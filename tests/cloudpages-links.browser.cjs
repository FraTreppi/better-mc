const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require(process.env.SFMCFIX_PLAYWRIGHT_MODULE || 'playwright');

const extension = process.env.SFMCFIX_EXTENSION_PATH || path.resolve(__dirname, '..');
const shell = 'https://mc.s10.exacttarget.com';
const app = 'https://cloudpages.s10.marketingcloudapps.com';
const embedded = 'https://web.s10.exacttarget.com';
const route = '/cloud/#app/CloudPages/';
const labels = ['Name', 'Location', 'Type', 'ID', 'Status', 'Modified', 'Actions'];
const first = { asset: '42', page: '420', name: 'Prima pagina', folder: 'Cartella iniziale' };
const target = { asset: '987654', page: '42', name: 'Pagina <due> & "speciale"', folder: 'Cartella B / Sottocartella' };

function documentHTML(options) {
    const filter = options.noFilter ? '' : options.overview
        ? '<div><div><input type="search" aria-label="Search"></div><p>Enter at least three characters to search.</p></div>'
        : '<input placeholder="Enter at least three characters to search">';
    const overview = options.inner
        ? '<header><h1>CloudPages</h1><button disabled>Add Content</button></header>'
        : options.overview
        ? '<header><b>CloudPages</b><nav><button>Overview</button><button onclick="this.setAttribute(\'aria-current\', \'page\');">Recycle Bin</button></nav></header>'
        : '';
    const headers = labels.map(label => options.overview && !options.inner
        ? `<div role="columnheader">${label}</div>` : `<th>${label}</th>`).join('');
    const list = options.inner
        ? `<div id="inventory-count">20+ items</div><table><thead><tr>${headers}</tr></thead></table>
           <div id="viewport" style="height:90px;overflow:auto"><table id="list"><tbody id="rows"></tbody></table></div>`
        : options.overview
            ? `<div id="inventory-count">20+ items</div><div id="viewport" style="height:90px;overflow:auto"><div id="list" role="grid"><div role="row">${headers}</div><div role="rowgroup" id="rows"></div></div></div>`
            : `<table id="list"><thead><tr>${headers}</tr></thead><tbody id="rows"></tbody></table>`;
    return `<!doctype html><html><body><main id="view"></main><script>
        const options = ${JSON.stringify(options)};
        const labels = ${JSON.stringify(labels)};
        const first = ${JSON.stringify(first)};
        const target = ${JSON.stringify(target)};
        const view = document.querySelector('#view');
        window.events = [];
        let isAll = false;
        let expanded = false;
        const escape = value => String(value).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[c]);
        function showList() {
            view.innerHTML = `
            + JSON.stringify(`${overview}<button role="tab" id="all">All Pages</button>${filter}${list}<button id="more">Load More</button>`)
            + `;
            const all = document.querySelector('#all');
            all.setAttribute('aria-selected', isAll);
            all.hidden = options.noAll || options.overview;
            all.onclick = () => { events.push(['all']); isAll = true; showList(); };
            const listing = document.querySelector('#list');
            listing.hidden = options.collections && !isAll;
            let rows = [first];
            if ((isAll || options.overview) && expanded) rows.push(target);
            const more = document.querySelector('#more');
            more.hidden = !isAll || expanded;
            const nextRows = () => {
                if (options.stalled) return;
                listing.setAttribute('aria-busy', 'true');
                setTimeout(() => { expanded = true; showList(); }, 100);
            };
            more.onclick = () => { events.push(['more']); nextRows(); };
            if (options.overview) {
                document.querySelector('#inventory-count').textContent = expanded ? '2 items' : '20+ items';
                document.querySelector('#viewport').onscroll = () => {
                    if (expanded || listing.getAttribute('aria-busy')) return;
                    events.push(['scroll']);
                    nextRows();
                };
            }
            function showRows(items) {
                const grid = options.overview && !options.inner;
                const rowContainer = document.querySelector('#rows');
                rowContainer.innerHTML = items.map(item =>
                    (grid ? '<div role="row" style="min-height:160px">' : '<tr class="slds-hint-parent"' +
                        (options.inner ? ' style="height:160px"' : '') + '>') + [
                        '<div class="slds-truncate" title="' + escape(item.name) + '">' + escape(item.name) + '</div><button type="button" class="native-control" aria-label="Native action">↗</button>',
                        escape(item.folder), 'Landing Page', options.noAsset && item === target ? '' : item.asset, 'Draft', 'Today',
                        '<div id="fixture-SLDSDataTableRow-' + item.asset + '-SLDSDataTableRowActions"><button type="button" class="row-actions"' +
                            (grid ? '' : ' aria-haspopup="true" aria-expanded="false"') + '>Actions</button></div>'
                    ].map((value, column) => (grid ? '<div role="gridcell"' : '<td') + ' data-label="' + labels[column] + '">' + value + (grid ? '</div>' : '</td>'))
                    .join('') + (grid ? '</div>' : '</tr>')
                ).join('');
                for (const [index, row] of [...rowContainer.children].entries()) {
                    const item = items[index];
                    row.querySelector('.native-control').onclick = () => events.push(['native', item.asset]);
                    row.querySelector('.slds-truncate').onclick = () => {
                        events.push(['open', item.asset]);
                        view.innerHTML = '<h1 id="native-editor">' + escape(item.name) + '</h1>';
                    };
                    const trigger = row.querySelector('.row-actions');
                    trigger.onclick = () => {
                        const old = row.querySelector('[role="menu"]');
                        if (!grid) trigger.setAttribute('aria-expanded', String(!old));
                        if (old) { old.remove(); return; }
                        trigger.insertAdjacentHTML('afterend', '<div role="menu"><button role="menuitem">Page Properties</button><button role="menuitem">Publish</button></div>');
                        row.querySelector('[role="menuitem"]').onclick = () => {
                            events.push(['properties', item.asset]);
                            row.querySelector('[role="menu"]').remove();
                            if (!grid) trigger.setAttribute('aria-expanded', 'false');
                            if (options.delayProperties) setTimeout(() => showDetails(item), 700);
                            else showDetails(item);
                        };
                        row.querySelectorAll('[role="menuitem"]')[1].onclick = () => events.push(['write']);
                    };
                }
            }
            const search = view.querySelector('input');
            if (search) search.oninput = () => {
                events.push(['native-search', search.value]);
                showRows(search.value.length >= 3 ? rows.filter(item => item.asset.includes(search.value)) : rows);
            };
            showRows(rows);
        }
        function showDetails(item) {
            const id = options.missingId && item === first ? '' :
                '<div><div><span>Page ID</span></div><div>' + item.page + '</div></div>';
            const card = '<article><h2>Page Details</h2><div>Draft</div>' + id + '</article>';
            if (options.full) {
                view.innerHTML = '<nav aria-label="Breadcrumb"><button>Home</button></nav><h1>' + escape(item.name) + '</h1>' + card;
                view.querySelector('nav button').onclick = () => {
                    events.push(['home']); isAll = false; expanded = false; showList();
                };
            } else {
                view.insertAdjacentHTML('afterend', '<section role="dialog"><h2>Page Properties</h2>' +
                    id + '<button type="button" aria-label="Close">×</button><button>Save</button></section>');
                const dialog = document.querySelector('[role="dialog"]');
                dialog.querySelector('button').onclick = () => dialog.remove();
                dialog.querySelectorAll('button')[1].onclick = () => events.push(['write']);
            }
        }
        showList();
    </script></body></html>`;
}

