const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../assets/js/contentbuilder/asset-search.js'), 'utf8');
const asset = (id = 1) => ({ id, name: 'Newsletter', customerKey: 'mail-key', assetType: { id: 208, name: 'htmlemail' }, category: { id: 20, name: 'Campagne' }, modifiedDate: '2026-10-22T12:00:00Z', content: 'NEVER_RETURN_HTML', privateToken: 'NEVER_RETURN_TOKEN' });
function fixture(intercept) {
    let scope = 's50:123';
    const events = new EventTarget(), calls = [], api = { context: { current: () => ({ scope }) } };
    const window = { sfmcfix: api, addEventListener: events.addEventListener.bind(events) };
    vm.runInNewContext(source, { window, AbortController, setTimeout, clearTimeout, Date, fetch: async (url, options) => {
        calls.push({ url, options });
        assert.ok(url.startsWith('/fuelapi/asset/v1/content/'));
        assert.equal(options.mode, 'same-origin'); assert.equal(options.credentials, 'same-origin'); assert.equal(options.redirect, 'error');
        assert.equal(options.cache, 'no-store');
        assert.equal(options.headers['X-Requested-With'], 'XMLHttpRequest');
        assert.equal(options.headers['x-fueldata-version'], '1.1');
        assert.ok(options.method === 'GET' && url.startsWith('/fuelapi/asset/v1/content/categories?') || options.method === 'POST' && url === '/fuelapi/asset/v1/content/assets/query?scope=ours');
        if (intercept) { const answer = await intercept(url, options); if (answer) return answer; }
        return { ok: true, json: async () => url.includes('/categories?') ? { items: [{ id: 10, parentId: 0, name: 'Content Builder' }, { id: 20, parentId: 10, name: 'Campagne' }], count: 2, page: 1, pageSize: 200 } : { items: [asset()], count: 1, page: JSON.parse(options.body).page.page, pageSize: 50 } };
    } });
    return { window, api: api.assetSearch, calls, change: () => { scope = 's50:999'; events.dispatchEvent(new Event('sfmcfix:contextchange')); } };
}
const clone = value => JSON.parse(JSON.stringify(value));
function leaves(query) { return query.property ? [query] : [...leaves(query.leftOperand), ...leaves(query.rightOperand)]; }
test('global metadata query is independent of the open folder; safe filters, explicit pagination and minimal result projection', async () => {
    const f = fixture();
    const result = await f.api.search({ term: "O'Reilly & summer", type: 'email', from: '2026-10-01', to: '2026-10-22' }, 2);
    const payload = JSON.parse(f.calls[0].options.body), filters = leaves(payload.query);
    assert.deepEqual(payload.page, { page: 2, pageSize: 50 });
    assert.equal(filters.some(filter => filter.property === 'category.id'), false);
    assert.deepEqual(filters.filter(filter => filter.simpleOperator === 'contains').map(filter => filter.value), ["O'Reilly & summer", "O'Reilly & summer"]);
    assert.deepEqual(filters.find(filter => filter.property === 'assetType.id').values, [5, 207, 208, 209]);
    assert.equal(filters.find(filter => filter.simpleOperator === 'lessThan').value, '2026-10-23T00:00:00.000Z');
    assert.equal(payload.fields.includes('content'), false);
    assert.ok(!JSON.stringify(result).includes('NEVER_RETURN'));
    await f.api.search({ field: 'id', term: '123', folder: '20', sort: 'name' });
    assert.deepEqual(leaves(JSON.parse(f.calls[1].options.body).query).map(filter => filter.property), ['id', 'category.id']);
    assert.equal(JSON.parse(f.calls[1].options.body).sort[0].property, 'name');
    const before = f.calls.length;
    for (const bad of [{ term: 'aa' }, { field: 'content' }, { term: 'x', field: 'id' }, { folder: '../20' }, { from: '2026-02-30' }, { from: '2026-10-22', to: '2026-10-01' }, { type: '__proto__' }]) await assert.rejects(f.api.search(bad));
    assert.equal(f.calls.length, before);
});
test('folders are paginated and cached only for their BU; errors do not use another scope cache', async () => {
    const f = fixture();
    assert.equal((await f.api.folders()).length, 2); await f.api.folders(); assert.equal(f.calls.length, 1);
    f.change(); await f.api.folders(); assert.equal(f.calls.length, 2);
    const forbidden = fixture(() => ({ ok: false, status: 403 }));
    await assert.rejects(forbidden.api.search({}), /HTTP 403/); await assert.rejects(forbidden.api.folders(), /HTTP 403/);
    assert.equal((await f.api.search({})).items.length, 1);
});
test('cancelling or replacing a search and changing BU reject late responses even when fetch ignores abort', async () => {
    const releases = [], f = fixture((url, options) => url.includes('/query?') ? new Promise(resolve => releases.push(() => resolve({ ok: true, json: async () => ({ items: [asset()], count: 1, page: 1, pageSize: 50 }) }))) : null);
    const first = f.api.search({ term: 'old' });
    const firstCheck = assert.rejects(first, error => error.name === 'AbortError');
    const second = f.api.search({ term: 'new' }); releases.shift()(); releases.shift()();
    await firstCheck; assert.equal((await second).items[0].id, 1);
    const third = f.api.search({}), thirdCheck = assert.rejects(third, error => error.name === 'AbortError');
    f.change(); releases.shift()(); await thirdCheck;
    const fourth = f.api.search({}), fourthCheck = assert.rejects(fourth, error => error.name === 'AbortError');
    f.api.cancel(); releases.shift()(); await fourthCheck;
});
test('unrecognized or repeated asset metadata and inconsistent pagination never become valid results', async () => {
    for (const data of [{ items: [asset(), asset()], count: 2, page: 1, pageSize: 50 }, { items: [], count: 5, page: 1 }, { items: [asset()], count: 'bad' }, { items: [asset()], count: 1, page: 2 }, { items: [{ ...asset(), id: 'javascript:alert(1)' }], count: 1 }]) {
        const f = fixture(() => ({ ok: true, json: async () => clone(data) })); await assert.rejects(f.api.search({}));
    }
});

