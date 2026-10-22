(function () {
    'use strict';
    const api = window.sfmcfix;
    const guid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
    let active = null;
    let state = { busy: false, completed: 0, total: null, message: '' };
    function context() {
        const match = location.hash.match(new RegExp('^#admin/data-extension/(' + guid + ')/records(?:/|$)', 'i'));
        return match ? { id: match[1].toLowerCase(), scope: api.context.current().scope } : null;
    }
    function publish(patch) {
        state = { ...state, ...patch };
        window.dispatchEvent(new Event('sfmcfix:de-csv-export'));
    }
    function cancel(message = 'Esportazione annullata.') {
        if (!active) return;
        active.reason = message;
        active.controller.abort();
    }
    function check(job) {
        const now = context();
        if (active !== job || job.controller.signal.aborted) throw new Error(job.reason || 'Esportazione interrotta.');
        if (now?.id !== job.id || now.scope !== job.scope) {
            cancel('Esportazione annullata: hai cambiato Data Extension o BU.');
            throw new Error(job.reason);
        }
    }
    function delay(ms, signal) {
        return new Promise((resolve, reject) => {
            const stopped = () => { clearTimeout(timer); reject(new Error('Esportazione annullata.')); };
            const timer = setTimeout(() => { signal.removeEventListener('abort', stopped); resolve(); }, ms);
            signal.addEventListener('abort', stopped, { once: true });
            if (signal.aborted) stopped();
        });
    }
    async function get(job, path) {
        for (let attempt = 0; attempt < 3; attempt++) {
            check(job);
            const controller = new AbortController();
            const stop = () => controller.abort();
            job.controller.signal.addEventListener('abort', stop, { once: true });
            const timer = setTimeout(stop, 30000);
            let wait = 500 * 2 ** attempt;
            try {
                const response = await fetch(path, { method: 'GET', mode: 'same-origin', credentials: 'same-origin',
                    cache: 'no-store', redirect: 'error', signal: controller.signal, headers: { Accept: 'application/json' } });
                check(job);
                if (response.ok) {
                    const data = await response.json();
                    check(job);
                    return data;
                }
                if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 2) {
                    throw Object.assign(new Error(`Lettura DE non riuscita (HTTP ${response.status}). Verifica sessione e permessi; nessun CSV parziale è stato scaricato.`), { definitive: true });
                }
                const after = response.headers.get('Retry-After');
                if (after !== null) {
                    const seconds = Number(after);
                    const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(after) - Date.now();
                    if (Number.isFinite(ms)) wait = Math.min(30000, Math.max(0, ms));
                }
            } catch (error) {
                check(job);
                if (error.definitive) throw error;
                if (attempt === 2) throw new Error('Lettura DE interrotta o risposta non valida. Riprova con la sessione Salesforce attiva; nessun CSV parziale è stato scaricato.');
            } finally {
                clearTimeout(timer);
                job.controller.signal.removeEventListener('abort', stop);
            }
            await delay(wait, job.controller.signal);
        }
    }
    function schema(data) {
        const fields = data?.fields;
        if (!Array.isArray(fields) || !fields.length || fields.some(field => typeof field?.name !== 'string' || !field.name)) {
            throw new Error('Schema della DE non riconosciuto. Nessun CSV è stato scaricato.');
        }
        const keys = fields.map(field => field.name.toLowerCase());
        if (new Set(keys).size !== fields.length) throw new Error('Nomi dei campi ambigui nella DE.');
        return fields.map(field => ({ name: field.name, key: field.name.toLowerCase(), type: field.type,
            primary: field.isPrimaryKey === true || field.isPrimaryKey === 1 }));
    }
    function count(data) {
        const result = typeof data?.count === 'string' && /^\d+$/.test(data.count) ? Number(data.count) : data?.count;
        if (!Number.isSafeInteger(result) || result < 0 || !Array.isArray(data?.items)) throw new Error('Conteggio o record della DE non riconosciuti.');
        return result;
    }
    function csv(value) {
        let text = String(value ?? '');
        if (/^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = "'" + text;
        return `"${text.replaceAll('"', '""')}"`;
    }
    function encode(job, data, page, expected) {
        check(job);
        if (count(data) !== job.total) throw new Error('Il numero di record della DE è cambiato durante la lettura. Riprova quando i dati sono stabili.');
        if (data.page != null && Number(data.page) !== page) throw new Error('Salesforce non ha restituito la pagina richiesta. Esportazione interrotta.');
        if (data.items.length !== expected) throw new Error('Pagina DE incompleta: il CSV non è stato scaricato. Riprova senza modificare i dati durante la lettura.');
        const lines = [];
        for (const row of data.items) {
            if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('Formato dei record DE non riconosciuto.');
            const values = new Map();
            for (const [name, value] of Object.entries(row)) {
                const key = name.toLowerCase();
                if (!job.columns.has(key) || values.has(key)) throw new Error('I campi restituiti non corrispondono allo schema della DE. Riprova dopo aver verificato lo schema.');
                if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) throw new Error('Valore DE non riconosciuto: esportazione interrotta.');
                values.set(key, value);
            }
            if (job.primary.length) {
                const key = JSON.stringify(job.primary.map(field => {
                    const value = values.get(field.key);
                    if (value == null) throw new Error('Chiave primaria mancante in un record della DE.');
                    return String(value);
                }));
                if (job.keys.has(key)) throw new Error('Record ripetuti tra le pagine: la DE potrebbe essere cambiata durante la lettura. Esportazione interrotta.');
                job.keys.add(key);
            }
            lines.push(job.fields.map(field => csv(values.get(field.key))).join('|') + '\r\n');
        }
        // Retain encoded page Blobs, never all 100,000 JSON rows or one giant
        // joined string. Each worker holds at most one response page at a time.
        job.parts[page] = new Blob(lines, { type: 'text/csv;charset=utf-8' });
        job.completed += data.items.length;
        publish({ completed: job.completed, total: job.total, message: `Letti ${job.completed.toLocaleString('it-IT')} / ${job.total.toLocaleString('it-IT')} record…` });
    }
    async function run(job) {
        const base = `/contactsmeta/fuelapi/internal/v1/customobjects/${job.id}/fields/`;
        const records = (page, size) => `/contactsmeta/fuelapi/internal/v1/CustomObjectData/${job.id}/?$page=${page}&$pagesize=${size}`;
        try {
            job.fields = schema(await get(job, base));
            job.columns = new Set(job.fields.map(field => field.key));
            job.primary = job.fields.filter(field => field.primary);
            const first = await get(job, records(1, 200));
            job.total = count(first);
            if (job.total > 0 && !first.items.length) throw new Error('Salesforce indica record presenti ma non restituisce la prima pagina.');
            if (first.items.length > job.total) throw new Error('Conteggio DE incoerente.');
            const size = first.items.length || 200;
            job.parts[0] = new Blob(['\ufeff', job.fields.map(field => csv(field.name)).join('|') + '\r\n']);
            encode(job, first, 1, Math.min(size, job.total));
            const pages = Math.ceil(job.total / size);
            let next = 2;
            async function worker() {
                while (next <= pages) {
                    check(job);
                    const page = next++;
                    const data = await get(job, records(page, size));
                    encode(job, data, page, Math.min(size, job.total - (page - 1) * size));
                }
            }
            await Promise.all(Array.from({ length: Math.min(3, Math.max(0, pages - 1)) }, worker));
            check(job);
            publish({ message: 'Verifica finale dei record e preparazione CSV…' });
            const finalFields = schema(await get(job, base));
            if (JSON.stringify(finalFields) !== JSON.stringify(job.fields) || count(await get(job, records(1, 1))) !== job.total || job.completed !== job.total) {
                throw new Error('La DE è cambiata durante l’esportazione. Riprova quando i dati sono stabili.');
            }
            check(job);
            const file = new Blob(job.parts, { type: 'text/csv;charset=utf-8' });
            const url = URL.createObjectURL(file);
            const anchor = document.createElement('a');
            const filename = `dataextension-${job.id}-all-${job.total}-records-${Date.now()}.csv`;
            anchor.href = url;
            anchor.download = filename;
            anchor.hidden = true;
            document.body.appendChild(anchor);
            try { anchor.click(); }
            finally { anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000); }
            publish({ busy: false, message: `Download CSV avviato: ${job.total.toLocaleString('it-IT')} record.` });
            return { completed: job.total, filename };
        } catch (error) {
            job.controller.abort();
            const message = job.reason || error.message || 'Esportazione non riuscita.';
            publish({ busy: false, message });
            throw new Error(message);
        } finally {
            job.parts.length = 0;
            job.keys.clear();
            if (active === job) active = null;
        }
    }
    api.deCsvExport = {
        getState: () => ({ ...state }),
        cancel: () => cancel(),
        start() {
            if (active) return active.promise;
            const current = context();
            if (!current) return Promise.reject(new Error('Apri i Records della Data Extension da esportare.'));
            const job = { ...current, controller: new AbortController(), parts: [], keys: new Set(), completed: 0 };
            active = job;
            publish({ id: job.id, scope: job.scope, busy: true, completed: 0, total: null, message: 'Lettura di tutti i record della Data Extension…' });
            job.promise = run(job);
            return job.promise;
        }
    };
    for (const event of ['hashchange', 'sfmcfix:contextchange']) window.addEventListener(event, () => {
        if (active) { try { check(active); } catch (_) { /* In-flight reads stop via AbortController. */ } }
    });
})();
