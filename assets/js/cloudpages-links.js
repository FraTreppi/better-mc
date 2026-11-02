(function () {
    'use strict';
    // Navigation uses native controls, also in embedded CloudPages documents.
    // Optional source export uses same-origin reads; no storage bridge or guessed editor routes.
    const host = location.hostname.match(/^(?:[a-z0-9-]+\.)?(s\d+)\.(?:exacttarget|marketingcloud|marketingcloudapps)\.com$/i);
    if (location.protocol !== 'https:' || !host) return;
    const stack = host[1].toLowerCase();
    const shellOrigin = `https://mc.${stack}.exacttarget.com`;
    const channel = 'sfmcfix-cloudpage-navigation';
    const selector = 'a.sfmcfix-cloudpage-newtab';
    const idKey = 'sfmcfix_cloudpage';
    const nameKey = 'sfmcfix_cloudpage_name';
    const validID = value => /^[1-9]\d{0,14}$/.test(value || '');
    const isLibrary = () => /^#app\/CloudPages\/(?:\?.*)?$/i.test(location.hash);
    const trustedOrigin = value => {
        try {
            const url = new URL(value);
            return url.protocol === 'https:' && !url.port &&
                new RegExp(`^(?:[a-z0-9-]+\\.)?${stack}\\.(?:exacttarget|marketingcloud|marketingcloudapps)\\.com$`, 'i').test(url.hostname);
        } catch (_) { return false; }
    };
    let request;
    let pending;
    let claimedFrame;
    let status;
    let timer;
    let stopped = false;
    let announced = false;

    function announce() {
        if (stopped) return;
        if (window !== window.top && !announced) {
            announced = true;
            window.top.postMessage({ channel, status: 'ready' }, shellOrigin);
        }
        if (window === window.top && pending && !request) {
            request = { ...pending, deadline: Date.now() + 30000 };
            queueMicrotask(selectPage);
        }
    }

    function emptyLibrary() {
        if (stopped || announced || window === window.top && !pending) return;
        const labels = ['Name', 'Location', 'Type', 'ID', 'Status', 'Modified'];
        const found = Array.from(document.querySelectorAll('table')).some(table => {
            const headings = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent.trim());
            return labels.every(label => headings.includes(label));
        });
        if (found) announce();
    }

    function rowInfo(row) {
        if (!row?.matches?.('tr.slds-hint-parent')) return null;
        const cell = label => row.querySelector(`td[data-label="${label}"]`);
        const nameCell = cell('Name');
        const nameElement = nameCell?.querySelector('.slds-truncate');
        const idElement = cell('ID')?.querySelector('.slds-truncate');
        const id = idElement?.textContent.trim();
        if (!nameElement || !validID(id) || !cell('Location') || !cell('Type') || !cell('Status') || !cell('Modified')) return null;
        const action = cell('Actions')?.querySelector('[id$="-SLDSDataTableRowActions"]');
        if (!action?.id.endsWith(`-SLDSDataTableRow-${id}-SLDSDataTableRowActions`)) return null;
        const name = nameElement.getAttribute('title') || nameElement.textContent.trim();
        if (!name || name.length > 1000) return null;
        return { id, name, nameCell, nameElement, action };
    }

    function targetURL(info) {
        const url = new URL('/cloud/', shellOrigin);
        url.searchParams.set(idKey, info.id);
        url.searchParams.set(nameKey, info.name);
        url.hash = '#app/CloudPages/';
        return url.href;
    }

    function decorate(row) {
        const info = rowInfo(row);
        if (!info) { row?.querySelector?.(selector)?.remove(); row?.querySelector?.('.sfmcfix-cloudpage-export')?.remove(); return; }
        let link = info.nameCell.querySelector(selector);
        if (!link) {
            link = document.createElement('a');
            link.className = 'slds-button slds-button_icon-border-filled sfmcfix-cloudpage-newtab';
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.style.cssText = 'float:right;transform:scale(.7);margin-left:10px;';
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('class', 'slds-button__icon slds-button_icon-x-small');
            svg.setAttribute('aria-hidden', 'true');
            const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
            const nativeUse = info.action.querySelector('svg use');
            let sprite = nativeUse?.getAttribute('href') || nativeUse?.getAttribute('xlink:href') || '/assets/icons/utility-sprite/svg/symbols.svg#down';
            try {
                const url = new URL(sprite, document.baseURI);
                if (url.origin !== location.origin || !url.pathname.endsWith('/icons/utility-sprite/svg/symbols.svg')) throw Error();
                sprite = url.pathname + '#link';
            } catch (_) { sprite = '/assets/icons/utility-sprite/svg/symbols.svg#link'; }
            use.setAttribute('href', sprite);
            svg.append(use); link.append(svg);
            info.nameCell.prepend(link);
        }
        const href = targetURL(info);
        if (link.href !== href) link.href = href;
        const label = `Apri ${info.name} nell’editor in un’altra scheda`;
        if (link.title !== label) { link.title = label; link.setAttribute('aria-label', label); }
        let download = info.nameCell.querySelector('.sfmcfix-cloudpage-export');
        if (!download) {
            download = document.createElement('button');
            download.type = 'button';
            download.className = 'slds-button slds-button_icon-border-filled sfmcfix-cloudpage-export';
            download.style.cssText = 'float:right;transform:scale(.7);margin-left:6px;';
            const icon = link.querySelector('svg').cloneNode(true);
            const use = icon.querySelector('use'); use.setAttribute('href', use.getAttribute('href').replace(/#link$/, '#download'));
            download.append(icon);
            download.title = 'Esporta il sorgente salvato della CloudPage per Git';
            download.setAttribute('aria-label', 'Esporta CloudPage per Git');
            download.addEventListener('click', async event => {
                event.preventDefault(); event.stopPropagation();
                const current = rowInfo(download.closest('tr'));
                if (!current || download.disabled) return;
                download.disabled = true;
                try { await exportPage(current); showStatus('CloudPage esportata. Nel progetto locale usa il comando import.'); }
                catch (error) { showStatus(error.message, true); }
                finally { download.disabled = false; }
            });
            info.nameCell.prepend(download);
        }
        announce();
    }

    async function exportPage(info) {
        const read = async path => {
            const response = await fetch(path, { method: 'GET', credentials: 'same-origin', mode: 'same-origin', redirect: 'error',
                headers: { Accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(30000) });
            if (!response.ok) throw Error('Esportazione CloudPage non disponibile (HTTP ' + response.status + '). Puoi usare il backup dal progetto locale.');
            const text = await response.text();
            if (text.length > 20 * 1024 * 1024) throw Error('Contenuto troppo grande: usa il backup dal progetto locale.');
            return JSON.parse(text);
        };
        const context = await read('/fuelapi/platform/v1/tokenContext');
        const mid = String(context?.organization?.id || '');
        if (!validID(mid)) throw Error('BU della sessione non rilevata.');
        // Exact site lookup supplied by the user. The public URL is metadata;
        // it is never fetched or opened to obtain the editable source.
        const sites = await read('/fuelapi/internal/v2/cloudpages/sites?siteAssetId=' + info.id);
        if (sites.totalCount !== 1 || sites.entities?.length !== 1 || String(sites.entities[0].siteAssetId) !== info.id) throw Error('CloudPage assente o risposta ambigua.');
        const asset = await read('/fuelapi/asset/v1/content/assets/' + info.id);
        if (String(asset.id) !== info.id) throw Error('Asset CloudPage non corrispondente.');
        const sources = [asset];
        const associated = String(asset.meta?.thumbnailRefAssetId || '');
        if (validID(associated) && associated !== info.id) {
            const content = await read('/fuelapi/asset/v1/content/assets/' + associated);
            if (String(content.id) !== associated) throw Error('Sorgente CloudPage non corrispondente.');
            sources.push(content);
        }
        if (!sources.some(source => typeof source.views?.html?.content === 'string' ||
            typeof source.content === 'string' && /<|%%|<%/.test(source.content))) throw Error('La risposta non include il sorgente modificabile. Usa il backup del progetto locale.');
        const after = await read('/fuelapi/platform/v1/tokenContext');
        if (String(after?.organization?.id) !== mid || rowInfo(info.nameCell.closest('tr'))?.id !== info.id) throw Error('Esportazione interrotta: BU o pagina cambiate.');
        const data = { format: 'sfmc-git-export-v1', exportedAt: new Date().toISOString(), source: 'saved-in-salesforce',
            context: { stack, mid }, items: [{ kind: 'cloudpage', id: info.id,
                data: { name: sites.entities[0].name, site: sites.entities[0], asset, sourceAssets: sources } }] };
        const text = JSON.stringify(data, (key, value) => /^(?:access_?token|refresh_?token|client_?secret|authorization|cookie|password)$/i.test(key) ? undefined : value, 2);
        if (text.length > 20 * 1024 * 1024) throw Error('Contenuto troppo grande: usa il backup dal progetto locale.');
        const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
        const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'sfmc-git-cloudpage-' + info.id + '.json';
        anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function clearMarker() {
        const url = new URL(location.href);
        url.searchParams.delete(idKey);
        url.searchParams.delete(nameKey);
        history.replaceState(history.state, '', url);
    }

    function showStatus(text, error = false) {
        if (!document.body) return;
        if (!status) {
            status = document.createElement('div');
            status.id = 'sfmcfix-cloudpage-opening';
            status.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;max-width:480px;padding:12px;background:white;border:1px solid #b5c8da;border-radius:4px;box-shadow:0 2px 8px #0002;color:#243746;font:14px/1.5 Arial,sans-serif';
            const message = document.createElement('span');
            status.append(message);
            const close = document.createElement('button');
            close.type = 'button'; close.textContent = 'Chiudi';
            close.style.cssText = 'margin-left:12px;cursor:pointer';
            close.addEventListener('click', () => { if (pending || request) stop(); status.remove(); status = null; });
            status.append(close);
            document.body.append(status);
        }
        status.setAttribute('role', error ? 'alert' : 'status');
        status.firstChild.textContent = text;
    }

    function stop() {
        if (stopped) return;
        stopped = true;
        clearInterval(timer);
        if (pending) {
            claimedFrame?.source.postMessage({ channel, status: 'cancel', requestId: pending.requestId }, claimedFrame.origin);
            clearMarker();
        }
        request = null;
        pending = null;
    }

    function report(result) {
        if (!request) return;
        if (window === window.top) { completed(result); return; }
        window.top.postMessage({ channel, status: result, requestId: request.requestId }, shellOrigin);
        request = null;
        stopped = true;
        clearInterval(timer);
    }

    function completed(result) {
        stop();
        if (result === 'selected') status?.remove();
        else showStatus(result === 'cancelled' ? 'Apertura automatica annullata.' : 'CloudPage non trovata nell’elenco caricato. Puoi cercarla e aprirla in questa scheda.', true);
    }

    function selectPage() {
        if (!request || stopped) return;
        if (Date.now() >= request.deadline) { report('missing'); return; }
        const matches = Array.from(document.querySelectorAll('tr.slds-hint-parent')).map(row => ({ row, info: rowInfo(row) }))
            .filter(item => item.row.getClientRects().length && item.info?.id === request.id && item.info.name === request.name);
        if (matches.length === 1) {
            const action = matches[0].info.action;
            const trigger = action.querySelector('button[aria-haspopup="true"]');
            if (!trigger || trigger.disabled) return;
            if (!request.menuOpened) {
                request.menuOpened = true;
                trigger.click();
                return;
            }
            if (trigger.getAttribute('aria-expanded') !== 'true') return;
            let menus = Array.from(action.querySelectorAll('[role="menu"], .slds-dropdown'));
            if (!menus.length) menus = Array.from(document.querySelectorAll('[role="menu"], .slds-dropdown')).filter(menu => menu.getClientRects().length);
            menus = menus.filter(menu => !menus.some(other => menu !== other && menu.contains(other)));
            if (menus.length !== 1) return;
            const candidates = Array.from(menus[0].querySelectorAll('a, button, [role="menuitem"]')).filter(item =>
                /^(edit|modifica)$/i.test(item.textContent.trim()) && item.getClientRects().length && !item.disabled);
            const edits = candidates.filter(item => !candidates.some(other => item !== other && item.contains(other)));
            if (edits.length === 1) {
                const edit = edits[0];
                report('selected');
                edit.click();
            }
            return;
        }
        if (matches.length > 1 || request.searched) return;
        if (!request.allPagesSelected) {
            const tabs = Array.from(document.querySelectorAll('[role="tab"], a, button')).filter(node =>
                /^(all pages|tutte le pagine)$/i.test(node.textContent.trim()) && node.getClientRects().length && !node.disabled);
            if (tabs.length === 1 && tabs[0].getAttribute('aria-selected') !== 'true') {
                request.allPagesSelected = true; tabs[0].click(); return;
            }
        }
        // This placeholder is visible in the supplied CloudPages screenshot.
        // Keep native filtering/pagination; never construct a Salesforce API URL.
        const searches = Array.from(document.querySelectorAll('input[placeholder]')).filter(input =>
            /^Enter at least three characters to search\.?$/i.test(input.placeholder.trim()) &&
            !input.disabled && input.getClientRects().length);
        if (searches.length !== 1 || request.name.length < 3) return;
        request.searched = true;
        const input = searches[0];
        const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        if (!setValue) return;
        setValue.call(input, request.name);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        for (const type of ['keydown', 'keyup']) input.dispatchEvent(new KeyboardEvent(type, {
            key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true
        }));
    }

    window.addEventListener('message', event => {
        const data = event.data;
        if (stopped || data?.channel !== channel) return;
        if (window === window.top) {
            if (!pending || !isLibrary() || !trustedOrigin(event.origin)) return;
            if (data.status === 'ready') {
                const frame = Array.from(document.querySelectorAll('iframe')).find(frame => frame.contentWindow === event.source);
                if (!frame || claimedFrame && claimedFrame.source !== event.source) return;
                claimedFrame = { source: event.source, origin: event.origin };
                event.source.postMessage({ channel, status: 'open', ...pending }, event.origin);
            } else if (claimedFrame?.source === event.source && claimedFrame.origin === event.origin && data.requestId === pending.requestId) {
                if (['selected', 'missing', 'cancelled'].includes(data.status)) completed(data.status);
            }
        } else if (event.source === window.top && event.origin === shellOrigin) {
            if (data.status === 'cancel' && request?.requestId === data.requestId) {
                request = null; stopped = true; clearInterval(timer);
            } else if (data.status === 'open' && !request && validID(data.id) &&
                typeof data.name === 'string' && data.name.length > 0 && data.name.length <= 1000 &&
                /^[a-f0-9-]{36}$/i.test(data.requestId || '')) {
                request = { id: data.id, name: data.name, requestId: data.requestId, deadline: Date.now() + 30000 };
                timer = setInterval(selectPage, 300);
                selectPage();
            }
        }
    });

    if (window === window.top && location.origin === shellOrigin && location.pathname === '/cloud/' && isLibrary()) {
        const params = new URL(location.href).searchParams;
        const id = params.get(idKey), name = params.get(nameKey);
        if (validID(id) && name && name.length <= 1000) {
            pending = { id, name, requestId: crypto.randomUUID() };
            const deadline = Date.now() + 45000;
            timer = setInterval(() => {
                if (!pending) return;
                if (!isLibrary()) { stop(); status?.remove(); return; }
                if (Date.now() >= deadline) {
                    stop();
                    showStatus('CloudPages non ha completato l’apertura. Puoi cercare la pagina in questa scheda.', true);
                } else {
                    showStatus('Apertura dell’editor CloudPage…');
                    if (request) selectPage();
                }
            }, 300);
            window.addEventListener('hashchange', () => { if (!isLibrary()) { stop(); status?.remove(); } });
        }
    }

    function userInteracted(event) {
        if (!event.isTrusted || event.target.closest?.('#sfmcfix-cloudpage-opening')) return;
        if (request) report('cancelled');
        if (pending) { stop(); status?.remove(); }
    }
    document.addEventListener('pointerdown', userInteracted, true);
    document.addEventListener('keydown', userInteracted, true);
    for (const type of ['click', 'auxclick', 'keydown']) document.addEventListener(type, event => {
        if (event.target.closest?.(selector)) event.stopPropagation();
    }, true);

    function start() {
        // The CloudPages host is now known from the user's Network evidence.
        // Announce before its async library renders, including an initial Collections view.
        if (/^cloud-pages\.s\d+\./i.test(location.hostname)) announce();
        document.querySelectorAll('tr.slds-hint-parent').forEach(decorate);
        emptyLibrary();
        const observer = new MutationObserver(records => {
            const rows = new Set();
            let libraryAdded = false;
            for (const record of records) {
                const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
                if (target?.closest(selector) || target?.closest('#sfmcfix-cloudpage-opening')) continue;
                const parentRow = target?.closest('tr.slds-hint-parent');
                if (parentRow) rows.add(parentRow);
                for (const node of record.addedNodes) {
                    if (node.nodeType !== 1 || node.matches(selector)) continue;
                    if (!announced && (node.matches('table,thead,th') || node.querySelector('table,thead'))) libraryAdded = true;
                    if (node.matches('tr.slds-hint-parent')) rows.add(node);
                    node.querySelectorAll('tr.slds-hint-parent').forEach(row => rows.add(row));
                }
            }
            rows.forEach(row => { if (row.isConnected) decorate(row); });
            if (libraryAdded) emptyLibrary();
            if (request) selectPage();
        });
        observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['id', 'title', 'data-label'] });
        window.addEventListener('pagehide', () => { observer.disconnect(); stop(); }, { once: true });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
})();
