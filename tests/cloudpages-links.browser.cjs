const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require(process.env.SFMCFIX_PLAYWRIGHT_MODULE || 'playwright');
const code = fs.readFileSync(path.resolve(__dirname, '../assets/js/cloudpages-links.js'), 'utf8');
const shell = 'https://mc.s10.exacttarget.com';
const app = 'https://cloudpages.s10.marketingcloudapps.com'; // Synthetic embedded app, not a claimed Salesforce route.
function row(id, name) {
    const escape = text => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    const value = escape(name);
    return `<tr class="slds-hint-parent"><td data-label=""><div data-testid="cb-thumbnail-data-cell"></div></td><td data-label="Name"><div class="slds-truncate" title="${value}">${value}</div></td><td data-label="Location">Folder</td><td data-label="Type">Landing Page</td><td data-label="ID"><div class="slds-truncate" title="${id}">${id}</div></td><td data-label="Status">Published</td><td data-label="Modified">Today</td><td data-label="Actions"><div id="fixture-SLDSDataTableRow-${id}-SLDSDataTableRowActions"><button>Actions</button></div></td></tr>`;
}
const targetName = 'Pagina <test> & "nome"';
(async () => {
    const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
    try {
        async function fixture({ missing = false, delayed = false, direct = false, empty = false, loaded = false, wrong = false } = {}) {
            const context = await browser.newContext();
            const errors = [], requests = [];
            context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
            await context.addInitScript({ content: code });
            let libraries = 0;
            await context.route('https://**/*', async route => {
                requests.push({ method: route.request().method(), url: route.request().url() });
                const url = new URL(route.request().url());
                if (url.origin === shell && !direct) return route.fulfill({ contentType: 'text/html', body: `<html><body><iframe src="${app}/fixture-library"></iframe></body></html>` });
                const initial = libraries++ === 0;
                const body = `<html><body><input placeholder="Enter at least three characters to search"><table><thead><tr>${['Name', 'Location', 'Type', 'ID', 'Status', 'Modified'].map(label => `<th>${label}</th>`).join('')}</tr></thead><tbody>${initial || loaded ? row('123456', targetName) : empty ? '' : row('987654', 'Altra pagina')}</tbody></table><script>
                    window.__selected = []; window.__searches = [];
                    document.querySelector('tbody').addEventListener('click', event => {
                        const row = event.target.closest('tr');
                        if (!row || event.target.closest('button')) return;
                        __selected.push(row.querySelector('[data-label="ID"] .slds-truncate').textContent);
                        document.querySelector('table').remove();
                        document.body.insertAdjacentHTML('beforeend','<main id="native-editor">Editor nativo</main>');
                    });
                    document.querySelector('input').addEventListener('input', event => {
                        __searches.push(event.target.value);
                        ${missing ? '' : `setTimeout(() => { document.querySelector('tbody').innerHTML = ${JSON.stringify(wrong ? row('222222', targetName) + row('123456', 'Nome diverso') : row('123456', targetName))}; }, ${delayed ? 3000 : 150});`}
                    });
                </script></body></html>`;
                return route.fulfill({ contentType: 'text/html', body });
            });
            const page = await context.newPage();
            await page.goto(`${shell}/cloud/#app/CloudPages/`);
            const frame = direct ? page.mainFrame() : page.frames().find(frame => frame.url().startsWith(app));
            await frame.locator('.sfmcfix-cloudpage-newtab').waitFor();
            return { context, page, frame, errors, requests };
        }
        for (const options of [{ direct: true }, { empty: true }, { loaded: true }]) {
            const f = await fixture(options);
            const popupPromise = f.context.waitForEvent('page');
            await f.frame.locator('.sfmcfix-cloudpage-newtab').click();
            const popup = await popupPromise;
            await popup.waitForLoadState();
            const target = options.direct ? popup.mainFrame() : popup.frames().find(frame => frame.url().startsWith(app));
            await target.locator('#native-editor').waitFor();
            await popup.waitForFunction(() => !location.search);
            assert.deepEqual(await target.evaluate(() => __selected), ['123456']);
            assert.deepEqual(await target.evaluate(() => __searches), options.loaded ? [] : [targetName]);
            assert.deepEqual(f.errors, []);
            await f.context.close();
        }
        console.log('PASS direct shell rendering, initially empty library and already-loaded target; selection requires the exact ID and name.');
        {
            const f = await fixture();
            const link = f.frame.locator('.sfmcfix-cloudpage-newtab');
            const href = new URL(await link.getAttribute('href'));
            assert.equal(href.origin, shell); assert.equal(href.hash, '#app/CloudPages/');
            assert.equal(href.searchParams.get('sfmcfix_cloudpage'), '123456');
            assert.equal(href.searchParams.get('sfmcfix_cloudpage_name'), targetName);
            assert.equal(await link.getAttribute('target'), '_blank');
            assert.equal(await link.getAttribute('rel'), 'noopener noreferrer');
            assert.ok((await link.getAttribute('aria-label')).includes(targetName));
            const popupPromise = f.context.waitForEvent('page');
            await link.click();
            const popup = await popupPromise;
            await popup.waitForLoadState();
            const target = popup.frames().find(frame => frame.url().startsWith(app));
            await target.locator('#native-editor').waitFor();
            await popup.waitForFunction(() => !location.search.includes('sfmcfix_cloudpage'));
            assert.deepEqual(await target.evaluate(() => __selected), ['123456']);
            assert.deepEqual(await target.evaluate(() => __searches), [targetName]);
            assert.deepEqual(await f.frame.evaluate(() => __selected), []);
            assert.equal(await f.frame.locator('table').count(), 1);
            assert.equal(f.page.url(), `${shell}/cloud/#app/CloudPages/`);
            assert.equal(await popup.locator('#sfmcfix-cloudpage-opening').count(), 0);
            assert.equal(f.requests.some(request => request.method !== 'GET'), false);
            assert.deepEqual(f.errors, []);
            await f.context.close();
            console.log('PASS supplied CloudPages row structure: accessible new-tab link, native name filtering then exact ID/name selection once, original tab unchanged, marker removed, no write requests.');
        }
        {
            const f = await fixture();
            await f.frame.evaluate(markup => document.querySelector('tbody').insertAdjacentHTML('beforeend', markup), row('222222', 'Seconda pagina'));
            await f.frame.locator('.sfmcfix-cloudpage-newtab').nth(1).waitFor();
            await f.frame.evaluate(() => {
                const row = document.querySelector('tbody tr');
                row.querySelector('[data-label="ID"] .slds-truncate').textContent = '333333';
                row.querySelector('[data-label="Name"] .slds-truncate').textContent = 'Rinominata';
                row.querySelector('[data-label="Name"] .slds-truncate').title = 'Rinominata';
                row.querySelector('[data-label="Actions"] > div').id = 'fixture-SLDSDataTableRow-333333-SLDSDataTableRowActions';
            });
            await f.frame.waitForFunction(() => document.querySelector('.sfmcfix-cloudpage-newtab').href.includes('sfmcfix_cloudpage=333333'));
            assert.equal(await f.frame.locator('.sfmcfix-cloudpage-newtab').count(), 2);
            await f.frame.evaluate(() => document.querySelector('[data-label="Actions"] > div').id = 'unrelated');
            await f.frame.waitForFunction(() => document.querySelectorAll('.sfmcfix-cloudpage-newtab').length === 1);
            assert.deepEqual(f.errors, []);
            await f.context.close();
            console.log('PASS Load More, reused rows and renamed pages update links without duplicates; non-CloudPages rows lose the control.');
        }
        for (const mode of ['missing', 'wrong', 'cancel', 'route']) {
            const f = await fixture({ missing: mode === 'missing', wrong: mode === 'wrong', delayed: mode !== 'wrong' });
            const popupPromise = f.context.waitForEvent('page');
            await f.frame.locator('.sfmcfix-cloudpage-newtab').click();
            const popup = await popupPromise;
            await popup.waitForLoadState();
            const target = popup.frames().find(frame => frame.url().startsWith(app));
            await target.waitForFunction(() => __searches.length === 1);
            if (mode === 'missing' || mode === 'wrong') {
                if (mode === 'wrong') await target.waitForFunction(() => document.querySelectorAll('tbody tr').length === 2);
                await target.evaluate(() => { const now = Date.now; Date.now = () => now() + 31000; });
                await popup.getByRole('alert').waitFor();
                await popup.getByRole('button', { name: 'Chiudi' }).click();
            } else if (mode === 'cancel') {
                await target.locator('input').click();
                await popup.getByRole('alert').waitFor();
                await target.waitForFunction(() => document.querySelector('[data-label="ID"] .slds-truncate')?.textContent === '123456');
            } else {
                await popup.evaluate(() => { location.hash = '#app/Email/'; });
                await target.waitForFunction(() => document.querySelector('[data-label="ID"] .slds-truncate')?.textContent === '123456');
            }
            assert.deepEqual(await target.evaluate(() => __selected), []);
            assert.equal(await popup.evaluate(() => location.search), '');
            assert.deepEqual(f.errors, []);
            await f.context.close();
        }
        console.log('PASS missing page, mismatched ID/name, user interaction and leaving CloudPages cancel automatic selection, including late search results.');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
