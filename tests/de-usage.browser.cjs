// Isolated content UI and MAIN context bridge, with fictional metadata and a simulated runtime.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require(process.env.SFMCFIX_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..'), id = '00000000-0000-4000-8000-000000000001', qid = '00000000-0000-4000-8000-000000000010';
(async () => {
 const browser = await chromium.launch({ executablePath: process.env.SFMCFIX_CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
 try {
  const ctx = await browser.newContext(), page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await ctx.route('https://**/*', route => {
   const url = new URL(route.request().url());
   if (url.pathname.startsWith('/assets/')) return route.fulfill({ contentType: url.pathname.endsWith('.js') ? 'application/javascript' : 'text/css', body: fs.readFileSync(root + url.pathname) });
   return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head></head><body><div id="dataExtension"><h1>Customers</h1></div></body></html>' });
  });
  await page.goto('https://mc.s10.exacttarget.com/contactsmeta/admin.html#admin/data-extension/' + id + '/properties');
  await page.evaluate(({ id,qid }) => {
   window.calls = []; window.replyMode = 'ready';
   window.sfmcfix = { context: { current: () => ({ persistent: true, scope: window.scope || 's10:123' }) } };
   window.chrome = { runtime: { getURL: p => '/' + p, sendMessage: (msg, callback) => {
    calls.push(msg);
    if (msg.action === 'settings' || msg.action === 'refresh') return callback({ ok: true, result: true });
    if (window.replyMode === 'setup') return callback({ ok: true, result: { state: 'setup-required' } });
    if (window.replyMode === 'building') return callback({ ok: true, result: { state: 'building', progress: { phase: 'Analisi SQL', current: 1, total: 10 } } });
    const result = { mid:'123', stack:'s10', generatedAt:'2026-11-12T12:00:00.000Z', de:{id,name:'Customers <script>unsafe</script>'}, coverage:{metadata:true,sources:true,targets:true,automations:false}, counts:{des:2,queries:1,automations:1,sourceErrors:0,unresolvedSources:0,targetErrors:0,automationErrors:1}, totalRows:2,
     rows:[{query:{id:qid,name:'Q <img src=x onerror=alert(1)>'}, reads:true,writes:true,mode:'Overwrite',automation:msg.offset ? null : {id:qid,name:'Daily',step:'2',activity:'1',status:'6'}}] };
    if (window.replyMode === 'error-empty') { result.rows = []; result.totalRows = 0; }
    const value = { ok:true,result:{state: window.replyMode === 'error-empty' ? 'error' : 'ready',result, ...(window.replyMode === 'error-empty' ? { error: 'Lettura non riuscita.' } : {})} };
    if (window.replyMode === 'held') window.release = () => callback(value); else callback(value);
   } } };
  }, { id,qid });
  await page.addScriptTag({ path: root + '/assets/js/contactbuilder/de-usage-context.js' });
  await page.addScriptTag({ path: root + '/assets/js/de-usage-content.js' });
  assert.equal(await page.locator('#sfmcfix-de-usage').count(), 1);
  await page.evaluate(() => document.querySelector('#sfmcfix-de-usage').click()); assert.equal(await page.locator('dialog[open]').count(), 0);
  await page.locator('#sfmcfix-de-usage').click();
  await page.waitForFunction(() => document.querySelector('tbody tr'));
  assert.match(await page.locator('[data-coverage]').innerText(), /Analisi parziale/);
  assert.match(await page.locator('tbody').innerText(), /Legge e scrive/);
  assert.match(await page.locator('tbody').innerText(), /Overwrite/);
  assert.equal(await page.locator('dialog script, dialog img').count(), 0);
  const link = page.locator('tbody a').first(); assert.match(await link.getAttribute('href'), /mc.s10.exacttarget.com/); assert.equal(await link.getAttribute('rel'), 'noopener noreferrer');
  await page.getByRole('button',{name:'Carica altri risultati'}).click();
  await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 2);
  assert.match(await page.locator('tbody tr').last().innerText(), /Collegamenti automation incompleti/);
  await page.getByRole('button',{name:'Chiudi',exact:true}).click();
  await page.evaluate(() => window.replyMode = 'setup'); await page.locator('#sfmcfix-de-usage').click();
  await page.waitForFunction(() => document.querySelector('[data-status]').textContent.includes('Collega il componente'));
  await page.getByRole('button',{name:'Collega Analisi DE',exact:true}).click();
  assert.equal(await page.evaluate(() => calls.at(-1).action), 'settings');
  await page.getByRole('button',{name:'Chiudi',exact:true}).click();
  await page.evaluate(() => window.replyMode = 'error-empty'); await page.locator('#sfmcfix-de-usage').click();
  await page.waitForFunction(() => document.querySelector('[data-status]').textContent.includes('Sono mostrati i risultati precedenti'));
  assert.match(await page.locator('[data-status]').innerText(), /Lettura non riuscita/);
  await page.getByRole('button',{name:'Chiudi',exact:true}).click();
  await page.evaluate(() => window.replyMode = 'held'); await page.locator('#sfmcfix-de-usage').click();
  await page.waitForFunction(() => typeof window.release === 'function');
  await page.evaluate(() => location.hash = '#admin/data-extension/00000000-0000-4000-8000-000000000002/properties');
  await page.waitForFunction(() => !document.querySelector('dialog').open); await page.evaluate(() => release());
  assert.equal(await page.locator('tbody tr').count(), 0);
  await page.evaluate(() => location.hash = '#admin/data-extensions');
  await page.waitForFunction(() => !document.querySelector('#sfmcfix-de-usage'));
  assert.deepEqual(errors, []); await ctx.close(); console.log('DE usage browser: passed (simulated metadata/runtime; trusted clicks, context, partial results, pagination, safe names, navigation cancellation).');
 } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
