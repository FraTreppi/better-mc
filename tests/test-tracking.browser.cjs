const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require(process.env.SFMCFIX_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const shell = 'https://mc.s50.exacttarget.com', members = 'https://members.s50.exacttarget.com';
const marker = '#app/Email/C12/Default.aspx?entityType=none&entityID=0&ks=ks%23Subscribers&sfmcfix_tracking=tests';
(async () => {
    const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
    try {
        async function fixture(mode = 'normal', marked = true) {
            const context = await browser.newContext(), errors = [], requests = [];
            await context.addInitScript({ content: read('assets/js/test-tracking-shell.js') });
            await context.route('https://**/*', async route => {
                const url = new URL(route.request().url()), file = url.pathname;
                requests.push({ method: route.request().method(), url: url.href });
                if (url.origin === shell && file === '/cloud/') return route.fulfill({ contentType: 'text/html', body: `<html><body><iframe id="email-frame" src="${members}/C12/Default.aspx"></iframe></body></html>` });
                if (file.startsWith('/vendor/')) return route.fulfill({ contentType: 'application/javascript', body: read('tests/vendor/' + file.split('/').at(-1)) });
                if (file === '/tracking-main.js') return route.fulfill({ contentType: 'application/javascript', body: read('assets/js/test-tracking-main.js') });
                if (file === '/C12/Default.aspx') return route.fulfill({ contentType: 'text/html', body: `<html><body><main id="etEmail"><div id="navbar">Native navbar</div><iframe id="fraLeftNav" src="/left-initial"></iframe><iframe id="fraContent" src="${mode === 'already' ? '/test-listing' : '/overview'}"></iframe></main>
                    <script src="/vendor/underscore-1.4.4.js"></script><script src="/vendor/backbone-0.9.10.js"></script><script>
                    window.__changes=0; window.__clicks=0;
                    window.ET={Config:{navData:{entry:[{sectionID:'Tracking'}]}}};
                    ${mode === 'nostate' ? '' : `
                    window._NavState=new Backbone.Model({sectionId:${['recovery-tracking', 'already'].includes(mode) ? "'Tracking'" : "'Subscribers'"},curNavItem:${mode.startsWith('recovery') ? 'null' : mode === 'already' ? "new Backbone.Model({sectionID:'Tracking'})" : "new Backbone.Model({sectionID:'Subscribers'})"},startData:{startUrl:'native'}});
                    _NavState.on('change:sectionId', function() {
                        if(this.get('sectionId')!=='Tracking')return;
                        __changes++;
                        this.set('curNavItem',new Backbone.Model({sectionID:'Tracking'}));
                        document.getElementById('fraLeftNav').src='/left-tracking';
                    });`}
                    </script><script src="/tracking-main.js"></script></body></html>` });
                if (file === '/left-initial') return route.fulfill({ contentType: 'text/html', body: '<html><body><a href="#">Other folder</a></body></html>' });
                if (file === '/left-tracking') {
                    if (mode === 'cancel') await new Promise(resolve => setTimeout(resolve, 800));
                    return route.fulfill({ contentType: 'text/html', body: `<html><body><a id="native-test-folder" href="#" onclick="event.preventDefault();parent.__clicks++;parent.document.querySelector('#fraContent').src='/test-listing'">Test Send Emails</a></body></html>` });
                }
                if (file === '/test-listing') return route.fulfill({ contentType: 'text/html', body: '<html><head><title>Test Send Emails</title></head><body><h1>Test Send Emails</h1><table><tr><td>Native send listing</td></tr></table></body></html>' });
                if (file === '/overview') return route.fulfill({ contentType: 'text/html', body: '<html><body><h1>Overview</h1></body></html>' });
                throw Error('Unexpected route ' + url.href);
            });
            const page = await context.newPage();
            page.on('pageerror', error => errors.push(error.message));
            await page.goto(shell + '/cloud/' + (marked ? marker : '#app/Email/'), { waitUntil: 'domcontentloaded' });
            const email = page.frames().find(frame => frame.url().startsWith(members + '/C12/')) ||
                await page.waitForEvent('framenavigated', { predicate: frame => frame.url().startsWith(members + '/C12/') });
            await email.waitForFunction(() => typeof __changes === 'number');
            return { context, page, email, errors, requests };
        }
        for (const mode of ['normal', 'recovery', 'recovery-tracking', 'already']) {
            const f = await fixture(mode);
            await f.page.waitForFunction(() => !location.hash.includes('sfmcfix_tracking'));
            assert.equal(await f.page.locator('#sfmcfix-tracking-opening').count(), 0);
            assert.equal(await f.email.locator('#etEmail #navbar').count(), 1);
            const state = await f.email.evaluate(() => ({ changes: __changes, clicks: __clicks }));
            assert.equal(state.changes, mode === 'already' ? 0 : 1);
            assert.equal(state.clicks, mode === 'already' ? 0 : 1);
            assert.ok(f.requests.every(request => request.method === 'GET'));
            assert.deepEqual(f.errors, []);
            await f.context.close();
        }
        console.log('PASS native Tracking selection with Backbone 0.9.10, missing curNavItem recovery including already-Tracking state, one folder click, existing listing, base view preserved, GET only.');
        {
            const f = await fixture('normal', false);
            await f.page.waitForTimeout(350);
            assert.deepEqual(await f.email.evaluate(() => ({ changes: __changes, clicks: __clicks })), { changes: 0, clicks: 0 });
            assert.equal(await f.page.locator('#sfmcfix-tracking-opening').count(), 0);
            assert.deepEqual(f.errors, []);
            await f.context.close();
        }
        {
            const f = await fixture('cancel');
            await f.email.waitForFunction(() => __changes === 1);
            await f.page.evaluate(() => { location.hash = '#app/CloudPages/'; });
            await f.email.locator('#fraLeftNav').contentFrame().locator('#native-test-folder').waitFor();
            await f.page.waitForTimeout(200);
            assert.equal(await f.email.evaluate(() => __clicks), 0);
            assert.equal(await f.page.locator('#sfmcfix-tracking-opening').count(), 0);
            assert.deepEqual(f.errors, []);
            await f.context.close();
        }
        {
            const f = await fixture('nostate');
            await f.page.getByRole('status').filter({ hasText: 'Attendo il caricamento' }).waitFor();
            await f.email.evaluate(() => { const now = Date.now; Date.now = () => now() + 21000; });
            await f.page.getByRole('alert').waitFor();
            assert.equal(await f.page.getByRole('button', { name: /diagnostica/i }).count(), 0);
            await f.page.getByRole('button', { name: 'Chiudi avviso tracking' }).click();
            assert.equal(await f.page.locator('#sfmcfix-tracking-opening').count(), 0);
            assert.equal(await f.email.evaluate(() => __clicks), 0);
            assert.deepEqual(f.errors, []);
            await f.context.close();
        }
        console.log('PASS unmarked Email Studio unchanged, leaving Email cancels late folder selection, timeout is dismissible without a diagnostic/history control.');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
