const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require(process.env.SFMCFIX_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const source = process.env.SFMCFIX_EXPORT_SOURCE || root + '/assets/js/components/code-project.js';
const html = '<!doctype html>\n<html><body>\n%%[ SET @demo = "Caffè" ]%%\n' + Array.from({ length: 1000 }, (_, i) => `<p>Riga ${i}</p>`).join('\n') + '\n<p>Modifica non salvata %%=v(@demo)=%%</p>\n</body></html>';
(async () => {
    const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
    try {
        for (const route of ['/#content/1001', '/#editor/1001', '/library/content/edit/1001', '/ContentEditor.aspx?assetId=1001', '/#content/edit?assetId=1001', '/#opaque-editor']) {
            const ctx = await browser.newContext(), errors = [], calls = [];
            ctx.setDefaultTimeout(5000);
            await ctx.route('https://**/*', async request => {
                const url = new URL(request.request().url());
                if (url.pathname.startsWith('/fuelapi/')) {
                    calls.push({ url: url.pathname, method: request.request().method() });
                    assert.equal(url.pathname, '/fuelapi/asset/v1/content/assets/1001');
                    return request.fulfill({ json: { id: 1001, name: 'Email demo', assetType: { id: 208 }, content: '<p>Contenuto salvato</p>' } });
                }
                return request.fulfill({ contentType: 'text/html', body: '<html><body><main style="min-height:3000px"></main></body></html>' });
            });
            const page = await ctx.newPage(); page.on('pageerror', error => errors.push(error.message));
            await page.goto('https://content-builder.s50.marketingcloudapps.com' + route);
            await page.evaluate(() => {
                // No asset-loaded event or cached asset: initial native GET preceded bootstrap.
                window.sfmcfix = { temp: {}, context: { current: () => ({ stack: 's50', mid: '123', scope: 's50:123' }), refresh: async () => {} },
                    nativeSession: { headers: () => ({}), readMid: async () => '123', backbone: () => null,
                        client: () => ({ ajax: options => { fetch(options.url).then(response => response.json()).then(options.success); return {}; } }) } };
            });
            await page.addScriptTag({ content: fs.readFileSync(source, 'utf8') });
            await page.evaluate(html => {
                document.body.insertAdjacentHTML('afterbegin', '<header style="display:flex;align-items:center;height:70px"><h1>Edit Email</h1><span>Email demo</span><div class="btn-group"><button id="native-save">Save</button><button id="native-save-menu">▼</button></div></header><div class="CodeMirror" style="height:200px">Only last few virtualized lines are in the DOM</div><section id="preview">Rendered preview is different</section>');
                window.__html = html;
                document.querySelector('.CodeMirror').CodeMirror = { getValue: () => __html };
                const hidden = document.createElement('div'); hidden.className = 'CodeMirror'; hidden.hidden = true;
                hidden.CodeMirror = { getValue() { throw Error('Hidden editor must never be read'); } }; document.body.append(hidden);
            }, html);
            const git = page.getByRole('button', { name: 'Esporta per Git', exact: true });
            const direct = page.getByRole('button', { name: 'Scarica HTML', exact: true });
            await git.waitFor(); await direct.waitFor();
            assert.equal(await page.locator('#sfmcfix-download-html + #sfmcfix-export-git + .btn-group > #native-save').count(), 1);
            assert.ok((await direct.boundingBox()).y < 100); // Visible in a tall iframe/document.
            const downloaded = page.waitForEvent('download'); await direct.click(); const file = await downloaded;
            assert.ok(file.suggestedFilename().endsWith('.html'));
            assert.equal(fs.readFileSync(await file.path(), 'utf8'), html);
            assert.deepEqual(calls, []); // Direct HTML needs no route ID, API or save.
            if (!route.includes('opaque')) {
                const snapshot = page.waitForEvent('download'); await git.click();
                assert.equal(JSON.parse(fs.readFileSync(await (await snapshot).path(), 'utf8')).items[0].data.content, '<p>Contenuto salvato</p>');
                assert.equal(calls.length, 1);
            } else {
                await git.click(); await page.getByRole('status').getByText(/Identificativo del contenuto non disponibile/).waitFor();
                assert.deepEqual(calls, []);
            }
            // Other full-document APIs: never reconstruct text from virtual DOM lines.
            for (const kind of ['ace', 'cm6', 'monaco', 'textarea']) {
                await page.evaluate(kind => {
                    document.querySelector('.CodeMirror:not([hidden])')?.remove();
                    document.querySelector('#other-editor')?.remove(); delete window.monaco;
                    const node = document.createElement(kind === 'textarea' ? 'textarea' : 'div'); node.id = 'other-editor'; node.style.cssText = 'height:200px;width:500px';
                    if (kind === 'ace') { node.className = 'ace_editor'; node.env = { editor: { getValue: () => __html } }; }
                    if (kind === 'cm6') { node.className = 'cm-editor'; node.cmView = { view: { state: { doc: { toString: () => __html } } } }; }
                    if (kind === 'monaco') window.monaco = { editor: { getEditors: () => [{ getDomNode: () => node, getValue: () => __html }] } };
                    if (kind === 'textarea') { node.name = 'html'; node.value = __html; }
                    document.body.append(node);
                }, kind);
                await direct.waitFor(); const pending = page.waitForEvent('download'); await direct.click();
                assert.equal(fs.readFileSync(await (await pending).path(), 'utf8'), html);
            }
            await page.evaluate(() => {
                const other = document.createElement('textarea'); other.name = 'html'; other.value = '<p>Altro documento</p>'; document.body.append(other);
            });
            await direct.click(); await page.getByRole('status').getByText(/più editor HTML/).waitFor();
            for (const ambiguous of ['/?assetId=2000#content/1001', '/#content/1001/2000']) {
                const before = calls.length;
                assert.equal(await page.evaluate(async route => {
                    history.replaceState(null, '', route);
                    if (sfmcfix.codeProject.describe() !== null) return false;
                    try { await sfmcfix.codeProject.exportCurrent(); return false; } catch (_) { return true; }
                }, ambiguous), true);
                assert.equal(calls.length, before);
            }
            await page.evaluate(() => {
                history.pushState(null, '', '/#folder/999'); document.querySelector('header').remove();
                document.querySelector('#other-editor')?.remove(); document.querySelector('textarea[name="html"]')?.remove(); delete window.monaco;
                sfmcfix.temp.lastloadedasset = { id: 1001, name: 'Stale asset', assetType: { id: 208 } };
            });
            await git.waitFor({ state: 'hidden' }); await direct.waitFor({ state: 'hidden' });
            assert.ok(calls.every(call => call.method === 'GET')); assert.deepEqual(errors, []);
            await ctx.close();
        }
        console.log('PASS cold editor bootstrap without cached assets, native route/assetId and opaque routes, async header placement before Save, complete 1000-line unsaved HTML/AMPscript with no API/save/preview access, native model readers, hidden/ambiguous editors, and library cleanup.');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
