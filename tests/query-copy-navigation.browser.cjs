// Native copy wizard fixture. Salesforce responses are simulated; no real writes.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require(process.env.SFMCFIX_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const A = '00000000-0000-4000-8000-000000000001', B = '00000000-0000-4000-8000-000000000002';
(async () => {
    const browser = await chromium.launch({ executablePath: process.env.SFMCFIX_CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
    try {
        async function fixture(startHash = '#ActivityDetails/300/' + A) {
            const ctx = await browser.newContext(), page = await ctx.newPage(), errors = [], calls = [];
            let hold = null;
            page.on('pageerror', error => errors.push(error.message));
            await ctx.addInitScript(() => window.addEventListener('message', event => {
                const msg = event.data;
                if (event.source === window && msg?.source === 'sfmcfix-storage' && msg.direction === 'request') {
                    window.postMessage({ source: 'sfmcfix-storage', direction: 'response', id: msg.id, ok: true, result: { [msg.payload.keys?.[0]]: {} } }, location.origin);
                }
            }));
            await ctx.route('https://**/*', async route => {
                const req = route.request(), url = new URL(req.url()), name = url.pathname;
                if (name === '/jquery.js') return route.fulfill({ contentType: 'application/javascript', body: fs.readFileSync('/usr/share/javascript/jquery/jquery.js') });
                if (name.startsWith('/assets/')) return route.fulfill({ contentType: name.endsWith('.js') ? 'application/javascript' : 'text/css', body: fs.readFileSync(root + name) });
                const apiPath=name.replace(/^\/AutomationStudioFuel3(?=\/fuelapi\/)/i,'');
                if (apiPath.startsWith('/fuelapi/')) {
                    calls.push({ method: req.method(), path: name, body: req.postData() });
                    if (req.method() === 'GET' && apiPath.startsWith('/fuelapi/automation/v1/queries/')) {
                        const id = name.split('/').at(-1);
                        return route.fulfill({ json: { queryDefinitionId: id, name: id === A ? 'Originale' : 'Nuova query', queryText: 'SELECT 1', modifiedDate: '2026-10-28T10:00:00Z' } });
                    }
                    if (req.method() === 'POST' || req.method() === 'PUT') {
                        if (url.searchParams.has('hold')) { hold = route; return; }
                        if (url.searchParams.has('fail')) return route.fulfill({ status: 403, json: { message: 'Not authorized' } });
                        return route.fulfill({ json: { queryDefinitionId: url.searchParams.get('result') || B } });
                    }
                    throw Error('Unexpected request ' + req.method() + ' ' + name);
                }
                return route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head><script src="/jquery.js"></script>
                    <script id="sfmc-fixer-config" type="application/json">{"extensionPath":"/","timestamp":1}</script><script src="/assets/js/content.js"></script>
                    </head><body><h1 id="query-name">Originale</h1><button id="native-copy">Copy</button><button id="native-save">Save</button>
                    <div id="summaryQueryEditor"></div><p id="status"></p>
                    <div id="wizard" class="modal" role="dialog" hidden><h2>Copy Query Activity</h2><label>Nome<input value="Nuova query"></label><button id="next">Next</button><button id="finish" type="button" class="btn btn-primary accept" data-original-title="" title="">Finish</button><button id="cancel">Cancel</button></div>
                    <script>
                    window.__path='/fuelapi/automation/v1/queries/';window.__mode='';window.__keepOpen=false;window.__returnToOriginal=false;window.__wizardRoute=false;window.__returnDelay=0;window.__callbacks=0;window.__cancelled=0;
                    window.ace={edit:()=>({selectAll:()=>{},focus:()=>{},setValue:()=>{}})};document.execCommand=()=>true;
                    function readQuery(){const id=location.hash.split('/')[2];if(!/^[0-9a-f-]{36}$/i.test(id||''))return jQuery.Deferred().resolve().promise();return jQuery.ajax({url:'/fuelapi/automation/v1/queries/'+id,dataType:'json',success:data=>document.querySelector('#query-name').textContent=data.name})}
                    function createQuery(){(window.__nativeJQuery || jQuery).ajax({url:__path+__mode,type:'POST',dataType:'json',contentType:'application/json',data:JSON.stringify({name:'Nuova query',queryText:'SELECT 1',targetId:'target-fixture'}),
                        success:function(){__callbacks++;if(__wizardRoute){if(__returnDelay)setTimeout(()=>{location.hash='#ActivityDetails/300/${A}'},__returnDelay);else location.hash='#ActivityDetails/300/${A}'}if(__returnToOriginal)window.dispatchEvent(new HashChangeEvent('hashchange',{newURL:location.href,oldURL:location.href}));if(!__keepOpen)document.querySelector('#wizard').hidden=true;document.querySelector('#status').textContent='Salvata'},
                        error:function(){document.querySelector('#status').textContent='Errore'}})}
                    document.querySelector('#native-copy').onclick=()=>{if(__wizardRoute)location.hash='#native-query-copy-wizard';document.querySelector('#wizard').hidden=false;document.querySelector('#status').textContent='Passaggio 1'};
                    document.querySelector('#next').onclick=()=>document.querySelector('#status').textContent='Passaggio 2';
                    document.querySelector('#finish').onclick=createQuery;
                    document.querySelector('#native-save').onclick=createQuery;
                    document.querySelector('#cancel').onclick=()=>{__cancelled++;document.querySelector('#wizard').hidden=true};
                    window.addEventListener('hashchange',readQuery);
                    const ready=setInterval(()=>{if(window.sfmcfix?.queryCopyNavigation){clearInterval(ready);readQuery().done(()=>document.querySelector('#status').textContent='Pronto')}},20);
                    </script></body></html>` });
            });
            await page.goto(`https://mc.s50.marketingcloudapps.com/AutomationStudioFuel3/?mid=123${startHash}`);
            await page.locator('#status').getByText('Pronto', { exact: true }).waitFor();
            await page.clock.install();
            await page.clock.pauseAt(new Date());
            return { ctx, page, errors, calls, release: async () => { const route = hold; assert.ok(route); hold = null; await route.fulfill({ json: { queryDefinitionId: B } }); }, held: () => Boolean(hold) };
        }
        const start = async f => { await f.page.locator('#native-copy').click(); await f.page.locator('#next').click(); };
        const finish = async f => { await f.page.locator('#finish').click(); await f.page.locator('#status').getByText('Salvata', { exact: true }).waitFor(); };
        const original = async f => { await f.page.clock.runFor(1200); assert.ok(f.page.url().endsWith(A)); assert.deepEqual(f.errors, []); };
        for(const requestPath of ['/AutomationStudioFuel3/fuelapi/automation/v1/queries/', 'fuelapi/automation/v1/queries/', 'https://mc.s50.marketingcloudapps.com/AutomationStudioFuel3/fuelapi/automation/v1/queries/']) {
            const f=await fixture();
            await f.page.evaluate(requestPath=>{
                __wizardRoute=true;__path=requestPath;
                document.querySelector('#native-copy').textContent='◻';
            },requestPath);
            await start(f);await f.page.clock.runFor(100);await finish(f);await f.page.clock.runFor(700);
            const report=await f.page.evaluate(()=>sfmcfix.queryCopyNavigation.diagnostics());
            assert.ok(f.page.url().endsWith(B), 'module-prefixed request failed: '+JSON.stringify(report));
            assert.equal(report.result,'navigated');assert.equal(report.requests.length,1);
            assert.equal(f.calls.filter(call=>call.method==='POST').length,1);
            assert.deepEqual(f.errors,[]);await f.ctx.close();
        }
        {
            const f = await fixture();
            await f.page.evaluate(() => {
                __wizardRoute = true;
                document.querySelector('#native-copy').innerHTML = '<i class="copy-icon"></i>';
                document.querySelector('#native-copy').style.cssText = 'min-width:25px;min-height:25px';
            });
            await start(f); await f.page.clock.runFor(100);
            assert.ok(f.page.url().endsWith('#native-query-copy-wizard'));
            await finish(f); await f.page.clock.runFor(700);
            const diagnostic = await f.page.evaluate(() => sfmcfix.queryCopyNavigation.diagnostics());
            assert.ok(f.page.url().endsWith(B), 'recognized Copy/Finish on a temporary wizard route must open the returned new query: ' + JSON.stringify(diagnostic));
            assert.equal(diagnostic.result, 'navigated');
            assert.equal(f.calls.filter(call=>call.method==='POST').length, 1);
            assert.deepEqual(f.errors, []); await f.ctx.close();
        }
        {
            const f = await fixture();
            await f.page.evaluate(() => {
                document.querySelector('#native-copy').innerHTML = '<i class="fuelux-icon fuelux-icon-copy"></i>';
                document.querySelector('#native-copy').style.minHeight = '25px';
                document.querySelector('#native-copy').style.minWidth = '25px';
                document.querySelector('#wizard h2').textContent = 'Copy Query Activity';
            });
            await start(f); await f.page.evaluate(() => { __keepOpen = true; __returnToOriginal = true; });
            await finish(f); await original(f); // Success alone does not dismiss/navigate away from the wizard.
            await f.page.evaluate(() => { document.querySelector('#wizard').hidden = true; });
            await f.page.clock.runFor(500);
            assert.ok(f.page.url().endsWith(B), 'icon-only Copy followed by Copy Query Activity → Finish must open the new query');
            await f.page.locator('#query-name').getByText('Nuova query', { exact: true }).waitFor();
            assert.ok(f.page.url().endsWith(`/300/${B}`));
            assert.equal(await f.page.evaluate(() => __callbacks), 1);
            assert.equal(f.calls.filter(c => c.method === 'POST').length, 1);
            assert.deepEqual(JSON.parse(f.calls.find(c => c.method === 'POST').body), { name: 'Nuova query', queryText: 'SELECT 1', targetId: 'target-fixture' });
            await f.page.clock.runFor(1500);
            assert.equal(f.calls.filter(c => c.method === 'GET' && c.path.endsWith(B)).length, 1);
            assert.deepEqual(f.errors, []);
            await f.ctx.close();
        }
        {
            const f = await fixture();
            await f.page.locator('#native-save').click(); await f.page.locator('#status').getByText('Salvata', { exact: true }).waitFor(); await original(f);
            await start(f); await f.page.locator('#cancel').click();
            await f.page.locator('#native-save').click(); await f.page.locator('#status').getByText('Salvata', { exact: true }).waitFor(); await original(f);
            assert.equal(await f.page.evaluate(() => __cancelled), 1);
            await f.page.clock.runFor(1100);
            await f.page.locator('.act-copyequery').click(); await original(f); // SQL clipboard Copy is excluded.
            assert.equal(f.calls.filter(c => c.method === 'POST').length, 2);
            await f.ctx.close();
        }
        {
            const f = await fixture();
            await start(f); await f.page.evaluate(() => { __mode = '?fail'; });
            await f.page.locator('#finish').click(); await f.page.locator('#status').getByText('Errore', { exact: true }).waitFor(); await original(f);
            await f.page.evaluate(() => { __mode = ''; }); await finish(f);
            await f.page.clock.runFor(600); await f.page.locator('#query-name').getByText('Nuova query', { exact: true }).waitFor();
            assert.ok(f.page.url().endsWith(B)); assert.equal(f.calls.filter(c => c.method === 'POST').length, 2); assert.deepEqual(f.errors, []);
            await f.ctx.close();
        }
        for (const mode of ['?result=' + A, '?result=invalid']) {
            const f = await fixture(); await start(f); await f.page.evaluate(mode => { __mode = mode; }, mode); await finish(f); await original(f); await f.ctx.close();
        }
        for (const request of [
            { path: '/fuelapi/automation/v1/queries/', method: 'PUT' },
            { path: '/fuelapi/automation/v1/scripts/', method: 'POST' },
            { path: 'https://other.s50.marketingcloudapps.com/fuelapi/automation/v1/queries/', method: 'POST' }
        ]) {
            const f = await fixture(); await start(f);
            await f.page.evaluate(request => {
                // Native Finish supplies the same click intent; substitute only
                // the fixture request to exercise unrelated method/path/origin.
                document.querySelector('#finish').onclick = () => jQuery.ajax({url:request.path,type:request.method,dataType:'json',
                    success:()=>{document.querySelector('#wizard').hidden=true;document.querySelector('#status').textContent='Salvata'}});
            }, request);
            await finish(f); await original(f); await f.ctx.close();
        }
        {
            const f = await fixture(); await start(f); await f.page.clock.runFor(10 * 60 * 1000 - 1000);
            await f.page.evaluate(() => { __mode = '?hold'; }); await f.page.locator('#finish').click(); await assertWait(f.held);
            await f.page.clock.runFor(2000); await f.release(); await f.page.locator('#status').getByText('Salvata', { exact: true }).waitFor();
            await original(f); await f.ctx.close();
        }
        for (const change of ['cancel', 'escape', 'bu', 'navigation']) {
            const f = await fixture(); await start(f); await f.page.evaluate(() => { __mode = '?hold'; }); await f.page.locator('#finish').click();
            await assertWait(f.held);
            if (change === 'cancel') await f.page.locator('#cancel').click();
            if (change === 'escape') { await f.page.keyboard.press('Escape'); await f.page.evaluate(() => { document.querySelector('#wizard').hidden = true; }); }
            if (change === 'bu') await f.page.evaluate(() => { history.replaceState(null, '', '?mid=999' + location.hash); window.dispatchEvent(new Event('sfmcfix:contextchange')); });
            if (change === 'navigation') await f.page.evaluate(() => { location.hash = '#Overview'; });
            await f.release(); await f.page.locator('#status').getByText('Salvata', { exact: true }).waitFor(); await f.page.clock.runFor(1500);
            assert.ok(!f.page.url().endsWith(B)); assert.deepEqual(f.errors, []); await f.ctx.close();
        }
        {
            const f = await fixture(); await start(f); await f.page.evaluate(A => { __path = '/fuelapi/automation/v1/queries/' + A + '/copy'; }, A); await finish(f);
            await f.page.clock.runFor(600); await f.page.locator('#query-name').getByText('Nuova query', { exact: true }).waitFor(); assert.ok(f.page.url().endsWith(B)); assert.deepEqual(f.errors, []); await f.ctx.close();
        }
        {
            const f = await fixture();
            await f.page.evaluate(() => {
                document.querySelector('#native-copy').innerHTML = '<i class="copy-icon"></i>';
                document.querySelector('#native-copy').style.cssText = 'min-width:25px;min-height:25px';
                const wizard = document.querySelector('#wizard'); wizard.className = 'activityConfig'; wizard.removeAttribute('role');
                wizard.querySelector('h2').textContent = 'Copy Query Activity';
            });
            await start(f); await finish(f); await f.page.clock.runFor(600);
            assert.ok(f.page.url().endsWith(B)); assert.deepEqual(f.errors, []); await f.ctx.close();
        }
        for (const separateClient of [false, true]) {
            const f = await fixture();
            if (separateClient) {
                await f.page.addScriptTag({ url: '/jquery.js' });
                await f.page.evaluate(() => {
                    const native = jQuery.noConflict(true);
                    window.requirejs = name => name === 'jquery' ? native : null;
                    window.requirejs.defined = name => name === 'jquery';
                    window.__nativeJQuery = native;
                });
            }
            await f.page.evaluate(() => {
                sfmcfix.temp.activities = {};
                document.querySelector('#native-copy').innerHTML = '<i class="copy-icon"></i>';
                document.querySelector('#native-copy').style.cssText = 'min-width:25px;min-height:25px';
            });
            await start(f); await finish(f); await f.page.clock.runFor(600);
            assert.ok(f.page.url().endsWith(B));
            const report = await f.page.evaluate(() => sfmcfix.queryCopyNavigation.diagnostics());
            assert.equal(report.sourceQueryLoaded, false); assert.equal(report.copyWizardRecognized, true);
            assert.equal(report.result, 'navigated');
            assert.equal(f.calls.filter(call => call.method === 'POST').length, 1);
            assert.deepEqual(f.errors, []); await f.ctx.close();
        }
        {
            const f = await fixture(); await start(f);
            await f.page.evaluate(A => {
                const url = new URL(location.href); url.hash = '#ActivityDetails/300/' + A.toUpperCase() + '/';
                history.replaceState(null, '', url.href);
                window.dispatchEvent(new HashChangeEvent('hashchange', {newURL:url.href}));
            }, A);
            await finish(f); await f.page.clock.runFor(600);
            assert.ok(f.page.url().endsWith(B)); assert.deepEqual(f.errors, []); await f.ctx.close();
        }
        for (const title of ['Edit Query Activity', 'Create Query Activity', 'Copy Script Activity']) {
            const f = await fixture();
            await f.page.evaluate(title => {
                document.querySelector('#native-copy').innerHTML = '<i class="copy-icon"></i>';
                document.querySelector('#native-copy').style.cssText = 'min-width:25px;min-height:25px';
                document.querySelector('#wizard h2').textContent = title;
            }, title);
            await start(f); await finish(f); await original(f);
            assert.equal(await f.page.locator('#sfmcfix-query-copy-diagnostic').count(), 0);
            await f.ctx.close();
        }
        {
            const f = await fixture(); await start(f);
            await f.page.evaluate(() => { __path = '/fuelapi/automation/v1/queries/create'; });
            await finish(f); await f.page.clock.runFor(2500);
            assert.ok(f.page.url().endsWith(A));
            const download = f.page.waitForEvent('download');
            await f.page.getByRole('button', { name: 'Scarica diagnostica apertura', exact: true }).click();
            const file = await download;
            assert.equal(file.suggestedFilename(), 'sfmc-query-copy-diagnostica.json');
            const report = JSON.parse(fs.readFileSync(await file.path(), 'utf8'));
            assert.equal(report.copyWizardRecognized, true); assert.equal(report.finishRecognized, true);
            assert.equal(report.result, 'native-request-unrecognized');
            assert.deepEqual(report.requests, [{ method: 'POST', endpoint: 'other-query-path', eligible: false, status: 200,
                response: { queryDefinitionId: true, id: false, nestedQueryDefinitionId: false, errors: false } }]);
            const serialized = JSON.stringify(report);
            for (const privateValue of [A, B, 'SELECT 1', 'Nuova query', 'target-fixture', '/queries/create']) assert.ok(!serialized.includes(privateValue));
            await f.page.getByRole('button', { name: 'Chiudi', exact: true }).click();
            await f.page.clock.runFor(1000);
            assert.equal(await f.page.locator('#sfmcfix-query-copy-diagnostic').count(), 0);
            assert.equal(f.calls.filter(call => call.method === 'POST').length, 1);
            assert.deepEqual(f.errors, []); await f.ctx.close();
        }
        {
            const f = await fixture();
            const button = f.page.locator('#sfmcfix-query-copy-tools').getByRole('button', {name:'Scarica diagnostica apertura',exact:true});
            await button.waitFor({state:'visible'});
            const bounds = await button.boundingBox(), viewport = f.page.viewportSize();
            assert.ok(bounds.x > viewport.width / 2 && bounds.y > viewport.height / 2);
            const idleDownload = f.page.waitForEvent('download'); await button.click();
            const idle = JSON.parse(fs.readFileSync(await (await idleDownload).path(), 'utf8'));
            assert.equal(idle.result, 'idle'); assert.equal(idle.runtime.queryDetail, true); assert.equal(idle.runtime.lastFinish, null);
            assert.equal(f.calls.filter(call => call.method === 'POST').length, 0);
            await f.page.evaluate(() => {
                document.querySelector('#wizard h2').outerHTML = '<div data-native-title>Copy Query Activity</div>';
            });
            await start(f);
            await f.page.evaluate(() => {
                const backdrop=document.createElement('div');backdrop.className='modal-backdrop';backdrop.style.cssText='position:fixed;inset:0;z-index:1040;background:#0005';document.body.append(backdrop);
                document.querySelector('#wizard').style.cssText='position:relative;z-index:1060;background:white';
            });
            const duringWizard=f.page.waitForEvent('download');await button.click();
            assert.equal((await duringWizard).suggestedFilename(),'sfmc-query-copy-diagnostica.json');
            assert.equal(f.calls.filter(call=>call.method==='POST').length,0); // The diagnostic sits above the native backdrop without submitting Finish.
            await finish(f); await original(f);
            assert.equal(await f.page.locator('#sfmcfix-query-copy-diagnostic').count(),0);
            await button.waitFor({state:'visible'}); // No recognized wizard or auto-failure notice is required.
            const download = f.page.waitForEvent('download'); await button.click();
            const report = JSON.parse(fs.readFileSync(await (await download).path(), 'utf8'));
            assert.equal(report.result, 'finish-unrecognized');
            assert.deepEqual(report.runtime.lastFinish, {dialogFound:true,copyWizardRecognized:false,acceptClass:true});
            for (const privateValue of [A,B,'SELECT 1','Nuova query','target-fixture']) assert.ok(!JSON.stringify(report).includes(privateValue));
            assert.equal(f.calls.filter(call => call.method === 'POST').length,1);
            await f.page.evaluate(() => { location.hash='#Overview'; });
            await f.page.clock.runFor(100);
            assert.equal(await f.page.locator('#sfmcfix-query-copy-tools').count(),0);
            await f.page.evaluate(A => { location.hash='#ActivityDetails/300/'+A; }, A);
            await f.page.clock.runFor(100);
            await button.waitFor({state:'visible'});
            assert.equal(await f.page.locator('#sfmcfix-query-copy-tools').count(),1);
            assert.deepEqual(f.errors,[]); await f.ctx.close();
        }
        {
            const f = await fixture();
            await f.page.evaluate(() => {
                __wizardRoute=true;__returnDelay=2500;
                document.querySelector('#native-copy').innerHTML='<i class="copy-icon"></i>';
                document.querySelector('#native-copy').style.cssText='min-width:25px;min-height:25px';
            });
            await start(f);await f.page.clock.runFor(100);await finish(f);await f.page.clock.runFor(600);
            assert.ok(f.page.url().endsWith('#native-query-copy-wizard'));
            assert.equal(await f.page.evaluate(()=>sfmcfix.queryCopyNavigation.diagnostics().result),'waiting-source-return');
            await f.page.clock.runFor(1500);assert.equal(await f.page.locator('#sfmcfix-query-copy-diagnostic').count(),0);
            await f.page.clock.runFor(1000);assert.ok(f.page.url().endsWith(B));
            const report=await f.page.evaluate(()=>sfmcfix.queryCopyNavigation.diagnostics());
            assert.equal(report.sourceFromRememberedDetail,true);assert.equal(report.wizardRouteDifferent,true);
            assert.equal(report.result,'navigated');
            for(const privateValue of [A,B,'#native-query-copy-wizard','SELECT 1'])assert.ok(!JSON.stringify(report).includes(privateValue));
            assert.deepEqual(f.errors,[]);await f.ctx.close();
        }
        for(const change of ['cancel','bu','navigation']) {
            const f=await fixture();
            await f.page.evaluate(()=>{__wizardRoute=true;__mode='?hold';document.querySelector('#native-copy').textContent='◻';});
            await start(f);await f.page.clock.runFor(100);await f.page.locator('#finish').click();await assertWait(f.held);
            if(change==='cancel')await f.page.locator('#cancel').click();
            if(change==='bu')await f.page.evaluate(()=>{history.replaceState(null,'','?mid=999'+location.hash);window.dispatchEvent(new Event('sfmcfix:contextchange'));});
            if(change==='navigation')await f.page.evaluate(()=>{location.hash='#Overview';});
            await f.release();await f.page.locator('#status').getByText('Salvata',{exact:true}).waitFor();await f.page.clock.runFor(1000);
            assert.ok(!f.page.url().endsWith(B));assert.deepEqual(f.errors,[]);await f.ctx.close();
        }
        for(const missingOrigin of ['not-observed','expired']) {
            const f=await fixture(missingOrigin==='not-observed'?'#native-query-copy-wizard':undefined);
            await f.page.evaluate(()=>{__wizardRoute=true;document.querySelector('#native-copy').textContent='◻';});
            await start(f);await f.page.clock.runFor(missingOrigin==='expired'?10*60*1000+1:100);
            await finish(f);await f.page.clock.runFor(700);
            assert.ok(f.page.url().endsWith(A));
            assert.equal(await f.page.evaluate(()=>sfmcfix.queryCopyNavigation.diagnostics().result),'source-route-unrecognized');
            assert.deepEqual(f.errors,[]);await f.ctx.close();
        }
        console.log('PASS actual Automation Studio bootstrap and native jQuery copy wizard: opens returned new Query Activity in the same tab after completion/close; no duplicate writes, unchanged SQL payload; ordinary save/clipboard Copy/cancel/error/invalid or source IDs/late results after cancel, BU change or navigation never redirect; native retry and explicit copy endpoint supported; exact module-prefixed POST URL supplied by the user, relative and absolute request URLs all open once; temporary wizard route reproduces the supplied failure and now opens after native return; missing/expired source, late responses after cancel/BU/navigation never open; same-source native hashchange and canonicalization survive completion; icon-only launcher, exact Copy Query Activity title and non-Bootstrap wizard supported; edit/create/script wizards excluded; sanitized user-downloaded diagnostics for unknown requests; bottom-right diagnostic button available before Copy and after an entirely unrecognized Finish, removed off query details and restored once on return. Simulated Salesforce only.');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
async function assertWait(check) { for (let i = 0; i < 100; i++) { if (check()) return; await new Promise(resolve => setTimeout(resolve, 20)); } throw Error('Request not captured'); }
