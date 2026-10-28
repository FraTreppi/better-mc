// Native picker fixture using the actual Content Builder bootstrap and jQuery hooks.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require(process.env.SFMCFIX_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const A = '00000000-0000-4000-8000-000000000001', B = '00000000-0000-4000-8000-000000000002';
(async () => {
    const browser = await chromium.launch({ executablePath: process.env.SFMCFIX_CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
    try {
        const ctx = await browser.newContext(), errors = [], requests = [];
        let forbidden = false;
        await ctx.addInitScript(() => {
            window.addEventListener('message', event => {
                if (event.source !== window || event.data?.source !== 'sfmcfix-storage' || event.data.direction !== 'request') return;
                const msg = event.data, key = msg.payload.keys?.[0];
                window.postMessage({ source: 'sfmcfix-storage', direction: 'response', id: msg.id, ok: true,
                    result: { [key]: key === 'SFMCFIX---SETTINGS-V2' ? { [msg.scope]: { testers: [] } } : { hidePreviewIcons: false } } }, location.origin);
            });
        });
        await ctx.route('https://**/*', route => {
            const url = new URL(route.request().url()), name = url.pathname;
            if (name === '/jquery.js') return route.fulfill({ contentType: 'application/javascript', body: fs.readFileSync('/usr/share/javascript/jquery/jquery.js') });
            if (name.startsWith('/assets/')) return route.fulfill({ contentType: name.endsWith('.js') ? 'application/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html', body: fs.readFileSync(root + name) });
            if (name.startsWith('/fuelapi/')) {
                requests.push({ method: route.request().method(), path: name });
                if (name === '/fuelapi/platform/v1/tokenContext') return route.fulfill({ json: { organization: { id: 123 } } });
                if (name.startsWith('/fuelapi/asset/v1/content/assets/')) {
                    const id = Number(name.split('/').at(-1));
                    return route.fulfill({ json: { id, name: 'Email ' + id, assetType: { id: 208 }, legacyData: { legacyId: id === 1001 ? 101 : 202 } } });
                }
                if (name === '/fuelapi/platform-internal/v1/categories/0/children') return route.fulfill({ json: {
                    count: 1, page: 1, pageSize: 25, items: [{ id: 782, parentId: 0, categoryType: 'dataextension', name: 'Data Extensions' }]
                } });
                if (name === '/fuelapi/platform-internal/v1/categories/782/children') {
                    const page = Number(url.searchParams.get('$page')) || 1;
                    return route.fulfill({ json: { count: 60, page, pageSize: 25, links: {},
                        items: Array.from({ length: 60 }, (_, i) => ({ id: 20 + i, parentId: 782, name: 'Folder ' + (i + 1), categoryType: 'dataextension' })).slice((page - 1) * 25, page * 25) } });
                }
                if (name === '/fuelapi/data-internal/v1/customobjects/category/20') return route.fulfill({ json: { count: 1, items: [{ id: A, name: 'DE clienti' }] } });
                if (/\/customobjects\/[0-9a-f-]{36}$/.test(name)) {
                    if (route.request().headers()['x-fixture-native'] !== 'configured') return route.fulfill({ status: 403, json: {} });
                    if (forbidden) return route.fulfill({ status: 403, json: {} });
                    const id = name.split('/').at(-1);
                    return route.fulfill({ json: { id, name: id === A ? 'DE clienti' : 'DE nuova' } });
                }
                if (name === '/fuelapi/guide/v1/emails/preview/send') return route.fulfill({ json: { success: true } });
                if (name.endsWith('/preview') && route.request().method() === 'POST') return route.fulfill({ json: { message: { views: [{ content: 'PRIVATE_RENDERED_HTML' }] } } });
                throw Error('Unexpected native/server call: ' + name);
            }
            return route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head><script src="/jquery.js"></script>
                <script id="sfmc-fixer-config" type="application/json">{"extensionPath":"/","timestamp":1}</script>
                <script>jQuery.ajaxSetup({beforeSend:function(xhr){xhr.setRequestHeader('X-Fixture-Native','configured')}});</script>
                <script src="/assets/js/content.js"></script></head><body>
                <main id="preview-panel"><div class="test-send-recipients-tab-content"><div class="test-send-recipients-pillbox"><input class="pillbox-add-item"></div></div></main>
                <button id="open-picker">Seleziona DE</button><button id="change-email">Cambia email</button><button id="preview-record">Preview record</button><button id="send-test">Send Test</button>
                <ul id="picker-tree"></ul><button id="load-more">Load More</button><ul id="records"></ul><p id="status"></p>
                <script>
                    window.__page = 0; window.__selected = null;
                    function ajax(options) { return jQuery.ajax(Object.assign({dataType:'json',useFuel2Token:true},options)); }
                    function render(items) { for (const item of items) {
                        const li = document.createElement('li'); li.className='tree-branch'; li.dataset.id=String(item.id);
                        const button = document.createElement('button'); button.textContent=item.name;
                        button.onclick=function(){document.querySelector('#status').textContent='Caricamento';ajax({url:'/fuelapi/data-internal/v1/customobjects/category/'+item.id,success:function(data){
                            document.querySelector('#records').replaceChildren();for(const de of data.items){const row=document.createElement('button');row.textContent=de.name;row.dataset.de=de.id;
                            row.onclick=function(){window.__selected=de.id;document.querySelector('#status').textContent='Record selezionato'};document.querySelector('#records').append(row)}
                            document.querySelector('#status').textContent='Elenco: '+data.items.length},error:function(){document.querySelector('#status').textContent='Errore lettura'}})};
                        li.append(button);document.querySelector('#picker-tree').append(li);
                    } }
                    async function loadMore() { await ajax({url:'/fuelapi/platform-internal/v1/categories/782/children?$page='+(++window.__page),success:function(data){window.__lastCount=data.count;render(data.items)}}); }
                    document.querySelector('#open-picker').onclick=async function(){document.querySelector('#picker-tree').replaceChildren();window.__page=0;
                        await ajax({url:'/fuelapi/platform-internal/v1/categories/0/children'});await loadMore()};
                    document.querySelector('#load-more').onclick=loadMore;
                    document.querySelector('#change-email').onclick=function(){ajax({url:'/fuelapi/asset/v1/content/assets/2002',success:function(){document.querySelector('#status').textContent='Email cambiata'}})};
                    document.querySelector('#preview-record').onclick=function(){ajax({url:'/fuelapi/guide/v1/emails/'+sfmcfix.temp.currentasset.legacyData.legacyId+'/dataExtension/'+window.__selected+'/row/0/preview',type:'POST',success:function(){document.querySelector('#status').textContent='Preview completata'}})};
                    document.querySelector('#send-test').onclick=function(){ajax({url:'/fuelapi/guide/v1/emails/preview/send',type:'POST',contentType:'application/json',data:JSON.stringify({emailID:101,recipients:['tester@example.com'],dataSource:{type:'DataExtension',id:window.__selected,row:0}}),success:function(){document.querySelector('#status').textContent='Invio nativo simulato'}})};
                    const ready=setInterval(function(){if(window.sfmcfix?.recentPreviewDEs && document.querySelector('.previewandtest-toolbox')){
                        clearInterval(ready);ajax({url:'/fuelapi/asset/v1/content/assets/1001',success:function(){document.querySelector('#status').textContent='Pronto'}})}},20);
                </script></body></html>` });
        });
        const page = await ctx.newPage(); page.on('pageerror', error => errors.push(error.message));
        await page.goto('https://content-builder.s50.marketingcloudapps.com/');
        await page.locator('#status').getByText('Pronto', { exact: true }).waitFor();
        const open = async () => { await page.locator('#open-picker').click(); await page.locator('#picker-tree > li').nth(25).waitFor(); };
        await open();
        const virtual = page.locator('#picker-tree > li[data-id="999999999"],#picker-tree > li[data-id="999999990"]');
        assert.equal(await virtual.count(), 1);
        for (const count of [51, 61]) {
            await page.locator('#load-more').click(); await page.waitForFunction(count => document.querySelector('#picker-tree').children.length === count, count);
            assert.equal(await virtual.count(), 1); assert.equal(await page.evaluate(() => __lastCount), 61);
        }
        await page.getByRole('button', { name: 'Folder 1', exact: true }).click();
        await page.locator('#records').getByRole('button', { name: 'DE clienti', exact: true }).click();
        await page.locator('#preview-record').click(); await page.locator('#status').getByText('Preview completata', { exact: true }).waitFor();
        await page.locator('#change-email').click(); await page.locator('#status').getByText('Email cambiata', { exact: true }).waitFor();
        await open();
        await page.getByRole('button', { name: 'DE recenti', exact: true }).click();
        await page.locator('#records').getByRole('button', { name: 'DE clienti', exact: true }).waitFor();
        assert.equal(await page.locator('#records > button').count(), 1);
        const detailCalls = requests.filter(request => request.path.endsWith('/customobjects/' + A)).length;
        await page.getByRole('button', { name: 'DE recenti', exact: true }).click();
        await page.locator('#status').getByText('Elenco: 1', { exact: true }).waitFor();
        assert.equal(requests.filter(request => request.path.endsWith('/customobjects/' + A)).length, detailCalls);
        await page.reload(); await page.locator('#status').getByText('Pronto', { exact: true }).waitFor();
        await open();
        await page.getByRole('button', { name: 'DE recenti', exact: true }).click();
        await page.locator('#records').getByRole('button', { name: 'DE clienti', exact: true }).waitFor();
        const store = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.includes('PREVIEW-DE-RECENTS')));
        assert.equal(store.length, 1); assert.ok(!JSON.stringify(store).includes('PRIVATE_RENDERED_HTML'));
        assert.ok(!requests.some(request => request.path.endsWith('/preview/send')));
        await page.evaluate(() => {
            sfmcfix.local.setItem('testsendlogs', JSON.stringify([{ logdate: new Date().toISOString(), emailID: 101,
                dataSource: { type: 'DataExtension', id: '00000000-0000-4000-8000-000000000001', row: 0 }, recipients: [] }]));
            sfmcfix.local.setItem('OTHER_HISTORY', 'preserved');
            for (let i = 1; i <= 22; i++) sfmcfix.recentPreviewDEs.rememberSend({ emailID: 101,
                dataSource: { type: 'DataExtension', id: '00000000-0000-4000-8000-' + String(i).padStart(12, '0') } });
        });
        await page.getByRole('button', { name: 'DE recenti', exact: true }).click();
        await page.locator('#status').getByText('Elenco: 20', { exact: true }).waitFor();
        assert.equal(await page.locator('#records > button').count(), 20);
        const beforeClear = requests.length;
        await page.getByRole('button', { name: 'Svuota recenti', exact: true }).click();
        assert.equal(requests.length, beforeClear); // Clear must not trigger the native folder click.
        await page.getByRole('button', { name: 'DE recenti', exact: true }).click();
        await page.locator('#status').getByText('Elenco: 0', { exact: true }).waitFor();
        assert.equal(await page.evaluate(() => JSON.parse(sfmcfix.local.getItem('testsendlogs')).length), 1);
        assert.equal(await page.evaluate(() => sfmcfix.local.getItem('OTHER_HISTORY')), 'preserved');
        await page.reload(); await page.locator('#status').getByText('Pronto', { exact: true }).waitFor(); await open();
        await page.getByRole('button', { name: 'DE recenti', exact: true }).click();
        await page.locator('#status').getByText('Elenco: 0', { exact: true }).waitFor();
        await page.getByRole('button', { name: 'Folder 1', exact: true }).click();
        await page.locator('#records').getByRole('button', { name: 'DE clienti', exact: true }).click();
        await page.locator('#preview-record').click(); await page.locator('#status').getByText('Preview completata', { exact: true }).waitFor();
        forbidden = true;
        await page.reload(); await page.locator('#status').getByText('Pronto', { exact: true }).waitFor(); await open();
        await page.getByRole('button', { name: 'DE recenti', exact: true }).click();
        await page.locator('#status').getByText('Errore lettura', { exact: true }).waitFor();
        const legacyLog = await page.evaluate(() => sfmcfix.local.getItem('testsendlogs'));
        await page.locator('#send-test').click();
        await page.locator('#status').getByText('Invio nativo simulato', { exact: true }).waitFor();
        assert.equal(requests.filter(request => request.path.endsWith('/preview/send')).length, 1);
        assert.equal(await page.evaluate(() => sfmcfix.local.getItem('testsendlogs')), legacyLog);
        assert.equal(await page.locator('#testsendlog-viewer, [data-action="open-log-container"], #sfmcfix-test-tracking, #dempreview-iframe-modal').count(), 0);
        assert.equal(await page.locator('[data-context-action="testers"]').count(), 1);
        assert.deepEqual(errors, []);
        console.log('PASS actual bootstrap + native jQuery picker: successful preview without send survives email change/reload; one BU history with twenty distinct DEs; three native pages keep one shortcut and 60 native folders; clear survives reload without erasing Test History or other histories; metadata uses native session and cache; 403 completes; records/HTML are not stored; simulated native send remains unmodified and writes no Test History; tester settings remain and removed controls are absent.');
        await ctx.close();
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
