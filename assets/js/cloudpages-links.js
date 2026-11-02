(function () {
    'use strict';
    // DOM-only helper, also in embedded CloudPages documents. No storage bridge,
    // private Salesforce APIs, guessed editor routes or remote code are needed.
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
        return { id, name, nameCell, nameElement };
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
        if (!info) { row?.querySelector?.(selector)?.remove(); return; }
        let link = info.nameCell.querySelector(selector);
        if (!link) {
            link = document.createElement('a');
            link.className = 'slds-button slds-button_icon-border-filled sfmcfix-cloudpage-newtab';
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = '↗';
            link.style.cssText = 'float:right;display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;margin-left:8px;text-decoration:none;font:18px Arial,sans-serif';
            info.nameCell.prepend(link);
        }
        const href = targetURL(info);
        if (link.href !== href) link.href = href;
        const label = `Apri ${info.name} nell’editor in un’altra scheda`;
        if (link.title !== label) { link.title = label; link.setAttribute('aria-label', label); }
        announce();
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
            close.addEventListener('click', () => { stop(); status.remove(); });
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
            const element = matches[0].info.nameElement;
            // Exactly one native row selection, only in the newly opened tab.
            report('selected');
            element.click();
            return;
        }
        if (matches.length > 1 || request.searched) return;
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
