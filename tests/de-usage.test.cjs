const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const root = path.resolve(__dirname, '..'), KEY = 'SFMCFIX---DE-USAGE-API';
const id = '00000000-0000-4000-8000-000000000001';
const config = { mid:'123', stack:'s10', authUrl:'https://fixture.auth.marketingcloudapis.com/', clientId:'fictional-id', clientSecret:'FICTIONAL_PRIVATE_SECRET' };
function fixture(options = {}) {
    const listeners = [], calls = [], opened = [], state = { local:{}, session:{} }, extension = 'chrome-extension://' + 'a'.repeat(32) + '/';
    let exists = false, engineConfig, release;
    const storage = { onChanged: { addListener() {} } };
    for (const area of ['local','session']) storage[area] = { setAccessLevel: async () => {}, get: (keys, cb) => cb(keys == null ? state[area] : Object.fromEntries(keys.filter(k => k in state[area]).map(k => [k,state[area][k]]))), set: (items, cb) => { Object.assign(state[area],items); cb(); } };
    const context = vm.createContext({ URL, crypto, console, chrome: { runtime: { id: 'a'.repeat(32), getURL: p => extension + p, onMessage: { addListener: cb => listeners.push(cb) }, getContexts: async () => exists ? [{}] : [], sendMessage: async message => {
        calls.push(message);
        if (message.action === 'configure') { engineConfig = message.config; if (options.holdConfigure) await new Promise(resolve => { release = resolve; }); }
        if (message.action === 'clear') engineConfig = null;
        return { ok:true, result: message.action === 'status' ? {state:engineConfig?.version === message.configVersion ? 'ready' : 'not-configured'} : {state:'ready'} };
    } }, offscreen:{createDocument: async () => { exists = true; }}, storage, tabs: { create: async o => opened.push(o), sendMessage: async () => {} }, action: { onClicked: { addListener() {} } } }, fetch: () => { throw Error('Generic network access forbidden'); } });
    vm.runInContext(fs.readFileSync(root + '/assets/js/background.js', 'utf8'), context);
    vm.runInContext(fs.readFileSync(root + '/assets/js/de-usage-worker.js', 'utf8'), context);
    const sender = { id: 'a'.repeat(32), url: 'https://mc.s10.exacttarget.com/contactsmeta/admin.html#admin/data-extension/' + id + '/properties', documentId: 'opaque-browser-document', tab: { id: 1 } };
    const internal = { id: sender.id, url: extension + 'assets/html/de-usage-settings.html' };
    const dispatch = (message,from) => new Promise(resolve => listeners.forEach(cb => cb(message,from,resolve)));
    const send = (action, data = {}, from = sender) => dispatch({ __sfmcfixDEUsage: true, action, deId: id, scope: 's10:123', ...data },from);
    const access = (action, from = sender, scope = 's10:123') => dispatch({ __sfmcfixStorage:true,action,scope,payload:{} },from);
    return { calls, opened, state, sender, internal, send, access, release: () => release() };
}
test('private configuration verifies API credentials once and creates the combined BU consent without exposing credentials', async () => {
    const f = fixture();
    assert.equal((await f.send('lookup')).result.state,'setup-required');
    assert.equal((await f.send('save',{config,approveBU:true})).ok,false);
    assert.equal((await f.send('save',{config},f.internal)).ok,false);
    assert.equal((await f.send('save',{config,approveBU:true},f.internal)).ok,true);
    assert.ok(!JSON.stringify(await f.send('config',{},f.internal)).includes(config.clientSecret));
    assert.equal((await f.send('lookup')).code,'LOCAL_ACCESS_REQUIRED');
    assert.equal((await f.access('requestAccess')).result.state,'granted');
    assert.equal((await f.send('lookup')).ok,true);
    assert.equal((await f.send('lookup')).ok,true);
    assert.equal(f.calls.filter(c => c.action === 'configure').length,1);
    const content = {...f.sender,url:'https://content-builder.s10.marketingcloudapps.com/',documentId:'content-document'};
    assert.equal((await f.access('requestAccess',content)).result.state,'granted');
    assert.equal((await f.send('clear',{},f.internal)).ok,true);assert.equal(f.state.local[KEY],null);
    assert.equal(f.calls.at(-1).action,'clear');
});
test('wrong BU, stack, DE, module, extension, action and page fail before engine access', async () => {
    const f = fixture(); await f.send('save',{config,approveBU:true},f.internal); await f.access('requestAccess');
    const before = f.calls.length;
    for (const data of [{scope:'s10:999'},{scope:'s50:123'},{deId:'00000000-0000-4000-8000-000000000002'},{offset:-1},{revision:'<script>'}]) assert.equal((await f.send('lookup',data)).ok,false);
    assert.equal((await f.send('https://evil.example/')).ok,false);
    for (const from of [{...f.sender,id:'other'},{...f.sender,url:'https://mc.s10.exacttarget.com/AutomationStudioFuel3/'},{...f.sender,documentId:''}]) assert.equal((await f.send('lookup',{},from)).ok,false);
    assert.equal(f.calls.length,before);
    assert.equal((await f.send('settings')).ok,true);assert.match(f.opened[0].url,/de-usage-settings.html$/);
});
test('resetting the shared BU approval clears the running engine and requires consent again without deleting credentials', async () => {
    const f = fixture(); await f.send('save',{config,approveBU:true},f.internal);await f.access('requestAccess');
    const settings = {...f.internal,url:f.internal.url.replace('de-usage-settings.html','activity-versioning.html')};
    assert.equal((await f.access('resetLocalAccess',settings)).ok,true);
    assert.equal(f.calls.at(-1).action,'clear');assert.ok(f.state.local[KEY]);
    assert.equal((await f.send('lookup')).code,'LOCAL_ACCESS_REQUIRED');
    assert.equal((await f.access('requestAccess')).result.state,'ask');
});
test('an existing BU approval from another module also authorizes API setup without asking again or extending expiry', async () => {
    const f=fixture(),content={...f.sender,url:'https://content-builder.s10.marketingcloudapps.com/',documentId:'another-module'};
    await f.access('authorize',content);
    const expiry=f.state.session['SFMCFIX---SESSION-APPROVALS']['bu-v2|s10:123'].expiresAt;
    assert.equal((await f.send('approval',{mid:'123',stack:'s10'},f.internal)).result.approved,true);
    assert.equal((await f.send('save',{config,approveBU:false},f.internal)).ok,true);
    assert.equal(f.state.session['SFMCFIX---SESSION-APPROVALS']['bu-v2|s10:123'].expiresAt,expiry);
    assert.equal((await f.access('requestAccess')).result.state,'granted');
    assert.equal((await f.send('lookup')).ok,true);
});
test('a late API configuration cannot restore credentials or approval after the user resets consents', async () => {
    const f=fixture({holdConfigure:true}),saving=f.send('save',{config,approveBU:true},f.internal);
    while(!f.calls.some(c=>c.action==='configure'))await new Promise(resolve=>setImmediate(resolve));
    const settings={...f.internal,url:f.internal.url.replace('de-usage-settings.html','activity-versioning.html')};
    assert.equal((await f.access('resetLocalAccess',settings)).ok,true);f.release();
    assert.equal((await saving).ok,false);assert.ok(!f.state.local[KEY]);
    assert.deepEqual(Object.keys(f.state.session['SFMCFIX---SESSION-APPROVALS']),[]);
});
