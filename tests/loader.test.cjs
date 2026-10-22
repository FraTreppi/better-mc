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
