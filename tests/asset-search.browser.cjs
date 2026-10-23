const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require(process.env.SFMCFIX_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
(async () => {
    const browser = await chromium.launch({ executablePath: process.env.SFMCFIX_CHROMIUM_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), headless: true, args: ['--no-sandbox'] });
    try {
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }), calls = [], errors = [];
        let slow = null, forbidden = false, bad = false, activeMid = '123';
        const folders = [{ id: 10, parentId: 0, name: 'Content Builder' }, { id: 20, parentId: 10, name: 'Campagne' }, { id: 30, parentId: 20, name: 'Archivio' }];
        const items = Array.from({ length: 51 }, (_, i) => ({ id: 1001 + i, name: `Newsletter ${String(i).padStart(3, '0')}`, customerKey: `mail-${i}`, assetType: { id: 208, name: 'htmlemail', displayName: 'HTML Email' }, category: { id: i % 2 ? 20 : 30, name: i % 2 ? 'Campagne' : 'Archivio' }, modifiedDate: '2026-10-22T12:00:00Z' }));
        items.push({ ...items[0], id: 2000, name: 'Unsafe <img src=x onerror="window.__xss=1">', customerKey: '<script>alert(1)</script>' });
        function matches(q, item) {
            if (q.leftOperand) return q.logicalOperator === 'OR' ? matches(q.leftOperand, item) || matches(q.rightOperand, item) : matches(q.leftOperand, item) && matches(q.rightOperand, item);
            const value = q.property.split('.').reduce((object, key) => object?.[key], item);
            if (q.simpleOperator === 'in') return q.values.includes(value);
            if (q.simpleOperator === 'contains') return String(value).toLowerCase().includes(q.value.toLowerCase());
            if (q.simpleOperator === 'equal') return value === q.value;
            if (q.simpleOperator === 'greaterThan') return value > q.value;
            if (q.simpleOperator === 'greaterThanOrEqual') return value >= q.value;
            if (q.simpleOperator === 'lessThan') return value < q.value;
            if (q.simpleOperator === 'like') return new RegExp('^' + q.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*') + '$', 'i').test(value);
            throw Error('Unexpected query operator');
        }
        await ctx.addInitScript(() => {
            window.__nativeOpen = 0; window.__other = 0;
            window.sfmcfix = { retryjQ: callback => callback(), initAjaxHanlders: () => { jQuery.ajaxPrefilter(options => {
                    const success = options.success;
                    options.success = data => { for (const [part, callback] of Object.entries(sfmcfix.ajax.success)) if (options.url.includes(part)) callback(data, null, null, options); success?.(data); };
                }); }, temp: {}, ajax: { success: {}, error: {}, transport: {}, prefilter: {} },
                storage: { getItem: async () => ({}), mergeItem: async () => ({}), onChange: () => {} }, notificationLogger: () => {},
                addCss: file => { const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = '/assets/css/' + file + '.css'; document.head.append(link); },
                addJs: (file, callback) => { const script = document.createElement('script'); script.src = '/assets/js/' + file + '.js'; script.onload = () => callback?.(); document.head.append(script); },
                addHtml: async () => {} };
        });
        await ctx.route('https://**/*', async route => {
            const url = new URL(route.request().url());
            if (url.pathname === '/jquery.js') return route.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(process.env.SFMCFIX_JQUERY_PATH || '/usr/share/javascript/jquery/jquery.js') });
            if (url.pathname === '/underscore.js') return route.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(root + '/tests/vendor/underscore-1.4.4.js') });
            if (url.pathname === '/backbone.js') return route.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(root + '/tests/vendor/backbone-0.9.10.js') });
            if (url.pathname === '/native-navigation-fixture.js') return route.fulfill({ contentType: 'application/javascript', body: `
                const NativeRouter = Backbone.Router.extend({ routes: { 'library/content/edit/:id': 'openContent' }, openContent: function(id) {
                    window.__nativeOpen++;
                    const display = function(asset) {
                            document.querySelector('#native-search').hidden = true; document.querySelector('#native-list').hidden = true;
                            const editor = document.createElement('section'); editor.id = 'native-editor'; editor.dataset.assetId = String(asset.id);
                            const title = document.createElement('h1'); title.textContent = asset.name;
                            const back = document.createElement('button'); back.textContent = 'Torna alla libreria'; back.onclick = function() {
                                editor.remove(); document.querySelector('#native-search').hidden = false; document.querySelector('#native-list').hidden = false;
                                Backbone.history.navigate('library', { trigger: false });
                            }; editor.append(title, back); document.body.append(editor);
                    };
                    if (window.__reuseCached && Number(sfmcfix.temp.lastloadedasset?.id) === Number(id)) return display(sfmcfix.temp.lastloadedasset);
                    jQuery.ajax({ url: '/fuelapi/asset/v1/content/assets/' + id + '?scope=ours', type: 'GET', useFuel2Token: true, headers: { 'x-fueldata-version': '1.1' }, success: display });
                } });
                new NativeRouter(); Backbone.history.start({ pushState: true, hashChange: false, silent: true });
                window.__nativeSelect = id => Backbone.history.navigate('library/content/edit/' + id, { trigger: true });
            ` });
            if (url.pathname === '/native-session-fixture.js') return route.fulfill({ contentType: 'application/javascript', body: `
                jQuery.ajaxSetup({ headers: { 'X-Fixture-Ajax-Setup': 'configured' }, beforeSend: function(xhr) { xhr.setRequestHeader('X-Fixture-Before-Send', 'configured'); } });
                jQuery.ajaxPrefilter(function(options, original, xhr) { if (options.useFuel2Token) xhr.setRequestHeader('X-Fixture-Native-Session', 'configured'); });
            ` });
            if (url.pathname.startsWith('/assets/')) return route.fulfill({ contentType: url.pathname.endsWith('.js') ? 'application/javascript' : 'text/css', body: fs.readFileSync(root + url.pathname) });
            if (url.pathname.startsWith('/fuelapi/')) {
                if (url.pathname === '/fuelapi/platform/v1/tokenContext') return route.fulfill({ json: { organization: { id: activeMid, enterpriseId: 777 }, user: { id: 888 } } });
                const headers = route.request().headers();
                if (headers['x-requested-with'] !== 'XMLHttpRequest' || headers['x-fueldata-version'] !== '1.1' || url.searchParams.get('scope') !== 'ours') return route.fulfill({ status: 403, json: {} });
                // A synthetic app pipeline protects POST while GET remains available,
                // reproducing the user's GET 200 / bare-fetch POST 403 report.
                if (route.request().method() === 'POST' && ['x-fixture-ajax-setup', 'x-fixture-before-send', 'x-fixture-native-session'].some(key => headers[key] !== 'configured')) return route.fulfill({ status: 403, json: {} });
                if (/\/assets\/\d+$/.test(url.pathname)) return route.fulfill({ json: items.find(item => item.id === Number(url.pathname.split('/').pop())) });
                calls.push({ url: url.href, method: route.request().method(), body: route.request().postDataJSON() });
                if (url.pathname.endsWith('/categories')) return route.fulfill({ json: { count: folders.length, page: 1, pageSize: 200, items: folders } });
                assert.equal(url.pathname, '/fuelapi/asset/v1/content/assets/query'); assert.equal(route.request().method(), 'POST');
                const q = route.request().postDataJSON();
                if (slow) { const gate = slow; slow = null; await gate.promise; }
                if (forbidden) return route.fulfill({ status: 403, json: {} });
                if (bad) return route.fulfill({ json: { count: 100, items: [] } });
                const found = items.filter(item => matches(q.query, item));
                return route.fulfill({ json: { count: found.length, page: q.page.page, pageSize: 50, items: found.slice((q.page.page - 1) * 50, q.page.page * 50) } });
            }
            return route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<html><head><style>#native-search{width:360px}.form-control{display:block;width:100%;height:32px;box-sizing:border-box}</style><link rel="stylesheet" href="/assets/css/styles.css"><script src="/jquery.js"></script><script src="/native-session-fixture.js"></script><script src="/underscore.js"></script><script src="/backbone.js"></script></head><body><div id="native-search"><input type="search" class="form-control dropdown-toggle" placeholder="Search"></div><table id="native-list"><tbody><tr data-flow-id="cb:repeater:list:1001" onclick="window.__nativeSelect(1001)"><td class="contentitem-table-name">Newsletter 000</td></tr></tbody></table><button id="delete" onclick="window.__other++">Delete</button><script src="/native-navigation-fixture.js"></script><script src="/assets/js/components/native-session.js"></script><script src="/assets/js/context.js"></script><script>sfmcfix.context.ready.then(()=>sfmcfix.addJs("contentbuilder/_index"))</script></body></html>' });
        });
        const page = await ctx.newPage(); page.on('pageerror', error => errors.push(error.message));
        await page.goto('https://content-builder.s50.marketingcloudapps.com/#folder/999');
        const trigger = page.getByRole('button', { name: 'Advanced', exact: true }); await trigger.waitFor();
        const bypassStatus = await page.evaluate(async () => (await fetch('/fuelapi/asset/v1/content/assets/query?scope=ours', {
            method: 'POST', headers: sfmcfix.nativeSession.headers(), credentials: 'same-origin',
            body: JSON.stringify({ page: { page: 1, pageSize: 50 }, query: { property: 'id', simpleOperator: 'greaterThan', value: 0 } })
        })).status);
        assert.equal(bypassStatus, 403);

        if (process.env.SFMCFIX_SEARCH_USE_FUEL) await page.evaluate(() => { const native = { ajax: options => jQuery.ajax(options) }; window.requirejs = name => name === 'fuel-ajax' ? native : null; window.requirejs.defined = name => name === 'fuel-ajax'; });
        const placement = await trigger.evaluate(button => ({ button: button.getBoundingClientRect().toJSON(), input: button.previousElementSibling.getBoundingClientRect().toJSON(), parent: button.parentElement.getBoundingClientRect().toJSON() }));
        assert.ok(placement.button.left >= placement.input.right); assert.ok(placement.button.right <= placement.parent.right + 1);
        assert.ok(Math.abs((placement.button.top + placement.button.height / 2) - (placement.input.top + placement.input.height / 2)) < 3);
        await trigger.click();
        const dialog = page.locator('#sfmcfix-asset-search'), term = dialog.locator('[name="term"]');
        await dialog.locator('[name="folder"]:enabled').waitFor();
        assert.equal(await dialog.locator('[data-context]').textContent(), 'BU 123 · s50');
        assert.equal(await page.locator('#native-search > input + #sfmcfix-asset-search-button').count(), 1);
        await term.fill('Newsletter'); await dialog.locator('[name="type"]').selectOption('email');
        await dialog.getByRole('button', { name: 'Cerca', exact: true }).click();
        await dialog.locator('[data-status]').getByText('1–50 di 51 risultati.', { exact: true }).waitFor();
        assert.equal(await dialog.locator('tbody tr').count(), 50);
        assert.ok((await dialog.locator('tbody').textContent()).includes('Content Builder / Campagne / Archivio'));
        assert.equal(JSON.stringify(calls[1].body).includes('999'), false);
        await dialog.getByRole('button', { name: 'Successiva', exact: true }).click();
        await dialog.locator('[data-status]').getByText('51–51 di 51 risultati.', { exact: true }).waitFor();
        assert.equal(await dialog.locator('tbody tr').count(), 1);
        // Cold open: the target is off-screen and no asset route has been learned.
        await dialog.getByRole('button', { name: 'Apri Newsletter 050', exact: true }).click();
        await page.locator('#native-editor[data-asset-id="1051"]').waitFor();
        await dialog.waitFor({ state: 'detached' });
        await page.getByRole('button', { name: 'Torna alla libreria' }).click();
        await trigger.click(); await term.fill('Newsletter');
        await dialog.getByRole('button', { name: 'Cerca', exact: true }).click();
        await dialog.locator('[data-status]').getByText('1–50 di 51 risultati.', { exact: true }).waitFor();
        await dialog.getByRole('button', { name: 'Apri Newsletter 000', exact: true }).click();
        await page.locator('#native-editor[data-asset-id="1001"]').waitFor();
        assert.equal(await page.evaluate(() => __nativeOpen), 2);
        await dialog.waitFor({ state: 'detached' });
        await page.getByRole('button', { name: 'Torna alla libreria' }).click();
        await trigger.click(); await dialog.locator('[name="folder"]:enabled').waitFor();
        await term.fill('Newsletter'); await dialog.locator('[name="folder"]').selectOption('30');
        await dialog.getByRole('button', { name: 'Cerca', exact: true }).click();
        await dialog.locator('[data-status]').getByText('1–26 di 26 risultati.', { exact: true }).waitFor();
        assert.equal(await dialog.locator('tbody tr').count(), 26);
        await dialog.getByRole('button', { name: 'Azzera filtri', exact: true }).click(); await term.fill('Unsafe');
        await dialog.getByRole('button', { name: 'Cerca', exact: true }).click();
        await dialog.locator('[data-status]').getByText('1–1 di 1 risultati.', { exact: true }).waitFor();
        assert.equal(await dialog.locator('img,script').count(), 0); assert.equal(await page.evaluate(() => window.__xss || 0), 0);
        await dialog.getByRole('button', { name: 'Apri Unsafe', exact: false }).click();
        await page.locator('#native-editor[data-asset-id="2000"]').waitFor();
        await dialog.waitFor({ state: 'detached' });
        await page.getByRole('button', { name: 'Torna alla libreria' }).click(); await trigger.click();
        await term.fill('Unsafe'); await dialog.getByRole('button', { name: 'Cerca', exact: true }).click();
        await dialog.locator('[data-status]').getByText('1–1 di 1 risultati.', { exact: true }).waitFor();
        await page.screenshot({ path: process.env.SFMCFIX_SEARCH_SCREENSHOT || '/tmp/sfmcfix-content-search.png' });
        let release; slow = { promise: new Promise(resolve => { release = resolve; }) };
        await term.fill('Newsletter'); await dialog.getByRole('button', { name: 'Cerca', exact: true }).click();
        await dialog.locator('[data-cancel]:visible').waitFor(); await dialog.getByRole('button', { name: 'Interrompi', exact: true }).click();
        release(); assert.equal(await dialog.locator('tbody tr').count(), 0);
        const postAttempts = calls.filter(call => call.method === 'POST').length;
        forbidden = true; await dialog.getByRole('button', { name: 'Cerca', exact: true }).click();
        await dialog.locator('[data-status]').getByText('HTTP 403', { exact: false }).waitFor();
        assert.equal(await dialog.locator('tbody tr').count(), 0);
        assert.equal(calls.filter(call => call.method === 'POST').length, postAttempts + 1);
        const report = await page.evaluate(() => sfmcfix.assetSearch.diagnostics());
        assert.equal(report.context.source, 'session');
        assert.equal(report.requests.find(r => r.method === 'POST').status, 403);
        assert.equal(report.requests.find(r => r.method === 'POST').transport, process.env.SFMCFIX_SEARCH_USE_FUEL ? 'AMD:fuel-ajax' : 'Backbone');
        assert.ok(!JSON.stringify(report).includes('Newsletter'));
        const downloadWait = page.waitForEvent('download');
        await dialog.getByRole('button', { name: 'Scarica diagnostica ricerca' }).click();
        const download = await downloadWait;
        assert.equal(download.suggestedFilename(), 'sfmc-content-builder-diagnostica.json');
        assert.deepEqual(JSON.parse(fs.readFileSync(await download.path(), 'utf8')).requests, report.requests);
        forbidden = false; bad = true; await dialog.getByRole('button', { name: 'Cerca', exact: true }).click();
        await dialog.locator('[data-status]').getByText('Paginazione', { exact: false }).waitFor(); bad = false;
        slow = { promise: new Promise(resolve => { release = resolve; }) };
        await dialog.getByRole('button', { name: 'Cerca', exact: true }).click(); await dialog.locator('[data-cancel]:visible').waitFor();
        activeMid = '999';
        await page.evaluate(() => sfmcfix.context.refresh());
        release(); await dialog.waitFor({ state: 'detached' });
        await trigger.click(); await dialog.locator('[data-context]').getByText('BU 999', { exact: false }).waitFor();
        assert.equal(await dialog.locator('tbody tr').count(), 0);
        await page.setViewportSize({ width: 390, height: 844 });
        assert.ok(await dialog.evaluate(element => element.getBoundingClientRect().width <= 390));
        await term.fill('Newsletter 001'); await dialog.locator('[name="mode"]').selectOption('equal');
        await dialog.getByRole('button', { name: 'Cerca', exact: true }).click();
        await dialog.getByRole('button', { name: 'Apri Newsletter 001', exact: true }).click();
        await page.locator('#native-editor[data-asset-id="1002"]').waitFor();
        await page.getByRole('button', { name: 'Torna alla libreria' }).click(); await trigger.click();
        await term.fill('Newsletter 001'); await dialog.locator('[name="mode"]').selectOption('equal');
        await dialog.getByRole('button', { name: 'Cerca', exact: true }).click();
        await dialog.getByRole('button', { name: 'Apri Newsletter 001', exact: true }).waitFor();
        await page.evaluate(() => { window.__reuseCached = true; });
        await dialog.getByRole('button', { name: 'Apri Newsletter 001', exact: true }).click();
        await page.locator('#native-editor[data-asset-id="1002"]').waitFor();
        await dialog.waitFor({ state: 'detached' });
        await page.getByRole('button', { name: 'Torna alla libreria' }).click(); await trigger.click();
        await term.fill('Newsletter 001'); await dialog.locator('[name="mode"]').selectOption('equal');
        await dialog.getByRole('button', { name: 'Cerca', exact: true }).click();
        await dialog.getByRole('button', { name: 'Apri Newsletter 001', exact: true }).waitFor();
        await page.evaluate(() => { window.__reuseCached = false; window.__savedHandlers = Backbone.history.handlers; Backbone.history.handlers = []; });
        await dialog.getByRole('button', { name: 'Apri Newsletter 001', exact: true }).click();
        await dialog.locator('[data-status]').getByText('Collegamento di apertura non riconosciuto', { exact: false }).waitFor();
        assert.equal(await dialog.locator('tbody tr').count(), 1);
        assert.equal(await term.inputValue(), 'Newsletter 001');
        await page.evaluate(() => {
            Backbone.history.handlers = __savedHandlers.map(handler => ({ ...handler, callback: () => {} }));
            const original = window.setTimeout; window.setTimeout = (callback, ms, ...args) => original(callback, ms === 8000 ? 60 : ms, ...args);
        });
        await dialog.getByRole('button', { name: 'Apri Newsletter 001', exact: true }).click();
        await dialog.locator('[data-status]').getByText('non ha confermato', { exact: false }).waitFor();
        assert.equal(await dialog.locator('tbody tr').count(), 1);
        await page.evaluate(() => { Backbone.history.handlers = __savedHandlers; });
        await dialog.getByRole('button', { name: 'Apri Newsletter 001', exact: true }).click();
        await page.locator('#native-editor[data-asset-id="1002"]').waitFor();
        await page.getByRole('button', { name: 'Torna alla libreria' }).click(); await trigger.click();
        await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' });
        await page.evaluate(() => document.querySelector('#native-search').remove()); await trigger.waitFor({ state: 'detached' });
        assert.equal(await page.evaluate(() => __other), 0); assert.deepEqual(errors, []);
        console.log('PASS real module chain and supplied search/row markup: global search, filters, full folder paths, 51 results over two pages, native row open and real Backbone pushState router with metadata confirmation, safe text rendering, cancel/errors/context isolation, responsive dialog and launcher cleanup. GET 200 / bare-fetch POST 403 reproduction, configured ajaxSetup/beforeSend/prefilter required, native POST succeeds, native 403 never retried, automatic session MID and BU switch, sanitized diagnostic download, metadata query POST and category/context GET.');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
