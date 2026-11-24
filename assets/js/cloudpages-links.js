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
    let routeContext = isShell && inCloudPages() ? true : null;
    let active = false;
    let suspended = false;
    let job;
    let result;
    let pendingDetails;
    let panel;
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
    const shown = (root, selector) => Array.from(root.querySelectorAll(selector)).filter(node => !panel?.contains(node) && visible(node));
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
    const searchHint = /^Enter at least three characters to search\.?$/i;
    const listRows = 'tbody tr, [role="row"]:has([role="gridcell"], [role="cell"])';
    const properties = /^(Page Properties|Page Details|Properties|Proprietà(?: della pagina)?|Dettagli (?:della )?pagina)$/i;
    const detailHeadings = 'h1, h2, h3, h4, [role="heading"]';
    const pageDetails = /^(Page Details|Dettagli (?:della )?pagina)$/i;
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
        return null;
    }

    function overview() {
        if (!nativeSearch()) return false;
        const labels = new Set(['CloudPages', 'Overview', 'Recycle Bin']);
        const elements = document.querySelectorAll('h1, h2, [role="heading"], a, button, [role="tab"], strong, b, span, div');
        for (const node of elements) {
            const label = text(node);
            if (labels.has(label) && visible(node)) labels.delete(label);
            if (!labels.size) return true;
        }
        return false;
    }

    const rowCell = (row, label) => row.querySelector(`td[data-label="${label}"], [role="gridcell"][data-label="${label}"], [role="cell"][data-label="${label}"]`);

    function listing() {
        return only(shown(document, 'table, [role="table"], [role="grid"]').filter(table => {
            const headings = Array.from(table.querySelectorAll('thead th, [role="columnheader"]'), text);
            if (tableLabels.every(label => headings.includes(label))) return true;
            // Salesforce can append sort instructions to its column headers.
            const row = table.querySelector(listRows);
            return row && tableLabels.every(label => rowCell(row, label));
        }));
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

    function detailView(info) {
        const dialog = only(visibleDialogs().filter(root =>
            properties.test(root.getAttribute('aria-label') || '') || named(root, properties, detailHeadings).length === 1));
        if (dialog) return { root: dialog, dialog };
        if (visible(info.row)) return null;
        const heading = only(named(document, pageDetails, detailHeadings));
        if (!heading) return null;
        // In the native details view the heading and labelled field are in the same card.
        const card = heading.closest('section, article, aside, [role="region"], .slds-card');
        return { root: card || heading.parentElement?.parentElement, dialog: null };
    }

    function updatePendingDetails() {
        if (!pendingDetails) return;
        pendingDetails.view ||= detailView(pendingDetails.info);
        if (pendingDetails.view && !visible(pendingDetails.view.root)) pendingDetails = null;
    }

    function detailPageId(root) {
        if (!root) return null;
        const fields = shown(root, 'label, dt, th, span, div, p, strong, b');
        const labels = leaves(fields.filter(node => /^(Page ID|ID (?:della )?pagina)\s*:?$/i.test(text(node))));
        const ids = new Set();
        for (const label of labels) {
            const value = label.control || label.nextElementSibling || label.parentElement?.nextElementSibling;
            if (visible(value)) {
                const id = pageNumber(typeof value.value === 'string' ? value.value : text(value));
                if (id !== null) ids.add(id);
            }
        }
        if (labels.length) return labels.length === 1 && ids.size === 1 ? [...ids][0] : null;
        const inline = leaves(fields.filter(node => /^(Page ID|ID (?:della )?pagina)\s*:\s*\d+$/i.test(text(node))));
        for (const field of inline) ids.add(pageNumber(text(field).split(':')[1]));
        return inline.length === 1 && ids.size === 1 ? [...ids][0] : null;
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
        const nameLink = info.nameElement.closest('a[href]');
        if (!enabled(control) && nameLink && (nameLink.origin !== location.origin ||
            (nameLink.target && nameLink.target.toLowerCase() !== '_self') || nameLink.hasAttribute('download'))) {
            throw new Error('La riga non espone un controllo nativo per leggere i dettagli in questa vista.');
        }
        const transition = { info, view: null };
        pendingDetails = transition;
        (enabled(control) ? control : info.nameElement).click();
        const view = await until(scan, () => {
            updatePendingDetails();
            return pendingDetails === transition && transition.view;
        }, 'Salesforce non ha mostrato dettagli riconoscibili per una pagina.');
        pendingDetails = null;
        const pageId = await until(scan, () => detailPageId(view.root), null, 2500);
        return { ...view, pageId };
    }

    async function returnToList(scan, view) {
        const control = view.dialog
            ? (only(named(view.dialog, /^(Close(?: dialog)?|Chiudi)$/i)) || only(named(view.dialog, /^(Cancel|Annulla)$/i)))
            : only(named(document, /^(Home)$/i, 'a, button, [role="link"]'));
        if (!enabled(control)) throw new Error('Il ritorno dai dettagli all’elenco richiede un controllo nativo riconoscibile.');
        control.click();
        await until(scan, () => !visible(view.root) && (currentList() || allPages()), 'L’elenco non è tornato disponibile.');
        if (!view.dialog) await chooseAllPages(scan);
    }

    async function scanLibrary(scan, previousMatch) {
        const checked = new Set();
        const unread = new Set();
        let unknown = false;
        try {
            if (visible(previousMatch?.view.root)) await returnToList(scan, previousMatch.view);
            updatePendingDetails();
            if (visibleDialogs().length || named(document, pageDetails, detailHeadings).length) {
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
                if (nativeSearch()?.value.trim()) throw new Error('Svuota il filtro Salesforce per cercare per Page ID.');
                const coverage = Boolean(selected(allPages()) && nativeSearch());
                const inventory = rows(table);
                unknown ||= inventory.some(item => item === null || (!searchableType.test(item.type) && !/^Code Resource$/i.test(item.type)));
                const info = inventory.find(item => item && searchableType.test(item.type) &&
                    !checked.has(item.key) && !unread.has(item.key));
                if (info) {
                    if (inventory.filter(item => item?.key === info.key).length > 1) {
                        unread.add(info.key);
                        continue;
                    }
                    status.textContent = `Ricerca Page ID ${scan.pageId}… ${checked.size} pagine verificate.`;
                    const view = await inspect(scan, info);
                    (view.pageId === null ? unread : checked).add(info.key);
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
                const moreInOverview = !more && overview() && shown(document, 'div, span, p').some(node => /^\d+\+\s+items?$/i.test(text(node)));
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
        panel = document.createElement('div');
        panel.id = 'sfmcfix-cloudpages-page-id';
        panel.setAttribute('role', 'form');
        panel.setAttribute('aria-label', 'Ricerca CloudPages per Page ID');
        panel.style.cssText = 'padding:8px 12px;background:#fff;border:1px solid #c9d5e3;border-radius:4px;color:#181818;font:14px/1.5 Arial,sans-serif';
        const label = document.createElement('label');
        label.textContent = 'Page ID';
        label.htmlFor = 'sfmcfix-cloudpages-page-id-input';
        input = document.createElement('input');
        input.id = label.htmlFor;
        input.inputMode = 'numeric';
        input.autocomplete = 'off';
        input.required = true;
        input.style.cssText = 'width:10em;margin:0 8px;padding:3px 6px;border:1px solid #747474;border-radius:3px';
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
        panel.append(label, input, search, cancel, status, details, open);
        search.addEventListener('click', startSearch);
        input.addEventListener('keydown', event => {
            if (event.key === 'Enter' && !event.isComposing) startSearch(event);
        });
        cancel.addEventListener('click', () => abort('Ricerca annullata.'));
        open.addEventListener('click', openResult);
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
        const libraryContext = routeContext === true || (routeContext === null && (overview() || (active && (job || result))));
        const recycleBin = libraryContext && named(document, /^Recycle Bin$/i).some(selected);
        active = !suspended && libraryContext && !recycleBin;
        if (!active) {
            if (recycleBin) abort('Ricerca interrotta dopo il passaggio al cestino.');
            panel?.remove();
            return;
        }
        updatePendingDetails();
        const table = listing();
        const native = nativeSearch();
        const anchor = table ? (scrollViewport(table) || table) : allPages();
        const toolbar = !anchor && native && native.parentElement !== document.body && native.parentElement;
        if (!anchor && !toolbar && !job && !result) {
            panel?.remove();
            return;
        }
        if (!panel) makePanel();
        const floating = Boolean(job || result?.view || (!anchor && !toolbar));
        const position = floating ? 'fixed' : '';
        if (panel.style.position !== position) {
            Object.assign(panel.style, { position, top: floating ? '12px' : '', right: floating ? '12px' : '',
                maxWidth: floating ? 'min(520px, calc(100% - 24px))' : '', zIndex: floating ? '2147483647' : '' });
        }
        if (floating) {
            if (panel.parentElement !== document.body) document.body.append(panel);
        } else if (toolbar) {
            if (toolbar.nextElementSibling !== panel) toolbar.after(panel);
        } else if (anchor.previousElementSibling !== panel) {
            anchor.before(panel);
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
            open.hidden = !result.view.dialog;
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
            if (visible(match.view.root)) await returnToList(scan, match.view);
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

    function contextChanged() {
        scope = readScope();
        abort('Ricerca interrotta dopo un cambio di contesto Salesforce.');
        if (panel) {
            clearResult();
            if (!job && status.textContent) status.textContent = '';
        }
        render();
    }

    function reportRoute(enabled) {
        if (enabled || routeContext !== null) routeContext = enabled;
        contextChanged();
    }

    if (isShell) {
        const notify = () => {
            for (const [frame, origin] of frames) {
                if (!frame.isConnected) frames.delete(frame);
                else frame.contentWindow?.postMessage({ channel, active: inCloudPages() }, origin);
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
        window.addEventListener('hashchange', () => { reportRoute(inCloudPages()); notify(); });
        document.addEventListener('pointerdown', event => { if (event.isTrusted && !panel?.contains(event.target)) notify(); }, true);
        document.addEventListener('keydown', event => { if (event.isTrusted && !panel?.contains(event.target)) notify(); }, true);
    } else if (shellFrame) {
        window.addEventListener('message', event => {
            if (event.source === window.top && event.origin === shellOrigin && event.data?.channel === channel &&
                typeof event.data.active === 'boolean') reportRoute(event.data.active);
        });
        window.top.postMessage({ channel, ready: true }, shellOrigin);
    }

    for (const type of ['input', 'pointerdown', 'keydown']) document.addEventListener(type, event => {
        if (!event.isTrusted || panel?.contains(event.target)) return;
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
        if (isShell) reportRoute(inCloudPages());
        else {
            contextChanged();
            if (shellFrame) window.top.postMessage({ channel, ready: true }, shellOrigin);
        }
    });

    function start() {
        render();
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
