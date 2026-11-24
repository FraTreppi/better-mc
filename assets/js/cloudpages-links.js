(function () {
    'use strict';

    const host = location.hostname.match(/^(?:[a-z0-9-]+\.)?(s\d+)\.(?:exacttarget|marketingcloud|marketingcloudapps)\.com$/i);
    if (location.protocol !== 'https:' || location.port || !host) return;
    const shellOrigin = `https://mc.${host[1]}.exacttarget.com`;
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
    let pendingDetails;
    let returningToList;
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
    const properties = /^(?:(?:Landing )?Page (?:Properties|Details)|Content Details|Properties|Proprietà(?: della pagina)?|Dettagli (?:della )?pagina)$/i;
    const detailHeadings = 'h1, h2, h3, h4, [role="heading"], .slds-modal__title, .slds-panel__header-title';
    const nativeClose = /^(?:Close(?: (?:dialog|modal|properties))?|Chiudi(?: proprietà)?)$/i;
    const nativeCancel = /^(?:Cancel|Annulla)$/i;
    const nativeBack = /^(?:Back(?: to (?:CloudPages|Overview|the list))?|Go Back|Torna (?:all’elenco|a CloudPages)|Indietro)$/i;
    const pageIdLabel = /^(?:Page ID|ID (?:della )?pagina)\s*:?$/i;
    const inlinePageId = /^(?:Page ID|ID (?:della )?pagina)\s*:?\s*(\d+)$/i;
    const searchableType = /^(Landing Page|Interactive Email Page)$/i;
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

    function menu(trigger, action, before) {
        if (trigger.getAttribute('aria-expanded') === 'false') return null;
        const selector = '[role="menu"], .slds-dropdown';
        const linked = document.getElementById(trigger.getAttribute('aria-controls'));
        if (visible(linked)) return linked;
        const local = shown(action, selector);
        return only(leaves(local.length ? local : shown(document, selector).filter(node => !before.has(node))));
    }

    const visibleDialogs = () => leaves(shown(document, '[role="dialog"], .slds-modal'));
    const detailsVisible = view => visible(view?.heading || view?.root);
    const dismissControl = root => only(shown(root, 'button.slds-modal__close, button.slds-panel__close')) ||
        only(named(root, nativeClose)) || only(named(root, nativeCancel));
    const pageIdFields = root => shown(root, 'label, dt, th, span, div, p, strong, b').filter(node => !node.closest(ownColumn));
    const visiblePageIdLabels = () => leaves(pageIdFields(document).filter(node =>
        !node.closest('table, [role="grid"], [role="table"], [role="menu"]') &&
        (pageIdLabel.test(text(node)) || inlinePageId.test(text(node)))));

    function detailView(transition) {
        const dialog = only(visibleDialogs().filter(root => !transition.dialogs.has(root) &&
            (properties.test(root.getAttribute('aria-label') || '') ||
                named(root, properties, detailHeadings).length || detailPageId(root) !== null)));
        if (dialog) return { root: dialog, dialog, back: transition.back };
        const heading = only(named(document, properties, detailHeadings).filter(node => !transition.headings.has(node) &&
            !node.closest('table, [role="grid"], [role="menu"]'))) ||
            only(visiblePageIdLabels().filter(node => !transition.labels.has(node)));
        if (!heading) return null;
        const card = heading.closest('section, article, aside, [role="region"], .slds-card, .slds-panel') ||
            heading.parentElement?.parentElement;
        if (!card) return null;
        if (visible(transition.info.row)) {
            for (let root = card, depth = 0; root && root !== document.body && depth < 4; root = root.parentElement, depth++) {
                if (root.contains(transition.info.row)) break;
                if (dismissControl(root) && detailPageId(root) !== null) {
                    return { root, dialog: root, heading, back: transition.back };
                }
            }
            return null;
        }
        return { root: card, dialog: null, heading, back: transition.back };
    }

    function updatePendingDetails() {
        if (!pendingDetails) return;
        pendingDetails.view ||= detailView(pendingDetails);
        if (pendingDetails.view && !detailsVisible(pendingDetails.view)) pendingDetails = null;
    }

    function detailPageId(root) {
        if (!root) return null;
        const fields = pageIdFields(root);
        const labels = leaves(fields.filter(node => pageIdLabel.test(text(node))));
        const ids = new Set();
        for (const label of labels) {
            const value = label.control || label.nextElementSibling || label.parentElement?.nextElementSibling;
            if (visible(value)) {
                const id = pageNumber(typeof value.value === 'string' ? value.value : text(value));
                if (id !== null) ids.add(id);
            }
            const siblingText = label.nextSibling;
            if (siblingText?.nodeType === Node.TEXT_NODE) {
                const id = pageNumber(siblingText.nodeValue);
                if (id !== null) ids.add(id);
            }
        }
        for (const field of leaves(fields.filter(node => inlinePageId.test(text(node))))) {
            ids.add(pageNumber(text(field).match(inlinePageId)[1]));
        }
        return ids.size === 1 ? [...ids][0] : null;
    }

    function pageIdInView(view) {
        if (view.dialog) return detailPageId(view.root);
        for (let root = view.root, depth = 0; root && root !== document.body && depth < 4; root = root.parentElement, depth++) {
            const id = detailPageId(root);
            if (id !== null) return id;
        }
        return null;
    }

    function canRestoreList(back) {
        if (!back) return false;
        const navigation = window.navigation;
        const entry = navigation?.currentEntry;
        if (back.key && entry) {
            return entry.index === back.index + 1 && navigation.entries()[back.index]?.key === back.key;
        }
        return history.length === back.length + 1 &&
            (location.pathname !== back.path || location.hash.split('?')[0] !== back.hash);
    }

    async function inspect(scan, info) {
        if (!visible(info.nameElement)) throw new Error('La riga è cambiata durante la scansione.');
        let control = only(named(info.row, properties));
        const trigger = info.action && (info.action.querySelector('button[aria-haspopup="true"], button[aria-haspopup="menu"]') ||
            only(shown(info.action, 'button')));
        if (!enabled(control) && enabled(trigger)) {
            const expanded = trigger.getAttribute('aria-expanded') === 'true';
            if (expanded) throw new Error('Chiudi il menu Salesforce e ripeti la ricerca.');
            const before = new Set(shown(document, '[role="menu"], .slds-dropdown'));
            trigger.click();
            const popup = await until(scan, () => menu(trigger, info.action, before), 'Il menu della pagina non è leggibile.');
            control = only(named(popup, properties));
            if (!enabled(control)) {
                trigger.click();
                await until(scan, () => !visible(popup), 'Il menu della pagina è rimasto aperto.');
            }
        }
        scan.signal.throwIfAborted();
        if (!enabled(control)) return null;
        const entry = window.navigation?.currentEntry;
        const transition = {
            info,
            view: null,
            dialogs: new Set(visibleDialogs()),
            headings: new Set(named(document, properties, detailHeadings)),
            labels: new Set(visiblePageIdLabels()),
            back: { key: entry?.key, index: entry?.index, length: history.length, path: location.pathname, hash: location.hash.split('?')[0] }
        };
        pendingDetails = transition;
        control.click();
        const view = await until(scan, () => {
            updatePendingDetails();
            return pendingDetails === transition && transition.view;
        }, 'Salesforce non ha mostrato dettagli riconoscibili per una pagina.');
        pendingDetails = null;
        const pageId = await until(scan, () => pageIdInView(view), null, 2500);
        return { ...view, pageId };
    }

    async function returnToList(scan, view) {
        returningToList = scan;
        try {
            const control = view.dialog ? dismissControl(view.dialog) : (
                only(named(document, nativeBack)) ||
                only(named(document, /^(Home|CloudPages)$/i, '.slds-breadcrumb a, nav[aria-label*="breadcrumb" i] a')) ||
                only(named(document, /^Home$/i, 'a, button, [role="link"]'))
            );
            scan.signal.throwIfAborted();
            if (enabled(control)) control.click();
            else if (!view.dialog && canRestoreList(view.back)) {
                // Restore the same-document history entry observed immediately before opening Properties.
                history.back();
            } else {
                throw new Error('Chiudi Properties per tornare all’elenco CloudPages. La scansione si è fermata.');
            }
            await until(scan, () => !detailsVisible(view) && (currentList() || allPages()), 'L’elenco non è tornato disponibile.');
            if (!view.dialog) await chooseAllPages(scan);
        } finally {
            returningToList = null;
        }
    }

    async function scanLibrary(scan, previousMatch) {
        const checked = new Set();
        const unread = new Set();
        let unknown = false;
        try {
            if (detailsVisible(previousMatch?.view)) await returnToList(scan, previousMatch.view);
            updatePendingDetails();
            if (visibleDialogs().length || named(document, properties, detailHeadings).length) {
                throw new Error('Torna all’elenco CloudPages prima di cercare.');
            }
            if (pendingDetails) {
                throw new Error('Attendi i dettagli richiesti a Salesforce. Se non si aprono, ricarica CloudPages.');
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
                unknown ||= inventory.some(item => item === null || (!searchableType.test(item.type) && !/^Code Resource$/i.test(item.type)));
                const info = inventory.find(item => item && searchableType.test(item.type) &&
                    !checked.has(item.key) && !unread.has(item.key));
                if (info) {
                    if (inventory.filter(item => item?.key === info.key).length > 1) {
                        unread.add(info.key);
                        continue;
                    }
                    const verified = info.assetId && verifiedPageIds.get(info.key);
                    if (verified) {
                        checked.add(info.key);
                        if (verified === scan.pageId) {
                            result = { ...info, pageId: verified };
                            return 'Corrispondenza trovata.';
                        }
                        continue;
                    }
                    status.textContent = `Ricerca Page ID ${scan.pageId}. Controllo le proprietà di ${info.name}… ${checked.size} pagine verificate.`;
                    const view = await inspect(scan, info);
                    scan.signal.throwIfAborted();
                    if (!view) {
                        unread.add(info.key);
                        continue;
                    }
                    (view.pageId === null ? unread : checked).add(info.key);
                    if (view.pageId !== null && info.assetId) {
                        verifiedPageIds.set(info.key, view.pageId);
                        showColumn(currentList());
                    }
                    if (view.pageId === scan.pageId) {
                        result = { ...info, pageId: view.pageId, view };
                        return view.dialog ? 'Corrispondenza trovata.' : 'Corrispondenza trovata. La pagina è aperta nei dettagli Salesforce.';
                    }
                    await returnToList(scan, view);
                    continue;
                }
                const pagination = named(document, /^(Load More|Carica altri|Carica altro)$/i);
                const more = only(pagination);
                if (pagination.length > 1 || (more && !enabled(more))) throw new Error('La paginazione Salesforce non è disponibile.');
                const moreInOverview = !more && cloudPagesList(table, native) &&
                    shown(document, 'div, span, p').some(node => /^\d+\+\s+items?$/i.test(text(node)));
                if (!more && !moreInOverview) {
                    const scope = coverage ? '' : ' La copertura dell’inventario della BU non è confermata.';
                    return coverage && unread.size === 0 && !unknown
                        ? `Nessuna corrispondenza nelle ${checked.size} pagine verificate in All Pages.`
                        : `Ricerca parziale. Nessuna corrispondenza nelle ${checked.size} pagine verificate.${scope} Alcune pagine o cartelle potrebbero non essere coperte.`;
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
            if (scan.signal.aborted) return `${scan.signal.reason} ${checked.size} pagine verificate.`;
            return `Ricerca parziale. ${error.message} ${checked.size} pagine verificate.`;
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
        updatePendingDetails();
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
        if (job || !active) return;
        const pageId = pageNumber(input.value);
        if (pageId === null) {
            status.textContent = 'Inserisci un Page ID numerico.';
            return;
        }
        const previous = result;
        clearResult();
        const controller = new AbortController();
        const scan = { pageId, controller, signal: controller.signal };
        job = scan;
        const timer = setTimeout(() => controller.abort('Ricerca parziale. Tempo massimo raggiunto.'), 300000);
        input.disabled = search.disabled = true;
        cancel.hidden = false;
        status.textContent = `Ricerca Page ID ${pageId}…`;
        render();
        const message = await scanLibrary(scan, previous);
        clearTimeout(timer);
        if (job !== scan) return;
        job = null;
        input.disabled = search.disabled = false;
        cancel.hidden = true;
        status.textContent = message;
        if (result) {
            details.textContent = `${result.name} · Posizione ${result.location || 'non disponibile'} · Page ID ${result.pageId} · ID asset ${result.assetId ?? 'non disponibile'}`;
            open.hidden = Boolean(result.view && !result.view.dialog);
        }
        render();
    }

    async function openResult() {
        if (!result || !active || job) return;
        const match = result;
        const controller = new AbortController();
        const scan = { controller, signal: controller.signal };
        job = scan;
        open.disabled = input.disabled = search.disabled = true;
        cancel.hidden = false;
        status.textContent = 'Apertura della CloudPage…';
        try {
            if (readScope() !== scope) contextChanged();
            scan.signal.throwIfAborted();
            if (detailsVisible(match.view)) await returnToList(scan, match.view);
            scan.signal.throwIfAborted();
            const table = currentList();
            const info = table && only(rows(table).filter(item => item?.key === match.key));
            if (!info || !visible(info.nameElement)) throw new Error('La riga non è più visibile nella vista corrente.');
            clearResult();
            status.textContent = 'Apertura nella vista nativa di Salesforce.';
            info.nameElement.click();
        } catch (error) {
            status.textContent = scan.signal.aborted ? scan.signal.reason : `Apertura non riuscita. ${error.message}`;
        } finally {
            job = null;
            open.disabled = input.disabled = search.disabled = false;
            cancel.hidden = true;
            render();
        }
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
            const enabled = inCloudPages();
            if (enabled && job && !job.signal.aborted && (pendingDetails || returningToList === job)) return;
            reportRoute(enabled, true);
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
