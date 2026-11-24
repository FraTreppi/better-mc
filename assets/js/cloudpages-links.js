(function () {
    'use strict';

    const host = location.hostname.match(/^(?:[a-z0-9-]+\.)?(s\d+)\.(?:exacttarget|marketingcloud|marketingcloudapps)\.com$/i);
    if (location.protocol !== 'https:' || location.port || !host) return;
    const shellOrigin = `https://mc.${host[1]}.exacttarget.com`;
    const metadataHost = `cloud-pages.${host[1]}.marketingcloudapps.com`;
    const channel = 'sfmcfix-cloudpages-context';
    const isTop = window === window.top;
    const isShell = isTop && location.origin === shellOrigin && /^\/cloud\/?$/i.test(location.pathname);
    const inCloudPages = () => /^#app\/CloudPages(?:\/|$)/i.test(location.hash);
    const stackHost = new RegExp(`^(?:[a-z0-9-]+\\.)?${host[1]}\\.(?:exacttarget|marketingcloud|marketingcloudapps)\\.com$`, 'i');
    function trustedOrigin(value) {
        try {
            const url = new URL(value);
            return url.protocol === 'https:' && !url.port && stackHost.test(url.hostname);
        } catch (_) {
            return false;
        }
    }
    const ancestors = Array.from(location.ancestorOrigins || []);
    if (!isTop && (!ancestors.length || !ancestors.every(trustedOrigin))) return;
    const shellFrame = !isTop && window.parent === window.top && ancestors[0] === shellOrigin;

    const frames = new Map();
    const verifiedPageIds = new Map();
    const columnCells = new Set();
    let routeContext = isShell && inCloudPages() ? true : null;
    let active = false;
    let suspended = false;
    let job;
    let result;
    let launcher;
    let panel;
    let panelExpanded = false;
    let columnToggle;
    let input;
    let search;
    let cancel;
    let status;
    let details;
    let open;

    const visible = node => node?.getClientRects().length && node.checkVisibility?.({ checkVisibilityCSS: true }) !== false &&
        !node.closest('[aria-hidden="true"]');
    const text = node => node?.textContent.trim().replace(/\s+/g, ' ') || '';
    const actions = 'button, a, [role="button"], [role="menuitem"], [role="tab"]';
    const insideControls = node => launcher?.contains(node) || panel?.contains(node);
    const shown = (root, selector) => Array.from(root.querySelectorAll(selector)).filter(node => !insideControls(node) && visible(node));
    const leaves = nodes => nodes.filter(node => !nodes.some(other => other !== node && node.contains(other)));
    const named = (root, label, selector = actions) => leaves(shown(root, selector).filter(node =>
        label.test(node.getAttribute('aria-label') || node.title || text(node))));
    const only = nodes => nodes.length === 1 ? nodes[0] : null;
    const enabled = node => node && !node.matches(':disabled, [aria-disabled="true"]');
    const pageNumber = value => /^\d+$/.test(value.trim()) ? value.trim().replace(/^0+(?=\d)/, '') : null;
    const allPages = () => only(named(document, /^(All Pages|Tutte le pagine)$/i));
    const selected = node => node?.matches('[aria-selected="true"], [aria-current="page"], [aria-pressed="true"]') ||
        node?.closest('.slds-is-active');
    const tableLabels = ['Name', 'Location', 'Type', 'ID', 'Status', 'Modified'];
    const libraryLabels = 'h1, h2, [role="heading"], a, button, [role="tab"], strong, b, span, div';
    const searchHint = /^Enter at least three characters to search\.?$/i;
    const listRows = 'tbody tr, [role="row"]:has([role="gridcell"], [role="cell"])';
    const headerCells = 'thead th, [role="columnheader"]';
    const ownColumn = '[data-sfmcfix-cloudpages-column]';
    const searchableType = /^(Landing Page|Interactive Email Page)$/i;
    const landingPage = /^Landing Page$/i;
    const readScope = () => {
        const params = new URLSearchParams(location.search);
        return ['mid', 'MID', 'memberId', 'memberID'].map(key => params.get(key)).join('/');
    };
    let scope = readScope();

    function nativeSearch() {
        const inputs = shown(document, 'input:not([type]), input[type="text"], input[type="search"]');
        if (!inputs.length) return null;
        const described = only(inputs.filter(node => searchHint.test(node.placeholder.trim()) ||
            (node.getAttribute('aria-describedby') || '').split(/\s+/).some(id => searchHint.test(text(document.getElementById(id))))));
        if (described) return described;
        const hint = only(leaves(shown(document, 'label, p, span, div, small').filter(node => searchHint.test(text(node)))));
        // Overview can show this instruction under the field rather than as its placeholder.
        for (let container = hint?.parentElement, level = 0; container && level < 4; container = container.parentElement, level++) {
            const input = only(inputs.filter(node => container.contains(node)));
            if (input) return input;
        }
        return only(inputs.filter(node => [node.placeholder, node.getAttribute('aria-label')]
            .some(label => /^(Search|Cerca)$/i.test(label || ''))));
    }

    function cloudPagesList(table, native) {
        if (!table && !native) return false;
        const labels = new Set(['CloudPages', 'Overview', 'Recycle Bin']);
        for (const node of document.querySelectorAll(libraryLabels)) {
            if (table?.contains(node)) continue;
            const label = text(node);
            if (labels.has(label) && visible(node)) labels.delete(label);
            if (!labels.size && native) return true;
        }
        if (labels.has('CloudPages')) return false;
        if (native && named(document, /^Add Content$/i).length) return true;
        if (!table) return false;
        // The app can render the module tabs outside the document containing the list.
        // Require the native row markers already used by the CloudPages shortcut.
        return rows(table).some(info => info?.action && info.assetId && searchableType.test(info.type));
    }

    const rowCell = (row, label) => row.querySelector(`td[data-label="${label}"], [role="gridcell"][data-label="${label}"], [role="cell"][data-label="${label}"]`);
    const hasHeading = (cell, label) => cell.getAttribute('data-label') === label || cell.title === label ||
        text(cell) === label || Array.from(cell.querySelectorAll('[title]')).some(node => node.title === label);

    function listing() {
        const candidates = shown(document, 'table, [role="table"], [role="grid"]');
        const rowTables = leaves(candidates.filter(table => {
            const row = table.querySelector(listRows);
            return row && tableLabels.every(label => rowCell(row, label));
        }));
        // Some list layouts have separate containers for the fixed headings and scrolling rows.
        if (rowTables.length) return only(rowTables);
        return only(leaves(candidates.filter(table => {
            const headings = Array.from(table.querySelectorAll(headerCells));
            return tableLabels.every(label => headings.some(cell => hasHeading(cell, label)));
        })));
    }

    function rowInfo(row) {
        const cell = label => rowCell(row, label);
        const nameElement = cell('Name')?.querySelector('.slds-truncate, a');
        const name = nameElement?.title || text(nameElement);
        const type = text(cell('Type'));
        if (!name || !type || !cell('ID')) return null;
        const assetId = pageNumber(text(cell('ID')));
        const location = cell('Location')?.querySelector('[title]')?.title || text(cell('Location'));
        let action = cell('Actions')?.querySelector('[id$="-SLDSDataTableRowActions"]');
        if (action && assetId && !action.id.endsWith(`-SLDSDataTableRow-${assetId}-SLDSDataTableRowActions`)) action = null;
        const key = JSON.stringify([assetId, name, location, type]);
        return { row, key, name, location, type, assetId, nameElement, action };
    }

    const rows = table => shown(table, listRows).map(rowInfo);
    const signature = table => table ? JSON.stringify(rows(table).map(info => info?.key)) : '';
    const busy = table => table.closest('[aria-busy="true"]') || table.querySelector('[aria-busy="true"]');
    const currentList = () => {
        const table = listing();
        return table && !busy(table) && table;
    };

    function scrollViewport(table) {
        for (let node = table; node && node !== document.body; node = node.parentElement) {
            if (/^(auto|scroll)$/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight) return node;
        }
        return null;
    }

    function showColumn(table) {
        const current = new Set();
        if (table && columnToggle?.checked) {
            // Split lists keep their header outside the scrolling table. Match the native column
            // in the nearest shared container, and leave ambiguous layouts alone.
            for (let root = table; root && root !== document.body; root = root.parentElement) {
                const header = only(shown(root, headerCells).filter(cell => !cell.matches(ownColumn) &&
                    hasHeading(cell, 'ID') && Array.from(cell.parentElement.children).some(sibling => hasHeading(sibling, 'Name'))));
                if (!header) continue;
                addPageIdCell(current, header, 'Page ID', true);
                for (const row of shown(table, listRows)) {
                    const anchor = rowCell(row, 'ID');
                    if (!anchor) continue;
                    const info = rowInfo(row);
                    const value = info?.assetId && verifiedPageIds.get(info.key);
                    addPageIdCell(current, anchor, value || '—', false);
                }
                break;
            }
        }
        for (const cell of columnCells) {
            if (current.has(cell)) continue;
            cell.remove();
            columnCells.delete(cell);
        }
    }

    function addPageIdCell(current, anchor, value, heading) {
        const tag = anchor.matches('th, td') ? (heading ? 'th' : 'td') : 'div';
        let cell = anchor.parentElement.querySelector(`:scope > ${ownColumn}`);
        if (!cell) {
            cell = document.createElement(tag);
            cell.setAttribute('data-sfmcfix-cloudpages-column', '');
            if (tag === 'div') cell.setAttribute('role', heading ? 'columnheader' : 'gridcell');
            if (tag === 'th') cell.scope = 'col';
            cell.style.cssText = 'box-sizing:border-box;width:90px;min-width:90px;flex:0 0 90px;padding-inline:8px;white-space:nowrap';
            if (heading) {
                cell.style.position = 'relative';
                cell.style.overflow = 'visible';
                const label = document.createElement('span');
                label.style.cssText = 'position:absolute;inset-inline-start:8px;transform:translateY(-50%);pointer-events:none';
                cell.append(label);
            }
            columnCells.add(cell);
        }
        const label = heading ? cell.firstElementChild : cell;
        if (label.textContent !== value) {
            label.textContent = value;
            cell.title = value === '—' ? 'Page ID da verificare' : '';
        }
        if (anchor.nextElementSibling !== cell) anchor.after(cell);
        if (heading) {
            // Salesforce can position the native header text above its table cell.
            // Align to the text, including in the fixed header layout.
            const walker = document.createTreeWalker(anchor, NodeFilter.SHOW_TEXT);
            let center;
            for (let node = walker.nextNode(); node; node = walker.nextNode()) {
                if (node.nodeValue.trim() !== 'ID' || !visible(node.parentElement)) continue;
                const range = document.createRange();
                range.selectNodeContents(node);
                const box = range.getBoundingClientRect();
                if (box.width <= 4 || box.height <= 4) continue;
                center = box.top + box.height / 2;
                break;
            }
            const native = anchor.getBoundingClientRect();
            label.style.top = `${(center ?? native.top + native.height / 2) - cell.getBoundingClientRect().top}px`;
        }
        current.add(cell);
    }

    async function until(scan, read, message, timeout = 6000) {
        const end = performance.now() + timeout;
        do {
            if (readScope() !== scope) contextChanged();
            scan.signal.throwIfAborted();
            const value = read();
            if (value) return value;
            await new Promise(resolve => setTimeout(resolve, 80));
        } while (performance.now() < end);
        scan.signal.throwIfAborted();
        if (message) throw new Error(message);
        return null;
    }

    async function chooseAllPages(scan) {
        const tab = allPages();
        if (!tab || selected(tab)) return;
        if (!enabled(tab)) return;
        const before = currentList();
        const previous = signature(before);
        tab.click();
        await until(scan, () => {
            const table = currentList();
            return table && (selected(allPages()) || table !== before || signature(table) !== previous);
        }, 'La vista All Pages non ha completato il caricamento.');
    }

    async function readSitePageId(scan, assetId) {
        const url = new URL('/fuelapi/internal/v2/cloudpages/sites', location.origin);
        url.searchParams.set('siteAssetId', assetId);
        const response = await fetch(url, {
            method: 'GET',
            mode: 'same-origin',
            credentials: 'same-origin',
            redirect: 'error',
            cache: 'no-store',
            headers: { Accept: 'application/json' },
            signal: AbortSignal.any([scan.signal, AbortSignal.timeout(8000)])
        }).catch(() => {
            scan.signal.throwIfAborted();
            throw new Error('La lettura dei metadati CloudPages è scaduta o non è disponibile.');
        });
        if (response.status === 404) return null;
        if (response.status === 401 || response.status === 403) {
            throw new Error(`Salesforce ha rifiutato la lettura dei metadati nella sessione della scheda (HTTP ${response.status}).`);
        }
        if (response.status === 429) throw new Error('Salesforce ha limitato le richieste di metadati (HTTP 429). Riprova più tardi.');
        if (!response.ok) throw new Error(`Lettura dei metadati non riuscita (HTTP ${response.status}).`);
        const data = await response.json().catch(() => {
            scan.signal.throwIfAborted();
            throw new Error('Salesforce ha restituito una risposta non JSON per i metadati CloudPages.');
        });
        const site = Array.isArray(data?.entities) && data.totalCount === 1 && only(data.entities);
        if (!site || pageNumber(String(site.siteAssetId ?? '')) !== assetId) return null;
        const pageId = pageNumber(String(site.defaultPageId ?? ''));
        return pageId && pageId !== '0' ? pageId : null;
    }

    async function scanLibrary(scan) {
        const checked = new Set();
        const unread = new Set();
        const progress = () => checked.size === 1 ? '1 pagina verificata.' : `${checked.size} pagine verificate.`;
        let unknown = false;
        try {
            if (location.hostname !== metadataHost) {
                throw new Error('Apri l’elenco nel riquadro nativo CloudPages per leggere i metadati.');
            }
            if (nativeSearch()?.value.trim()) throw new Error('Svuota il filtro Salesforce per cercare per Page ID.');
            await chooseAllPages(scan);
            while (true) {
                const table = await until(scan, currentList, 'L’elenco CloudPages non è disponibile.');
                scan.signal.throwIfAborted();
                const native = nativeSearch();
                if (native?.value.trim()) throw new Error('Svuota il filtro Salesforce per cercare per Page ID.');
                const coverage = Boolean(selected(allPages()) && native);
                const inventory = rows(table);
                const counts = new Map();
                for (const info of inventory) {
                    if (info?.assetId) counts.set(info.assetId, (counts.get(info.assetId) || 0) + 1);
                }
                const candidates = inventory.filter(info => {
                    if (info && /^Code Resource$/i.test(info.type)) return false;
                    if (!info || !landingPage.test(info.type) || !info.assetId || info.assetId === '0' || counts.get(info.assetId) !== 1) {
                        unknown = true;
                        return false;
                    }
                    if (verifiedPageIds.has(info.key)) checked.add(info.key);
                    return true;
                });
                const matches = () => candidates.filter(info => verifiedPageIds.get(info.key) === scan.pageId);
                const batch = matches().length ? [] : candidates
                    .filter(info => !checked.has(info.key) && !unread.has(info.key)).slice(0, 3);
                let error;
                if (batch.length) {
                    status.textContent = `Ricerca Page ID ${scan.pageId}… ${progress()}`;
                    const outcomes = await Promise.allSettled(batch.map(info => readSitePageId(scan, info.assetId)));
                    if (readScope() !== scope) contextChanged();
                    scan.signal.throwIfAborted();
                    const current = currentList();
                    if (!current || signature(current) !== JSON.stringify(inventory.map(info => info?.key))) {
                        throw new Error('L’elenco CloudPages è cambiato mentre i metadati erano in caricamento.');
                    }
                    for (const [index, outcome] of outcomes.entries()) {
                        const { key } = batch[index];
                        if (outcome.status === 'rejected') error ||= outcome.reason;
                        else if (outcome.value) {
                            verifiedPageIds.set(key, outcome.value);
                            checked.add(key);
                        } else {
                            unread.add(key);
                        }
                    }
                    showColumn(current);
                }
                const found = matches();
                if (found.length > 1) throw new Error('Salesforce ha restituito più righe per lo stesso Page ID.');
                if (found.length === 1) {
                    result = { ...found[0], pageId: scan.pageId };
                    return 'Corrispondenza trovata.';
                }
                if (error) throw error;
                if (batch.length) continue;

                const pagination = named(document, /^(Load More|Carica altri|Carica altro)$/i);
                const more = only(pagination);
                if (pagination.length > 1 || (more && !enabled(more))) throw new Error('La paginazione Salesforce non è disponibile.');
                const moreInOverview = !more && cloudPagesList(table, native) &&
                    shown(document, 'div, span, p').some(node => /^\d+\+\s+items?$/i.test(text(node)));
                if (!more && !moreInOverview) {
                    const coverageNote = coverage ? '' : ' La copertura dell’inventario della BU non è confermata.';
                    return coverage && unread.size === 0 && !unknown
                        ? `Nessuna corrispondenza in All Pages. ${progress()}`
                        : `Ricerca parziale. Nessuna corrispondenza nelle pagine controllate. ${progress()}${coverageNote} Alcune pagine o cartelle potrebbero non essere coperte.`;
                }
                const previous = signature(table);
                if (more) more.click();
                else {
                    const viewport = scrollViewport(table);
                    if (!viewport) throw new Error('Salesforce indica altre righe, ma il riquadro non consente di caricarle.');
                    viewport.scrollTop = viewport.scrollHeight;
                }
                await until(scan, () => {
                    const next = currentList();
                    return next && (signature(next) !== previous || (!more && named(document, /^(Load More|Carica altri|Carica altro)$/i).length));
                }, 'Salesforce non ha caricato altre righe.');
            }
        } catch (error) {
            if (scan.signal.aborted) return `${scan.signal.reason} ${progress()}`;
            return `Ricerca parziale. ${error.message} ${progress()}`;
        }
    }

    function makePanel() {
        launcher = document.createElement('button');
        launcher.type = 'button';
        launcher.className = 'slds-button slds-button_neutral';
        launcher.id = 'sfmcfix-cloudpages-page-id-launcher';
        launcher.textContent = 'Page ID';
        launcher.setAttribute('aria-controls', 'sfmcfix-cloudpages-page-id');
        launcher.style.cssText = 'display:inline-flex;align-items:center;align-self:flex-start;vertical-align:top;box-sizing:border-box;flex:none;height:32px;padding:0 10px;margin-inline:4px;white-space:nowrap;background:white;color:#0176d3;border:1px solid #747474;border-radius:4px;cursor:pointer';
        launcher.addEventListener('click', () => setPanelExpanded(!panelExpanded));

        panel = document.createElement('div');
        panel.id = 'sfmcfix-cloudpages-page-id';
        panel.setAttribute('role', 'form');
        panel.setAttribute('aria-label', 'Ricerca CloudPages per Page ID');
        panel.style.cssText = 'position:fixed;z-index:2147483647;box-sizing:border-box;overflow:auto;padding:10px 12px;background:#fff;border:1px solid #c9d5e3;border-radius:4px;box-shadow:0 3px 12px #0003;color:#181818;font:14px/1.5 Arial,sans-serif';
        const label = document.createElement('label');
        label.textContent = 'Page ID';
        label.htmlFor = 'sfmcfix-cloudpages-page-id-input';
        input = document.createElement('input');
        input.id = label.htmlFor;
        input.inputMode = 'numeric';
        input.autocomplete = 'off';
        input.required = true;
        input.style.cssText = 'width:min(10em, 46%);margin:0 8px;padding:3px 6px;border:1px solid #747474;border-radius:3px';
        search = document.createElement('button');
        search.type = 'button';
        search.textContent = 'Cerca';
        cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.textContent = 'Annulla ricerca';
        cancel.hidden = true;
        status = document.createElement('div');
        status.setAttribute('role', 'status');
        details = document.createElement('div');
        open = document.createElement('button');
        open.type = 'button';
        open.textContent = 'Apri pagina';
        open.hidden = true;
        const close = document.createElement('button');
        close.type = 'button';
        close.textContent = 'Chiudi';
        close.setAttribute('aria-label', 'Chiudi ricerca Page ID');
        close.style.cssText = 'float:right;margin-left:8px';
        const column = document.createElement('label');
        column.style.cssText = 'display:block;margin-top:8px';
        columnToggle = document.createElement('input');
        columnToggle.type = 'checkbox';
        column.append(columnToggle, ' Mostra colonna Page ID');
        panel.append(close, label, input, search, cancel, column, status, details, open);
        search.addEventListener('click', startSearch);
        input.addEventListener('keydown', event => {
            if (event.key === 'Enter' && !event.isComposing) startSearch(event);
        });
        cancel.addEventListener('click', () => abort('Ricerca annullata.'));
        open.addEventListener('click', openResult);
        close.addEventListener('click', () => setPanelExpanded(false));
        columnToggle.addEventListener('change', render);
        panel.addEventListener('keydown', event => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            event.stopPropagation();
            setPanelExpanded(false);
        });
    }

    function setPanelExpanded(expanded) {
        if (!expanded) abort('Ricerca annullata.');
        panelExpanded = expanded;
        render();
        if (expanded) input.focus();
        else launcher.focus();
    }

    function placeLauncher(native, anchor) {
        launcher.style.height = `${Math.max(24, Math.round(native?.getBoundingClientRect().height || 32))}px`;
        if (!native) {
            if (anchor?.previousElementSibling !== launcher) anchor?.before(launcher);
            return;
        }
        const field = native.closest('.slds-input-has-icon, .slds-form-element__control, [role="search"]') || native;
        for (let group = field, depth = 0; group.parentElement !== document.body && depth < 5; group = group.parentElement, depth++) {
            const next = group.nextElementSibling === launcher ? launcher.nextElementSibling : group.nextElementSibling;
            if (!next || next === anchor || next.contains(anchor) || next.querySelector('table, [role="grid"], [role="table"]')) continue;
            const button = next.matches('button, [role="button"]') ? next : next.querySelector('button, [role="button"]');
            if (!button) continue;
            const title = button.getAttribute('aria-label') || button.title || text(button);
            if (/clear|cancella|load more|carica|all pages|overview/i.test(title)) continue;
            if (group.nextElementSibling !== launcher) group.after(launcher);
            return;
        }
        if (field.nextElementSibling !== launcher) field.after(launcher);
    }

    function positionPanel() {
        const rect = visible(launcher) && launcher.getBoundingClientRect();
        const width = Math.min(430, innerWidth - 16);
        const left = Math.max(8, Math.min(innerWidth - width - 8, (rect?.right || innerWidth - 8) - width));
        const top = Math.min(Math.max(8, innerHeight - 170), rect ? rect.bottom + 6 : 8);
        Object.assign(panel.style, { width: `${width}px`, left: `${left}px`, top: `${top}px`, maxHeight: `${innerHeight - top - 8}px` });
    }

    function clearResult() {
        result = null;
        if (details.textContent) details.textContent = '';
        if (!open.hidden) open.hidden = true;
    }

    function render() {
        if (!document.body) return;
        if (readScope() !== scope) {
            contextChanged();
            return;
        }
        const table = listing();
        const native = nativeSearch();
        const libraryContext = routeContext === true || (routeContext === null && (cloudPagesList(table, native) || (active && (job || result))));
        const recycleBin = libraryContext && named(document, /^Recycle Bin$/i).some(selected);
        active = !suspended && libraryContext && !recycleBin;
        if (!active) {
            if (recycleBin) abort('Ricerca interrotta dopo il passaggio al cestino.');
            panelExpanded = false;
            verifiedPageIds.clear();
            showColumn(null);
            launcher?.remove();
            panel?.remove();
            return;
        }
        const anchor = table ? (scrollViewport(table) || table) : allPages();
        if (!anchor && !native && !job && !result) {
            showColumn(null);
            launcher?.remove();
            panel?.remove();
            return;
        }
        if (!panel) makePanel();
        if (anchor || native) placeLauncher(native, anchor);
        else launcher.remove();
        launcher.setAttribute('aria-expanded', String(panelExpanded));
        showColumn(table);
        if (panelExpanded) {
            if (panel.parentElement !== document.body) document.body.append(panel);
            positionPanel();
        } else {
            panel.remove();
        }
    }

    function abort(reason) {
        job?.controller.abort(reason);
    }

    async function startSearch(event) {
        event.preventDefault();
        event.stopPropagation();
        if (!event.isTrusted || job || !active) return;
        const pageId = pageNumber(input.value);
        if (pageId === null) {
            status.textContent = 'Inserisci un Page ID numerico.';
            return;
        }
        clearResult();
        const controller = new AbortController();
        const scan = { pageId, controller, signal: controller.signal };
        job = scan;
        const timer = setTimeout(() => controller.abort('Ricerca parziale. Tempo massimo raggiunto.'), 300000);
        input.disabled = search.disabled = true;
        cancel.hidden = false;
        status.textContent = `Ricerca Page ID ${pageId}…`;
        render();
        const message = await scanLibrary(scan);
        clearTimeout(timer);
        if (job !== scan) return;
        job = null;
        input.disabled = search.disabled = false;
        cancel.hidden = true;
        status.textContent = message;
        if (result) {
            details.textContent = `${result.name} · Posizione ${result.location || 'non disponibile'} · Page ID ${result.pageId} · ID asset ${result.assetId ?? 'non disponibile'}`;
            open.hidden = false;
        }
        render();
    }

    function openResult(event) {
        if (!event.isTrusted || !result || !active || job) return;
        if (readScope() !== scope) {
            contextChanged();
            return;
        }
        const table = currentList();
        const info = table && only(rows(table).filter(item => item?.key === result.key));
        if (!info || !visible(info.nameElement)) {
            status.textContent = 'La riga non è più visibile nella vista corrente. Cerca di nuovo il Page ID.';
            return;
        }
        clearResult();
        status.textContent = 'Apertura nella vista nativa di Salesforce.';
        info.nameElement.click();
        render();
    }

    function contextChanged(closePanel = true) {
        scope = readScope();
        abort('Ricerca interrotta dopo un cambio di contesto Salesforce.');
        verifiedPageIds.clear();
        if (closePanel) panelExpanded = false;
        if (panel) {
            clearResult();
            if (!job && status.textContent) status.textContent = '';
        }
        render();
    }

    function reportRoute(enabled, invalidate = false) {
        const next = enabled || routeContext !== null ? enabled : null;
        if (next !== routeContext) {
            routeContext = next;
            contextChanged();
        } else if (invalidate) {
            contextChanged(false);
        }
    }

    if (isShell) {
        const notify = () => {
            for (const [frame, origin] of frames) {
                if (!frame.isConnected) frames.delete(frame);
                else frame.contentWindow?.postMessage({ channel, active: inCloudPages(), invalidate: true }, origin);
            }
        };
        window.addEventListener('message', event => {
            if (event.data?.channel !== channel || event.data.ready !== true) return;
            if (!trustedOrigin(event.origin)) return;
            const frame = Array.from(document.querySelectorAll('iframe')).find(node => node.contentWindow === event.source);
            if (frame) {
                frames.set(frame, event.origin);
                event.source.postMessage({ channel, active: inCloudPages() }, event.origin);
            }
        });
        window.addEventListener('hashchange', () => {
            reportRoute(inCloudPages(), true);
            notify();
        });
        document.addEventListener('pointerdown', event => { if (event.isTrusted && !insideControls(event.target)) notify(); }, true);
        document.addEventListener('keydown', event => { if (event.isTrusted && !insideControls(event.target)) notify(); }, true);
    } else if (shellFrame) {
        window.addEventListener('message', event => {
            if (event.source === window.top && event.origin === shellOrigin && event.data?.channel === channel &&
                typeof event.data.active === 'boolean') reportRoute(event.data.active, event.data.invalidate === true);
        });
        window.top.postMessage({ channel, ready: true }, shellOrigin);
    }

    for (const type of ['input', 'pointerdown', 'keydown']) document.addEventListener(type, event => {
        if (!event.isTrusted || insideControls(event.target)) return;
        if (job) abort('Ricerca interrotta dall’interazione con Salesforce.');
        if (result) {
            clearResult();
            status.textContent = '';
            render();
        }
    }, true);
    window.addEventListener('pagehide', () => { suspended = true; contextChanged(); });
    window.addEventListener('pageshow', event => {
        if (!event.persisted) return;
        suspended = false;
        if (isShell) reportRoute(inCloudPages(), true);
        else {
            contextChanged();
            if (shellFrame) window.top.postMessage({ channel, ready: true }, shellOrigin);
        }
    });

    function start() {
        render();
        window.addEventListener('resize', render);
        let scheduled;
        new MutationObserver(() => {
            if (scheduled) return;
            scheduled = requestAnimationFrame(() => { scheduled = null; render(); });
        }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true,
            attributeFilter: ['hidden', 'class', 'aria-hidden', 'aria-selected', 'aria-current', 'aria-pressed', 'role'] });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
})();
