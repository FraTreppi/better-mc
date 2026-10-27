const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(root + '/' + p, 'utf8');
const SETTINGS = 'SFMCFIX---SETTINGS-V2', UI = 'SFMCFIX---UI-PREFERENCES';
const bucket = scope => `SFMCFIX:v2:${scope}:SFMCFIX---ACTIVITYVERSIONING`;
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const clone = v => JSON.parse(JSON.stringify(v));
function workerFixture(options = {}) {
    const state = { local: { [SETTINGS]: { 's50:123': { testers: [['Rossi', 'Mario', 'mario@example.com']] },
        's50:999': { testers: [['PRIVATE_OTHER_BU', '', 'other@example.com']] } },
        [UI]: { hidePreviewIcons: false, secret: 'PRIVATE_UI_FIELD' },
        [bucket('s50:123')]: { original: { queryText: 'SELECT 1', accessToken: 'DO_NOT_EXPOSE_TOKEN' } },
        [bucket('s50:999')]: { original: { queryText: 'PRIVATE_OTHER_SQL' } }
    }, session: {} };
    let clock = Date.now();
    class Clock extends Date { static now() { return clock; } }
    const listeners = [], changes = [], access = [], messages = [];
    let notify = () => {};
    const storage = {};
    for (const area of ['local', 'session']) storage[area] = {
        setAccessLevel: options.failAccess ? () => { throw Error('Native API unavailable'); } : async options => access.push([area, options.accessLevel]),
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
    const context = vm.createContext({ URL, console, Date: Clock, chrome: {
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
    return { state, access, messages, send, from, request, extension, advance: ms => { clock += ms; }, emit: patch => changes.forEach(listener => listener(patch, 'local')), setNotify: callback => { notify = callback; } };
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
    for (const file of ['assets/js/background.js', 'assets/js/loader.js', 'assets/js/activity-versioning.js', 'assets/js/local-access-settings.js', 'assets/html/activity-versioning.html', 'assets/html/email-studio-diagnostics.html']) assert.equal(accessible(file), false, file);
    for (const file of ['assets/js/content.js', 'assets/js/context.js', 'assets/js/components/tester-editor.js', 'assets/html/modals/dem-preview.html']) assert.equal(accessible(file), true, file);
    assert.ok(manifest.content_security_policy.extension_pages.includes("frame-ancestors 'none'"));
    assert.ok(manifest.content_security_policy.extension_pages.includes("script-src 'self'"));
});

test('Chrome document IDs with 32 hex digits can authorize only their own BU', async () => {
    const w = workerFixture();
    const sender = { ...w.from('https://content-builder.s50.marketingcloudapps.com/'), documentId: 'ABCDEF0123456789ABCDEF0123456789' };
    assert.equal((await w.request(sender, 'register', {})).ok, true);
    assert.equal((await w.request(sender, 'authorize', {}, 's50:123')).ok, true);
    assert.equal((await w.request(sender, 'get', { keys: [SETTINGS] }, 's50:123')).ok, true);
    assert.equal((await w.request(sender, 'get', { keys: [SETTINGS] }, 's50:999')).ok, false);
    for (const documentId of ['', null, 123, ' ', 'bad\nID', '__proto__', 'constructor', 'a'.repeat(129)]) {
        assert.equal((await w.request({ ...sender, documentId }, 'register', {})).ok, false);
    }
    const original = clone(w.state.local[SETTINGS]['s50:123'].testers);
    assert.equal((await w.request(sender, 'merge', { items: { [SETTINGS]: { 's50:123': { testerSource: 'de' } } } }, 's50:123')).ok, true);
    assert.equal(w.state.local[SETTINGS]['s50:123'].testerSource, 'de');
    assert.deepEqual(w.state.local[SETTINGS]['s50:123'].testers, original);
    assert.equal((await w.request(sender, 'merge', { items: { [SETTINGS]: { 's50:123': { testerSource: 'https://arbitrary.invalid/' } } } }, 's50:123')).ok, false);
    assert.equal(w.state.local[SETTINGS]['s50:999'].testerSource, 'local');
});

test('opaque Chrome identity, module errors and mixed extension versions are handled explicitly', async () => {
    const w = workerFixture();
    const sender = { ...w.from('https://content-builder.s50.marketingcloudapps.com/'), documentId: 'opaque-document-token-from-chrome' };
    const version = JSON.parse(read('manifest.json')).version;
    const registered = await w.request(sender, 'register', {});
    assert.equal(registered.ok, true);
    assert.equal(registered.version, version);
    assert.equal((await w.request(sender, 'authorize', {}, 's50:123')).ok, true);
    assert.equal((await w.request(sender, 'get', { keys: [SETTINGS] }, 's50:123')).ok, true);
    assert.equal((await w.request({ ...sender, documentId: 'another-Chrome-document' }, 'get', { keys: [SETTINGS] }, 's50:123')).ok, false);
    assert.equal((await w.request({ ...sender, documentId: undefined }, 'register', {})).code, 'DOCUMENT_ID');
    const shell = { ...sender, url: 'https://mc.s50.exacttarget.com/cloud/#app/Contact%20Builder' };
    assert.equal((await w.request(shell, 'register', {})).code, 'DOCUMENT_MODULE');
    const outdated = await w.send({ __sfmcfixStorage: true, clientVersion: '1.1.12', action: 'register' }, sender);
    assert.equal(outdated.ok, false); assert.equal(outdated.code, 'VERSION_MISMATCH');
    for (const file of ['assets/js/background.js', 'assets/js/loader.js']) assert.ok(read(file).includes(`const VERSION = '${version}';`));
});

test('a synchronous storage protection failure still returns a fail-closed error', async () => {
    const w = workerFixture({ failAccess: true });
    const sender = w.from('https://content-builder.s50.marketingcloudapps.com/');
    const response = await w.request(sender, 'register', {});
    assert.equal(response.ok, false);
    assert.equal(response.code, 'STORAGE_INIT');
    assert.ok(!JSON.stringify(response).includes('mario@example.com'));
});

const APPROVALS = 'SFMCFIX---SESSION-APPROVALS', DOCUMENTS = 'SFMCFIX---DOCUMENT-GRANTS';
const lifetime = 12 * 60 * 60 * 1000;
test('session consent resumes for new documents and tabs, isolated by origin, module and BU', async () => {
    const w = workerFixture(), url = 'https://content-builder.s50.marketingcloudapps.com/';
    const first = w.from(url), next = w.from(url, 2);
    const access = (sender, scope) => w.request(sender, 'requestAccess', {}, scope);
    assert.equal((await access(first, 's50:123')).result.state, 'ask');
    assert.equal((await access(next, 's50:123')).result.state, 'waiting');
    assert.equal((await w.request(first, 'authorize', {}, 's50:123')).result.state, 'granted');
    const expiry = Object.values(w.state.session[APPROVALS])[0].expiresAt;
    w.advance(1000);
    // A remembered decision still needs a fresh binding to the browser document.
    assert.equal((await w.request(next, 'get', { keys: [SETTINGS] }, 's50:123')).code, 'LOCAL_ACCESS_REQUIRED');
    assert.equal((await access(next, 's50:123')).result.state, 'granted');
    assert.equal((await w.request(next, 'get', { keys: [SETTINGS] }, 's50:123')).ok, true);
    assert.equal((await w.request({ ...next, tab: { id: 999 } }, 'get', { keys: [SETTINGS] }, 's50:123')).ok, false);
    assert.equal(w.state.session[DOCUMENTS][next.documentId].expiresAt, expiry);
    assert.equal((await access(next, 's50:999')).result.state, 'ask');
    for (const [otherURL, scope] of [
        ['https://content-builder.s50.exacttarget.com/', 's50:123'],
        ['https://content-builder.s10.marketingcloudapps.com/', 's10:123'],
        ['https://mc.s50.marketingcloudapps.com/AutomationStudioFuel3/', 's50:123']
    ]) assert.equal((await access(w.from(otherURL, 3), scope)).result.state, 'ask');
    assert.equal((await access(next, 's10:123')).ok, false);
    // Re-registering a document cannot extend the absolute decision expiry.
    assert.equal((await w.request(first, 'register', {})).ok, true);
    assert.equal(w.state.session[DOCUMENTS][first.documentId].expiresAt, expiry);
    w.advance(lifetime - 1002);
    await w.request(first, 'register', {});
    w.advance(3);
    assert.equal((await w.request(first, 'get', { keys: [SETTINGS] }, 's50:123')).code, 'LOCAL_ACCESS_REQUIRED');
    assert.equal((await access(first, 's50:123')).result.state, 'ask');
    const count = w.messages.length;
    w.emit({ [SETTINGS]: { newValue: clone(w.state.local[SETTINGS]) }, [UI]: { newValue: { hidePreviewIcons: true } } });
    await new Promise(resolve => setImmediate(resolve));
    assert.ok(w.messages.length > count); // Recent document still receives nonsensitive UI changes.
    assert.ok(w.messages.slice(count).every(sent => !sent.message.changes[SETTINGS]));
});

test('denials persist through new documents, expire, and reset only from private settings', async () => {
    const w = workerFixture(), url = 'https://content-builder.s50.marketingcloudapps.com/';
    const first = w.from(url), next = w.from(url, 2), denied = w.from(url, 3);
    const internal = { id: 'security-fixture', url: w.extension + 'assets/html/activity-versioning.html' };
    for (const doc of [first, next, denied]) await w.request(doc, 'register', {});
    await w.request(first, 'authorize', {}, 's50:123');
    await w.request(next, 'requestAccess', {}, 's50:123');
    await w.request(denied, 'denyAccess', {}, 's50:123');
    assert.equal((await w.request(next, 'requestAccess', {}, 's50:123')).result.state, 'denied');
    assert.equal((await w.request(first, 'get', { keys: [SETTINGS] }, 's50:123')).ok, false);
    assert.equal((await w.request(first, 'resetLocalAccess', {})).ok, false);
    const local = clone(w.state.local);
    assert.equal((await w.request(internal, 'resetLocalAccess')).ok, true);
    assert.deepEqual(w.state.local, local);
    assert.deepEqual(w.state.session[APPROVALS], {});
    assert.ok(Object.values(w.state.session[DOCUMENTS]).every(grant => grant.scope === null && grant.expiresAt === null));
    assert.deepEqual(w.messages.filter(sent => sent.message.__sfmcfixLocalAccessReset).map(sent => sent.options.documentId).sort(),
        [first, next, denied].map(doc => doc.documentId).sort());
    assert.equal((await w.request(next, 'requestAccess', {}, 's50:123')).result.state, 'ask');
    await w.request(next, 'denyAccess', {}, 's50:123');
    w.advance(lifetime + 1);
    assert.equal((await w.request(next, 'requestAccess', {}, 's50:123')).result.state, 'ask');
});

test('an abandoned confirmation expires without unlocking data or blocking another document forever', async () => {
    const w = workerFixture(), url = 'https://content-builder.s50.marketingcloudapps.com/';
    const first = w.from(url), next = w.from(url, 2);
    assert.equal((await w.request(first, 'requestAccess', {}, 's50:123')).result.state, 'ask');
    assert.equal((await w.request(next, 'requestAccess', {}, 's50:123')).result.state, 'waiting');
    assert.equal((await w.request(next, 'get', { keys: [SETTINGS] }, 's50:123')).ok, false);
    w.advance(120001);
    assert.equal((await w.request(next, 'requestAccess', {}, 's50:123')).result.state, 'ask');
});


test('tester folder paths are validated, scoped and preserved independently of local tester contacts', async () => {
    const w = workerFixture(), content = w.from('https://content-builder.s50.marketingcloudapps.com/');
    await w.request(content, 'authorize', {}, 's50:123');
    const merge = path => w.request(content, 'merge', { items: { [SETTINGS]: { 's50:123': { testerSource: 'de', testerFolderPath: path } } } }, 's50:123');
    const saved = await merge(['Progetti', 'SFMC_UI_Fixer']); assert.equal(saved.ok, true);
    assert.deepEqual(saved.result[SETTINGS]['s50:123'].testerFolderPath, ['Progetti', 'SFMC_UI_Fixer']);
    assert.equal(w.state.local[SETTINGS]['s50:123'].testers[0][1], 'Mario');
    assert.equal(w.state.local[SETTINGS]['s50:999'].testerFolderPath, undefined);
    for (const invalid of ['https://arbitrary.invalid/', [], ['Wrong'], ['Bad/segment', 'SFMC_UI_Fixer'],
        ['x'.repeat(251), 'SFMC_UI_Fixer'], Array(21).fill('SFMC_UI_Fixer'), ['\u0000', 'SFMC_UI_Fixer']]) {
        assert.equal((await merge(invalid)).ok, false);
    }
    assert.deepEqual(w.state.local[SETTINGS]['s50:123'].testerFolderPath, ['Progetti', 'SFMC_UI_Fixer']);
});
