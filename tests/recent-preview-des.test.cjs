const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const code = fs.readFileSync(path.join(__dirname, '../assets/js/contentbuilder/recent-preview-des.js'), 'utf8');
const KEY = 'SFMCFIX---PREVIEW-DE-RECENTS', ROOT = '/fuelapi/platform-internal/v1/categories/';
const A = '00000000-0000-4000-8000-000000000001', B = '00000000-0000-4000-8000-000000000002';
const clone = value => JSON.parse(JSON.stringify(value));
function fixture(options = {}) {
    let scope = 's50:123';
    const events = new EventTarget(), storage = new Map(), calls = [], notices = [];
    const api = { temp: { currentasset: { id: 1001, legacyData: { legacyId: 101 } } }, ajax: { prefilter: {}, success: {}, transport: {} },
        context: { current: () => ({ scope }) }, local: {
            getItem: key => storage.get(scope + ':' + key), setItem: (key, value) => storage.set(scope + ':' + key, value)
        }, nativeSession: { headers: () => ({ 'X-Fixture-Session': 'native' }), client: () => ({ ajax: params => {
            calls.push(params);
            if (options.metadata) return options.metadata(params);
            queueMicrotask(() => params.success({ id: params.url.split('/').at(-1), name: 'DE ' + params.url.slice(-1) }));
            return { abort: () => {} };
        } }) }, notificationLogger: (...args) => notices.push(args) };
    const location = new URL('https://content-builder.s50.marketingcloudapps.com/');
    vm.runInNewContext(code, { window: { sfmcfix: api, addEventListener: events.addEventListener.bind(events) }, location, URL,
        fetch: async (url, init) => { calls.push({ url, init }); return { ok: true, json: async () => ({ id: A, name: 'A' }) }; },
        AbortController, setTimeout: (...args) => setTimeout(...args).unref(), clearTimeout });
    if (options.native === false) api.nativeSession.client = () => null;
    function changeScope(next = 's50:999') { scope = next; events.dispatchEvent(new Event('sfmcfix:contextchange')); }
    function preview(id = A, emailID = 101, success = true, custom = {}) {
        const done = [];
        const params = { url: `/fuelapi/guide/v1/emails/${emailID}/dataExtension/${id}/row/0/preview`, type: 'POST', ...custom };
        api.ajax.prefilter['/fuelapi/guide/v1/emails/'](params, {}, { done: callback => done.push(callback) });
        if (success) done.forEach(callback => callback({ privateHTML: 'DO_NOT_SAVE_RECORD_OR_HTML' }));
        return done;
    }
    function request(id = 999999990, custom = {}) {
        const transport = api.ajax.transport['/fuelapi/data-internal/v1/customobjects/category/']({ url: `/fuelapi/data-internal/v1/customobjects/category/${id}?$page=1`, type: 'GET', ...custom });
        let completeCount = 0;
        const promise = new Promise(resolve => transport.send({}, (status, message, response) => { completeCount++; resolve({ status, message, ...clone(response.json) }); }));
        return { transport, promise, count: () => completeCount };
    }
    function categories(parent, page = 1, items = [], count = 51) {
        const data = { count, page, pageSize: 25, links: { next: '/native-next' }, items: clone(items) };
        const args = [data, null, null, { url: ROOT + parent + '/children?$page=' + page }];
        api.ajax.success[ROOT](...args);
        return { data, again: () => api.ajax.success[ROOT](...args) };
    }
    return { api, events, calls, notices, storage, changeScope, preview, request, categories };
}

test('a preview without Send Test becomes a BU recent after changing email; one BU list survives email changes', async () => {
    const f = fixture(); f.preview();
    let result = await f.request(999999999).promise;
    assert.equal(result.status, 200); assert.deepEqual(result.items.map(row => row.id), [A]);
    f.api.temp.currentasset = { id: 2002, legacyData: { legacyId: 202 } };
    assert.equal((await f.request(999999999).promise).items.length, 1);
    assert.deepEqual((await f.request().promise).items.map(row => row.id), [A]);
    f.preview(B, 202);
    assert.deepEqual((await f.request(999999999).promise).items.map(row => row.id), [B, A]);
    assert.deepEqual((await f.request().promise).items.map(row => row.id), [B, A]);
    assert.equal(f.api.local.getItem('testsendlogs'), undefined);
    const saved = f.api.local.getItem(KEY);
    assert.ok(saved); assert.ok(!saved.includes('DO_NOT_SAVE')); assert.ok(!saved.includes('row'));
    assert.deepEqual(f.notices, []);
});

