(function () {
    'use strict';
    const api = window.sfmcfix;
    if (api.recentPreviewDEs) return;
    const KEY = 'SFMCFIX---PREVIEW-DE-RECENTS', MAX_AGE = 60 * 24 * 60 * 60 * 1000;
    const GUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
    const guid = value => typeof value === 'string' && new RegExp(`^${GUID}$`, 'i').test(value) ? value.toLowerCase() : null;
    const numeric = value => /^\d{1,15}$/.test(String(value ?? '')) && Number(value) > 0 ? String(value) : null;
    const folders = [{ id: 999999999, name: 'DE recenti · questa email' }, { id: 999999990, name: 'DE recenti · questa BU' }];
    const virtual = id => folders.some(folder => String(folder.id) === String(id));
    const metadata = new Map(), active = new Set();
    let rootId = null, generation = 0;
    const array = key => {
        try { const value = JSON.parse(api.local.getItem(key) || '[]'); return Array.isArray(value) ? value : []; }
        catch (_) { return []; }
    };
    function currentAsset() {
        const asset = api.temp.currentasset;
        return { assetId: numeric(asset?.id), emailID: numeric(asset?.legacyData?.legacyId) };
    }
    function entries() {
        // Import only identifiers from the existing, already BU-scoped send log.
        const logs = array('testsendlogs').filter(row => row?.dataSource?.type === 'DataExtension').map(row => ({
            deId: row.dataSource.id, emailID: row.emailID, usedAt: new Date(row.logdate).getTime()
        }));
        return [...array(KEY), ...logs].filter(row => guid(row?.deId) && numeric(row?.emailID) &&
            Number.isFinite(row.usedAt) && row.usedAt <= Date.now() && Date.now() - row.usedAt < MAX_AGE)
            .map(row => ({ deId: guid(row.deId), emailID: numeric(row.emailID), assetId: numeric(row.assetId), usedAt: row.usedAt }))
            .sort((a, b) => b.usedAt - a.usedAt);
    }
    function remember(deId, emailID, assetId, scope) {
        if (scope !== api.context.current().scope || !guid(deId) || !numeric(emailID)) return;
        const item = { deId: guid(deId), emailID: numeric(emailID), assetId: numeric(assetId), usedAt: Date.now() };
        const seen = new Set();
        const result = [item, ...entries()].filter(row => {
            const key = `${row.deId}:${row.emailID}`;
            if (seen.has(key)) return false;
            seen.add(key); return true;
        }).slice(0, 200);
        try { api.local.setItem(KEY, JSON.stringify(result)); }
        catch (_) { /* A disabled/full site store must never break the native preview. */ }
    }
    api.recentPreviewDEs = {
        rememberSend(data) {
            const asset = currentAsset();
            if (data?.dataSource?.type === 'DataExtension') remember(data.dataSource.id, data.emailID,
                asset.emailID === numeric(data.emailID) ? asset.assetId : null, api.context.current().scope);
        }
    };
    function nativeURL(options) {
        try {
            const url = new URL(options.url, location.href);
            return url.origin === location.origin ? url : null;
        } catch (_) { return null; }
    }
    api.ajax.prefilter['/fuelapi/guide/v1/emails/'] = function (options, original, xhr) {
        const url = nativeURL(options);
        if (!url || String(options.type || options.method || 'GET').toUpperCase() !== 'POST') return;
        const match = url.pathname.match(new RegExp(`^/fuelapi/guide/v1/emails/(\\d+)/dataExtension/(${GUID})/row/\\d+/preview/?$`, 'i'));
        let deId = match?.[2], emailID = match?.[1];
        if (!match && /^\/fuelapi\/guide\/v1\/emails(?:\/\d+)?\/preview\/?$/i.test(url.pathname)) {
            try {
                const data = typeof options.data === 'string' ? JSON.parse(options.data) : options.data;
                if (data?.dataSource?.type !== 'DataExtension' || !Number.isInteger(data.dataSource.row) || data.dataSource.row < 0) return;
                deId = data.dataSource.id; emailID = data.emailID;
                const pathID = url.pathname.match(/\/emails\/(\d+)\//)?.[1];
                if (pathID && numeric(pathID) !== numeric(emailID)) return;
            } catch (_) { return; }
        }
        if (!guid(deId) || !numeric(emailID) || typeof xhr?.done !== 'function') return;
        const scope = api.context.current().scope, asset = currentAsset();
        const assetId = asset.emailID === numeric(emailID) ? asset.assetId : null;
        // Observe the successful native preview, without issuing it ourselves or reading its records/HTML.
        xhr.done(() => remember(deId, emailID, assetId, scope));
    };
    function firstPage(url, data) {
        for (const key of ['$skip', '$offset', 'offset']) if (Number(url.searchParams.get(key)) > 0) return false;
        const page = url.searchParams.get('$page') ?? url.searchParams.get('page') ?? data.page ?? 1;
        return Number(page) === 1;
    }
    api.ajax.success['/fuelapi/platform-internal/v1/categories/'] = function (data, b, c, options) {
        const url = nativeURL(options), parent = url?.pathname.match(/^\/fuelapi\/platform-internal\/v1\/categories\/(\d+)\/children\/?$/)?.[1];
        if (!parent || virtual(parent) || !Array.isArray(data?.items)) return;
        const root = data.items.find(item => item.categoryType === 'dataextension' && (Number(item.parentId) === 0 || item.isRoot === true));
        if (root) rootId = String(root.id);
        if (rootId !== parent) return;
        // Keep the native page/pageSize/links. Add shortcuts only to page 1,
        // but report the same augmented total on every page of this root.
        const native = data.items.filter(item => !virtual(item.id));
        const previous = data.items.length - native.length;
        data.items = firstPage(url, data) ? [...folders.map(folder => ({ ...folder,
            categoryType: 'dataextension', editable: 0, extendable: 0, hasChildren: false,
            iconType: 'dataextension', parentId: Number(parent), objectId: `sfmcfix-${folder.id}`,
            links: { children: { href: `/v1/categories/${folder.id}/children` } }
        })), ...native] : native;
        if (Number.isFinite(Number(data.count))) data.count = Number(data.count) - previous + folders.length;
    };
    function requestMetadata(id) {
        const old = metadata.get(id);
        if (old && (old.pending || old.until > Date.now())) return old.promise;
        const stamp = generation, scope = api.context.current().scope;
        const controller = new AbortController(), holder = { pending: true };
        let xhr, timer;
        active.add(controller);
        holder.promise = new Promise((resolve, reject) => {
            const fail = status => reject(Object.assign(new Error('Metadati DE non disponibili.'), { status: Number(status) || 502 }));
            controller.signal.addEventListener('abort', () => { try { xhr?.abort?.(); } catch (_) {} fail(0); }, { once: true });
            timer = setTimeout(() => controller.abort(), 8000);
            const path = `/fuelapi/data-internal/v1/customobjects/${id}`, native = api.nativeSession?.client();
            if (native) {
                xhr = native.ajax({ url: path, type: 'GET', dataType: 'json', useFuel2Token: true, timeout: 8000,
                    headers: api.nativeSession.headers(), success: resolve, error: response => fail(response?.status) });
            } else {
                fetch(path, { method: 'GET', credentials: 'same-origin', mode: 'same-origin', redirect: 'error',
                    cache: 'no-store', signal: controller.signal, headers: { Accept: 'application/json' } })
                    .then(response => response.ok ? response.json() : fail(response.status)).then(resolve, reject);
            }
        }).then(value => {
            if (stamp !== generation || scope !== api.context.current().scope) throw Object.assign(new Error('BU cambiata.'), { status: 409 });
            if (guid(value?.id) !== id || typeof value.name !== 'string' || !value.name.trim()) throw Object.assign(new Error('Metadati DE non riconosciuti.'), { status: 502 });
            holder.pending = false; holder.until = Date.now() + 30000;
            return value;
        }).catch(error => { if (metadata.get(id) === holder) metadata.delete(id); throw error; })
            .finally(() => { clearTimeout(timer); active.delete(controller); });
        metadata.set(id, holder);
        if (metadata.size > 200) metadata.delete(metadata.keys().next().value);
        return holder.promise;
    }
    function transport(options, children) {
        const url = nativeURL(options);
        const match = url?.pathname.match(children ? /^\/fuelapi\/platform-internal\/v1\/categories\/(\d+)\/children\/?$/ :
            /^\/fuelapi\/data-internal\/v1\/customobjects\/category\/(\d+)\/?$/);
        if (!match || !virtual(match[1]) || String(options.type || options.method || 'GET').toUpperCase() !== 'GET') return;
        const scope = api.context.current().scope, stamp = generation, asset = currentAsset();
        let cancelled = false;
        return { abort() { cancelled = true; }, send(headers, complete) {
            const response = items => ({ count: items.length, page: 1, pageSize: 25, links: {}, items });
            if (children) { complete(200, 'success', { json: response([]) }, ''); return; }
            const seen = new Set();
            const ids = entries().filter(row => match[1] === '999999990' ||
                (asset.emailID ? row.emailID === asset.emailID : asset.assetId && row.assetId === asset.assetId))
                .filter(row => { if (seen.has(row.deId)) return false; seen.add(row.deId); return true; }).slice(0, 8).map(row => row.deId);
            const stillCurrent = () => !cancelled && stamp === generation && scope === api.context.current().scope &&
                (match[1] === '999999990' || JSON.stringify(asset) === JSON.stringify(currentAsset()));
            Promise.all(ids.map(id => requestMetadata(id).catch(error => {
                if ([404, 410].includes(error.status)) return null;
                throw error;
            }))).then(items => {
                if (stillCurrent()) complete(200, 'success', { json: response(items.filter(Boolean)) }, '');
                else if (!cancelled) complete(409, 'Contesto cambiato', { json: response([]) }, '');
            }, error => { if (!cancelled) complete(error.status || 502, 'Lettura DE recenti non riuscita', { json: response([]) }, ''); });
        } };
    }
    api.ajax.transport['/fuelapi/platform-internal/v1/categories/'] = options => transport(options, true);
    api.ajax.transport['/fuelapi/data-internal/v1/customobjects/category/'] = options => transport(options, false);
    window.addEventListener('sfmcfix:contextchange', () => {
        generation++; rootId = null; metadata.clear();
        for (const controller of active) controller.abort();
        active.clear();
    });
})();
