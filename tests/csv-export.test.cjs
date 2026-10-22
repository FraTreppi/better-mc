const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../assets/js/components/de-csv-export.js'), 'utf8');
const id = '00000000-0000-4000-8000-000000000001';
function fixture(options = {}) {
    const total = options.total ?? 100000;
    const location = new URL(`https://mc.s50.exacttarget.com/contactsmeta/admin.html#admin/data-extension/${id}/records/`);
    const events = new EventTarget(), files = [], calls = [], progress = [];
    let scope = 's50:123', pending = 0, maximum = 0;
    const api = { context: { current: () => ({ scope }) } };
    class ExportURL extends URL {}
    ExportURL.createObjectURL = blob => { files.push(blob); return 'blob:fixture'; };
    ExportURL.revokeObjectURL = () => {};
    const window = { sfmcfix: api, addEventListener: events.addEventListener.bind(events), dispatchEvent: event => {
        if (api.deCsvExport) progress.push(api.deCsvExport.getState());
        return events.dispatchEvent(event);
    } };
    const fields = options.fields || [{ name: 'CardNumber', type: 'Text', isPrimaryKey: options.primary !== false },
        { name: 'Nome', type: 'Text' }, { name: 'Notes', type: 'Text' }];
    const context = vm.createContext({ window, location, Event, URL: ExportURL, AbortController, Blob,
        setTimeout: (...args) => setTimeout(...args).unref(), clearTimeout, document: {
            createElement: () => ({ click: () => {}, remove: () => {} }), body: { appendChild: () => {} }
        }, fetch: async (target, init) => {
            const url = new URL(target, location);
            calls.push({ url, init });
            assert.equal(url.origin, location.origin); assert.equal(init.method, 'GET');
            assert.equal(init.mode, 'same-origin'); assert.equal(init.credentials, 'same-origin');
            assert.equal(init.cache, 'no-store'); assert.equal(init.redirect, 'error');
            assert.equal(url.searchParams.has('filter'), false);
            if (options.intercept) {
                const answer = await options.intercept({ url, init, files, calls, changeScope, navigate });
                if (answer) return answer;
            }
            let data;
            if (url.pathname.endsWith('/fields/')) data = { fields };
            else {
                pending++; maximum = Math.max(maximum, pending);
                const page = Number(url.searchParams.get('$page'));
                const requested = Number(url.searchParams.get('$pagesize'));
                const size = Math.min(options.serverSize || 200, requested);
                const from = (page - 1) * size;
                const items = Array.from({ length: Math.min(size, Math.max(0, total - from)) }, (_, offset) => {
                    const i = from + offset;
                    return options.row ? options.row(i) : { CardNumber: `CARD-${String(i).padStart(6, '0')}`, Nome: `Nome ${i}`, Notes: i === total - 1 ? 'È | "ultimo"\nseconda riga' : '' };
                });
                if (page % 3 === 0) await new Promise(resolve => setImmediate(resolve));
                pending--;
                data = { items, count: total, page, pageSize: size };
                if (options.data) data = options.data(data, { url, calls });
            }
            return { ok: true, status: 200, headers: new Headers(), json: async () => data };
        }
    });
    vm.runInContext(source, context);
    function changeScope() { scope = 's50:999'; events.dispatchEvent(new Event('sfmcfix:contextchange')); }
    function navigate() { location.hash = '#admin/data-extension/00000000-0000-4000-8000-000000000002/records/'; events.dispatchEvent(new Event('hashchange')); }
    return { export: api.deCsvExport, files, calls, progress, maximum: () => maximum, changeScope, navigate };
}

test('exports all 100,000 records in page order with bounded concurrency and no grid filters', async () => {
    const f = fixture();
    const result = await f.export.start();
    assert.equal(result.completed, 100000);
    assert.equal(f.files.length, 1);
    const text = await f.files[0].text();
    const identifiers = text.match(/"CARD-\d{6}"/g) || [];
    assert.equal(identifiers.length, 100000);
    assert.ok(identifiers.every((value, i) => value === `"CARD-${String(i).padStart(6, '0')}"`));
    assert.ok(text.indexOf('CARD-000199') < text.indexOf('CARD-000200'));
    assert.ok(text.indexOf('CARD-000399') < text.indexOf('CARD-000400'));
    assert.ok(text.includes('"È | ""ultimo""\nseconda riga"'));
    assert.equal(f.calls.filter(c => c.url.pathname.includes('CustomObjectData')).length, 501);
    assert.ok(f.maximum() <= 3);
    assert.equal(f.export.getState().busy, false);
    assert.equal(f.export.getState().completed, 100000);
    assert.ok(f.progress.filter(state => state.busy).some(state => state.completed > 200));
    assert.ok(result.filename.includes('-all-100000-records-'));
});