test('virtual folders appear once at the detected root, never again in Load More or nested folders', () => {
    const f = fixture();
    f.categories(0, 1, [{ id: 782, parentId: 0, categoryType: 'dataextension' }]);
    const first = f.categories(782, 1, [{ id: 10, name: 'Folder 1' }]);
    assert.deepEqual(clone(first.data.items.map(row => row.id)), [999999990, 10]);
    assert.deepEqual(clone(first.data.items.slice(0, 1).map(row => row.name)), ['DE recenti']);
    first.again(); assert.equal(first.data.items.length, 2); assert.equal(first.data.count, 52);
    for (const page of [2, 3]) {
        const next = f.categories(782, page, [{ id: 10 + page, name: 'Native page ' + page }]);
        assert.deepEqual(next.data.items.map(row => row.id), [10 + page]);
        assert.equal(next.data.count, first.data.count); assert.equal(next.data.pageSize, 25);
        assert.deepEqual(next.data.links, { next: '/native-next' });
    }
    assert.equal(f.categories(10, 1, [{ id: 50 }]).data.items.length, 1);
    f.changeScope(); assert.equal(f.categories(782).data.items.length, 0);
});

test('new history merges compatible send logs, deduplicates before limiting to twenty, and ignores malformed/expired data', async () => {
    const f = fixture(), stamp = Date.now();
    const rows = Array.from({ length: 30 }, (_, i) => ({ logdate: new Date(stamp - i * 1000).toISOString(), emailID: 101,
        dataSource: { type: 'DataExtension', id: '00000000-0000-4000-8000-' + String(i + 1).padStart(12, '0'), row: 0 }, recipients: ['PRIVATE_EMAIL'] }));
    rows.unshift(...Array.from({ length: 12 }, () => rows[0]));
    rows.push({ ...rows[1], logdate: 'invalid' }, { ...rows[1], logdate: '2000-01-01' }, { ...rows[1], dataSource: { type: 'List', id: B } });
    f.api.local.setItem('testsendlogs', JSON.stringify(rows));
    const result = await f.request().promise;
    assert.equal(result.items.length, 20); assert.equal(new Set(result.items.map(row => row.id)).size, 20);
    f.preview(B);
    assert.ok(!f.api.local.getItem(KEY).includes('PRIVATE_EMAIL'));
    assert.ok(!f.api.local.getItem(KEY).includes('recipients'));
    f.api.local.setItem(KEY, '{bad'); f.api.local.setItem('testsendlogs', '{}');
    assert.equal((await f.request().promise).items.length, 0);
});

test('failed/unrelated previews do not record data and a late preview cannot enter another BU', async () => {
    const f = fixture(); f.preview(A, 101, false);
    f.preview(A, 101, true, { type: 'GET' });
    f.preview(A, 101, true, { url: 'https://untrusted.invalid/fuelapi/guide/v1/emails/101/dataExtension/' + A + '/row/0/preview' });
    f.preview(A, 101, true, { url: '/fuelapi/guide/v1/emails/preview/send' });
    assert.equal(f.api.local.getItem(KEY), undefined);
    const delayed = f.preview(A, 101, false); f.changeScope(); delayed.forEach(callback => callback());
    assert.equal(f.api.local.getItem(KEY), undefined);
    assert.equal((await f.request().promise).items.length, 0);
    f.changeScope('s50:123'); assert.equal((await f.request().promise).items.length, 0);
    f.preview(A, 101, true, { url: '/fuelapi/guide/v1/emails/101/preview', data: JSON.stringify({ emailID: 101, dataSource: { type: 'DataExtension', id: A, row: 0 } }) });
    assert.equal((await f.request().promise).items.length, 1);
});

