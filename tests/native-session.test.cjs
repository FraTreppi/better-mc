const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path'), crypto = require('node:crypto');
const read = name => fs.readFileSync(path.join(__dirname, '../assets/js', name), 'utf8');
function fixture() {
    const events = new EventTarget(), docEvents = new EventTarget(), calls = [], saved = new Map();
    const api = { storage: { getItem: async () => ({}), onChange: () => {} } };
    const window = { sfmcfix: api, addEventListener: events.addEventListener.bind(events), dispatchEvent: events.dispatchEvent.bind(events) };
    const location = new URL('https://content-builder.s50.marketingcloudapps.com/');
    let response = { organization: { id: 123, enterpriseId: 777 }, user: { id: 888 }, accessToken: 'NEVER_COPY_TOKEN' };
    const context = vm.createContext({ window, location, document: { referrer: '', hidden: false, getElementById: () => null, addEventListener: docEvents.addEventListener.bind(docEvents) },
        URL, crypto, Event, AbortController, setTimeout, clearTimeout, setInterval: () => {}, sessionStorage: { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) },
        fetch: async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => response }; } });
    vm.runInContext(read('components/native-session.js'), context);
    return { api, window, events, context, location, calls, saved, setResponse: value => { response = value; } };
}
test('session reader uses only the current token organization MID; no user, enterprise, asset IDs or token retention', async () => {
    const f = fixture();
    assert.equal(await f.api.nativeSession.readMid(), '123');
    assert.equal(f.calls[0].url, '/fuelapi/platform/v1/tokenContext');
    assert.equal(f.calls[0].options.credentials, 'same-origin');
    assert.equal(f.calls[0].options.headers['X-Requested-With'], 'XMLHttpRequest');
    for (const data of [{ user: { id: 999 } }, { organization: { enterpriseId: 777 } }, { organization: { id: 'bad' } }, { owner: { id: 456 } }]) {
        f.setResponse(data); assert.equal(await f.api.nativeSession.readMid(), null);
    }
    assert.equal(f.saved.size, 0);
});
test('native client and defined AMD client keep their method owner; 403 does not retry using fetch', async () => {
    const f = fixture(), requests = [];
    const native = { ajax(options) { assert.equal(this, native); requests.push(options); options.success({ organization: { id: 456 } }); } };
    f.window.requirejs = name => { assert.equal(name, 'fuel-ajax'); return native; };
    f.window.requirejs.defined = () => false;
    assert.equal(f.api.nativeSession.client(), null);
    f.window.requirejs.defined = name => name === 'fuel-ajax';
    assert.equal(f.api.nativeSession.client().kind, 'AMD:fuel-ajax');
    assert.equal(await f.api.nativeSession.readMid(), '456');
    assert.equal(requests[0].useFuel2Token, true);
    f.window.Fuel = { ajax: options => options.error({ status: 403 }) };
    assert.equal(f.api.nativeSession.client().kind, 'Fuel');
    assert.equal(await f.api.nativeSession.readMid(), null);
    assert.equal(f.calls.length, 0);
});
test('automatic MID is refreshed on a BU switch, invalidated on failure and never restored from a manual hint', async () => {
    const f = fixture(); let changes = 0;
    f.saved.set('SFMCFIX---MANUAL-CONTEXT-HINT', JSON.stringify({ mid: '999', stack: 's50' }));
    f.events.addEventListener('sfmcfix:contextchange', () => changes++);
    vm.runInContext(read('context.js'), f.context);
    await f.api.context.ready;
    assert.equal(f.api.context.current().mid, '123');
    assert.equal(f.api.context.current().source, 'session');
    f.location.search = '?mid=999'; // A stale URL cannot override the active token's BU.
    f.setResponse({ organization: { id: 456 } }); await f.api.context.refresh();
    assert.equal(f.api.context.current().scope, 's50:456'); assert.equal(changes, 1);
    f.location.search = '';
    f.setResponse({ organization: { enterpriseId: 777 }, user: { id: 888 } }); await f.api.context.refresh();
    assert.equal(f.api.context.current().mid, null); assert.equal(f.api.context.current().persistent, false); assert.equal(changes, 2);
    assert.ok(!JSON.stringify(f.api.context.current()).includes('999'));
});
test('a delayed session response cannot restart a cancelled search', async () => {
    const f = fixture(); let release;
    f.api.context = { current: () => ({ scope: 's50:123' }), refresh: () => new Promise(resolve => { release = resolve; }) };
    vm.runInContext(read('contentbuilder/asset-search.js'), f.context);
    const pending = f.api.assetSearch.search({});
    const rejected = assert.rejects(pending, error => error.name === 'AbortError');
    f.api.assetSearch.cancel(); release(); await rejected;
    assert.equal(f.calls.length, 0);
});
test('session timeout returns without waiting for the native callback', async () => {
    const f = fixture(); let expire, success, aborted = false;
    f.context.setTimeout = callback => { expire = callback; return 1; };
    f.context.clearTimeout = () => {};
    f.window.Fuel = { ajax: options => { success = options.success; return { abort: () => { aborted = true; } }; } };
    const pending = f.api.nativeSession.readMid(); expire();
    assert.equal(await pending, null); assert.equal(aborted, true);
    success({ organization: { id: 999 } });
    assert.equal(f.saved.size, 0);
});
test('a successful automatic lookup retires an earlier manual MID', async () => {
    const f = fixture();
    f.setResponse({}); f.context.prompt = () => '999';
    vm.runInContext(read('context.js'), f.context); await f.api.context.ready;
    await f.api.context.configure(); assert.equal(f.api.context.current().source, 'manual');
    f.setResponse({ organization: { id: 123 } }); await f.api.context.refresh();
    assert.equal(f.api.context.current().mid, '123');
    f.setResponse({}); await f.api.context.refresh();
    assert.equal(f.api.context.current().mid, null);
});


test('Content Builder collections use the configured Backbone/jQuery pipeline even without a Fuel facade', async () => {
    const f = fixture(), calls = [];
    const jquery = { ajax(options) { assert.equal(this, jquery); calls.push(options); options.success({ organization: { id: 123 } }); } };
    const backbone = { ajax(options) { assert.equal(this, backbone); return jquery.ajax(options); } };
    f.window.jQuery = jquery;
    assert.equal(f.api.nativeSession.client().kind, 'jQuery');
    assert.equal(await f.api.nativeSession.readMid(), '123');
    f.window.Backbone = backbone;
    assert.equal(f.api.nativeSession.client().kind, 'Backbone');
    assert.equal(await f.api.nativeSession.readMid(), '123');
    delete f.window.Backbone; delete f.window.jQuery;
    const modules = { backbone, jquery };
    f.window.requirejs = name => modules[name];
    f.window.requirejs.defined = name => Boolean(modules[name]);
    assert.equal(f.api.nativeSession.client().kind, 'AMD:backbone');
    assert.equal(await f.api.nativeSession.readMid(), '123');
    delete modules.backbone;
    assert.equal(f.api.nativeSession.client().kind, 'AMD:jquery');
    assert.equal(await f.api.nativeSession.readMid(), '123');
    assert.equal(calls.length, 4); assert.equal(f.calls.length, 0);
    assert.ok(calls.every(options => options.useFuel2Token));
});
