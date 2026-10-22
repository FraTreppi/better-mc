const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const script = fs.readFileSync(path.join(__dirname, '../assets/js/contentbuilder/tester-source.js'), 'utf8');
const id = '00000000-0000-4000-8000-000000000001';
const name = 'tester_content_builder';
const clone = value => JSON.parse(JSON.stringify(value));

function fixture(options = {}) {
    let scope = 's50:123';
    const settings = { testerSource: 'de', testers: [['Local', '', 'local@example.com']] };
    const events = new EventTarget();
    const calls = [];
    const api = { preferences: { get: () => settings }, context: { current: () => ({ scope, persistent: options.persistent !== false }) } };
    const window = { sfmcfix: api, addEventListener: events.addEventListener.bind(events) };
    const records = options.records || [{ Nome: 'Mario', Cognome: 'Rossi', Email: 'mario@example.com', Secret: 'not-a-tester-field' }];
    const folders = options.folders || [{ id: 10, parentId: 0, categoryType: 'dataextension', name: 'Data Extensions' }, { id: 11, parentId: 10, name: 'SFMC_UI_Fixer' }];
    const fields = options.fields || [{ name: 'Nome', type: 'Text' }, { name: 'Cognome', type: 'Text' }, { name: 'Email', type: 'EmailAddress', isPrimaryKey: true }];
    const context = vm.createContext({ window, AbortController, setTimeout: (...args) => setTimeout(...args).unref(), clearTimeout, console,
        fetch: async (target, init) => {
            const url = new URL(target, 'https://content-builder.s50.marketingcloudapps.com');
            calls.push({ target, init });
            assert.equal(url.origin, 'https://content-builder.s50.marketingcloudapps.com');
            assert.equal(init.method, 'GET'); assert.equal(init.mode, 'same-origin'); assert.equal(init.credentials, 'same-origin');
            assert.equal(init.redirect, 'error'); assert.equal(init.cache, 'no-store');
            if (options.fetch) return options.fetch(url, init);
            let value;
            if (url.pathname.includes('/category/0')) value = { count: 1, items: options.candidates || [{ id, name, customerKey: name, categoryId: 11 }] };
            else if (url.pathname.includes('/fullPath')) value = { items: folders };
            else if (url.pathname.endsWith('/fields/')) value = { fields };
            else if (url.pathname.includes('/customObjectData/')) {
                const page = Number(url.searchParams.get('$page'));
                const pageSize = Number(url.searchParams.get('$pagesize'));
                value = { count: records.length, items: records.slice((page - 1) * pageSize, page * pageSize) };
                if (options.rowHook) await options.rowHook({ changeScope });
            } else throw Error('Unexpected URL');
            return { ok: options.status == null, status: options.status || 200, json: async () => clone(value) };
        }
    });
    vm.runInContext(script, context);
    function changeScope(next = 's50:999') { scope = next; events.dispatchEvent(new Event('sfmcfix:contextchange')); }
    return { source: api.testerSource, settings, events, calls, changeScope };
}

test('shared DE uses exact schema, same-origin reads, paginated rows and memory-only cache', async () => {
    const rows = Array.from({ length: 211 }, (_, i) => ({ Nome: `Tester ${i}`, Cognome: 'Team', Email: `tester${i}@example.com`, secret: 'excluded' }));
    rows.push({ Nome: 'Duplicate', Email: 'TESTER0@example.com' }, { Nome: 'Invalid', Email: 'not-email' });
    const f = fixture({ records: rows });
    const data = await f.source.list();
    assert.equal(data.testers.length, 211); assert.equal(data.invalid, 1);
    assert.ok(!JSON.stringify(data).includes('excluded'));
    assert.equal(f.calls.filter(c => c.target.includes('customObjectData')).length, 2);
    const count = f.calls.length;
    await f.source.list(); assert.equal(f.calls.length, count);
    await f.source.list({ refresh: true }); assert.equal(f.calls.length, count * 2);
    f.settings.testerSource = 'local';
    assert.deepEqual(clone((await f.source.list()).testers), [['Local', '', 'local@example.com']]);
    assert.equal(f.calls.length, count * 2);
});

test('missing DE, wrong key/folder/fields, permission errors and oversize DE fail without local fallback', async () => {
    const bad = [
        { candidates: [] },
        { candidates: [{ id, name, customerKey: 'wrong', categoryId: 11 }] },
        { folders: [{ id: 10, parentId: 0, categoryType: 'shared_dataextension' }, { id: 11, parentId: 10, name: 'SFMC_UI_Fixer' }] },
        { folders: [{ id: 10, parentId: 0, categoryType: 'dataextension' }, { id: 11, parentId: 10, name: 'Another folder' }] },
        { fields: [{ name: 'Nome', type: 'Text' }, { name: 'Cognome', type: 'Text' }, { name: 'Email', type: 'Text', isPrimaryKey: true }] },
        { records: Array.from({ length: 1001 }, () => ({ Email: 'a@example.com' })) },
        { status: 403 }, { persistent: false }
    ];
    for (const options of bad) await assert.rejects(fixture(options).source.list());
});

test('a late response from the previous BU cannot populate contacts or cache', async () => {
    let once = true;
    const f = fixture({ rowHook: async ({ changeScope }) => { if (once) { once = false; changeScope(); } } });
    await assert.rejects(f.source.list(), /BU/);
    const data = await f.source.list();
    assert.equal(data.scope, 's50:999');
    assert.equal(f.calls.filter(c => c.target.includes('/category/0')).length, 2);
});