test('native Fuel client keeps its session handling; cancellation aborts the native request without waiting for a callback', async () => {
    const f = fixture(), native = []; let aborted = 0;
    f.window.Fuel = { ajax: options => { native.push(options); return { abort: () => { aborted++; } }; } };
    const pending = f.api.search({ term: 'Newsletter' });
    assert.equal(native[0].url, '/fuelapi/asset/v1/content/assets/query?scope=ours'); assert.equal(native[0].type, 'POST');
    assert.equal(native[0].headers['x-fueldata-version'], '1.1');
    assert.equal(native[0].headers['X-Requested-With'], 'XMLHttpRequest');
    assert.equal(native[0].useFuel2Token, true); assert.equal(native[0].contentType, 'application/json;charset=utf-8;datekind=local');
    native[0].success({ items: [asset()], count: 1, page: 1, pageSize: 50 });
    assert.equal((await pending).items[0].id, 1); assert.equal(f.calls.length, 0);
    const late = f.api.search({}), lateCheck = assert.rejects(late, error => error.name === 'AbortError');
    f.api.cancelSearch(); await lateCheck; assert.equal(aborted, 1);
    native[1].success({ items: [asset()], count: 1, page: 1, pageSize: 50 });
    const forbidden = f.api.search({}); native[2].error({ status: 403 }); await assert.rejects(forbidden, /HTTP 403/);
    assert.equal(f.calls.length, 0);
});

test('folder pagination follows the server page size even when it is smaller than requested', async () => {
    const f = fixture(url => {
        if (!url.includes('/categories?')) return;
        const page = Number(new URL(url, 'https://fixture.invalid').searchParams.get('$page'));
        return { ok: true, json: async () => ({ count: 250, page, pageSize: 50, items: Array.from({ length: 50 }, (_, i) => ({ id: (page - 1) * 50 + i + 1, parentId: 0, name: 'Folder ' + i })) }) };
    });
    assert.equal((await f.api.folders()).length, 250); assert.equal(f.calls.length, 5);
});
