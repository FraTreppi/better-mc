const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../assets/js/contentbuilder/asset-navigation.js'), 'utf8');
function fixture(patterns) {
    const events = new EventTarget(), timers = new Map(), calls = [];
    let scope = 's50:123', serial = 0;
    const history = { fragment: 'library', handlers: patterns.map(route => ({ route })), navigate(route, options) { calls.push({ route, options }); this.fragment = route; } };
    const api = { context: { current: () => ({ scope }), refresh: async () => {} }, nativeSession: { backbone: () => ({ history }) } };
    const window = { sfmcfix: api, addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events) };
    vm.runInNewContext(source, { window, document: { querySelector: () => null }, location: { hash: '' }, setTimeout: callback => { timers.set(++serial, callback); return serial; }, clearTimeout: id => timers.delete(id) });
    function loaded(id, typeId = 208) { const event = new Event('sfmcfix:asset-loaded'); event.detail = { id, typeId }; events.dispatchEvent(event); }
    return { api: api.assetNavigation, history, calls, loaded, timers,
        change: () => { scope = 's50:999'; events.dispatchEvent(new Event('sfmcfix:contextchange')); } };
}
const asset = { id: 566383, typeId: 208 };
test('offscreen assets dispatch a registered native route with trigger and require the matching asset load', async () => {
    for (const pattern of [/^library\/content\/edit\/([^/]+)$/, /^asset\/([^/?]+)\/email(?:\?([\s\S]*))?$/]) {
        const f = fixture([pattern]), pending = f.api.open(asset, { signal: new AbortController().signal, scope: 's50:123' });
        await new Promise(setImmediate);
        assert.equal(f.calls.length, 1); assert.equal(f.calls[0].options.trigger, true);
        assert.ok(pattern.test(f.calls[0].route));
        f.loaded(1); f.loaded(asset.id, 16); assert.equal(f.api.diagnostics().result, 'pending');
        f.loaded(asset.id); await pending;
        assert.equal(f.api.diagnostics().result, 'confirmed'); assert.equal(f.timers.size, 0);
        assert.ok(!JSON.stringify(f.api.diagnostics()).includes(String(asset.id)));
    }
});
test('unknown, destructive, generic or ambiguous routes never dispatch guessed navigation', async () => {
    for (const patterns of [[], [/^.*$/], [/^content\/delete\/([^/]+)$/], [/^asset\/([^/]+)\/([^/]+)$/]]) {
        const f = fixture(patterns);
        await assert.rejects(f.api.open(asset, { signal: new AbortController().signal, scope: 's50:123' }), /non riconosciuto/);
        assert.equal(f.calls.length, 0); assert.equal(f.timers.size, 0);
    }
});
test('a route callback without asset load times out; cancellation and BU change reject late confirmations', async () => {
    const f = fixture([/^content\/edit\/([^/]+)$/]);
    let pending = f.api.open(asset, { signal: new AbortController().signal, scope: 's50:123' });
    let rejected = assert.rejects(pending, /non ha confermato/);
    await new Promise(setImmediate); [...f.timers.values()][0](); await rejected;
    const controller = new AbortController(); pending = f.api.open(asset, { signal: controller.signal, scope: 's50:123' });
    rejected = assert.rejects(pending, error => error.name === 'AbortError');
    await new Promise(setImmediate); controller.abort(); f.loaded(asset.id); await rejected;
    pending = f.api.open(asset, { signal: new AbortController().signal, scope: 's50:123' });
    rejected = assert.rejects(pending, error => error.name === 'AbortError');
    await new Promise(setImmediate); f.change(); f.loaded(asset.id); await rejected;
    assert.equal(f.timers.size, 0);
});
