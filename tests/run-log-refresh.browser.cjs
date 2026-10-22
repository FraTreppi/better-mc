const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require(process.env.SFMCFIX_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const A = '00000000-0000-4000-8000-000000000001', B = '00000000-0000-4000-8000-000000000002';
const toolbar = '<div class="run-log-toolbar"><span>Run Log<i aria-hidden="true"></i></span><div class="dates"><span>View</span><span id="start-group"><input value="09/22/2026"><i class="calendar"></i></span><span>to</span><span id="end-group"><input value="10/22/2026"><i class="calendar"></i></span></div><div class="status"><label>View by Status</label><select><option>All</option></select><button class="btn-default refresh-button"><i class="fuelux-icon fuelux-icon-refresh-hover"></i></button></div></div>';
(async () => {
    const browser = await chromium.launch({ executablePath: process.env.SFMCFIX_CHROMIUM_PATH ||
        (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), headless: true, args: ['--no-sandbox'] });
    try {
        async function fixture() {
            const ctx = await browser.newContext(), page = await ctx.newPage(), errors = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.clock.install({ time: new Date('2026-10-22T12:00:00Z') });
            await page.clock.pauseAt(new Date('2026-10-22T12:00:01Z'));
            await ctx.route('https://**/*', route => route.fulfill({ contentType: 'text/html', body:
                `<html><head><style>.run-log-toolbar{display:flex;align-items:center;gap:16px}.dates{display:flex;align-items:center;gap:6px}.status{margin-left:auto}input{width:110px}#run-log{border:1px solid #ccc}</style></head><body><div id="outside"><button title="Refresh" id="other-refresh">Other refresh</button><button id="run-once">Run Once</button><button id="save">Save</button><button id="delete">Delete</button></div><section id="run-log">${toolbar}<div id="entries">Entries</div></section></body></html>` }));
            await page.goto(`https://mc.s50.marketingcloudapps.com/AutomationStudioFuel3/#Instance/${A}/activity`);
            await page.addScriptTag({ content: fs.readFileSync(process.env.SFMCFIX_JQUERY_PATH ||
                (fs.existsSync('/usr/share/javascript/jquery/jquery.js') ? '/usr/share/javascript/jquery/jquery.js' : require.resolve('jquery/dist/jquery.js')), 'utf8') });
            await page.evaluate(toolbar => {
                window.__scope = 's50:123'; window.__reads = 0; window.__other = 0; window.__writes = 0;
                window.__delay = 100; window.__disableNative = true; window.__replace = false; window.__toolbar = toolbar;
                window.sfmcfix = { context: { current: () => ({ scope: __scope }) } };
                document.querySelector('#other-refresh').onclick = () => __other++;
                for (const id of ['run-once', 'save', 'delete']) document.getElementById(id).onclick = () => __writes++;
                jQuery.ajaxTransport('+*', options => ({ send: (_, complete) => {
                    if (options.type !== 'GET') throw Error('Unexpected write');
                    setTimeout(() => complete(200, 'OK', { text: '{}' }, 'Content-Type: application/json'), __delay);
                }, abort: () => {} }));
                jQuery(document).on('click', '#run-log .refresh-button', function () {
                    if (this.disabled) return;
                    const native = this;
                    __reads++;
                    if (__disableNative) native.disabled = true;
                    jQuery.ajax({ url: '/fuelapi/automation/v1/fixture-run-log', dataType: 'json', global: false,
                        success: () => {
                            native.disabled = false;
                            if (__replace) document.querySelector('#run-log').innerHTML = __toolbar + '<div id="entries">Updated entries</div>';
                        } });
                });
            }, toolbar);
            await page.addScriptTag({ content: fs.readFileSync(path.join(root, 'assets/js/automation/run-log-refresh.js'), 'utf8') });
            const toggle = page.locator('#sfmcfix-run-log-refresh');
            await toggle.waitFor();
            return { page, ctx, errors, toggle };
        }
        {
            const f = await fixture();
            assert.equal(await f.toggle.getAttribute('aria-pressed'), 'false');
            assert.equal(await f.page.locator('#end-group + #sfmcfix-run-log-refresh').count(), 1);
            await f.page.clock.runFor(10000); assert.equal(await f.page.evaluate(() => __reads), 0);
            await f.toggle.click();
            await f.page.clock.runFor(4999); assert.equal(await f.page.evaluate(() => __reads), 0);
            await f.page.clock.runFor(1); assert.equal(await f.page.evaluate(() => __reads), 1);
            await f.page.clock.runFor(5000); assert.equal(await f.page.evaluate(() => __reads), 2);
            await f.toggle.click(); await f.page.clock.runFor(15000); assert.equal(await f.page.evaluate(() => __reads), 2);
            assert.equal(await f.toggle.getAttribute('aria-pressed'), 'false');
            assert.equal(await f.page.evaluate(() => __other + __writes), 0);
            assert.ok(f.page.url().endsWith(`/activity`));
            assert.deepEqual(f.errors, []);
            console.log('PASS exact supplied FuelUX refresh button: OFF by default, placed after date range, first tick at 5s, repeated ticks, second click stops, no page navigation/other refresh/write controls.');
            await f.ctx.close();
        }
        {
            const f = await fixture();
            await f.page.evaluate(() => { __delay = 12000; __disableNative = false; });
            await f.toggle.click(); await f.page.clock.runFor(15000);
            assert.equal(await f.page.evaluate(() => __reads), 1);
            await f.page.clock.runFor(5000); assert.equal(await f.page.evaluate(() => __reads), 2);
            await f.toggle.click(); await f.page.clock.runFor(15000);
            await f.page.evaluate(() => { __delay = 100; __disableNative = true; __replace = true; });
            await f.toggle.click(); await f.page.clock.runFor(10000);
            assert.equal(await f.page.evaluate(() => __reads), 4);
            assert.equal(await f.toggle.count(), 1); assert.equal(await f.toggle.getAttribute('aria-pressed'), 'true');
            await f.page.evaluate(() => document.querySelector('#run-log').style.display = 'none');
            await f.page.clock.runFor(10000); assert.equal(await f.page.evaluate(() => __reads), 4);
            await f.page.evaluate(() => document.querySelector('#run-log').style.display = '');
            await f.page.clock.runFor(5000); assert.equal(await f.page.evaluate(() => __reads), 5);
            assert.deepEqual(f.errors, []);
            console.log('PASS slow global:false native requests never overlap, replacement toolbar keeps ON without duplicates, hidden Run Log pauses and resumes.');
            await f.ctx.close();
        }
        {
            const f = await fixture();
            await f.toggle.click();
            await f.page.evaluate(B => { location.hash = `#Instance/${B}/activity`; }, B);
            await f.page.clock.runFor(6000);
            assert.equal(await f.page.evaluate(() => __reads), 0); assert.equal(await f.toggle.getAttribute('aria-pressed'), 'false');
            await f.toggle.click();
            await f.page.evaluate(() => { __scope = 's50:999'; window.dispatchEvent(new Event('sfmcfix:contextchange')); });
            await f.page.clock.runFor(6000);
            assert.equal(await f.page.evaluate(() => __reads), 0); assert.equal(await f.toggle.getAttribute('aria-pressed'), 'false');
            await f.toggle.click();
            await f.page.evaluate(() => document.querySelector('.run-log-toolbar .status').insertAdjacentHTML('beforeend', '<button id="ambiguous" class="refresh-button"><i class="fuelux-icon fuelux-icon-refresh-hover"></i></button>'));
            await f.page.clock.runFor(6000); assert.equal(await f.page.evaluate(() => __reads), 0);
            assert.equal(await f.toggle.count(), 0);
            await f.page.evaluate(() => document.querySelector('#ambiguous').remove());
            await f.page.clock.runFor(5000); assert.equal(await f.page.evaluate(() => __reads), 1);
            assert.equal(await f.page.evaluate(() => __other + __writes), 0);
            assert.deepEqual(f.errors, []);
            console.log('PASS changed automation/BU stops polling; ambiguous refresh controls produce no click; restored unique control resumes safely.');
            await f.ctx.close();
        }
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
