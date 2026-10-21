const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(root + '/' + p, 'utf8');
const SETTINGS = 'SFMCFIX---SETTINGS-V2', UI = 'SFMCFIX---UI-PREFERENCES';
const bucket = scope => `SFMCFIX:v2:${scope}:SFMCFIX---ACTIVITYVERSIONING`;
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const clone = v => JSON.parse(JSON.stringify(v));
function workerFixture() {
    const state = { local: { [SETTINGS]: { 's50:123': { testers: [['Rossi', 'Mario', 'mario@example.com']] },
        's50:999': { testers: [['PRIVATE_OTHER_BU', '', 'other@example.com']] } },
        [UI]: { hidePreviewIcons: false, secret: 'PRIVATE_UI_FIELD' },
        [bucket('s50:123')]: { original: { queryText: 'SELECT 1', accessToken: 'DO_NOT_EXPOSE_TOKEN' } },
        [bucket('s50:999')]: { original: { queryText: 'PRIVATE_OTHER_SQL' } }
    }, session: {} };
    const listeners = [], changes = [], access = [], messages = [];
    let notify = () => {};
    const storage = {};
    for (const area of ['local', 'session']) storage[area] = {
        setAccessLevel: async options => access.push([area, options.accessLevel]),
        get: (keys, cb) => cb(keys == null ? clone(state[area]) : Object.fromEntries(keys.filter(k => state[area][k] !== undefined).map(k => [k, clone(state[area][k])]))),
        set: (items, cb) => {
            const patch = {};
            for (const [key, value] of Object.entries(items)) {
                patch[key] = { newValue: clone(value) }; if (state[area][key] !== undefined) patch[key].oldValue = clone(state[area][key]);
                state[area][key] = clone(value);
            }
            cb(); for (const listener of changes) listener(patch, area);
        }
    };
    storage.onChanged = { addListener: cb => changes.push(cb) };
    const extension = 'chrome-extension://security-fixture/';
    const context = vm.createContext({ URL, console, chrome: {
        runtime: { id: 'security-fixture', getURL: p => extension + p, onMessage: { addListener: cb => listeners.push(cb) } },
        storage, tabs: { sendMessage: async (tab, message, options) => { messages.push(clone({ tab, message, options })); await notify(message, options.documentId); }, create: () => {} },
        action: { onClicked: { addListener: () => {} } }
    } });
    vm.runInContext(read('assets/js/background.js'), context);
    const send = (msg, sender) => new Promise((resolve, reject) => {
        if (!listeners.some(listener => listener(msg, sender, result => resolve(clone(result))) === true)) reject(Error('No listener'));
    });
    const from = (url, number = 1) => ({ id: 'security-fixture', url, documentId: id(number), frameId: 0, tab: { id: number } });
    const request = (sender, action, payload, scope) => send({ __sfmcfixStorage: true, action, payload, scope }, sender);
    return { state, access, messages, send, from, request, extension, setNotify: callback => { notify = callback; } };
}
test('page storage is limited to an explicitly authorized document, module and BU', async () => {
    const w = workerFixture();
    const content = w.from('https://content-builder.s50.marketingcloudapps.com/');
    const automation = w.from('https://mc.s50.marketingcloudapps.com/AutomationStudioFuel3/', 2);
    const internal = { id: 'security-fixture', url: w.extension + 'assets/html/activity-versioning.html' };
    const keys = key => ({ keys: [key] });
    assert.equal((await w.request(content, 'get', { keys: null })).ok, false);
    for (const action of ['clear', 'set', 'remove', 'deleteVersions']) assert.equal((await w.request(content, action, {})).ok, false);
    assert.equal((await w.request(content, 'get', keys(SETTINGS), 's50:123')).ok, false);
    assert.equal((await w.request(content, 'authorize', {}, 's99:123')).ok, false);
    assert.equal((await w.request(w.from('https://pages.fixture.sfmc-content.com/welcome', 3), 'authorize', {}, 's50:123')).ok, false);
    assert.equal((await w.request({ ...content, id: 'other-extension' }, 'get', keys(UI))).ok, false);
    assert.equal((await w.send({ __sfmcfixFetch: true, url: 'https://members.s99.exacttarget.com/' }, content)).ok, false);
    assert.equal((await w.request(content, 'authorize', {}, 's50:123')).ok, true);
    const preferences = await w.request(content, 'get', keys(SETTINGS), 's50:123');
    assert.deepEqual(Object.keys(preferences.result[SETTINGS]), ['s50:123']);
    assert.ok(!JSON.stringify(preferences).includes('PRIVATE_OTHER_BU'));
    assert.equal((await w.request(content, 'get', keys(SETTINGS), 's50:999')).ok, false);
    assert.equal((await w.request(content, 'merge', { items: { [SETTINGS]: { 's50:999': { testers: [] } } } }, 's50:123')).ok, false);
    assert.equal((await w.request(content, 'merge', { items: { [UI]: { hidePreviewIcons: true } } }, 's50:123')).ok, false);
    assert.equal((await w.request(content, 'merge', { items: { [SETTINGS]: { 's50:123': { testers: [['Verdi', 'Anna', 'anna@example.com']] } } } }, 's50:123')).ok, true);
    assert.equal(w.state.local[SETTINGS]['s50:999'].testers[0][0], 'PRIVATE_OTHER_BU');
    assert.equal((await w.request(content, 'get', keys(bucket('s50:123')), 's50:123')).ok, false);
    assert.equal((await w.request(automation, 'authorize', {}, 's50:123')).ok, true);
    const versions = await w.request(automation, 'get', keys(bucket('s50:123')), 's50:123');
    assert.equal(versions.result[bucket('s50:123')].original.queryText, 'SELECT 1');
    assert.ok(!JSON.stringify(versions).includes('DO_NOT_EXPOSE_TOKEN'));
    const record = { queryDefinitionId: id(9), queryText: 'SELECT 2', name: 'Saved', accessToken: 'DO_NOT_STORE_TOKEN', sfmcfixContext: { mid: '999' } };
    assert.equal((await w.request(automation, 'merge', { items: { [bucket('s50:123')]: { fixture: record } } }, 's50:123')).ok, true);
    assert.equal(w.state.local[bucket('s50:123')].fixture.sfmcfixContext.mid, '123');
    assert.equal(w.state.local[bucket('s50:123')].fixture.accessToken, undefined);
    const bad = JSON.parse('{"__proto__":{"queryText":"bad"}}');
    assert.equal((await w.request(automation, 'merge', { items: { [bucket('s50:123')]: bad } }, 's50:123')).ok, false);
    assert.equal((await w.request(internal, 'merge', { items: { [UI]: { hidePreviewIcons: true } } })).ok, true);
    assert.equal((await w.request(internal, 'deleteVersions', { entries: [{ bucket: bucket('s50:123'), key: 'fixture' }] })).ok, true);
    await new Promise(resolve => setImmediate(resolve));
    for (const sent of w.messages.filter(m => m.options.documentId === content.documentId)) {
        assert.ok(!JSON.stringify(sent).includes('PRIVATE_OTHER')); assert.ok(!JSON.stringify(sent).includes('DO_NOT_'));
        assert.ok(!Object.keys(sent.message.changes).some(key => key.includes('ACTIVITYVERSIONING')));
    }
    assert.deepEqual(w.access, [['local', 'TRUSTED_CONTEXTS'], ['session', 'TRUSTED_CONTEXTS']]);
    assert.equal(w.state.local[bucket('s50:123')].original.accessToken, undefined);
});

test('privileged pages are private and network permissions remain limited', () => {
    const manifest = JSON.parse(read('manifest.json'));
    assert.deepEqual(manifest.permissions, ['storage']);
    assert.ok(!manifest.host_permissions.some(value => value.includes('sfmc-content.com')));
    const patterns = manifest.web_accessible_resources.flatMap(entry => entry.resources);
    const accessible = file => patterns.some(pattern => new RegExp('^' + pattern.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$').test(file));
    for (const file of ['assets/js/background.js', 'assets/js/loader.js', 'assets/js/activity-versioning.js', 'assets/html/activity-versioning.html', 'assets/html/email-studio-diagnostics.html']) assert.equal(accessible(file), false, file);
    for (const file of ['assets/js/content.js', 'assets/js/context.js', 'assets/js/components/tester-editor.js', 'assets/html/modals/dem-preview.html']) assert.equal(accessible(file), true, file);
    assert.ok(manifest.content_security_policy.extension_pages.includes("frame-ancestors 'none'"));
    assert.ok(manifest.content_security_policy.extension_pages.includes("script-src 'self'"));
});