test('handles server page-size caps, empty DEs, literal quotes and formula protection', async () => {
    const capped = fixture({ total: 523, serverSize: 25, row: i => ({ CardNumber: String(i), Nome: '=1+1', Notes: 'plain "text"' }) });
    await capped.export.start();
    const text = await capped.files[0].text();
    assert.equal((text.match(/"'=1\+1"/g) || []).length, 523);
    assert.ok(text.includes('"plain ""text"""'));
    const empty = fixture({ total: 0 });
    assert.equal((await empty.export.start()).completed, 0);
    assert.equal((await empty.files[0].text()).trim(), '"CardNumber"|"Nome"|"Notes"');
    const duplicatesWithoutKey = fixture({ total: 500, primary: false, row: () => ({ CardNumber: 'same', Nome: null, Notes: '' }) });
    await duplicatesWithoutKey.export.start();
    assert.equal((await duplicatesWithoutKey.files[0].text()).match(/"same"/g).length, 500);
});

test('changed totals, incomplete/ignored pages, duplicate primary keys and invalid fields never download a partial file', async () => {
    for (const data of [
        (data, { url }) => Number(url.searchParams.get('$page')) === 2 ? { ...data, count: data.count + 1 } : data,
        (data, { url }) => Number(url.searchParams.get('$page')) === 2 ? { ...data, items: [] } : data,
        (data, { url }) => Number(url.searchParams.get('$page')) === 2 ? { ...data, page: 1 } : data,
        (data, { url }) => Number(url.searchParams.get('$pagesize')) === 1 ? { ...data, count: data.count + 1 } : data,
        (data, { url }) => Number(url.searchParams.get('$page')) === 2 ? { ...data, items: data.items.map(row => ({ ...row, CardNumber: 'CARD-000000' })) } : data,
        (data, { url }) => Number(url.searchParams.get('$page')) === 2 ? { ...data, items: data.items.map(row => ({ ...row, Unexpected: 'new field' })) } : data
    ]) {
        const f = fixture({ total: 1000, data });
        await assert.rejects(f.export.start());
        assert.equal(f.files.length, 0);
        assert.equal(f.export.getState().busy, false);
    }
});

test('a schema change during the final verification prevents the download', async () => {
    let reads = 0;
    const f = fixture({ total: 401, intercept: async ({ url }) => {
        if (url.pathname.endsWith('/fields/') && ++reads === 2) return {
            ok: true, status: 200, json: async () => ({ fields: [{ name: 'Changed', type: 'Text' }] })
        };
    } });
    await assert.rejects(f.export.start(), /cambiata/);
    assert.equal(f.files.length, 0);
});

test('cancels on explicit request, DE navigation and BU changes even if a late response ignores abort', async () => {
    for (const reason of ['cancel', 'DE', 'BU']) {
        let f;
        f = fixture({ total: 1000, intercept: async ({ url, changeScope, navigate }) => {
            if (url.searchParams.get('$page') === '2') {
                if (reason === 'cancel') f.export.cancel();
                if (reason === 'DE') navigate();
                if (reason === 'BU') changeScope();
            }
        } });
        await assert.rejects(f.export.start(), /annullata/);
        assert.equal(f.files.length, 0);
        assert.equal(f.export.getState().busy, false);
    }
});

test('retries temporary throttling, rejects forbidden reads, and coalesces a second click', async () => {
    let attempts = 0;
    const f = fixture({ total: 401, intercept: async ({ url }) => {
        if (url.searchParams.get('$page') === '2' && !attempts++) return { ok: false, status: 429, headers: new Headers({ 'Retry-After': '0' }) };
    } });
    const first = f.export.start(), second = f.export.start();
    assert.equal(first, second);
    await first;
    assert.equal(f.files.length, 1);
    assert.equal(f.calls.filter(call => call.url.searchParams.get('$page') === '2').length, 2);
    const denied = fixture({ intercept: async () => ({ ok: false, status: 403, headers: new Headers() }) });
    await assert.rejects(denied.export.start(), /403/);
    assert.equal(denied.files.length, 0);
});
