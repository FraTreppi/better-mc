(function () {
    'use strict';
    const api = window.sfmcfix;
    if (api.codeProject) return;
    const GUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
    let asset;
    let busy = false;
    let generation = 0;
    let xhr;
    const clean = (value, depth = 0) => {
        if (depth > 60) throw Error('La struttura del contenuto è troppo profonda.');
        if (Array.isArray(value)) return value.map(item => clean(item, depth + 1));
        if (!value || typeof value !== 'object') return value;
        return Object.fromEntries(Object.entries(value).filter(([key]) =>
            !/^(?:access_?token|refresh_?token|client_?secret|authorization|cookie|password|__proto__|constructor|prototype)$/i.test(key))
            .map(([key, item]) => [key, clean(item, depth + 1)]));
    };
    function currentAsset() {
        const scope = api.context.current().scope;
        const candidate = api.temp?.lastloadedasset;
        const fragment = api.nativeSession?.backbone?.()?.history?.fragment || location.pathname + location.hash;
        const isEditor = /(?:asset|content|email|editor)/i.test(fragment) && !/(?:^|\/)(?:folder|folders|category|categories)(?:\/|$)/i.test(fragment);
        const same = value => value && new RegExp(`(?:^|/)${Number(value.id)}(?:/|\\?|$)`).test(fragment);
        if (isEditor && Number.isSafeInteger(Number(candidate?.id)) && same(candidate)) asset = { id: Number(candidate.id), scope };
        return isEditor && asset?.scope === scope && same(asset) ? asset : null;
    }
    function describe() {
        if (/^content-builder\./i.test(location.hostname)) {
            const current = currentAsset();
            if (current) return { kind: 'asset', id: current.id, path: '/fuelapi/asset/v1/content/assets/' + current.id };
        }
        const query = location.hash.match(/^#ActivityDetails\/300\/([a-f0-9-]{36})\/?$/i);
        if (/^\/AutomationStudioFuel3(?:\/|$)/i.test(location.pathname) && query && GUID.test(query[1])) {
            return { kind: 'query', id: query[1], path: '/AutomationStudioFuel3/fuelapi/automation/v1/queries/' + query[1] };
        }
        const journey = location.hash.match(/^#\/?([a-f0-9-]{36})(?:\/(\d+))?(?:\/|$)/i);
        if (/^jbinteractions\./i.test(location.hostname) && journey && GUID.test(journey[1])) {
            return { kind: 'journey', id: journey[1], version: journey[2] || null, path: '/fuelapi/interaction/v1/interactions/' + journey[1] + '?extras=all' + (journey[2] ? '&versionNumber=' + journey[2] : '') };
        }
        return null;
    }
    function read(path) {
        const client = api.nativeSession?.client();
        if (!client) throw Error('Attendi il caricamento del modulo e riprova.');
        return new Promise((resolve, reject) => {
            xhr = client.ajax({ url: path, type: 'GET', dataType: 'json', contentType: api.nativeSession.contentType,
                headers: api.nativeSession.headers(), useFuel2Token: true, cache: false, timeout: 30000,
                success: resolve, error: response => reject(Error('Esportazione non disponibile (HTTP ' + (Number(response?.status) || 0) + ').')) });
        });
    }
    async function exportCurrent() {
        if (busy) return;
        const selected = describe();
        if (!selected) throw Error('Apri il dettaglio del contenuto da esportare.');
        busy = true;
        try {
            await api.context.refresh();
            const context = api.context.current();
            const ticket = ++generation;
            const sessionMid = await api.nativeSession.readMid?.();
            const mid = sessionMid || context.mid;
            if (api.nativeSession.readMid && !sessionMid || !/^[1-9]\d{0,14}$/.test(String(mid || '')) || !/^s\d+$/.test(context.stack || '')) throw Error('BU non rilevata. Apri il modulo dal menu Salesforce e verifica il MID prima di esportare.');
            if (ticket !== generation || context.scope !== api.context.current().scope) throw Error('Esportazione interrotta: BU cambiata.');
            const data = await read(selected.path);
            if (ticket !== generation || context.scope !== api.context.current().scope || JSON.stringify(selected) !== JSON.stringify(describe())) throw Error('Esportazione interrotta: contenuto o BU cambiati.');
            const actual = selected.kind === 'asset' ? data?.id : selected.kind === 'query' ? data?.queryDefinitionId : data?.id;
            if (String(actual).toLowerCase() !== String(selected.id).toLowerCase()) throw Error('La risposta non corrisponde al contenuto aperto.');
            if (selected.version && Number(data.version ?? data.versionNumber) !== Number(selected.version)) throw Error('La risposta non corrisponde alla versione del Journey aperta.');
            if (sessionMid && String(await api.nativeSession.readMid()) !== String(sessionMid)) throw Error('Esportazione interrotta: BU cambiata.');
            if (ticket !== generation || context.scope !== api.context.current().scope) throw Error('Esportazione interrotta: BU cambiata.');
            const kind = selected.kind === 'asset' && [205, 246, 247].includes(Number(data.assetType?.id)) ? 'cloudpage' : selected.kind;
            const snapshot = { format: 'sfmc-git-export-v1', exportedAt: new Date().toISOString(), source: 'saved-in-salesforce',
                context: { stack: context.stack, mid: String(mid) }, items: [{ kind, id: String(actual) + (kind === 'journey' ? '.v' + (data.version ?? data.versionNumber ?? '') : ''), data: clean(data) }] };
            const text = JSON.stringify(snapshot, null, 2);
            if (text.length > 20 * 1024 * 1024) throw Error('Il contenuto supera 20 MB. Usa il backup del progetto locale.');
            const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
            const link = document.createElement('a');
            link.href = url; link.download = 'sfmc-git-' + kind + '-' + String(actual) + '.json';
            link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
            return snapshot;
        } finally { busy = false; xhr = null; }
    }
    const button = document.createElement('button');
    button.id = 'sfmcfix-export-git'; button.type = 'button'; button.textContent = 'Esporta per Git';
    button.title = 'Scarica il contenuto salvato in Salesforce per il progetto locale. Le modifiche non salvate nell’editor sono escluse.';
    button.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:997;padding:8px 12px;border:1px solid #b5c8da;border-radius:4px;background:white;color:#145b92;cursor:pointer';
    button.hidden = true;
    document.body.append(button);
    const status = document.createElement('span');
    status.setAttribute('role', 'status'); status.style.cssText = 'position:fixed;right:16px;bottom:58px;z-index:997;max-width:420px;background:white;color:#243746;font:13px Arial,sans-serif';
    document.body.append(status);
    button.onclick = async () => {
        button.disabled = true; status.textContent = 'Esportazione del contenuto salvato…';
        try { await exportCurrent(); status.textContent = 'File pronto. Nel progetto locale usa il comando import per estrarre codice e documentazione.'; }
        catch (error) { status.textContent = error.message; }
        finally { button.disabled = false; }
    };
    const sync = () => { button.hidden = !describe(); };
    const changed = () => { generation++; asset = null; try { xhr?.abort?.(); } catch (_) {} status.textContent = ''; sync(); };
    window.addEventListener('hashchange', changed);
    window.addEventListener('sfmcfix:contextchange', changed);
    window.addEventListener('sfmcfix:asset-loaded', () => requestAnimationFrame(sync));
    window.addEventListener('pagehide', changed, { once: true });
    sync();
    api.codeProject = { exportCurrent, describe };
})();
