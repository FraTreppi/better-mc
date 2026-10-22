(function () {
    'use strict';
    const api = window.sfmcfix;
    if (api.assetSearch) return;
    const types = {
        all: { label: 'Tutti i tipi', ids: [] },
        email: { label: 'Email', ids: [5, 207, 208, 209] },
        template: { label: 'Template', ids: [4, 206, 214, 231, 235] },
        block: { label: 'Blocchi di contenuto', ids: [3, ...Array.from({ length: 9 }, (_, i) => 195 + i), ...Array.from({ length: 4 }, (_, i) => 210 + i), ...Array.from({ length: 15 }, (_, i) => 215 + i), 232, 233, 234] },
        image: { label: 'Immagini', ids: [8, ...Array.from({ length: 24 }, (_, i) => 16 + i)] },
        document: { label: 'Documenti', ids: [11, ...Array.from({ length: 43 }, (_, i) => 101 + i)] }
    };
    let searchJob = null, folderJob = null, folderCache = null;
    const diagnostics = new Map();
    const contentType = 'application/json;charset=utf-8;datekind=local';
    const headers = () => api.nativeSession?.headers() || { Accept: 'application/json', 'Content-Type': contentType,
        'x-fueldata-version': '1.1', 'X-Requested-With': 'XMLHttpRequest' };
    function nativeClient() {
        return api.nativeSession?.client() || (typeof window.Fuel?.ajax === 'function' ? { kind: 'Fuel', ajax: options => window.Fuel.ajax(options) } : null);
    }
    const abortError = () => Object.assign(new Error('Ricerca interrotta.'), { name: 'AbortError' });
    function check(job) {
        if (job.controller.signal.aborted || job.scope !== api.context.current().scope) throw abortError();
    }
    function job() { return { scope: api.context.current().scope, controller: new AbortController() }; }
    function nativeRequest(client, path, options, current) {
        return new Promise((resolve, reject) => {
            let xhr;
            const abort = () => {
                try { xhr?.abort?.(); } catch (_) { /* Still reject if the native client cannot abort. */ }
                reject(abortError());
            };
            const complete = response => { current.controller.signal.removeEventListener('abort', abort); resolve(response); };
            current.controller.signal.addEventListener('abort', abort, { once: true });
            try {
                // Let the native Fuel client supply its own session headers.
                // Never read, persist or expose Salesforce access tokens.
                xhr = client.ajax({ url: path, type: options.method, data: options.body, processData: false,
                    contentType, headers: headers(), dataType: 'json',
                    useFuel2Token: true, cache: false, timeout: 30000,
                    success: data => complete({ ok: true, json: async () => data }),
                    error: response => complete({ ok: false, status: Number(response?.status) || 0 }) });
                if (current.controller.signal.aborted) abort();
            } catch (error) { current.controller.signal.removeEventListener('abort', abort); reject(error); }
        });
    }
    async function request(path, options, current) {
        check(current);
        const client = nativeClient();
        const record = { path: path.split('?')[0], method: options.method, scope: 'ours', transport: client?.kind || 'fetch', status: null };
        diagnostics.set(record.path, record);
        const timer = setTimeout(() => current.controller.abort(), 30000);
        try {
            const response = client ? await nativeRequest(client, path, options, current) : await fetch(path, { ...options, signal: current.controller.signal,
                mode: 'same-origin', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
                headers: headers() });
            check(current);
            record.status = response.ok ? 200 : Number(response.status) || 0;
            if (!response.ok) {
                const detail = response.status === 429 ? 'Attendi qualche secondo prima di riprovare.' : response.status === 403 ?
                    'Salesforce ha rifiutato la richiesta della sessione attiva. Inserire il MID manualmente non concede l’accesso. Riapri Content Builder dal menu Salesforce e riprova; se persiste, scarica la diagnostica.' :
                    'Verifica la sessione e i permessi della BU corrente.';
                throw new Error(`Ricerca Content Builder non disponibile (HTTP ${response.status}). ${detail}`);
            }
            const data = await response.json(); check(current);
            return data;
        } catch (error) {
            if (current.controller.signal.aborted && current.scope === api.context.current().scope && !current.cancelled) {
                throw new Error('Salesforce non ha completato la ricerca entro 30 secondi. Riprova con filtri più precisi.');
            }
            check(current);
            if (error.message.startsWith('Ricerca Content Builder')) throw error;
            throw new Error('Risposta Content Builder non disponibile o non riconosciuta. Riprova con la sessione Salesforce attiva.');
        } finally { clearTimeout(timer); }
    }
    function cancelJob(current) { if (current) { current.cancelled = true; current.controller.abort(); } }
    function numeric(value, label) {
        if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) throw new Error(`${label} non valido.`);
        return Number(value);
    }
    const termFilter = (property, simpleOperator, value) => ({ property, simpleOperator, value });
    function date(value) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value + 'T00:00:00Z')) ||
            new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !== value) throw new Error('Data non valida.');
        return value + 'T00:00:00.000Z';
    }
    function query(filters, page) {
        const field = filters.field || 'both', mode = filters.mode || 'contains', type = filters.type || 'all';
        const term = String(filters.term || '').trim();
        if (!['both', 'name', 'customerKey', 'id'].includes(field) || !['contains', 'start', 'end', 'equal'].includes(mode) || !Object.hasOwn(types, type)) throw new Error('Filtro di ricerca non valido.');
        if (term.length > 250) throw new Error('Il testo di ricerca può contenere al massimo 250 caratteri.');
        if (term && field !== 'id' && mode !== 'equal' && term.length < 3) throw new Error('Inserisci almeno tre caratteri oppure scegli “Uguale a”.');
        const terms = [];
        if (term) {
            if (field === 'id') terms.push(termFilter('id', 'equal', numeric(term, 'ID asset')));
            else {
                const value = mode === 'end' ? '%' + term : mode === 'start' ? term + '%' : term;
                const filter = property => termFilter(property, mode === 'equal' ? 'equal' : mode === 'contains' ? 'contains' : 'like', value);
                terms.push(field === 'both' ? { leftOperand: filter('name'), logicalOperator: 'OR', rightOperand: filter('customerKey') } : filter(field));
            }
        }
        if (types[type].ids.length) terms.push({ property: 'assetType.id', simpleOperator: 'in', values: types[type].ids });
        if (filters.folder) terms.push(termFilter('category.id', 'equal', numeric(filters.folder, 'Cartella')));
        if (filters.from) terms.push(termFilter('modifiedDate', 'greaterThanOrEqual', date(filters.from)));
        if (filters.to) {
            const until = new Date(date(filters.to)); until.setUTCDate(until.getUTCDate() + 1);
            terms.push(termFilter('modifiedDate', 'lessThan', until.toISOString()));
        }
        if (filters.from && filters.to && filters.from > filters.to) throw new Error('La data iniziale deve precedere o coincidere con quella finale.');
        const sort = filters.sort || 'modified';
        if (!['modified', 'name', 'created'].includes(sort)) throw new Error('Ordinamento non valido.');
        return { page: { page: numeric(page, 'Pagina'), pageSize: 50 },
            query: terms.length ? terms.reduce((leftOperand, rightOperand) => ({ leftOperand, logicalOperator: 'AND', rightOperand })) : termFilter('id', 'greaterThan', 0),
            sort: [{ property: sort === 'name' ? 'name' : sort === 'created' ? 'createdDate' : 'modifiedDate', direction: sort === 'name' ? 'ASC' : 'DESC' }, { property: 'id', direction: 'ASC' }],
            fields: ['id', 'name', 'customerKey', 'assetType', 'category', 'createdDate', 'modifiedDate'] };
    }
    function collection(data, requestedPage, maximum) {
        if (!Array.isArray(data?.items) || data.items.length > maximum) throw new Error('Elenco Content Builder non riconosciuto.');
        const count = Number(data.count), page = Number(data.page ?? requestedPage), size = Number(data.pageSize ?? maximum);
        if (!Number.isSafeInteger(count) || count < 0 || page !== requestedPage || !Number.isSafeInteger(size) || size < 1 || size > maximum || data.items.length > size ||
            (count === 0 && data.items.length) || (count > (page - 1) * size && !data.items.length)) throw new Error('Paginazione Content Builder non riconosciuta. Riprova la ricerca.');
        return { items: data.items, count, page, pageSize: size };
    }
    async function search(filters, page = 1) {
        const payload = query(filters, page); // Validate before replacing a valid job.
        cancelJob(searchJob);
        const current = searchJob = job();
        try {
            if (api.context.refresh) await api.context.refresh();
            check(current);
            // POST /query only reads metadata; no asset create/update/delete endpoint.
            const raw = await request('/fuelapi/asset/v1/content/assets/query?scope=ours', { method: 'POST', body: JSON.stringify(payload) }, current);
            const result = collection(raw, page, 50), ids = new Set();
            result.items = result.items.map(asset => {
                const id = numeric(asset?.id, 'ID asset');
                if (ids.has(id) || typeof asset.name !== 'string' || !asset.assetType || !Number.isSafeInteger(Number(asset.assetType.id))) throw new Error('Metadati degli asset non riconosciuti. Riprova la ricerca.');
                ids.add(id);
                return { id, name: asset.name.slice(0, 4000), customerKey: typeof asset.customerKey === 'string' ? asset.customerKey.slice(0, 4000) : '',
                    typeId: Number(asset.assetType.id), type: String(asset.assetType.displayName || asset.assetType.name || asset.assetType.id).slice(0, 250),
                    folderId: /^\d+$/.test(String(asset.category?.id)) ? Number(asset.category.id) : null,
                    folder: typeof asset.category?.name === 'string' ? asset.category.name.slice(0, 4000) : '',
                    modified: typeof asset.modifiedDate === 'string' ? asset.modifiedDate.slice(0, 100) : '' };
            });
            check(current);
            return result;
        } finally { if (searchJob === current) searchJob = null; }
    }
    async function folders() {
        const scope = api.context.current().scope;
        if (folderCache?.scope === scope && Date.now() < folderCache.until) return folderCache.items;
        if (folderJob?.scope === scope) return folderJob.promise;
        cancelJob(folderJob);
        const current = folderJob = job();
        current.promise = (async () => {
            const items = [], ids = new Set();
            for (let page = 1; page <= 40; page++) {
                const data = collection(await request(`/fuelapi/asset/v1/content/categories?scope=ours&$page=${page}&$pageSize=200&$orderBy=id%20ASC`, { method: 'GET' }, current), page, 200);
                if (data.count > 2000) throw new Error('Più di 2000 cartelle: usa la ricerca su tutte le cartelle; il filtro e i percorsi completi non sono disponibili.');
                for (const folder of data.items) {
                    const id = numeric(folder?.id, 'Cartella');
                    if (ids.has(id) || typeof folder.name !== 'string' || !/^\d+$/.test(String(folder.parentId))) throw new Error('Struttura cartelle non riconosciuta.');
                    ids.add(id); items.push({ id, parentId: Number(folder.parentId), name: folder.name.slice(0, 4000) });
                }
                if (page * data.pageSize >= data.count) {
                    check(current);
                    folderCache = { scope, until: Date.now() + 300000, items };
                    return items;
                }
            }
            throw new Error('Elenco cartelle incompleto. Usa la ricerca su tutte le cartelle.');
        })();
        try { return await current.promise; } finally { if (folderJob === current) folderJob = null; }
    }
    function cancelSearch() { cancelJob(searchJob); searchJob = null; }
    function cancel() { cancelSearch(); cancelJob(folderJob); folderJob = null; }
    window.addEventListener('sfmcfix:contextchange', () => { cancel(); folderCache = null; diagnostics.clear(); });
    api.assetSearch = { search, folders, cancel, cancelSearch, types, diagnostics: () => ({
        feature: 'content-builder-search', version: '1.1.20', date: new Date().toISOString(),
        context: { source: api.context.current().source || 'unknown', midDetected: Boolean(api.context.current().mid) },
        requests: Array.from(diagnostics.values(), record => ({ ...record })), headerNames: Object.keys(headers())
    }) };
})();
