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
    const preferencesKey = () => api.preferences.get().testerSource;
    let source = preferencesKey();
    window.addEventListener('sfmcfix:preferences', () => {
        const next = preferencesKey();
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
        // Locate the exact DE globally, then discover and validate its real
        // folder chain. Previous manually saved paths never constrain discovery.
        if (!Array.isArray(folders) || folders.length < 2 || folders.length > 21 || folders.at(-1)?.name !== folder ||
            String(folders.at(-1)?.id) !== String(de.categoryId) ||
            String(folders[0]?.categoryType).toLowerCase() !== 'dataextension' ||
            !(Number(folders[0]?.parentId) === 0 || folders[0]?.isRoot === true) ||
            new Set(folders.map(item => String(item?.id))).size !== folders.length ||
            folders.some(item => !/^\d+$/.test(String(item?.id)) || (item.categoryType && String(item.categoryType).toLowerCase() !== 'dataextension')) ||
            folders.slice(1).some((item, index) => typeof item.name !== 'string' || !item.name.trim() || item.name.length > 250 ||
                /[\x00-\x1f\x7f]/.test(item.name) || String(item.parentId) !== String(folders[index]?.id))) {
            throw new Error(`La DE ${name} deve trovarsi nella cartella ${folder}, anche in sottocartelle di Data Extensions della BU corrente.`);
        }
        const folderPath = folders.slice(1).map(item => item.name);
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
        const invalidReasons = { missingEmail: 0, invalidEmail: 0, invalidNames: 0, ambiguousFields: 0, invalidFormat: 0 };
        // Metadata preserves the declared names, while record endpoints can
        // lowercase them. Rowsets can also split the PK and other attributes
        // into keys/values. Read only these three fields, without guessing or
        // recursively searching unrelated metadata for an email address.
        function values(row) {
            if (!row || typeof row !== 'object' || Array.isArray(row)) return { issue: 'invalidFormat' };
            const result = new Map();
            let ambiguous = false;
            function collect(part) {
                for (const [key, value] of Object.entries(part)) {
                    const field = key.toLowerCase();
                    if (!['email', 'nome', 'cognome'].includes(field)) continue;
                    if (result.has(field) && result.get(field) !== value) ambiguous = true;
                    result.set(field, value);
                }
            }
            collect(row);
            for (const [key, part] of Object.entries(row)) {
                if (['keys', 'values'].includes(key.toLowerCase()) && part && typeof part === 'object' && !Array.isArray(part)) collect(part);
            }
            if (ambiguous) return { issue: 'ambiguousFields' };
            if (!result.has('email')) return { issue: 'missingEmail' };
            const email = result.get('email');
            if (typeof email !== 'string' || !emailPattern.test(email.trim()) || email.trim().length > 254) return { issue: 'invalidEmail' };
            const first = result.get('nome'), last = result.get('cognome');
            if (![first, last].every(value => value == null || (typeof value === 'string' && value.length <= 4000))) return { issue: 'invalidNames' };
            return { email: email.trim(), tester: [(last || '').trim(), (first || '').trim(), email.trim()] };
        }
        for (const row of records) {
            const entry = values(row);
            if (entry.issue) invalidReasons[entry.issue]++;
            else contacts.set(entry.email.toLowerCase(), entry.tester);
        }
        const invalid = Object.values(invalidReasons).reduce((sum, count) => sum + count, 0);
        checkContext();
        return { testers: Array.from(contacts.values()), invalid, invalidReasons, id: de.id, folderPath, scope: context.scope, loaded: Date.now() };
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
