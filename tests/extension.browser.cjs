// Real unpacked extension smoke test. Requires an installed browser that permits
// developer extensions; no browser policies or security checks are overridden.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const { chromium } = require(process.env.SFMCFIX_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..'), manifest = require('../manifest.json');
const SETTINGS = 'SFMCFIX---SETTINGS-V2', UI = 'SFMCFIX---UI-PREFERENCES';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sfmcfix-browser-'));
(async () => {
    let ctx;
    try {
        ctx = await chromium.launchPersistentContext(profile, {
            ...(process.env.SFMCFIX_CHROMIUM_PATH ? { executablePath: process.env.SFMCFIX_CHROMIUM_PATH } : { channel: 'msedge' }),
            headless: true, ignoreDefaultArgs: ['--disable-extensions'],
            args: ['--no-sandbox', `--load-extension=${root}`]
        });
        const worker = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 15000 });
        const extension = worker.url().slice(0, worker.url().indexOf('/assets/'));
        const errors = [], consoleErrors = [];
        const watch = page => {
            page.on('pageerror', error => errors.push(error.message));
            page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
        };
        const api = await worker.evaluate(() => ({ version: chrome.runtime.getManifest().version,
            local: typeof chrome.storage.local.setAccessLevel, session: typeof chrome.storage.session.setAccessLevel }));
        assert.deepEqual(api, { version: manifest.version, local: 'function', session: 'function' });
        await worker.evaluate(async ({ SETTINGS }) => chrome.storage.local.set({ [SETTINGS]: {
            's50:123': { testers: [['Rossi', 'Mario', 'mario@example.com']], testerSource: 'local' },
            's50:999': { testers: [['Other BU', 'Private', 'other@example.com']], testerSource: 'local' }
        } }), { SETTINGS });
        const jquery = fs.readFileSync(process.env.SFMCFIX_JQUERY_PATH ||
            (fs.existsSync('/usr/share/javascript/jquery/jquery.js') ? '/usr/share/javascript/jquery/jquery.js' : require.resolve('jquery/dist/jquery.js')));
        await ctx.route('https://**/*', route => {
            const url = new URL(route.request().url());
            const mid = Number(new URL(route.request().frame().url()).searchParams.get('mid')) || 123;
            if (url.pathname === '/fuelapi/platform/v1/tokenContext') return route.fulfill({ json: { organization: { id: mid, enterpriseId: 777 }, user: { id: 888 } } });
            const deID = '00000000-0000-4000-8000-000000000001';
            if (url.pathname.includes('/customobjects/category/0')) return route.fulfill({ json: { count: 1,
                items: [{ id: deID, name: 'tester_content_builder', customerKey: 'tester_content_builder', categoryId: 11 }] } });
            if (url.pathname.includes('/categories/11/fullPath')) return route.fulfill({ json: { items: [
                { id: 10, parentId: 0, categoryType: 'dataextension', name: 'Data Extensions' }, { id: 11, parentId: 10, name: 'SFMC_UI_Fixer' }] } });
            if (url.pathname.endsWith('/customobjects/' + deID + '/fields/')) return route.fulfill({ json: { fields: [
                { name: 'Nome', type: 'Text' }, { name: 'Cognome', type: 'Text' }, { name: 'Email', type: 'EmailAddress', isPrimaryKey: true }] } });
            if (url.pathname.includes('/customObjectData/' + deID)) return route.fulfill({ json: { count: 1,
                items: [{ Nome: mid === 999 ? 'Private' : 'Anna', Cognome: 'Tester', Email: 'tester@example.com' }] } });
            if (url.pathname === '/native-session-fixture.js') return route.fulfill({ contentType: 'application/javascript', body: `
                jQuery.ajaxSetup({ beforeSend: function(xhr) { xhr.setRequestHeader('X-Fixture-Before-Send', 'configured'); } });
                jQuery.ajaxPrefilter(function(options, original, xhr) { if (options.useFuel2Token) xhr.setRequestHeader('X-Fixture-Native-Session', 'configured'); });
            ` });
            if (url.pathname === '/jquery.js') return route.fulfill({ contentType: 'application/javascript', body: jquery });
            if (url.pathname === '/fuelapi/asset/v1/content/assets/1001') return route.fulfill({ json: { id: 1001, name: 'Newsletter', assetType: { id: 208, name: 'htmlemail' } } });
            if (url.pathname === '/fuelapi/asset/v1/content/categories') return route.fulfill({ json: { count: 2, page: 1, pageSize: 200, items: [{ id: 10, parentId: 0, name: 'Content Builder' }, { id: 20, parentId: 10, name: 'Campagne' }] } });
            if (url.pathname === '/fuelapi/asset/v1/content/assets/query') {
                if (['x-fixture-before-send', 'x-fixture-native-session'].some(key => route.request().headers()[key] !== 'configured')) return route.fulfill({ status: 403, json: {} });
                assert.equal(route.request().method(), 'POST');
                assert.equal(url.searchParams.get('scope'), 'ours');
                assert.equal(route.request().headers()['x-requested-with'], 'XMLHttpRequest');
                assert.equal(route.request().headers()['x-fueldata-version'], '1.1');
                return route.fulfill({ json: { count: 1, page: 1, pageSize: 50, items: [{ id: 1001, name: 'Newsletter', customerKey: 'mail-key', assetType: { id: 208, name: 'htmlemail' }, category: { id: 20, name: 'Campagne' } }] } });
            }
            return route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<html><head><script src="/jquery.js"></script><script src="/native-session-fixture.js"></script></head><body><div style="width:360px"><input type="search" class="form-control dropdown-toggle" placeholder="Search"></div><table><tbody><tr data-flow-id="cb:repeater:list:1001" onclick="jQuery.ajax({url: &quot;/fuelapi/asset/v1/content/assets/1001&quot;, type: &quot;GET&quot;, useFuel2Token: true, success: function() { document.getElementById(&quot;native-opened&quot;).textContent = &quot;Newsletter aperta&quot;; }})"><td class="contentitem-table-name">Newsletter</td></tr></tbody></table><div id="native-opened"></div><main id="preview-panel"><div class="test-send-recipients-tab-content"><div class="test-send-recipients-pillbox"><input class="pillbox-add-item"></div></div></main><button>Send Test</button></body></html>' });
        });
        let grants = 0;
        const watchConsent = page => page.on('dialog', async dialog => {
            if (/BU (123|999) /.test(dialog.message())) { grants++; await dialog.accept(); }
            else await dialog.dismiss();
        });
        const loadTesters = async page => {
            const trigger = page.getByRole('button', { name: 'Impostazioni SFMC', exact: true });
            if (await page.locator('#sfmcfix-context-options').isHidden()) await trigger.click();
            await page.locator('[data-context-action="testers"]').click();
            await page.locator('[data-tester-load-status]').getByText('1 tester attivi', { exact: false }).waitFor();
            assert.equal(await page.locator('#sfmcfix-tester-editor').count(), 0);
        };
        const testerName = page => page.evaluate(async () => (await sfmcfix.testerSource.list()).testers[0][1]);
        const page = await ctx.newPage(); watch(page); watchConsent(page);
        await page.goto('https://content-builder.s50.marketingcloudapps.com/');
        await loadTesters(page); assert.equal(await testerName(page), 'Anna');
        assert.equal(grants, 1);
        const state = await worker.evaluate(async SETTINGS => (await chrome.storage.local.get(SETTINGS))[SETTINGS], SETTINGS);
        assert.equal(state['s50:123'].testers[0][1], 'Mario'); // Old local contacts are retained.
        assert.equal(state['s50:123'].testerSource, 'de');
        assert.equal(state['s50:999'].testers[0][1], 'Private');
        const docs = await worker.evaluate(async () => (await chrome.storage.session.get('SFMCFIX---DOCUMENT-GRANTS'))['SFMCFIX---DOCUMENT-GRANTS']);
        assert.ok(Object.values(docs).some(doc => doc.role === 'content' && doc.scope === 's50:123'));
        assert.ok(Object.keys(docs).every(id => id.length > 0));
        await page.reload(); await loadTesters(page);
        assert.equal(await testerName(page), 'Anna'); assert.equal(grants, 1);
        await page.goto('https://mc.s50.exacttarget.com/cloud/');
        await page.goto('https://content-builder.s50.marketingcloudapps.com/'); await loadTesters(page);
        assert.equal(await testerName(page), 'Anna'); assert.equal(grants, 1);
        const another = await ctx.newPage(); watch(another); watchConsent(another);
        await another.goto('https://content-builder.s50.marketingcloudapps.com/'); await loadTesters(another);
        assert.equal(grants, 1);
        await another.goto('https://content-builder.s50.marketingcloudapps.com/?mid=999'); await loadTesters(another);
        assert.equal(await testerName(another), 'Private'); assert.equal(grants, 2);
        await another.goto('https://content-builder.s50.marketingcloudapps.com/'); await loadTesters(another);
        assert.equal(await testerName(another), 'Anna'); assert.equal(grants, 2); await another.close();
        const preferences = await ctx.newPage(); watch(preferences);
        await preferences.goto(`${extension}/assets/html/activity-versioning.html`);
        const visibility = preferences.locator('#show-preview-icons'); await visibility.setChecked(false);
        await page.locator('.previewandtest-toolbox').waitFor({ state: 'hidden' });
        assert.equal(await page.getByRole('link', { name: 'Tracking Test', exact: true }).count(), 0);
        assert.equal(await page.locator('#testsendlog-viewer').count(), 0);
        await preferences.reload(); assert.equal(await preferences.locator('#show-preview-icons').isChecked(), false);
        await preferences.locator('#show-preview-icons').setChecked(true);
        await page.locator('.previewandtest-toolbox').waitFor({ state: 'visible' });
        const savedUI = await worker.evaluate(async UI => (await chrome.storage.local.get(UI))[UI], UI);
        assert.equal(savedUI.hidePreviewIcons, false);
        await preferences.getByRole('button', { name: 'Ripristina le conferme di accesso locale', exact: true }).click();
        await preferences.locator('#local-access-status').getByText('Conferme ripristinate.', { exact: false }).waitFor();
        const approvals = await worker.evaluate(async () => (await chrome.storage.session.get('SFMCFIX---SESSION-APPROVALS'))['SFMCFIX---SESSION-APPROVALS']);
        assert.deepEqual(approvals, {});
        await loadTesters(page); assert.equal(await testerName(page), 'Anna'); assert.equal(grants, 3);
        await page.getByRole('button', { name: 'Advanced', exact: true }).click();
        const search = page.locator('#sfmcfix-asset-search');
        assert.equal(await search.locator('[data-context]').textContent(), 'BU 123 · s50');
        await search.locator('[name="term"]').fill('Newsletter');
        await search.getByRole('button', { name: 'Cerca', exact: true }).click();
        await search.locator('[data-status]').getByText('1–1 di 1 risultati.', { exact: true }).waitFor();
        assert.ok((await search.locator('tbody').textContent()).includes('Newsletter'));
        const report = await page.evaluate(() => sfmcfix.assetSearch.diagnostics());
        assert.equal(report.requests.find(request => request.method === 'POST').transport, 'jQuery');
        assert.equal(report.requests.find(request => request.method === 'POST').status, 200);
        await search.getByRole('button', { name: 'Apri Newsletter', exact: true }).click();
        await page.locator('#native-opened').getByText('Newsletter aperta', { exact: true }).waitFor();
        await search.waitFor({ state: 'detached' });
        assert.equal(await page.evaluate(() => sfmcfix.assetNavigation.diagnostics().result), 'confirmed');
        assert.deepEqual(errors, []); assert.deepEqual(consoleErrors, []);
        console.log(`PASS real extension ${manifest.version}: service worker, protected local/session APIs, isolated session consent with native document IDs, no repeat on reload/module return/new tab, separate BU confirmation, reset with retained tester data, one-click DE activation without an editor, internal settings, live document notifications and tester settings visibility without Tracking Test or Test History and Advanced metadata search through configured jQuery beforeSend/prefilters and real extension resources.`);
    } finally {
        if (ctx) await ctx.close();
        fs.rmSync(profile, { recursive: true, force: true });
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
