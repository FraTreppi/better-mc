(function () {
    'use strict';
    const api = window.sfmcfix;
    if (api.queryCopyNavigation || !window.jQuery?.ajaxPrefilter) return;
    const GUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
    const guid = value => typeof value === 'string' && new RegExp(`^${GUID}$`, 'i').test(value) ? value.toLowerCase() : null;
    const routePattern = new RegExp(`^#ActivityDetails/(\\d{1,6})/(${GUID})/?$`, 'i');
    const excluded = '.mcefix-activity-toolbar, #sfmcfix-context, [data-sfmcfix-run-log]';
    const copyLabels = new Set(['copy', 'duplicate', 'copia', 'duplica', 'copy query', 'copy activity', 'copy sql query', 'copia query', 'duplica query']);
    const finishLabels = new Set(['finish', 'save', 'done', 'create', 'complete', 'copy', 'duplicate', 'fine', 'salva', 'crea', 'completa', 'copia', 'duplica']);
    const cancelLabels = new Set(['cancel', 'close', 'annulla', 'chiudi']);
    let operation = null, timer = null, expiry = null;

    function visible(node) {
        return Boolean(node?.isConnected && node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden');
    }
    function dialogs() {
        return Array.from(document.querySelectorAll('.modal, [role="dialog"]')).filter(visible);
    }
    function cancel() {
        if (timer !== null) clearTimeout(timer);
        if (expiry !== null) clearTimeout(expiry);
        timer = null; expiry = null; operation = null;
    }
    function current(task) {
        return operation === task && task.scope === api.context.current().scope && task.hash === location.hash && Date.now() < task.expires;
    }
    function watch() {
        timer = null;
        const task = operation;
        if (!task) return;
        if (!current(task) || task.result && Date.now() > task.openUntil) { cancel(); return; }
        if (!task.result) return;
        // Allow the native success callback, modal transitions and any follow-up
        // saves to finish. Never open a query while its copy wizard is visible.
        if (task.result && !task.requests.size && Date.now() >= task.readyAt && !visible(task.dialog) && !dialogs().length) {
            const hash = task.hash.replace(routePattern, `#ActivityDetails/$1/${task.result}`);
            cancel();
            location.hash = hash;
            return;
        }
        timer = setTimeout(watch, 100);
    }
    function schedule() { if (timer === null) timer = setTimeout(watch, 100); }
    document.addEventListener('click', event => {
        const button = event.target.closest?.('button, a, [role="button"], input[type="button"], input[type="submit"]');
        if (!button || button.closest(excluded) || !visible(button) || button.disabled || button.getAttribute('aria-disabled') === 'true' || button.classList.contains('disabled')) return;
        const label = [button.value, button.textContent, button.getAttribute('aria-label'), button.title]
            .map(value => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase()).find(Boolean) || '';
        const dialog = button.closest('.modal, [role="dialog"]');
        if (operation && current(operation) && dialog && visible(dialog)) {
            if (finishLabels.has(label)) {
                operation.dialog = dialog;
                operation.submitAt = Date.now();
                operation.attempt++;
                operation.result = null;
                operation.requests.clear();
            } else if (cancelLabels.has(label) || button.matches('[data-dismiss="modal"], [data-bs-dismiss="modal"], .close')) cancel();
            return;
        }
        if (!copyLabels.has(label) || dialogs().length) return;
        const match = location.hash.match(routePattern);
        if (!match) return;
        const source = guid(match[2]);
        const loaded = api.temp?.activities?.[match[2]]?.data || api.temp?.activities?.[source]?.data;
        // The current route must refer to a Query Activity actually loaded by
        // Salesforce. Reuse that observed route type; do not invent a type/URL.
        if (!source || guid(loaded?.queryDefinitionId) !== source) return;
        cancel();
        operation = { source, hash: location.hash, scope: api.context.current().scope, expires: Date.now() + 10 * 60 * 1000,
            dialog: null, submitAt: null, attempt: 0, result: null, requests: new Set() };
        expiry = setTimeout(cancel, 10 * 60 * 1000);
    }, true);
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && operation && dialogs().length) cancel();
    }, true);
    document.addEventListener('click', event => {
        if (operation && event.target.matches?.('.modal, .modal-backdrop')) cancel();
    }, true);
    // Observe the existing native request only. No copy, save, run or extra
    // API call is made by the extension, and the SQL/request body is not read.
    window.jQuery.ajaxPrefilter((options, original, xhr) => {
        const task = operation;
        if (!task || !current(task) || task.submitAt === null || Date.now() - task.submitAt > 5000) return;
        let url;
        try { url = new URL(options.url, location.href); } catch (_) { return; }
        const copyPath = new RegExp(`^/fuelapi/automation/v1/queries/${task.source}/(?:copy|clone)/?$`, 'i');
        const createPath = /^\/fuelapi\/automation\/v1\/queries\/?$/i;
        if (url.origin !== location.origin || String(options.type || options.method || 'GET').toUpperCase() !== 'POST' ||
            !(createPath.test(url.pathname) || copyPath.test(url.pathname)) || typeof xhr?.done !== 'function' || typeof xhr?.always !== 'function') return;
        const attempt = task.attempt;
        task.requests.add(xhr);
        xhr.done(data => {
            if (!current(task) || attempt !== task.attempt) return;
            const id = guid(data?.queryDefinitionId);
            if (!id || id === task.source || data?.success === false || data?.hasError === true || data?.error ||
                Array.isArray(data?.errors) && data.errors.length) return;
            if (task.result && task.result !== id) { cancel(); return; }
            task.result = id;
            task.readyAt = Date.now() + 350;
            task.openUntil = Date.now() + 30000;
        });
        xhr.always(() => {
            if (!current(task) || attempt !== task.attempt) return;
            task.requests.delete(xhr);
            schedule();
        });
    });
    for (const event of ['hashchange', 'sfmcfix:contextchange', 'pagehide']) window.addEventListener(event, cancel);
    api.queryCopyNavigation = { cancel };
})();