async function run() {
    const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'better-mc-cloudpages-'));
    let context;
    try {
        context = await chromium.launchPersistentContext(profile, {
            channel: process.env.SFMCFIX_BROWSER_CHANNEL || 'chromium',
            headless: true,
            args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
        });
        const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 15000 });
        const version = JSON.parse(await fs.readFile(path.join(extension, 'manifest.json'), 'utf8')).version;
        assert.equal(await worker.evaluate(() => chrome.runtime.getManifest().version), version);
        const errors = [];
        async function fixture(options = {}) {
            const requests = [];
            const page = await context.newPage();
            page.on('pageerror', error => errors.push(error.message));
            await page.route('https://**/*', request => {
                const url = new URL(request.request().url());
                requests.push([request.request().method(), url.origin, url.pathname]);
                if (url.origin === shell && url.pathname === '/cloud/') {
                    return request.fulfill({ contentType: 'text/html', body: options.direct ? documentHTML(options) :
                        `<!doctype html><button id="bu" onclick="document.querySelector('iframe').src='${app}/fixture?mid=999'">Cambia BU</button>
                        <iframe width="900" height="600" src="${options.inner ? embedded + '/host' : app + '/fixture?mid=123'}"></iframe>` });
                }
                if (url.origin === embedded && url.pathname === '/host') return request.fulfill({
                    contentType: 'text/html', body: `<!doctype html><iframe width="800" height="500" src="${app}/fixture?mid=123"></iframe>`
                });
                if (url.origin === app && url.pathname === '/fixture') return request.fulfill({ contentType: 'text/html', body: documentHTML(options) });
                return request.abort();
            });
            await page.goto(options.overview && !options.inner ? `${app}/fixture?mid=123` : `${shell}${route}`);
            const direct = options.direct || (options.overview && !options.inner);
            const outer = direct ? page : page.frameLocator('iframe');
            const doc = options.inner ? outer.frameLocator('iframe') : outer;
            const appFrame = direct ? page.mainFrame() : page.frames().find(frame => frame.url().startsWith(app));
            const form = doc.getByRole('form', { name: 'Ricerca CloudPages per Page ID' });
            await form.waitFor();
            const status = form.getByRole('status');
            const start = async value => {
                await form.getByLabel('Page ID', { exact: true }).fill(value);
                await form.getByRole('button', { name: 'Cerca', exact: true }).click();
            };
            const finished = re => status.getByText(re).waitFor();
            const events = () => doc.locator('body').evaluate(() => window.events);
            const openingDetails = () => appFrame.waitForFunction(() => window.events.some(([event]) => event === 'properties'));
            const close = async () => {
                assert.equal((await events()).some(([event]) => event === 'write'), false);
                assert.equal(requests.every(([method, origin, pathname]) => method === 'GET' &&
                    ((origin === shell && (pathname === '/cloud/' || pathname === '/favicon.ico')) ||
                    (origin === embedded && pathname === '/host') ||
                    (origin === app && (pathname === '/fixture' || pathname === '/favicon.ico')))), true, JSON.stringify(requests));
                await page.close();
            };
            return { page, doc, form, start, finished, events, openingDetails, close };
        }

        {
            const f = await fixture();
            const native = f.doc.getByPlaceholder('Enter at least three characters to search');
            await native.fill('999');
            assert.equal(await f.doc.locator('tbody tr').count(), 0);
            await f.start('42');
            await f.finished(/Svuota il filtro Salesforce/);
            assert.equal(await native.inputValue(), '999');
            await native.fill('');
            assert.equal(await f.doc.locator('.sfmcfix-cloudpage-newtab').count(), 0);
            await f.doc.getByRole('button', { name: 'Native action' }).click();
            await f.start('4e1');
            await f.finished(/Inserisci un Page ID numerico/);
            await f.start('42');
            await f.finished(/Corrispondenza trovata/);
            const result = await f.form.textContent();
            assert.ok(result.includes(target.name));
            assert.ok(result.includes(target.folder));
            assert.ok(result.includes('Page ID 42 · ID asset 987654'));
            await f.form.getByRole('button', { name: 'Apri pagina' }).click();
            await f.doc.locator('#native-editor').waitFor();
            assert.deepEqual(await f.events(), [
                ['native-search', '999'], ['native-search', ''], ['native', '42'], ['all'],
                ['properties', '42'], ['more'], ['properties', '987654'], ['open', '987654']
            ]);
            await f.close();
        }

        for (const options of [{ overview: true }, { overview: true, inner: true }]) {
            const f = await fixture(options);
            const native = f.doc.getByRole('searchbox', { name: 'Search' });
            assert.equal(await f.form.locator('xpath=following-sibling::*[1]').getAttribute('id'), 'viewport');
            await native.fill('4160');
            await f.start('42');
            await f.finished(/Svuota il filtro Salesforce/);
            assert.equal(await native.inputValue(), '4160');
            await native.fill('');
            await f.form.getByLabel('Page ID', { exact: true }).fill('42');
            await f.form.getByLabel('Page ID', { exact: true }).press('Enter');
            await f.finished(/Corrispondenza trovata/);
            assert.ok((await f.form.textContent()).includes('Page ID 42 · ID asset 987654'));
            await f.form.getByRole('button', { name: 'Apri pagina' }).click();
            await f.doc.locator('#native-editor').waitFor();
            await f.form.waitFor({ state: 'detached' });
            assert.deepEqual(await f.events(), [['native-search', '4160'], ['native-search', ''],
                ['properties', '42'], ['scroll'], ['properties', '987654'], ['open', '987654']]);
            await f.close();
        }

        {
            const f = await fixture({ overview: true });
            await f.doc.getByRole('button', { name: 'Recycle Bin' }).click();
            await f.form.waitFor({ state: 'detached' });
            assert.deepEqual(await f.events(), []);
            await f.close();
        }

        {
            const f = await fixture({ direct: true, full: true, noAsset: true, collections: true });
            await f.start('00042');
            await f.finished(/pagina è aperta nei dettagli Salesforce/);
            assert.ok((await f.form.textContent()).includes('Page ID 42 · ID asset non disponibile'));
            assert.equal(await f.doc.getByRole('heading', { name: target.name }).count(), 1);
            assert.deepEqual(await f.events(), [['all'], ['properties', '42'], ['home'], ['all'], ['more'], ['properties', '987654']]);
            await f.close();
        }

        for (const options of [{}, { missingId: true }, { noAll: true }, { stalled: true }, { noFilter: true }]) {
            const f = await fixture(options);
            await f.start('4');
            await f.finished(Object.keys(options).length ? /Ricerca parziale/ : /Nessuna corrispondenza nelle 2 pagine verificate in All Pages/);
            assert.equal(await f.form.getByRole('button', { name: 'Apri pagina' }).isVisible(), false);
            await f.close();
        }

        {
            const f = await fixture({ delayProperties: true });
            await f.start('42');
            await f.openingDetails();
            await f.form.getByRole('button', { name: 'Annulla ricerca' }).click();
            await f.finished(/Ricerca annullata/);
            await f.start('420');
            await f.finished(/Attendi i dettagli richiesti a Salesforce|Torna all’elenco CloudPages/);
            await f.doc.getByRole('dialog').waitFor();
            assert.deepEqual(await f.events(), [['all'], ['properties', '42']]);
            assert.equal(await f.form.getByRole('button', { name: 'Apri pagina' }).isVisible(), false);
            await f.close();
        }

        {
            const f = await fixture({ delayProperties: true });
            await f.start('420');
            await f.openingDetails();
            await Promise.all([
                f.page.waitForEvent('framenavigated', frame => frame.url() === `${app}/fixture?mid=999`),
                f.page.locator('#bu').click()
            ]);
            await f.form.waitFor();
            assert.deepEqual(await f.events(), []);
            await f.page.evaluate(() => { location.hash = '#app/Email/'; });
            await f.form.waitFor({ state: 'detached' });
            assert.equal(await f.doc.getByRole('dialog').count(), 0);
            await f.close();
        }

        assert.deepEqual(errors, []);
        console.log(`PASS Manifest V3 ${version}, CloudPages DOM fixtures, native controls, cross-folder pagination, exact short IDs, partial, cancellation and BU/route change (${process.env.SFMCFIX_BROWSER_CHANNEL || 'chromium'}).`);
    } finally {
        await context?.close();
        await fs.rm(profile, { recursive: true, force: true });
    }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
