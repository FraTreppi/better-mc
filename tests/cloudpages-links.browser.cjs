const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require(process.env.SFMCFIX_PLAYWRIGHT_MODULE || 'playwright');

const extension = process.env.SFMCFIX_EXTENSION_PATH || path.resolve(__dirname, '..');
const shell = 'https://mc.s10.exacttarget.com';
const app = 'https://cloudpages.s10.marketingcloudapps.com';
const route = '/cloud/#app/CloudPages/';
const labels = ['Name', 'Location', 'Type', 'ID', 'Status', 'Modified', 'Actions'];
const first = { asset: '42', page: '420', name: 'Prima pagina', folder: 'Cartella iniziale' };
const target = { asset: '987654', page: '42', name: 'Pagina <due> & "speciale"', folder: 'Cartella B / Sottocartella' };

function documentHTML(options) {
    const filter = options.noFilter ? '' : '<input placeholder="Enter at least three characters to search">';
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
            + JSON.stringify(`<button role="tab" id="all">All Pages</button>${filter}<table><thead><tr>${labels.map(label =>
                `<th>${label}</th>`).join('')}</tr></thead><tbody></tbody></table><button id="more">Load More</button>`)
            + `;
            const all = document.querySelector('#all');
            all.setAttribute('aria-selected', isAll);
            all.hidden = options.noAll;
            all.onclick = () => { events.push(['all']); isAll = true; showList(); };
            document.querySelector('table').hidden = options.collections && !isAll;
            let rows = [first];
            if (isAll && expanded) rows.push(target);
            const more = document.querySelector('#more');
            more.hidden = !isAll || expanded;
            more.onclick = () => {
                events.push(['more']);
                if (options.stalled) return;
                document.querySelector('table').setAttribute('aria-busy', 'true');
                setTimeout(() => { expanded = true; showList(); }, 100);
            };
            function showRows(items) {
                document.querySelector('tbody').innerHTML = items.map((item, i) =>
                    '<tr class="slds-hint-parent">' + [
                        '<div class="slds-truncate" title="' + escape(item.name) + '">' + escape(item.name) + '</div><button type="button" class="native-control" aria-label="Native action">↗</button>',
                        escape(item.folder), 'Landing Page', options.noAsset && item === target ? '' : item.asset, 'Draft', 'Today',
                        '<div id="fixture-SLDSDataTableRow-' + item.asset + '-SLDSDataTableRowActions"><button type="button" aria-haspopup="true" aria-expanded="false">Actions</button></div>'
                    ].map((value, column) => '<td data-label="' + labels[column] + '">' + value + '</td>').join('') + '</tr>'
                ).join('');
                for (const [index, row] of [...document.querySelectorAll('tbody tr')].entries()) {
                    const item = items[index];
                    row.querySelector('.native-control').onclick = () => events.push(['native', item.asset]);
                    row.querySelector('.slds-truncate').onclick = () => {
                        events.push(['open', item.asset]);
                        view.innerHTML = '<h1 id="native-editor">' + escape(item.name) + '</h1>';
                    };
                    const trigger = row.querySelector('[aria-haspopup]');
                    trigger.onclick = () => {
                        const old = row.querySelector('[role="menu"]');
                        trigger.setAttribute('aria-expanded', String(!old));
                        if (old) { old.remove(); return; }
                        trigger.insertAdjacentHTML('afterend', '<div role="menu"><button role="menuitem">Page Properties</button><button role="menuitem">Publish</button></div>');
                        row.querySelector('[role="menuitem"]').onclick = () => {
                            events.push(['properties', item.asset]);
                            row.querySelector('[role="menu"]').remove();
                            trigger.setAttribute('aria-expanded', 'false');
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
                        <iframe width="900" height="600" src="${app}/fixture?mid=123"></iframe>` });
                }
                if (url.origin === app && url.pathname === '/fixture') return request.fulfill({ contentType: 'text/html', body: documentHTML(options) });
                return request.abort();
            });
            await page.goto(`${shell}${route}`);
            const doc = options.direct ? page : page.frameLocator('iframe');
            const appFrame = options.direct ? page.mainFrame() : page.frames().find(frame => frame.url().startsWith(app));
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
