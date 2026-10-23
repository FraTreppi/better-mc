(function () {
    'use strict';
    const api = window.sfmcfix;
    if (api.assetNavigation) return;
    const routes = new Map();
    const safeRoute = route => typeof route === 'string' && route.length < 300 && /^[a-z0-9_/-]+$/i.test(route) &&
        /(?:^|\/)(?:asset|assets|content|email|emails)(?:\/|$)/i.test(route) &&
        !/(?:^|\/)(?:delete|remove|copy|create|save|send|test|publish|approve|schedule|run|folder|folders|category|categories)(?:\/|$)/i.test(route);
    let last = { method: 'none', result: 'none' };
    const backbone = () => api.nativeSession?.backbone?.() || window.Backbone;
    function handlers() { return (backbone()?.history?.handlers || []).filter(handler => typeof handler.route?.source === 'string' && typeof handler.route.test === 'function'); }
    function matches(handler, route) {
        const index = handler.route.lastIndex;
        try { handler.route.lastIndex = 0; return handler.route.test(route); }
        finally { handler.route.lastIndex = index; }
    }
    function literalRoute(handler, id) {
        let source = handler.route.source.replace(/^\^|\$$/g, '');
        // Backbone's optional query capture is not an asset route argument.
        source = source.replace(/\(\?:\\\?\(\[\\s\\S\]\*\)\)\?$/, '');
        let captures = 0;
        source = source.replace(/\((?:\[\^\/?\]|\[\^\/\]|\[\^\\\/\?\]|\[\^\\\/\]|\[0-9\]|\\d)\+\)/g, () => { captures++; return String(id); });
        source = source.replace(/\\\//g, '/');
        return captures === 1 && safeRoute(source) && matches(handler, source) ? source : null;
    }
    function remember(event) {
        const id = Number(event.detail?.id), type = Number(event.detail?.typeId);
        if (!Number.isSafeInteger(id) || id < 1 || !Number.isSafeInteger(type)) return;
        const fragment = String(backbone()?.history?.fragment || location.hash.slice(1)).replace(/^\//, '');
        if (!safeRoute(fragment)) return;
        const parts = fragment.split('/'), index = parts.indexOf(String(id));
        if (index < 0 || parts.lastIndexOf(String(id)) !== index) return;
        routes.set(type, { prefix: parts.slice(0, index).join('/'), suffix: parts.slice(index + 1).join('/') });
    }
    function routeFor(asset) {
        const registered = handlers(), learned = routes.get(asset.typeId), candidates = [];
        if (learned) candidates.push([learned.prefix, asset.id, learned.suffix].filter(Boolean).join('/'));
        for (const handler of registered) {
            const route = literalRoute(handler, asset.id);
            if (route) candidates.push(route);
        }
        const email = [5, 207, 208, 209].includes(asset.typeId);
        for (const prefix of ['asset', 'assets', 'content/asset', 'content/assets', 'content/edit', 'content', ...(email ? ['email', 'emails'] : [])]) {
            for (const suffix of email ? ['/email', '', '/edit', '/view'] : ['', '/edit', '/view']) candidates.push(`${prefix}/${asset.id}${suffix}`);
        }
        // Never assign an assumed hash. A route must be recognized by an
        // existing native handler; generic catch-all routes are insufficient.
        for (const candidate of candidates) {
            for (const route of [candidate, '/' + candidate]) {
                if (!safeRoute(route)) continue;
                if (/(?:^|\/)emails?(?:\/|$)/i.test(route) && !email) continue;
                const handler = registered.find(item => matches(item, route));
                if (!handler || !/(?:asset|content|email)/i.test(handler.route.source)) continue;
                if (!learned || candidate !== candidates[0]) {
                    const alternatives = new Set(candidates.filter(value => matches(handler, value)));
                    if (alternatives.size !== 1) continue; // Do not guess a second route argument such as mode.
                }
                return route;
            }
        }
        return null;
    }
    async function open(asset, { signal, scope }) {
        if (!Number.isSafeInteger(asset.id) || asset.id < 1 || !Number.isSafeInteger(asset.typeId) || asset.typeId < 1) throw new Error('Identificativo del contenuto non valido.');
        const abortError = () => Object.assign(new Error('Apertura interrotta.'), { name: 'AbortError' });
        const check = () => { if (signal.aborted || scope !== api.context.current().scope) throw abortError(); };
        check(); await api.context.refresh?.(); check();
        const row = document.querySelector(`[data-flow-id="cb:repeater:list:${asset.id}"]`);
        const visible = Boolean(row?.isConnected && row.getClientRects().length && getComputedStyle(row).visibility !== 'hidden');
        const route = visible ? null : routeFor(asset), history = backbone()?.history;
        last = { method: visible ? 'row' : route ? 'router' : 'unavailable', result: 'pending' };
        if (!visible && (!route || !history || typeof history.navigate !== 'function')) {
            last.result = 'unsupported';
            throw new Error('Collegamento di apertura non riconosciuto in questa pagina. I risultati sono conservati. Scarica la diagnostica ricerca per verificare la navigazione nativa.');
        }
        return new Promise((resolve, reject) => {
            let timer, observer, done = false;
            const libraryInput = document.querySelector('input[type="search"].form-control.dropdown-toggle');
            const libraryVisible = Boolean(libraryInput?.getClientRects().length);
            function finish(error) {
                if (done) return;
                done = true; clearTimeout(timer); observer?.disconnect();
                window.removeEventListener('sfmcfix:asset-loaded', loaded);
                window.removeEventListener('sfmcfix:contextchange', changed);
                signal.removeEventListener('abort', cancelled);
                last.result = error ? error.name === 'AbortError' ? 'aborted' : 'unconfirmed' : 'confirmed';
                if (error) reject(error); else resolve();
            }
            const cancelled = () => finish(abortError());
            const changed = () => { if (scope !== api.context.current().scope) cancelled(); };
            const loaded = event => {
                try { check(); } catch (error) { finish(error); return; }
                if (Number(event.detail?.id) === asset.id && Number(event.detail?.typeId) === asset.typeId) finish();
            };
            window.addEventListener('sfmcfix:asset-loaded', loaded);
            window.addEventListener('sfmcfix:contextchange', changed);
            signal.addEventListener('abort', cancelled, { once: true });
            if (libraryVisible && typeof MutationObserver === 'function') {
                // A cached editor can reuse the last loaded asset without
                // another GET. Require that exact asset and a native view change.
                observer = new MutationObserver(() => {
                    try { check(); } catch (error) { finish(error); return; }
                    const current = api.temp?.lastloadedasset;
                    if (Number(current?.id) === asset.id && Number(current?.assetType?.id) === asset.typeId &&
                        (!libraryInput.isConnected || !libraryInput.getClientRects().length)) finish();
                });
                observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
            }
            timer = setTimeout(() => finish(new Error('Content Builder non ha confermato l’apertura del contenuto. I risultati sono conservati: puoi riprovare o scaricare la diagnostica ricerca.')), 8000);
            try {
                check();
                if (visible) (row.querySelector('.contentitem-table-name, [data-content-field="name"]') || row).click();
                else if (history.fragment === route && typeof history.loadUrl === 'function') history.loadUrl(route);
                else history.navigate(route, { trigger: true });
            } catch (_) { finish(new Error('Il comando nativo non ha aperto il contenuto. I risultati sono conservati. Scarica la diagnostica ricerca.')); }
        });
    }
    window.addEventListener('sfmcfix:asset-loaded', remember);
    window.addEventListener('sfmcfix:contextchange', () => routes.clear());
    api.assetNavigation = { open, diagnostics: () => ({ ...last, nativeHistory: Boolean(backbone()?.history),
        routePatterns: handlers().map(item => item.route.source).filter(value => value.length < 200 && /(?:asset|content|email)/i.test(value) &&
            /^[a-z0-9_\\/()[\]{}?^$.*+|:=!\s-]+$/i.test(value)).slice(0, 20).map(value => value.replace(/\d+/g, '<number>')) }) };
})();