test('recent metadata uses the native GET client, coalesces reads and completes permission errors instead of hanging', async () => {
    const f = fixture(); f.preview();
    const [a, b] = await Promise.all([f.request().promise, f.request(999999999).promise]);
    assert.equal(a.items.length, 1); assert.equal(b.items.length, 1); assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].type, 'GET'); assert.equal(f.calls[0].useFuel2Token, true);
    await f.request().promise; assert.equal(f.calls.length, 1);
    for (const status of [403, 404]) {
        const failed = fixture({ metadata: params => { queueMicrotask(() => params.error({ status })); return { abort() {} }; } });
        failed.preview(); const result = await failed.request().promise;
        assert.equal(result.status, status === 404 ? 200 : 403); assert.equal(result.items.length, 0);
    }
});

test('aborting or changing the email/BU prevents late virtual-folder contents from reaching the picker', async () => {
    const pending = [];
    const f = fixture({ metadata: params => { pending.push(params); return { abort() {} }; } });
    f.preview(); const cancelled = f.request(); cancelled.transport.abort();
    pending[0].success({ id: A, name: 'A' });
    await new Promise(resolve => setImmediate(resolve)); assert.equal(cancelled.count(), 0);
    f.changeScope(); f.preview(B, 202); const switched = f.request(999999999);
    f.changeScope('s50:777');
    assert.equal((await switched.promise).items.length, 0);
    pending.at(-1)?.success({ id: B, name: 'Stale' });
    assert.equal((await f.request().promise).items.length, 0);
});


test('BU history works without a loaded email and its GET fallback is restricted to the same origin', async () => {
    const f = fixture({ native: false }); f.preview(); delete f.api.temp.currentasset;
    assert.equal((await f.request().promise).items.length, 1);
    assert.equal((await f.request(999999999).promise).items.length, 1);
    assert.equal(f.calls[0].url, '/fuelapi/data-internal/v1/customobjects/' + A);
    assert.equal(f.calls[0].init.method, 'GET'); assert.equal(f.calls[0].init.mode, 'same-origin');
    assert.equal(f.calls[0].init.credentials, 'same-origin'); assert.equal(f.calls[0].init.redirect, 'error');
});

test('the single BU list remains valid when a different email opens', async () => {
    let complete;
    const f = fixture({ metadata: params => { complete = params.success; return { abort() {} }; } });
    f.preview(); const list = f.request(999999999);
    f.api.temp.currentasset = { id: 2002, legacyData: { legacyId: 202 } };
    complete({ id: A, name: 'A' });
    assert.equal((await list.promise).status, 200);
    assert.equal((await f.request(999999999).promise).items.length, 1);
    assert.equal((await f.request().promise).items.length, 1);
});


test('clear removes only current BU recents, preserves Test History and prevents old logs and pending previews from returning', async () => {
    const f = fixture();
    const logs = JSON.stringify([{ emailID: 101, logdate: new Date().toISOString(), dataSource: { type: 'DataExtension', id: A, row: 1 } }]);
    f.api.local.setItem('testsendlogs', logs); f.api.local.setItem('OTHER_HISTORY', 'keep');
    f.preview(B); const late = f.preview(A, 101, false);
    f.changeScope('s50:999'); f.preview(B); f.changeScope('s50:123');
    assert.equal((await f.request().promise).items.length, 2);
    f.api.recentPreviewDEs.clear(); late.forEach(callback => callback());
    assert.equal((await f.request().promise).items.length, 0);
    assert.equal(f.api.local.getItem('testsendlogs'), logs); assert.equal(f.api.local.getItem('OTHER_HISTORY'), 'keep');
    f.preview(B); assert.deepEqual((await f.request().promise).items.map(row => row.id), [B]);
    f.changeScope('s50:999'); assert.deepEqual((await f.request().promise).items.map(row => row.id), [B]);
});

test('legacy preview history is retained until clear and pending metadata is not delivered after clear', async () => {
    let complete;
    const f = fixture({ metadata: params => { complete = params.success; return { abort() {} }; } });
    f.api.local.setItem(KEY, JSON.stringify([{ deId: A, emailID: 101, usedAt: Date.now() }]));
    const list = f.request(); f.api.recentPreviewDEs.clear(); complete({ id: A, name: 'Old' });
    assert.equal((await list.promise).items.length, 0);
    assert.equal((await f.request().promise).items.length, 0);
});
