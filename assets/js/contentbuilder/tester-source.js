(function () {
    'use strict';
    const api = window.sfmcfix;
    const name = 'tester_content_builder';
    const folder = 'SFMC_UI_Fixer';
    const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const emailPattern = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;
    let cache = null;
    let pending = null;
    let controller = null;
    let expiry = null;

    function invalidate() {
        cache = null;
        clearTimeout(expiry);
        expiry = null;
        controller?.abort();
        controller = null;
        pending = null;
    }
    window.addEventListener('sfmcfix:contextchange', invalidate);
    let source = api.preferences.get().testerSource;
    window.addEventListener('sfmcfix:preferences', () => {
        const next = api.preferences.get().testerSource;
        if (next !== source) { source = next; invalidate(); }
    });

    async function load(context, request) {
        function checkContext() {
            if (request.signal.aborted || context.scope !== api.context.current().scope) {
                throw new Error('Caricamento interrotto: la BU è cambiata o la richiesta è scaduta. Riprova.');
            }
        }
        async function get(path) {
            checkContext();
            // Only relative, same-origin Salesforce reads. No extension proxy,
            // caller-supplied URLs, credentials, tokens or cross-stack requests.
            let response;
            try {
                response = await fetch(path, { method: 'GET', credentials: 'same-origin', mode: 'same-origin',
                    cache: 'no-store', redirect: 'error', signal: request.signal, headers: { Accept: 'application/json' } });
            } catch (_) {
                checkContext();
                throw new Error('Lettura DE non disponibile in Content Builder. Verifica la sessione e i permessi sui record.');
            }
            checkContext();
            if (!response.ok) throw new Error(`Lettura DE non riuscita (HTTP ${response.status}). Verifica sessione e permessi nella BU corrente.`);
            let value;
            try { value = await response.json(); } catch (_) { throw new Error('Risposta Salesforce non riconosciuta durante la lettura della DE.'); }
            checkContext();
            return value;
        }
        async function pages(path, pageSize, limit) {
            const result = [];
            for (let page = 1; page <= 10; page++) {
                const data = await get(`${path}${path.includes('?') ? '&' : '?'}$page=${page}&$pagesize=${pageSize}`);
                if (!Array.isArray(data?.items)) throw new Error('Elenco Salesforce non riconosciuto. Nessun contatto caricato.');
                const count = data.count == null ? null : Number(data.count);
                if (count !== null && (!Number.isInteger(count) || count < 0)) throw new Error('Conteggio Salesforce non valido.');
                if ((count !== null && count > limit) || result.length + data.items.length > limit) {
                    throw new Error(`La lettura supera il limite di ${limit} record. Riduci la rubrica e riprova.`);
                }
                result.push(...data.items);
                if (count !== null ? result.length >= count : data.items.length < pageSize) return result;
                if (!data.items.length) throw new Error('Elenco Salesforce incompleto. Premi Verifica e carica DE per riprovare.');
            }
            throw new Error('Troppe pagine di risultati. Nessuna rubrica parziale viene utilizzata.');
        }

        const candidates = (await pages(`/fuelapi/data-internal/v1/customobjects/category/0?retrievalType=1&includeFullPath=true&name=${name}`, 100, 1000))
            .filter(item => item?.name === name && (item.customerKey ?? item.key) === name);
        const unique = Array.from(new Map(candidates.map(item => [item.id, item])).values());
        if (unique.length !== 1 || !guid.test(unique[0]?.id || '')) {
            throw new Error(`Serve una sola DE con Nome ed External Key entrambi “${name}”, nella BU corrente.`);
        }
        const de = unique[0];
        if (!/^\d+$/.test(String(de.categoryId))) throw new Error('Cartella della DE non riconosciuta.');
        const path = await get(`/fuelapi/platform-internal/v1/categories/${de.categoryId}/fullPath?$pageSize=50`);
        const folders = path?.items;
        // The standard folder must be a direct child of the local DE root.
        // A similarly named nested/shared folder must never be used silently.
        if (!Array.isArray(folders) || folders.length !== 2 || folders[1]?.name !== folder ||
            String(folders[1]?.id) !== String(de.categoryId) ||
            String(folders[1]?.parentId) !== String(folders[0]?.id) ||
            String(folders[0]?.categoryType).toLowerCase() !== 'dataextension' ||
            !(Number(folders[0]?.parentId) === 0 || folders[0]?.isRoot === true)) {
            throw new Error(`Sposta la DE in Data Extensions → ${folder}, direttamente sotto la radice locale della BU.`);
        }
        const schema = await get(`/fuelapi/internal/v1/customobjects/${de.id}/fields/`);
        const fields = Array.isArray(schema?.fields) ? schema.fields : schema?.items;
        const field = key => Array.isArray(fields) ? fields.find(item => item?.name === key) : null;
        if (field('Nome')?.type !== 'Text' || field('Cognome')?.type !== 'Text' || field('Email')?.type !== 'EmailAddress' ||
            ![true, 1].includes(field('Email')?.isPrimaryKey)) {
            throw new Error('Campi richiesti: Nome (Text), Cognome (Text), Email (EmailAddress, Primary Key). Usa esattamente questi nomi.');
        }
        // Endpoint and flat item shape used by the native DE records collection.
        const records = await pages(`/fuelapi/internal/v1/customObjectData/${de.id}/`, 200, 1000);
        const contacts = new Map();
        let invalid = 0;
        for (const row of records) {
            if (!row || typeof row.Email !== 'string' || !emailPattern.test(row.Email.trim()) || row.Email.trim().length > 254 ||
                ![row.Nome, row.Cognome].every(value => value == null || (typeof value === 'string' && value.length <= 250))) {
                invalid++;
                continue;
            }
            const email = row.Email.trim();
            contacts.set(email.toLowerCase(), [(row.Cognome || '').trim(), (row.Nome || '').trim(), email]);
        }
        checkContext();
        return { testers: Array.from(contacts.values()), invalid, id: de.id, scope: context.scope, loaded: Date.now() };
    }

    api.testerSource = {
        name, folder,
        async list({ source = api.preferences.get().testerSource, refresh = false } = {}) {
            if (source !== 'de') return { testers: api.preferences.get().testers || [], invalid: 0 };
            const context = api.context.current();
            if (!context.persistent) throw new Error('Conferma il MID della BU corrente prima di leggere la DE.');
            if (refresh) invalidate();
            if (cache?.scope === context.scope && Date.now() - cache.loaded < 5 * 60 * 1000) return cache;
            if (pending?.scope === context.scope) return pending.promise;
            invalidate();
            const request = new AbortController();
            controller = request;
            const timeout = setTimeout(() => request.abort(), 25000);
            const promise = load(context, request).then(value => {
                if (controller === request && context.scope === api.context.current().scope) {
                    cache = value;
                    expiry = setTimeout(() => { if (cache === value) cache = null; }, 5 * 60 * 1000);
                }
                return value;
            }).finally(() => {
                clearTimeout(timeout);
                if (controller === request) { controller = null; pending = null; }
            });
            pending = { scope: context.scope, promise };
            return promise;
        }
    };
})();
