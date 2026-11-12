const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const root = path.resolve(__dirname, '..'), KEY = 'SFMCFIX---DE-USAGE-CONNECTION';
const id = '00000000-0000-4000-8000-000000000001';
function fixture() {
    const listeners = [], calls = [], opened = [], state = {}, extension = 'chrome-extension://' + 'a'.repeat(32) + '/';
    const storage = { onChanged: { addListener() {} } };
    for (const area of ['local','session']) storage[area] = { setAccessLevel: async () => {}, get: (keys, cb) => cb(keys == null ? state : Object.fromEntries(keys.filter(k => k in state).map(k => [k,state[k]]))), set: (items, cb) => { Object.assign(state,items); cb(); } };
    const context = vm.createContext({ URL, URLSearchParams, AbortSignal, console, chrome: { runtime: { id: 'a'.repeat(32), getURL: p => extension + p, onMessage: { addListener: cb => listeners.push(cb) } }, storage, tabs: { create: async o => opened.push(o), sendMessage: async () => {} }, action: { onClicked: { addListener() {} } } }, fetch: async (url, opts) => {
        calls.push({ url, opts }); return { ok: true, text: async () => JSON.stringify({ state: 'ready', mid: '123', stack: 's10' }) };
    } });
    vm.runInContext(fs.readFileSync(root + '/assets/js/background.js', 'utf8'), context);
    vm.runInContext(fs.readFileSync(root + '/assets/js/de-usage-worker.js', 'utf8'), context);
    const sender = { id: 'a'.repeat(32), url: 'https://mc.s10.exacttarget.com/contactsmeta/admin.html#admin/data-extension/' + id + '/properties', documentId: 'opaque-browser-document', tab: { id: 1 } };
    const internal = { id: sender.id, url: extension + 'assets/html/de-usage-settings.html' };
    const send = (action, data = {}, from = sender) => new Promise(resolve => listeners.forEach(cb => cb({ __sfmcfixDEUsage: true, action, deId: id, scope: 's10:123', ...data }, from, resolve)));
    return { calls, opened, state, sender, internal, send };
}
test('DE reader pairing is private, secret is never returned, only fixed authenticated loopback requests are issued', async () => {
    const f = fixture(), code = 's10:123:' + 'b'.repeat(64);
    assert.equal((await f.send('lookup')).result.state, 'setup-required');
    assert.equal((await f.send('save', { code })).ok, false);
    assert.equal((await f.send('save', { code }, f.internal)).ok, true);
    assert.ok(!JSON.stringify(await f.send('config', {}, f.internal)).includes('b'.repeat(64)));
    assert.equal((await f.send('lookup')).ok, true);
    const call = f.calls.at(-1); assert.equal(new URL(call.url).origin, 'http://127.0.0.1:17638');
    assert.equal(call.opts.headers.Authorization, 'Bearer ' + 'b'.repeat(64)); assert.equal(call.opts.credentials, 'omit'); assert.equal(call.opts.redirect, 'error');
    assert.equal((await f.send('clear', {}, f.internal)).ok, true); assert.equal(f.state[KEY], null);
});
test('other BU, stack, DE, module, extension and arbitrary endpoint actions fail before network access', async () => {
    const f = fixture(); await f.send('save', { code: 's10:123:' + 'b'.repeat(64) }, f.internal);
    const before = f.calls.length;
    for (const data of [{ scope: 's10:999' }, { scope: 's50:123' }, { deId: '00000000-0000-4000-8000-000000000002' }, { offset: -1 }, { revision: '<script>' }]) assert.equal((await f.send('lookup', data)).ok, false);
    assert.equal((await f.send('https://evil.example/')).ok, false);
    for (const from of [{ ...f.sender, id: 'other' }, { ...f.sender, url: 'https://mc.s10.exacttarget.com/AutomationStudioFuel3/' }, { ...f.sender, documentId: '' }]) assert.equal((await f.send('lookup', {}, from)).ok, false);
    assert.equal(f.calls.length, before);
    assert.equal((await f.send('settings')).ok, true); assert.match(f.opened[0].url, /de-usage-settings.html$/);
});
