const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require(process.env.SFMCFIX_PLAYWRIGHT_MODULE || 'playwright');

const extension = process.env.SFMCFIX_EXTENSION_PATH || path.resolve(__dirname, '..');
const shell = 'https://mc.s10.exacttarget.com';
const app = 'https://cloud-pages.s10.marketingcloudapps.com';
const embedded = 'https://web.s10.exacttarget.com';
const route = '/cloud/#app/CloudPages/';
const sites = '/fuelapi/internal/v2/cloudpages/sites';
const labels = ['Name', 'Location', 'Type', 'ID', 'Status', 'Modified', 'Actions'];
const first = { asset: '294630', page: '4288', name: 'Prima pagina', folder: 'Cartella iniziale' };
const target = { asset: '987654', page: '42', name: 'Pagina <due> & "speciale"', folder: 'Cartella B / Sottocartella' };

function documentHTML(options) {
    const filter = options.noFilter ? '' : options.overview
        ? '<div id="toolbar" style="display:flex;justify-content:flex-end"><div id="search-field" class="slds-input-has-icon"><input type="search" style="height:40px" aria-label="Search" placeholder="Search"><button type="button" aria-label="Clear search">×</button><p>Enter at least three characters to search.</p></div><button type="button" id="native-filter" aria-label="Filter">Filtro</button><button type="button" id="native-columns" aria-label="Columns">Colonne</button></div>'
        : '<input placeholder="Enter at least three characters to search">';
    const overview = options.inner
        ? '<header><h1>CloudPages</h1><button disabled>Add Content</button></header>'
        : options.overview
        ? '<header><b>CloudPages</b><nav><button>Overview</button><button onclick="this.setAttribute(\'aria-current\', \'page\');">Recycle Bin</button></nav></header>'
        : '';
    const headers = labels.map(label => {
        if (options.inner && label === 'ID') {
            return '<th style="position:relative"><span id="native-id-heading" style="position:absolute;top:-14px">ID</span></th>';
        }
        return options.overview && !options.inner ? `<div role="columnheader">${label}</div>` : `<th>${label}</th>`;
    }).join('');
    const list = options.inner
        ? `<style>#fixed-headings th { clip-path: inset(0) } #fixed-headings th:has(#native-id-heading) { clip-path: none }</style>
           <div id="inventory-count">20+ items</div><table id="fixed-headings"><thead><tr>${headers}</tr></thead></table>
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
            function openPage(item) {
                view.innerHTML = '<h1 id="native-editor">' + escape(item.name) + '</h1><h2>Page Details</h2>';
            }
            function showRows(items) {
                const grid = options.overview && !options.inner;
                const rowContainer = document.querySelector('#rows');
                rowContainer.innerHTML = items.map(item =>
                    (grid ? '<div role="row" style="min-height:160px">' : '<tr class="slds-hint-parent"' +
                        (options.inner ? ' style="height:160px"' : '') + '>') + [
                        (options.plainName ? '<div class="slds-truncate" title="' + escape(item.name) + '">' + escape(item.name) + '</div>' :
                            '<a href="#native-page"><span class="slds-truncate" title="' + escape(item.name) + '">' + escape(item.name) + '</span></a>') +
                            '<button type="button" class="native-control" aria-label="Native action">↗</button>',
                        escape(item.folder), options.unsupported && item === first ? 'Microsite' : 'Landing Page',
                        options.noAsset && item === target ? '' : item.asset, 'Draft', 'Today',
                        '<div id="fixture-SLDSDataTableRow-' + item.asset + '-SLDSDataTableRowActions"><button type="button" class="row-actions"' +
                            (grid ? '' : ' aria-haspopup="true" aria-expanded="false"') + '>Actions</button></div>'
                    ].map((value, column) => (grid ? '<div role="gridcell"' : '<td') + ' data-label="' + labels[column] + '">' + value + (grid ? '</div>' : '</td>'))
                    .join('') + (grid ? '</div>' : '</tr>')
                ).join('');
                for (const [index, row] of [...rowContainer.children].entries()) {
                    const item = items[index];
                    if (options.trackRowClicks) {
                        for (const type of ['click', 'dblclick']) row.addEventListener(type, () => events.push([type, item.asset]));
                    }
                    row.querySelector('.native-control').onclick = () => events.push(['native', item.asset]);
                    const link = row.querySelector('a');
                    if (link) link.onclick = event => {
                        event.preventDefault();
                        events.push(['open', item.asset]);
                        if (!options.noNativeOpening) openPage(item);
                    };
                    row.querySelector('.row-actions').onclick = event => {
                        if (!options.plainName) throw new Error('There is already a native link');
                        events.push(['menu', item.asset]);
                        const menu = document.createElement('div');
                        menu.id = 'properties-menu-' + item.asset;
                        menu.setAttribute('role', 'menu');
                        menu.innerHTML = '<button role="menuitem">Delete</button><button role="menuitem">Properties</button>';
                        menu.firstElementChild.onclick = () => events.push(['delete', item.asset]);
                        menu.lastElementChild.onclick = () => {
                            events.push(['properties', item.asset]);
                            menu.remove();
                            openPage(item);
                        };
                        event.currentTarget.setAttribute('aria-expanded', 'true');
                        event.currentTarget.setAttribute('aria-controls', menu.id);
                        document.body.append(menu);
                    };
                }
            }
            const search = view.querySelector('input');
            if (search) search.oninput = () => {
                const value = search.value.toLowerCase();
                events.push(['native-search', search.value]);
                showRows(value.length >= 3 ? rows.filter(item => item.asset.includes(value) || item.name.toLowerCase().includes(value)) : rows);
            };
            const nativeColumns = view.querySelector('#native-columns');
            if (nativeColumns) nativeColumns.onclick = () => events.push(['native-columns']);
            const nativeFilter = view.querySelector('#native-filter');
            if (nativeFilter) nativeFilter.onclick = () => events.push(['native-filter']);
            showRows(rows);
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
            const reads = [];
            const page = await context.newPage();
            page.on('pageerror', error => errors.push(error.message));
            const handleRequest = async request => {
                const native = request.request();
                const url = new URL(native.url());
                requests.push([native.method(), url.origin, url.pathname]);
                if (url.origin === app && url.pathname === sites) {
                    const asset = url.searchParams.get('siteAssetId');
                    const mid = native.serviceWorker() ? 'worker' : new URL(native.frame().url()).searchParams.get('mid');
                    reads.push([mid, asset, [...url.searchParams.keys()], Boolean(native.headers().authorization)]);
                    const record = [first, target].find(item => item.asset === asset);
                    if (options.delay && mid !== '999') await new Promise(resolve => setTimeout(resolve, 800));
                    const authenticated = !options.sessionCookie ||
                        (await native.allHeaders()).cookie?.includes('fixture_cloudpages_session=active');
                    const status = !authenticated ? 401 : (record === first && options.http) || (record ? 200 : 404);
                    try {
                        if (options.html) return await request.fulfill({ status, contentType: 'text/html', body: '<h1>Sign in</h1>' });
                        const entities = record && !(options.missingId && record === first) ? [{
                            siteAssetId: Number(options.wrongAsset && record === first ? target.asset : record.asset),
                            defaultPageId: Number(record === first && mid === '999' ? '400' : record.page),
                            siteId: 2000000 + Number(record.asset)
                        }] : [];
                        return await request.fulfill({ status, json: { page: 1, pageSize: 50, totalCount: entities.length, entities } });
                    } catch (error) {
                        if (!options.delay) throw error;
                    }
                    return;
                }
                if (url.origin === shell && url.pathname === '/cloud/') {
                    return request.fulfill({ contentType: 'text/html', body: options.direct ? documentHTML(options) :
                        `<!doctype html><button id="bu" onclick="document.querySelector('iframe').src='${app}/fixture?mid=999'">Cambia BU</button>
                        <iframe width="900" height="600" src="${options.inner || options.crossFrame ? embedded + '/host' : app + '/fixture?mid=123'}"></iframe>` });
                }
                if (url.origin === embedded && url.pathname === '/host') return request.fulfill({
                    contentType: 'text/html', body: options.crossFrame ? documentHTML(options) :
                        `<!doctype html><iframe width="800" height="500" src="${app}/fixture?mid=123"></iframe>`
                });
                if (url.origin === app && url.pathname === '/fixture') return request.fulfill({
                    contentType: 'text/html',
                    body: documentHTML(options),
                    headers: options.sessionCookie ? { 'set-cookie': 'fixture_cloudpages_session=active; Path=/; Secure; HttpOnly; SameSite=Strict' } : {}
                });
                return request.abort();
            };
            await context.route('https://**/*', handleRequest);
            await page.goto(options.overview && !options.inner && !options.direct ? `${app}/fixture?mid=123` :
                `${shell}${options.outsideCloudPages ? '/cloud/#app/Email/' : route}`);
            const direct = options.direct || (options.overview && !options.inner);
            const outer = direct ? page : page.frameLocator('iframe');
            const doc = options.inner ? outer.frameLocator('iframe') : outer;
            const launcher = doc.getByRole('button', { name: 'Page ID', exact: true });
            const form = doc.getByRole('form', { name: 'Ricerca CloudPages per Page ID' });
            await launcher.waitFor();
            assert.equal(await launcher.getAttribute('aria-expanded'), 'false');
            assert.equal(await form.count(), 0);
            const show = async () => {
                if (!await form.isVisible()) await launcher.click();
                try {
                    await form.waitFor({ timeout: 4000 });
                } catch (error) {
                    throw new Error(`Riquadro non visibile ${JSON.stringify(options)}. Stato controllo: ${await launcher.getAttribute('aria-expanded', { timeout: 500 })}`, { cause: error });
                }
            };
            const status = form.getByRole('status');
            const start = async value => {
                await show();
                await form.getByLabel('Page ID', { exact: true }).fill(value);
                await form.getByRole('button', { name: 'Cerca', exact: true }).click();
            };
            const finished = async re => {
                try {
                    await status.getByText(re).waitFor({ timeout: 12000 });
                } catch (error) {
                    throw new Error(`Stato: ${await status.textContent({ timeout: 500 })}\nRichieste: ${JSON.stringify(requests)}`, { cause: error });
                }
            };
            const events = () => doc.locator('body').evaluate(() => window.events);
            const reading = () => context.waitForEvent('request', { predicate: request => new URL(request.url()).pathname === sites });
            const close = async (openedFromProperties = false) => {
                assert.equal((await events()).some(([event]) => event === 'properties'), openedFromProperties);
                assert.equal((await events()).some(([event]) => event === 'delete'), false);
                assert.equal(requests.every(([method, origin, pathname]) => method === 'GET' &&
                    ((origin === shell && (pathname === '/cloud/' || pathname === '/favicon.ico')) ||
                    (origin === embedded && pathname === '/host') ||
                    (origin === app && ['/fixture', '/favicon.ico', sites].includes(pathname)))), true, JSON.stringify(requests));
                for (const [, asset, parameters, explicitAuth] of reads) {
                    assert.ok([first.asset, target.asset].includes(asset), 'only assets shown in the inventory are requested');
                    assert.deepEqual(parameters, ['siteAssetId']);
                    assert.equal(explicitAuth, false);
                }
                await page.close();
                await context.unroute('https://**/*', handleRequest);
                await context.clearCookies({ name: 'fixture_cloudpages_session' });
            };
            return { page, doc, launcher, form, show, start, finished, events, reading, reads, close };
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
            await f.form.getByRole('button', { name: 'Chiudi ricerca Page ID' }).click();
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
            assert.deepEqual(f.reads.map(([, asset]) => asset), [first.asset, target.asset]);
            assert.equal(await f.doc.locator('#native-editor').count(), 0);
            await f.start('4288');
            await f.finished(/Corrispondenza trovata/);
            assert.ok((await f.form.textContent()).includes('Page ID 4288 · ID asset 294630'));
            assert.equal(f.reads.length, 2);
            await f.start('42');
            await f.finished(/Corrispondenza trovata/);
            await f.form.getByRole('button', { name: 'Apri pagina' }).click();
            await f.doc.locator('#native-editor').waitFor();
            assert.deepEqual(await f.events(), [
                ['native-search', '999'], ['native-search', ''], ['native', '294630'], ['all'],
                ['more'], ['open', '987654']
            ]);
            await f.close();
        }

        for (const options of [{ overview: true, sessionCookie: true }, { overview: true, inner: true }]) {
            const f = await fixture(options);
            const native = f.doc.getByRole('searchbox', { name: 'Search' });
            assert.equal(await f.launcher.locator('xpath=preceding-sibling::*[1]').getAttribute('id'), 'search-field');
            assert.equal(await f.launcher.locator('xpath=following-sibling::*[1]').getAttribute('id'), 'native-filter');
            const launcherBox = await f.launcher.boundingBox();
            const searchBox = await native.boundingBox();
            assert.ok(Math.abs(launcherBox.height - searchBox.height) <= 1, 'Page ID matches the height of Search');
            assert.ok(Math.abs(launcherBox.y - searchBox.y) <= 1, 'Page ID and Search start at the same height');
            const column = '[data-sfmcfix-cloudpages-column]';
            const visibleHeading = f.doc.locator('[data-sfmcfix-cloudpages-heading]');
            const toggle = f.form.getByRole('checkbox', { name: 'Mostra colonna Page ID' });
            await f.doc.getByRole('button', { name: 'Filter', exact: true }).click();
            await f.doc.getByRole('button', { name: 'Columns', exact: true }).click();
            await f.show();
            assert.equal(await f.launcher.getAttribute('aria-expanded'), 'true');
            await toggle.check();
            assert.deepEqual(await f.doc.locator(column).allTextContents(), ['Page ID', '—']);
            assert.equal(await f.doc.getByRole('columnheader', { name: 'Page ID', exact: true }).count(), 1);
            if (options.inner) {
                const idBox = await f.doc.locator('#native-id-heading').boundingBox();
                const pageIdBox = await visibleHeading.boundingBox();
                assert.ok(Math.abs((idBox.y + idBox.height / 2) - (pageIdBox.y + pageIdBox.height / 2)) <= 2,
                    'Page ID stays on the line of the fixed native headers');
                const intersection = await visibleHeading.evaluate(node => new Promise(resolve => {
                    const observer = new IntersectionObserver(([entry]) => {
                        observer.disconnect();
                        resolve(entry.intersectionRatio);
                    });
                    observer.observe(node);
                }));
                assert.equal(intersection, 1, 'Page ID remains visible above the clipped header table');
                const valueStart = await f.doc.locator(`td${column}`).first().evaluate(node =>
                    node.getBoundingClientRect().left + parseFloat(getComputedStyle(node).paddingLeft));
                const headingStart = await visibleHeading.evaluate(node => node.getBoundingClientRect().left);
                assert.ok(Math.abs(headingStart - valueStart) <= 2, 'Page ID is aligned with its column values');
            }
            await native.fill('4160');
            await f.start('42');
            await f.finished(/Svuota il filtro Salesforce/);
            assert.equal(await native.inputValue(), '4160');
            await native.fill('');
            await f.form.getByLabel('Page ID', { exact: true }).fill('42');
            await f.form.getByLabel('Page ID', { exact: true }).press('Enter');
            await f.finished(/Corrispondenza trovata/);
            assert.ok((await f.form.textContent()).includes('Page ID 42 · ID asset 987654'));
            assert.deepEqual(await f.doc.locator(column).allTextContents(), ['Page ID', '4288', '42']);
            assert.deepEqual(await f.doc.locator('[data-label="ID"]').allTextContents(), ['294630', '987654']);
            await f.form.getByLabel('Page ID', { exact: true }).press('Escape');
            await f.form.waitFor({ state: 'detached' });
            assert.deepEqual(await f.doc.locator(column).allTextContents(), ['Page ID', '4288', '42']);
            await f.show();
            await toggle.uncheck();
            assert.equal(await f.doc.locator(column).count(), 0);
            assert.equal(await visibleHeading.count(), 0);
            await f.form.getByRole('button', { name: 'Apri pagina' }).click();
            await f.doc.locator('#native-editor').waitFor();
            await f.form.waitFor({ state: 'detached' });
            assert.deepEqual(await f.events(), [['native-filter'], ['native-columns'], ['native-search', '4160'], ['native-search', ''],
                ['scroll'], ['open', '987654']]);
            await f.close();
        }

        {
            const f = await fixture({ overview: true });
            await f.doc.getByRole('button', { name: 'Recycle Bin' }).click();
            await f.launcher.waitFor({ state: 'detached' });
            assert.deepEqual(await f.events(), []);
            await f.close();
        }

        {
            const f = await fixture({ direct: true, overview: true, trackRowClicks: true });
            await f.start('4288');
            await f.finished(/Corrispondenza trovata/);
            assert.ok((await f.form.textContent()).includes('Page ID 4288 · ID asset 294630'));
            await f.start('42');
            await f.finished(/Corrispondenza trovata/);
            assert.ok((await f.form.textContent()).includes('Page ID 42 · ID asset 987654'));
            await f.form.getByRole('checkbox', { name: 'Mostra colonna Page ID' }).check();
            await f.form.getByRole('button', { name: 'Chiudi ricerca Page ID' }).click();
            const numbers = f.doc.locator('[role="gridcell"][data-sfmcfix-cloudpages-column]');
            await numbers.first().click();
            assert.deepEqual(await numbers.allTextContents(), ['4288', '42']);
            await numbers.last().dblclick({ position: { x: 12, y: 8 } });
            assert.deepEqual(await numbers.allTextContents(), ['4288', '42']);
            assert.equal(await numbers.last().evaluate(() => document.getSelection().toString().trim()), '42');
            await f.doc.locator('#viewport').evaluate(node => { node.scrollTop = 0; });
            assert.equal(await f.doc.locator('[data-sfmcfix-cloudpages-heading]').textContent(), 'Page ID');
            assert.deepEqual(f.reads.map(([source, asset]) => [source, asset]), [
                ['worker', first.asset], ['worker', first.asset], ['worker', target.asset]
            ]);
            assert.deepEqual(await f.events(), [['scroll']]);
            await f.close();
        }

        {
            const f = await fixture({ direct: true, overview: true, plainName: true });
            const native = f.doc.getByRole('searchbox', { name: 'Search' });
            const name = f.form.getByText(target.name, { exact: true });
            const column = f.form.getByRole('checkbox', { name: 'Mostra colonna Page ID' });
            await f.show();
            await column.check();
            await f.start('42');
            await f.finished(/Corrispondenza trovata/);
            await name.evaluate(node => {
                document.activeElement.blur();
                const range = document.createRange();
                range.selectNodeContents(node);
                window.getSelection().removeAllRanges();
                window.getSelection().addRange(range);
            });
            await f.page.keyboard.down('Control');
            assert.equal(await name.isVisible(), true);
            assert.equal(await name.evaluate(() => window.getSelection().toString()), target.name);
            assert.deepEqual(await f.doc.locator('[role="gridcell"][data-sfmcfix-cloudpages-column]').allTextContents(), ['4288', '42']);
            await f.page.keyboard.press('KeyC');
            await f.page.keyboard.up('Control');
            await native.press('Control+v');
            assert.equal(await native.inputValue(), target.name);
            assert.equal(await name.isVisible(), true);
            await native.fill('Nome diverso');
            assert.equal(await f.doc.locator('[data-label="Name"]').count(), 0);
            assert.equal(await name.isVisible(), true);
            await f.form.getByRole('button', { name: 'Apri pagina' }).click();
            await f.doc.locator('#native-editor').waitFor();
            assert.equal(await f.doc.locator('#native-editor').textContent(), target.name);
            assert.deepEqual(await f.events(), [
                ['scroll'], ['native-search', target.name], ['native-search', 'Nome diverso'],
                ['native-search', target.asset], ['menu', target.asset], ['properties', target.asset]
            ]);
            await f.close(true);
        }

        {
            const f = await fixture({ direct: true, overview: true, noNativeOpening: true });
            await f.start('4288');
            await f.finished(/Corrispondenza trovata/);
            await f.form.getByRole('button', { name: 'Apri pagina' }).click();
            await f.finished(/Salesforce non ha mostrato i dettagli/);
            const copy = f.form.getByRole('button', { name: 'Copia nome' });
            assert.equal(await copy.isVisible(), true);
            await copy.click();
            await f.finished(/Nome copiato|Nome selezionato/);
            if ((await f.form.getByRole('status').textContent()).includes('Nome selezionato')) {
                await f.page.keyboard.press('Control+c');
            }
            const native = f.doc.getByRole('searchbox', { name: 'Search' });
            await native.press('Control+v');
            assert.equal(await native.inputValue(), first.name);
            assert.equal(await f.form.getByText(first.name, { exact: true }).isVisible(), true);
            assert.deepEqual(await f.events(), [['open', first.asset], ['native-search', first.name]]);
            await f.close();
        }

        {
            const f = await fixture({ direct: true, overview: true, outsideCloudPages: true });
            await f.start('4288');
            await f.finished(/Ricerca parziale.*riquadri CloudPages/);
            assert.equal(f.reads.length, 0);
            await f.close();
        }

        {
            const f = await fixture({ crossFrame: true });
            await f.start('4288');
            await f.finished(/Corrispondenza trovata/);
            assert.deepEqual(f.reads.map(([source, asset]) => [source, asset]), [['worker', first.asset]]);
            await f.close();
        }

        {
            const f = await fixture({ direct: true, http: 401 });
            await f.start('42');
            await f.finished(/Ricerca parziale.*HTTP 401.*0 pagine verificate/);
            assert.equal(await f.form.getByRole('button', { name: 'Apri pagina' }).isVisible(), false);
            await f.close();
        }

        {
            const f = await fixture({ direct: true, delay: true });
            await Promise.all([f.reading(), f.start('42')]);
            await f.form.getByRole('button', { name: 'Annulla ricerca' }).click();
            await f.finished(/Ricerca annullata.*0 pagine verificate/);
            assert.equal(await f.form.getByRole('button', { name: 'Apri pagina' }).isVisible(), false);
            assert.deepEqual(f.reads.map(([, asset]) => asset), [first.asset]);
            await f.close();
        }

        for (const [options, message] of [
            [{}, /Nessuna corrispondenza in All Pages.*2 pagine verificate/],
            [{ missingId: true }, /Ricerca parziale.*1 pagina verificata/],
            [{ wrongAsset: true }, /Ricerca parziale.*1 pagina verificata/],
            [{ noAsset: true }, /Ricerca parziale.*1 pagina verificata/],
            [{ unsupported: true }, /Ricerca parziale.*1 pagina verificata/],
            [{ noAll: true }, /Ricerca parziale.*copertura/],
            [{ stalled: true }, /Ricerca parziale.*non ha caricato altre righe/],
            [{ noFilter: true }, /Ricerca parziale.*copertura/],
            [{ http: 401 }, /Ricerca parziale.*HTTP 401/],
            [{ http: 403 }, /Ricerca parziale.*HTTP 403/],
            [{ http: 429 }, /Ricerca parziale.*HTTP 429/],
            [{ html: true }, /Ricerca parziale.*risposta non JSON/]
        ]) {
            const f = await fixture(options);
            await f.start(options.wrongAsset ? '4288' : '4');
            await f.finished(message);
            assert.equal(await f.form.getByRole('button', { name: 'Apri pagina' }).isVisible(), false);
            assert.equal(await f.doc.locator('#native-editor').count(), 0);
            if (options.noAsset) assert.deepEqual(f.reads.map(([, asset]) => asset), [first.asset]);
            if (options.unsupported) assert.deepEqual(f.reads.map(([, asset]) => asset), [target.asset]);
            if (options.http || options.html) assert.equal(f.reads.length, 1);
            await f.close();
        }

        {
            const f = await fixture({ delay: true });
            await Promise.all([f.reading(), f.start('42')]);
            await f.form.getByRole('button', { name: 'Annulla ricerca' }).click();
            await f.finished(/Ricerca annullata.*0 pagine verificate/);
            assert.equal(await f.form.getByRole('button', { name: 'Apri pagina' }).isVisible(), false);
            await Promise.all([f.reading(), f.start('4288')]);
            await f.finished(/Corrispondenza trovata/);
            assert.deepEqual(f.reads.map(([, asset]) => asset), [first.asset, first.asset]);
            await f.close();
        }

        {
            const f = await fixture({ delay: true });
            await Promise.all([f.reading(), f.start('4288')]);
            await Promise.all([
                f.page.waitForEvent('framenavigated', frame => frame.url() === `${app}/fixture?mid=999`),
                f.page.locator('#bu').click()
            ]);
            await f.launcher.waitFor();
            assert.equal(await f.form.count(), 0);
            assert.deepEqual(await f.events(), []);
            await f.start('400');
            await f.finished(/Corrispondenza trovata/);
            assert.ok((await f.form.textContent()).includes('Page ID 400 · ID asset 294630'));
            assert.deepEqual(f.reads.map(([mid, asset]) => [mid, asset]), [['123', first.asset], ['999', first.asset]]);
            await f.page.evaluate(() => { location.hash = '#app/Email/'; });
            await f.launcher.waitFor({ state: 'detached' });
            assert.equal(await f.doc.locator('#native-editor').count(), 0);
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
