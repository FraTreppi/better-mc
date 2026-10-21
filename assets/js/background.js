// Service worker: unico proprietario di chrome.storage.local per tutta l'estensione.
// Tutte le mutazioni passano da qui e vengono serializzate in una coda,
// così il read-modify-write del merge è atomico e non ci sono race tra frame/tab.

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// merge profondo: gli oggetti si fondono ricorsivamente, tutto il resto
// (array, primitivi) viene sostituito. Un valore undefined elimina la chiave.
function deepMerge(target, source) {
    const out = isPlainObject(target) ? { ...target } : {};
    for (const key of Object.keys(source)) {
        if (['__proto__', 'constructor', 'prototype'].includes(key)) continue;
        const sv = source[key];
        if (sv === undefined) { delete out[key]; continue; }
        out[key] = (isPlainObject(sv) && isPlainObject(out[key])) ? deepMerge(out[key], sv) : sv;
    }
    return out;
}

// coda globale: serializza le scritture per garantire l'atomicità del read-modify-write
let writeChain = Promise.resolve();
function enqueue(task) {
    const run = writeChain.then(task, task);
    writeChain = run.then(() => {}, () => {});
    return run;
}

const getLocal = (keys) => new Promise((res, rej) =>
    chrome.storage.local.get(keys, (items) =>
        chrome.runtime.lastError ? rej(chrome.runtime.lastError) : res(items)));
const setLocal = (items) => new Promise((res, rej) =>
    chrome.storage.local.set(items, () =>
        chrome.runtime.lastError ? rej(chrome.runtime.lastError) : res(true)));
const removeLocal = (keys) => new Promise((res, rej) =>
    chrome.storage.local.remove(keys, () =>
        chrome.runtime.lastError ? rej(chrome.runtime.lastError) : res(true)));
const clearLocal = () => new Promise((res, rej) =>
    chrome.storage.local.clear(() =>
        chrome.runtime.lastError ? rej(chrome.runtime.lastError) : res(true)));

async function handle(action, payload) {
    switch (action) {
        case 'get':
            return await getLocal(payload?.keys ?? null);
        case 'set':
            return await enqueue(() => setLocal(payload?.items || {}));
        case 'merge':
            return await enqueue(async () => {
                const items = payload?.items || {};
                const keys = Object.keys(items);
                const current = await getLocal(keys);          // leggi
                const next = {};
                for (const k of keys) {                        // fondi
                    next[k] = isPlainObject(items[k]) ? deepMerge(current[k], items[k]) : items[k];
                }
                await setLocal(next);                          // scrivi
                return next;
            });
        case 'remove':
            return await enqueue(() => removeLocal(payload?.keys || []));
        case 'clear':
            return await enqueue(() => clearLocal());
        case 'deleteVersions':
            return await enqueue(async () => {
                const entries = payload?.entries || [];
                const buckets = [...new Set(entries.map(entry => entry.bucket))];
                if (buckets.some(key => key !== 'SFMCFIX---ACTIVITYVERSIONING' &&
                    !/^SFMCFIX:v2:.+:SFMCFIX---ACTIVITYVERSIONING$/.test(key))) throw new Error('Archivio versioni non valido');
                const data = await getLocal(buckets);
                for (const { bucket, key } of entries) {
                    if (data[bucket]) delete data[bucket][key];
                }
                await setLocal(data);
                return true;
            });
        default:
            throw new Error(`azione storage sconosciuta: ${action}`);
    }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || !msg.__sfmcfixStorage) return; // non è roba nostra
    handle(msg.action, msg.payload)
        .then((result) => sendResponse({ ok: true, result }))
        .catch((e) => sendResponse({ ok: false, error: (e && e.message) || String(e) }));
    return true; // mantiene il canale aperto per la risposta asincrona
});

// Fetch proxy: esegue fetch nel contesto del service worker (ha host_permissions SFMC)
// e restituisce la response serializzata. Gli script iniettati nel main world non possono
// aggirare CORS da soli; il service worker invece usa le host_permissions del manifest.
async function handleFetch({ url, options = {} }) {
    const target = new URL(url);
    if (target.protocol !== 'https:' || target.username || target.password || target.port ||
        !/\.(exacttarget|marketingcloud|marketingcloudapps)\.com$/i.test(target.hostname)) {
        throw new Error('Il proxy accetta solo URL HTTPS di Marketing Cloud');
    }
    if (options.method && options.method.toUpperCase() !== 'GET') throw new Error('Il proxy supporta solo letture GET');
    const response = await fetch(url, { method: 'GET', credentials: 'include', redirect: 'error',
        signal: AbortSignal.timeout(25000) });
    const headers = Object.fromEntries(response.headers.entries());
    const body = await response.text();
    return { status: response.status, statusText: response.statusText, headers, ok: response.ok, body };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || !msg.__sfmcfixFetch) return;
    handleFetch(msg)
        .then((result) => sendResponse({ ok: true, result }))
        .catch((e) => sendResponse({ ok: false, error: (e && e.message) || String(e) }));
    return true;
});

// Apre la pagina Activity Versioning in una nuova tab al click sull'icona dell'estensione.
chrome.action.onClicked.addListener(() => {
    chrome.tabs.create({ url: chrome.runtime.getURL('assets/html/activity-versioning.html') });
});
