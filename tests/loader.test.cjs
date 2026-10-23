const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8')).version;
const code = fs.readFileSync(path.join(root, 'assets/js/loader.js'), 'utf8');

async function fixture(reply, mode) {
    const errors = [], messages = [];
    const location = new URL('https://content-builder.s50.marketingcloudapps.com/');
    const runtime = { id: 'fixture', lastError: undefined, getURL: path => 'chrome-extension://fixture/' + path,
        onMessage: { addListener: () => {} }, sendMessage: (message, callback) => {
            messages.push(message);
            if (mode === 'throw') throw Error('Extension context invalidated.');
            if (mode === 'lastError') runtime.lastError = { message: 'The message port closed before a response was received.' };
            callback(reply);
            runtime.lastError = undefined;
        }
    };
    vm.runInNewContext(code, { URL, location, chrome: { runtime }, window: { addEventListener: () => {} },
        console: { error: message => errors.push(message) }, document: { createElement: () => ({}), head: { appendChild: () => {} } } });
    await new Promise(resolve => setImmediate(resolve));
    return { errors, messages };
}

test('loader identifies obsolete workers, disconnected contexts and explicit registration errors', async () => {
    const working = await fixture({ ok: true, result: true, version });
    assert.equal(working.errors.length, 0);
    assert.equal(working.messages[0].clientVersion, version);
    for (const [reply, mode, cause] of [
        [{ ok: true, result: true }, undefined, 'VERSION_MISMATCH'],
        [{ ok: false, code: 'DOCUMENT_ID', error: 'Documento assente.', version }, undefined, 'DOCUMENT_ID'],
        [undefined, 'throw', 'EXTENSION_CONTEXT'],
        [undefined, 'lastError', 'EXTENSION_CONNECTION']
    ]) {
        const result = await fixture(reply, mode);
        assert.equal(result.errors.length, 1);
        assert.ok(result.errors[0].includes(`[${cause}]`));
        assert.ok(result.errors[0].includes(version));
        assert.ok(!result.errors[0].includes('undefined'));
    }
});

function bridgeFixture(handler, allowed = true) {
    let onPageMessage, onRuntimeMessage, nextID = 0;
    const posted = [], messages = [], confirms = [];
    const location = new URL('https://content-builder.s50.marketingcloudapps.com/');
    const window = {
        addEventListener: (type, listener) => { if (type === 'message') onPageMessage = listener; },
        postMessage: message => posted.push(message),
        confirm: message => { confirms.push(message); return allowed; }
    };
    const runtime = { id: 'fixture', getURL: path => 'chrome-extension://fixture/' + path,
        onMessage: { addListener: listener => { onRuntimeMessage = listener; } },
        sendMessage: (message, callback) => {
            messages.push(message);
            Promise.resolve(message.action === 'register' ? true : handler(message)).then(result => {
                if (result?.fixtureFailure) callback({ ok: false, code: result.fixtureFailure, error: 'Expired', version });
                else callback({ ok: true, result, version });
            });
        }
    };
    vm.runInNewContext(code, { URL, location, chrome: { runtime }, window, console, setTimeout,
        document: { createElement: () => ({}), head: { appendChild: () => {} } } });
    return { confirms, messages, posted,
        reset: (sender = { id: 'fixture' }) => onRuntimeMessage({ __sfmcfixLocalAccessReset: true }, sender),
        request: async (action = 'get') => {
            const id = `request-${++nextID}`;
            await onPageMessage({ source: window, origin: location.origin, data: {
                source: 'sfmcfix-storage', direction: 'request', id, action,
                scope: 's50:123', payload: { keys: ['SFMCFIX---SETTINGS-V2'] }
            } });
            return posted.find(message => message.id === id);
        }
    };
}

test('loader reuses remembered access without dialogs and rejects page authorization/reset attempts', async () => {
    const f = bridgeFixture(message => message.action === 'requestAccess' ? { state: 'granted' } : { scoped: true });
    assert.equal((await f.request()).ok, true);
    assert.equal((await f.request()).ok, true);
    assert.equal(f.confirms.length, 0);
    assert.equal(f.messages.filter(message => message.action === 'requestAccess').length, 1);
    for (const action of ['requestAccess', 'authorize', 'denyAccess', 'resetLocalAccess']) {
        assert.equal((await f.request(action)).ok, false);
        assert.equal(f.messages.some(message => message.action === action && action !== 'requestAccess'), false);
    }
});

test('loader prompts once on first access and retries expired document grants through the worker', async () => {
    let state = 'ask', failRead = false;
    const f = bridgeFixture(message => {
        if (message.action === 'requestAccess') return { state };
        if (message.action === 'authorize') { state = 'granted'; return { state }; }
        if (failRead) { failRead = false; return { fixtureFailure: 'LOCAL_ACCESS_REQUIRED' }; }
        return { scoped: true };
    });
    assert.equal((await f.request()).ok, true);
    assert.equal(f.confirms.length, 1);
    assert.ok(f.confirms[0].includes('BU 123'));
    assert.ok(f.confirms[0].includes('12 ore'));
    assert.equal((await f.request()).ok, true);
    assert.equal(f.confirms.length, 1);
    state = 'ask'; failRead = true;
    assert.equal((await f.request()).ok, true);
    assert.equal(f.confirms.length, 2);
    f.reset({ id: 'untrusted-extension' });
    assert.equal((await f.request()).ok, true);
    assert.equal(f.confirms.length, 2);
    state = 'ask'; f.reset();
    assert.ok(f.posted.some(message => message.changes?.['SFMCFIX---SETTINGS-V2']?.accessReset));
    assert.equal((await f.request()).ok, true);
    assert.equal(f.confirms.length, 3);
});

test('loader remembers rejection through the worker and reset lets the user choose again', async () => {
    let state = 'ask';
    const f = bridgeFixture(message => {
        if (message.action === 'requestAccess') return { state };
        if (message.action === 'denyAccess') { state = 'denied'; return { state }; }
        throw Error('Sensitive read must not run after denial');
    }, false);
    assert.equal((await f.request()).ok, false);
    assert.equal((await f.request()).ok, false);
    assert.equal(f.confirms.length, 1);
    assert.equal(f.messages.some(message => message.action === 'get'), false);
    state = 'ask'; f.reset();
    assert.equal((await f.request()).ok, false);
    assert.equal(f.confirms.length, 2);
});

test('parallel requests in a document share the same prompt and pending access is invalidated by reset', async () => {
    let resolveAccess;
    const f = bridgeFixture(message => message.action === 'requestAccess' ?
        new Promise(resolve => { resolveAccess = resolve; }) : { scoped: true });
    const first = f.request(), second = f.request();
    assert.equal(f.messages.filter(message => message.action === 'requestAccess').length, 1);
    f.reset(); resolveAccess({ state: 'granted' });
    assert.equal((await first).ok, false);
    assert.equal((await second).ok, false);
    assert.equal(f.messages.some(message => message.action === 'get'), false);
    assert.equal(f.confirms.length, 0);
});
