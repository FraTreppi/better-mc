const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require(process.env.SFMCFIX_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..'), GUID = '00000000-0000-4000-8000-000000000001';
(async () => {
    const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
    try {
        for (const kind of ['asset', 'query', 'journey']) {
            const ctx = await browser.newContext(), calls = [], errors = [];
            let wrong = false, forbidden = false, delay = false;
            const record = kind === 'asset' ? { id: 1001, name: 'Template demo', customerKey: 'template-demo', assetType: { id: 206 },
                content: '<h1>%%FirstName%%</h1>', views: { html: { slots: { block: { content: '<p>Blocco</p>' } } } }, accessToken: 'DO_NOT_EXPORT' } :
                kind === 'query' ? { queryDefinitionId: GUID, key: 'query-demo', name: 'Query demo', queryText: 'SELECT 1', targetKey: 'DE-demo' } :
                { id: GUID, key: 'journey-demo', name: 'Journey demo', version: 2, activities: [], triggers: [] };
            const address = kind === 'asset' ? 'https://content-builder.s50.marketingcloudapps.com/#content/1001' :
                kind === 'query' ? `https://mc.s50.marketingcloudapps.com/AutomationStudioFuel3/#ActivityDetails/300/${GUID}` : `https://jbinteractions.s50.marketingcloudapps.com/#${GUID}/2`;
            await ctx.route('https://**/*', async route => {
                const url = new URL(route.request().url());
                if (url.pathname.includes('/fuelapi/')) {
                    calls.push({ url: url.pathname, method: route.request().method() });
                    if (delay) await new Promise(resolve => setTimeout(resolve, 400));
                    return route.fulfill({ status: forbidden ? 403 : 200, json: wrong ? { ...record, id: 'wrong', queryDefinitionId: 'wrong' } : record });
                }
                return route.fulfill({ contentType: 'text/html', body: '<html><body><h1>Native editor</h1></body></html>' });
            });
            const page = await ctx.newPage(); page.on('pageerror', error => errors.push(error.message));
            await page.goto(address);
            await page.evaluate(record => {
                window.__scope = 's50:123';
                window.sfmcfix = { temp: { lastloadedasset: record }, context: { current: () => ({ stack: 's50', mid: __scope.split(':')[1], scope: __scope, persistent: true }), refresh: async () => {} },
                    nativeSession: { headers: () => ({ Accept: 'application/json' }), contentType: 'application/json', backbone: () => ({ history: { fragment: location.hash.slice(1) } }),
                        client: () => ({ ajax: options => {
                            const controller = new AbortController();
                            fetch(options.url, { signal: controller.signal, method: options.type }).then(async response => response.ok ? options.success(await response.json()) : options.error({ status: response.status })).catch(() => options.error({ status: 0 }));
                            return { abort: () => controller.abort() };
                        } }) } };
            }, record);
            await page.addScriptTag({ content: fs.readFileSync(root + '/assets/js/components/code-project.js', 'utf8') });
            const button = page.getByRole('button', { name: 'Esporta per Git', exact: true }); await button.waitFor();
            const downloadEvent = page.waitForEvent('download'); await button.click(); const downloaded = await downloadEvent;
            const result = JSON.parse(fs.readFileSync(await downloaded.path(), 'utf8'));
            assert.equal(result.format, 'sfmc-git-export-v1'); assert.equal(result.context.mid, '123');
            assert.equal(result.items[0].kind, kind); assert.equal(result.items[0].data.name, record.name);
            assert.ok(!JSON.stringify(result).includes('DO_NOT_EXPORT'));
            if (kind === 'asset') assert.equal(result.items[0].data.views.html.slots.block.content, '<p>Blocco</p>');
            if (kind === 'journey') assert.ok(result.items[0].id.endsWith('.v2'));
            await page.evaluate(() => { sfmcfix.nativeSession.readMid = async () => null; });
            const beforeMissingMid = calls.length;
            await button.click(); await page.getByRole('status').getByText(/BU non rilevata/).waitFor();
            assert.equal(calls.length, beforeMissingMid);
            await page.evaluate(() => { let count = 0; sfmcfix.nativeSession.readMid = async () => ++count === 1 ? '123' : '999'; });
            await button.click(); await page.getByRole('status').getByText(/Esportazione interrotta: BU cambiata/).waitFor();
            await page.evaluate(() => { sfmcfix.nativeSession.readMid = async () => '123'; });
            wrong = true; await button.click(); await page.getByRole('status').getByText('La risposta non corrisponde al contenuto aperto.', { exact: true }).waitFor();
            wrong = false; forbidden = true; await button.click(); await page.getByRole('status').getByText(/HTTP 403/).waitFor();
            forbidden = false; delay = true;
            const before = calls.length;
            await button.click(); await page.waitForFunction(() => document.querySelector('#sfmcfix-export-git').disabled);
            await page.evaluate(() => { __scope = 's50:999'; window.dispatchEvent(new Event('sfmcfix:contextchange')); });
            await page.waitForFunction(() => !document.querySelector('#sfmcfix-export-git').disabled);
            assert.equal(calls.length, before + 1);
            assert.ok(calls.every(call => call.method === 'GET')); assert.deepEqual(errors, []);
            await ctx.close();
        }
        console.log('PASS saved asset/query/Journey exports with full layout, exact version, no session token, GET only, identity/403 checks and cancellation on BU change.');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
