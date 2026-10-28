(function () {
    'use strict';
    const api = window.sfmcfix;
    if (api.queryCopyNavigation || !window.jQuery?.ajaxPrefilter) return;
    const VERSION = '1.1.31';
    const GUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
    const guid = value => typeof value === 'string' && new RegExp(`^${GUID}$`, 'i').test(value) ? value.toLowerCase() : null;
    const routePattern = new RegExp(`^#ActivityDetails/(\\d{1,6})/(${GUID})/?$`, 'i');
    const excluded = '.mcefix-activity-toolbar, #sfmcfix-context, #sfmcfix-query-copy-diagnostic, [data-sfmcfix-run-log]';
    const copyLabels = new Set(['copy', 'duplicate', 'copia', 'duplica', 'copy query', 'copy activity', 'copy sql query', 'copia query', 'duplica query']);
    const finishLabels = new Set(['finish', 'save', 'done', 'create', 'complete', 'copy', 'duplicate', 'fine', 'salva', 'crea', 'completa', 'copia', 'duplica']);
    const cancelLabels = new Set(['cancel', 'close', 'annulla', 'chiudi']);
    const wizardTitles = new Set(['copy query activity', 'copy sql query activity', 'copia attività query', 'copia attivita query']);
    const headings = 'h1,h2,h3,h4,h5,h6,.modal-title,[role="heading"],.modal-header span';
    const normalize = value => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
    let operation = null, timer = null, expiry = null, report = null, noticeDismissed = false;

    function visible(node) {
        return Boolean(node?.isConnected && node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden');
    }
    function dialogs() {
        return Array.from(document.querySelectorAll('.modal, [role="dialog"]')).filter(visible);
    }
    function copyWizard(root) {
        // Read only headings, never the SQL editor or the whole dialog text.
        return Boolean(root && Array.from(root.querySelectorAll(headings)).some(heading => wizardTitles.has(normalize(heading.textContent)) && visible(heading)));
    }
    function dialogFor(button) {
        const standard = button.closest('.modal, [role="dialog"]');
        if (standard) return standard;
        // Some Salesforce modal containers have neither Bootstrap's class nor
        // an ARIA role. Require the exact native copy title inside a bounded
        // common ancestor of the title and the final button.
        let parent = button.parentElement;
        for (let level = 0; parent && parent !== document.body && level < 12; level++, parent = parent.parentElement) {
            if (/modal|dialog|wizard|activityConfig/i.test(parent.className || '') && copyWizard(parent)) return parent;
        }
        return null;
    }
    function dispose() {
        if (timer !== null) clearTimeout(timer);
        if (expiry !== null) clearTimeout(expiry);
        timer = null; expiry = null; operation = null;
    }
    function hideNotice() { document.getElementById('sfmcfix-query-copy-diagnostic')?.remove(); }
    function cancel(reason = 'cancelled') {
        if (operation) report.result = reason;
        dispose(); hideNotice();
    }
    function diagnostics() {
        return { format: 'sfmcfix-query-copy-v1', extensionVersion: VERSION, capturedAt: new Date().toISOString(),
            ...(report ? JSON.parse(JSON.stringify(report)) : { result: 'idle' }) };
    }
    function notice() {
        if (noticeDismissed || document.getElementById('sfmcfix-query-copy-diagnostic')) return;
        const box = document.createElement('aside');
        box.id = 'sfmcfix-query-copy-diagnostic';
        box.setAttribute('role', 'status');
        box.className = 'sfmcfix-query-copy-diagnostic';
        const text = document.createElement('span');
        text.textContent = 'La copia non è stata aperta automaticamente. ';
        const download = document.createElement('button');
        download.type = 'button'; download.className = 'btn btn-default btn-sm';
        download.textContent = 'Scarica diagnostica apertura';
        download.onclick = () => {
            const url = URL.createObjectURL(new Blob([JSON.stringify(diagnostics(), null, 2)], { type: 'application/json' }));
            const link = document.createElement('a'); link.href = url; link.download = 'sfmc-query-copy-diagnostica.json'; link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        };
        const close = document.createElement('button');
        close.type = 'button'; close.className = 'btn btn-link btn-sm'; close.textContent = 'Chiudi'; close.onclick = () => { noticeDismissed = true; hideNotice(); };
        box.append(text, download, close); document.body.append(box);
    }
    function begin(dialog = null) {
        hideNotice(); dispose(); noticeDismissed = false;
        const match = location.hash.match(routePattern), source = guid(match?.[2]);
        const loaded = source && (api.temp?.activities?.[match[2]]?.data || api.temp?.activities?.[source]?.data);
        report = { sourceRouteRecognized: Boolean(match), sourceQueryLoaded: Boolean(source && guid(loaded?.queryDefinitionId) === source),
            copyWizardRecognized: copyWizard(dialog), finishRecognized: false, result: 'copy-started', requests: [] };
        if (!report.sourceRouteRecognized || !report.sourceQueryLoaded && !report.copyWizardRecognized) {
            report.result = !match ? 'source-route-unrecognized' : 'source-query-unavailable';
            return null;
        }
        operation = { source, hash: location.hash, scope: api.context.current().scope, expires: Date.now() + 10 * 60 * 1000,
            dialog, submitAt: null, attempt: 0, result: null, failed: false, requests: new Set() };
        expiry = setTimeout(() => cancel('expired'), 10 * 60 * 1000);
        return operation;
    }
    function sameSourceRoute(hash, task) {
        const next = hash.match(routePattern), previous = task.hash.match(routePattern);
        return Boolean(next && previous && next[1] === previous[1] && guid(next[2]) === task.source);
    }
    function current(task) {
        return operation === task && task.scope === api.context.current().scope && sameSourceRoute(location.hash, task) && Date.now() < task.expires;
    }
    function watch() {
        timer = null;
        const task = operation;
        if (!task) return;
        if (!current(task)) { cancel('context-changed'); return; }
        const closed = !visible(task.dialog) && !dialogs().length;
        if (Date.now() > task.openUntil) {
            if (report.result === 'waiting-wizard-close') report.result = 'wizard-close-timeout';
            else if (report.result === 'waiting-native-request') report.result = 'native-request-unrecognized';
            dispose(); if (closed) notice(); return;
        }
        // Native callback/transition completion comes first. The extension
        // never closes or submits the wizard itself.
        if (task.result && !task.failed && !task.requests.size && Date.now() >= task.readyAt && closed) {
            const hash = task.hash.replace(routePattern, `#ActivityDetails/$1/${task.result}`);
            report.result = 'navigated'; dispose(); hideNotice(); location.hash = hash; return;
        }
        if (closed && !task.requests.size && Date.now() - task.submitAt >= 2000) {
            if (report.result === 'waiting-native-request') report.result = 'native-request-unrecognized';
            if (report.result !== 'native-error') notice();
        }
        timer = setTimeout(watch, 100);
    }
    function schedule() { if (timer === null) timer = setTimeout(watch, 100); }
    document.addEventListener('click', event => {
        const button = event.target.closest?.('button, a, [role="button"], input[type="button"], input[type="submit"]');
        if (!button || button.closest(excluded) || !visible(button) || button.disabled || button.getAttribute('aria-disabled') === 'true' || button.classList.contains('disabled')) return;
        const labels = [button.value, button.textContent, button.getAttribute('aria-label'), button.title, button.getAttribute('data-original-title')].map(normalize).filter(Boolean);
        const dialog = dialogFor(button);
        if (dialog && visible(dialog)) {
            const recognized = copyWizard(dialog);
            if (labels.some(label => finishLabels.has(label)) && (recognized || operation && current(operation) && operation.dialog === dialog)) {
                // The title identifies the copy even when its launcher is an
                // unlabelled icon, as in the native Copy Query Activity flow.
                installObservers();
                const task = operation && current(operation) ? operation : begin(dialog);
                if (!task) { report.finishRecognized = true; notice(); return; }
                noticeDismissed = false; hideNotice();
                task.dialog = dialog; task.submitAt = Date.now(); task.attempt++; task.result = null; task.failed = false; task.requests.clear();
                task.openUntil = Date.now() + 30000;
                report.copyWizardRecognized = recognized; report.finishRecognized = true; report.result = 'waiting-native-request'; report.requests = [];
                schedule();
            } else if (operation && (labels.some(label => cancelLabels.has(label)) || button.matches('[data-dismiss="modal"], [data-bs-dismiss="modal"], .close'))) cancel();
            return;
        }
        if (!labels.some(label => copyLabels.has(label)) || dialogs().length) return;
        begin();
    }, true);
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && operation && (visible(operation.dialog) || dialogs().length)) cancel();
    }, true);
    document.addEventListener('click', event => {
        if (operation && event.target.matches?.('.modal, .modal-backdrop')) cancel();
    }, true);
    // Observe native jQuery requests only. Do not read/replay their bodies or
    // extract authentication headers. Reports include fixed path categories,
    // HTTP status and presence flags, never IDs, names, SQL or response values.
    function observeNative(options, original, xhr) {
        const task = operation;
        if (!task || !current(task) || task.submitAt === null || Date.now() - task.submitAt > 5000) return;
        let url;
        try { url = new URL(options.url, location.href); } catch (_) { return; }
        if (url.origin !== location.origin || !/^\/fuelapi\/automation\/v1\/queries(?:\/|$)/i.test(url.pathname)) return;
        const method = String(options.type || options.method || 'GET').toUpperCase();
        if (!['POST', 'PUT', 'PATCH'].includes(method) || typeof xhr?.done !== 'function' || typeof xhr?.always !== 'function') return;
        const createPath = /^\/fuelapi\/automation\/v1\/queries\/?$/i.test(url.pathname);
        const copyPath = new RegExp(`^/fuelapi/automation/v1/queries/${task.source}/(?:copy|clone)/?$`, 'i').test(url.pathname);
        const eligible = method === 'POST' && (createPath || copyPath);
        const entry = { method, endpoint: createPath ? 'query-collection' : copyPath ? 'source-query-copy' : 'other-query-path', eligible, status: null };
        if (report.requests.length < 10) report.requests.push(entry);
        const attempt = task.attempt;
        if (eligible) task.requests.add(xhr);
        xhr.done(data => {
            if (!current(task) || attempt !== task.attempt) return;
            entry.response = { queryDefinitionId: Boolean(guid(data?.queryDefinitionId)), id: Boolean(guid(data?.id)),
                nestedQueryDefinitionId: Boolean(guid(data?.queryDefinition?.queryDefinitionId)),
                errors: Boolean(data?.success === false || data?.hasError === true || data?.error || Array.isArray(data?.errors) && data.errors.length) };
            if (!eligible) { report.result = 'native-request-unrecognized'; return; }
            const id = guid(data?.queryDefinitionId);
            if (!id || id === task.source || entry.response.errors) { task.failed = true; report.result = 'response-id-unrecognized'; return; }
            if (task.result && task.result !== id) { task.failed = true; report.result = 'ambiguous-response'; return; }
            task.result = id; task.readyAt = Date.now() + 350; task.openUntil = Date.now() + 30000; report.result = 'waiting-wizard-close';
        });
        xhr.fail?.(() => {
            if (current(task) && attempt === task.attempt && eligible) { task.failed = true; report.result = 'native-error'; }
        });
        xhr.always(() => {
            if (!current(task) || attempt !== task.attempt) return;
            entry.status = Number.isInteger(xhr.status) ? xhr.status : null;
            task.requests.delete(xhr); schedule();
        });
    }
    const observedClients = new WeakSet();
    function installObservers() {
        const clients = [window.jQuery, api.nativeSession?.backbone?.()?.$];
        for (const loader of [window.requirejs, window.require]) {
            try { if (typeof loader === 'function' && loader.defined?.('jquery')) clients.push(loader('jquery')); } catch (_) {}
        }
        for (const client of clients) {
            if (typeof client?.ajaxPrefilter !== 'function' || observedClients.has(client)) continue;
            observedClients.add(client); client.ajaxPrefilter(observeNative);
        }
    }
    installObservers();
    window.addEventListener('hashchange', event => {
        const task = operation;
        if (task && sameSourceRoute(location.hash, task)) {
            // Salesforce can return to/re-dispatch the source detail after
            // creating the copy. This is the expected native completion, not
            // navigation to a different activity. Also allow case/trailing-slash
            // canonicalization of that same observed detail route.
            let sameEvent = true;
            if (event.newURL) {
                try { const url = new URL(event.newURL); sameEvent = url.origin === location.origin && sameSourceRoute(url.hash, task); }
                catch (_) { sameEvent = false; }
            }
            if (sameEvent) { report.sourceRouteEvents = Math.min(20, (report.sourceRouteEvents || 0) + 1); return; }
        }
        cancel('route-changed');
    });
    window.addEventListener('sfmcfix:contextchange', () => cancel('context-changed'));
    window.addEventListener('pagehide', () => cancel('page-hidden'));
    api.queryCopyNavigation = { cancel, diagnostics };
})();
