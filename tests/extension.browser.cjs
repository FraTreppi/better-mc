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
            if (url.pathname === '/jquery.js') return route.fulfill({ contentType: 'application/javascript', body: jquery });
            return route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<html><head><script src="/jquery.js"></script></head><body><main id="preview-panel"><div class="test-send-recipients-tab-content"><div class="test-send-recipients-pillbox"><input class="pillbox-add-item"></div></div></main><button>Send Test</button></body></html>' });
        });
        const page = await ctx.newPage(); watch(page);
        let grants = 0;
        page.on('dialog', async dialog => {
            if (dialog.message().includes('BU 123')) { grants++; await dialog.accept(); }
            else await dialog.dismiss();
        });
        await page.goto('https://content-builder.s50.marketingcloudapps.com/?mid=123');
        const trigger = page.getByRole('button', { name: 'Impostazioni SFMC', exact: true });
        await trigger.click(); await page.locator('[data-context-action="testers"]').click();
        let editor = page.locator('#sfmcfix-tester-editor'); await editor.waitFor();
        await editor.getByRole('textbox', { name: 'Nome tester 1', exact: true }).fill('Anna');
        await editor.getByRole('button', { name: 'Salva tester', exact: true }).click();
        await editor.getByRole('status').getByText('1 tester salvati', { exact: false }).waitFor();
        assert.equal(grants, 1);
        const state = await worker.evaluate(async SETTINGS => (await chrome.storage.local.get(SETTINGS))[SETTINGS], SETTINGS);
        assert.equal(state['s50:123'].testers[0][1], 'Anna');
        assert.equal(state['s50:999'].testers[0][1], 'Private');
        const docs = await worker.evaluate(async () => (await chrome.storage.session.get('SFMCFIX---DOCUMENT-GRANTS'))['SFMCFIX---DOCUMENT-GRANTS']);
        assert.ok(Object.values(docs).some(doc => doc.role === 'content' && doc.scope === 's50:123'));
        assert.ok(Object.keys(docs).every(id => id.length > 0));
        await page.reload();
        await trigger.click(); await page.locator('[data-context-action="testers"]').click();
        editor = page.locator('#sfmcfix-tester-editor'); await editor.waitFor();
        assert.equal(await editor.getByRole('textbox', { name: 'Nome tester 1', exact: true }).inputValue(), 'Anna');
        assert.equal(grants, 2); // A new document requires its own real isolated-world consent.
        const preferences = await ctx.newPage(); watch(preferences);
        await preferences.goto(`${extension}/assets/html/activity-versioning.html`);
        const visibility = preferences.locator('#show-preview-icons'); await visibility.setChecked(false);
        await page.locator('.previewandtest-toolbox').waitFor({ state: 'hidden' });
        assert.equal(await page.getByRole('link', { name: 'Tracking Test', exact: true }).isVisible(), true);
        await preferences.reload(); assert.equal(await preferences.locator('#show-preview-icons').isChecked(), false);
        await preferences.locator('#show-preview-icons').setChecked(true);
        await page.locator('.previewandtest-toolbox').waitFor({ state: 'visible' });
        const savedUI = await worker.evaluate(async UI => (await chrome.storage.local.get(UI))[UI], UI);
        assert.equal(savedUI.hidePreviewIcons, false);
        assert.deepEqual(errors, []); assert.deepEqual(consoleErrors, []);
        console.log(`PASS real extension ${manifest.version}: service worker, protected local/session APIs, isolated consent with native document IDs, scoped tester save/reload, other BU preserved, internal settings, live document notifications and Tracking Test visibility.`);
    } finally {
        if (ctx) await ctx.close();
        fs.rmSync(profile, { recursive: true, force: true });
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
