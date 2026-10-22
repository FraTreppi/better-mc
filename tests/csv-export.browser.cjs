const fs = require('node:fs'), assert = require('node:assert/strict'), path = require('node:path');
const { chromium } = require(process.env.SFMCFIX_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const A = '00000000-0000-4000-8000-000000000001', B = '00000000-0000-4000-8000-000000000002';
(async () => {
    const browser = await chromium.launch({ executablePath: process.env.SFMCFIX_CHROMIUM_PATH ||
        (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), headless: true, args: ['--no-sandbox'] });
    try {
        const ctx = await browser.newContext(), page = await ctx.newPage(), errors = [], calls = [];
        let total = 100000, prefix = 'A', slow = false, forbidden = false, downloads = 0;
        page.on('pageerror', error => errors.push(error.message));
        page.on('download', () => downloads++);
        await ctx.route('https://**/*', async route => {
            const url = new URL(route.request().url());
            if (!url.pathname.startsWith('/contactsmeta/fuelapi/')) return route.fulfill({ contentType: 'text/html', body:
                '<body><div id="dataExtension"><div class="repeater-records"><div class="repeater-header"><button class="btn btn-default export">Export</button><input placeholder="Search" value="only-visible-filter"></div><div class="repeater-pagination"><input class="repeater-secondaryPaging" value="42"></div><table><tr><td>Only the visible page</td></tr></table></div></div></body>' });
            calls.push({ url, method: route.request().method() });
            assert.equal(url.searchParams.has('filter'), false);
            assert.equal(url.searchParams.has('search'), false);
            if (forbidden) return route.fulfill({ status: 403, contentType: 'application/json', body: '{}' });
            if (slow) await new Promise(resolve => setTimeout(resolve, 50));
            let data;
            if (url.pathname.endsWith('/fields/')) data = { fields: [{ name: 'CardNumber', type: 'Text', isPrimaryKey: true }, { name: 'Nome', type: 'Text' }] };
            else {
                const pageIndex = Number(url.searchParams.get('$page'));
                const size = Math.min(200, Number(url.searchParams.get('$pagesize')));
                const from = (pageIndex - 1) * size;
                data = { count: total, page: pageIndex, pageSize: size, items: Array.from({ length: Math.min(size, Math.max(0, total - from)) }, (_, i) =>
                    ({ CardNumber: `${prefix}-${String(from + i).padStart(6, '0')}`, Nome: from + i === total - 1 ? 'È | "ultimo"' : 'Nome' })) };
            }
            return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) }).catch(() => {});
        });
        await page.goto(`https://mc.s50.exacttarget.com/contactsmeta/admin.html#admin/data-extension/${A}/records/`);
        await page.addScriptTag({ content: fs.readFileSync(process.env.SFMCFIX_JQUERY_PATH ||
            (fs.existsSync('/usr/share/javascript/jquery/jquery.js') ? '/usr/share/javascript/jquery/jquery.js' : require.resolve('jquery/dist/jquery.js')), 'utf8') });
        await page.evaluate(() => {
            window.__scope = 's50:123'; window.debounce = callback => callback;
            window.sfmcfix = { context: { current: () => ({ scope: __scope }) }, local: { getItem: () => null }, retryjQ: callback => callback(), notificationLogger: () => {} };
        });
        await page.addScriptTag({ content: read('assets/js/components/de-csv-export.js') });
        await page.addScriptTag({ content: read('assets/js/contactbuilder/de.js') });
        const button = page.locator('#axportascsv'), panel = page.locator('#sfmcfix-csv-export-progress');
        await button.waitFor(); assert.equal(await button.isDisabled(), false);
        const ready = page.waitForEvent('download', { timeout: 60000 });
        await button.click();
        await page.waitForFunction(() => sfmcfix.deCsvExport.getState().completed >= 200);
        assert.equal(await button.isDisabled(), true);
        assert.equal(await panel.getByRole('button', { name: 'Annulla CSV' }).isVisible(), true);
        const download = await ready;
        const text = fs.readFileSync(await download.path(), 'utf8');
        assert.equal((text.match(/"A-\d{6}"/g) || []).length, 100000);
        assert.ok(text.includes('"A-099999"')); assert.ok(text.includes('"È | ""ultimo"""'));
        assert.ok(download.suggestedFilename().includes('-all-100000-records-'));
        await page.waitForFunction(() => !sfmcfix.deCsvExport.getState().busy);
        assert.ok((await panel.textContent()).includes('100.000'));
        console.log('PASS actual CSV button downloads all 100,000 records across 500 pages, regardless of visible page 42 and grid filter; progress and cancel controls work.');

        total = 10000; slow = true;
        await button.click(); await page.waitForFunction(() => sfmcfix.deCsvExport.getState().completed >= 200);
        await panel.getByRole('button', { name: 'Annulla CSV' }).click();
        await page.waitForFunction(() => !sfmcfix.deCsvExport.getState().busy);
        assert.equal(downloads, 1);
        assert.ok((await panel.textContent()).includes('annullata'));
        await page.evaluate(B => new Promise(resolve => {
            window.addEventListener('hashchange', resolve, { once: true }); location.hash = `#admin/data-extension/${B}/records/`;
        }), B);
        slow = false; total = 17; prefix = 'B';
        const secondReady = page.waitForEvent('download'); await button.click();
        const second = await secondReady, csv = fs.readFileSync(await second.path(), 'utf8');
        assert.equal((csv.match(/"B-\d{6}"/g) || []).length, 17); assert.ok(!csv.includes('A-'));
        assert.ok(second.suggestedFilename().includes(B));
        await page.waitForFunction(() => !sfmcfix.deCsvExport.getState().busy);
        total = 10000; slow = true;
        await button.click(); await page.waitForFunction(() => sfmcfix.deCsvExport.getState().completed >= 200);
        await page.evaluate(() => { __scope = 's50:999'; window.dispatchEvent(new Event('sfmcfix:contextchange')); });
        await page.waitForFunction(() => !sfmcfix.deCsvExport.getState().busy);
        assert.equal(downloads, 2);
        forbidden = true; slow = false;
        await button.click(); await page.waitForFunction(() => !sfmcfix.deCsvExport.getState().busy);
        assert.ok((await panel.textContent()).includes('403'));
        assert.equal(downloads, 2); assert.ok(calls.every(call => call.method === 'GET'));
        assert.deepEqual(errors, []);
        console.log('PASS cancellation and changed BU produce no partial download; next DE exports only its own records; permission errors are visible; only GETs, no browser exceptions.');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
