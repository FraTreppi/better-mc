// Privileged storage stays in the extension. Page scripts receive only an
// explicitly approved BU view, never the full archive or a network proxy.
'use strict';
const VERSION = '1.1.19';
function failure(code, message) { return Object.assign(new Error(message), { code }); }
const SETTINGS = 'SFMCFIX---SETTINGS-V2';
const UI = 'SFMCFIX---UI-PREFERENCES';
const VERSIONS = 'SFMCFIX---ACTIVITYVERSIONING';
const DOCUMENTS = 'SFMCFIX---DOCUMENT-GRANTS';
const forbidden = key => ['__proto__', 'constructor', 'prototype'].includes(key);
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const scopeParts = value => typeof value === 'string' && /^(s\d+):(\d{1,15})$/.test(value) && Number(value.split(':')[1]) > 0 ? value.split(':') : null;
const versionBucket = scope => `SFMCFIX:v2:${scope}:${VERSIONS}`;
let writeChain = Promise.resolve();
function enqueue(task) {
    const run = writeChain.then(task, task);
    writeChain = run.then(() => {}, () => {});
    return run;
}
const read = (area, keys) => new Promise((resolve, reject) => chrome.storage[area].get(keys, items =>
    chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve(items)));
const write = (area, items) => new Promise((resolve, reject) => chrome.storage[area].set(items, () =>
    chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve(true)));
const initialized = Promise.resolve().then(() => Promise.all(['local', 'session'].map(area =>
    chrome.storage[area].setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })))).then(() => enqueue(async () => {
        const all = await read('local', null);
        const cleaned = {};
        for (const [key, value] of Object.entries(all)) {
            const match = key.match(/^SFMCFIX:v2:(s\d+:\d{1,15}):SFMCFIX---ACTIVITYVERSIONING$/);
            if (!match && key !== VERSIONS) continue;
            const records = {};
            for (const [id, record] of Object.entries(plain(value) ? value : {})) {
                if (forbidden(id) || id.length > 512 || !plain(record)) continue;
                records[id] = match && scopeParts(match[1]) ? versionView(record, match[1]) : activityFields(record);
                if (!match && scopeParts(record.sfmcfixContext?.scope)) records[id].sfmcfixContext = versionView(record, record.sfmcfixContext.scope).sfmcfixContext;
            }
            if (JSON.stringify(value) !== JSON.stringify(records)) cleaned[key] = records;
        }
        if (plain(all[SETTINGS])) {
            const settings = {};
            for (const [scope, record] of Object.entries(all[SETTINGS])) if (scopeParts(scope)) settings[scope] = { testers: Array.isArray(record?.testers) ? record.testers : [], testerSource: record?.testerSource === 'de' ? 'de' : 'local' };
            if (JSON.stringify(settings) !== JSON.stringify(all[SETTINGS])) cleaned[SETTINGS] = settings;
        }
        if (Object.keys(cleaned).length) await write('local', cleaned);
    }));
initialized.catch(() => console.error('SFMC Fixer [STORAGE_INIT]: archivio protetto non inizializzato. Ricarica l’estensione e tutte le schede Marketing Cloud.'));
function pageRole(value) {
    try {
        const url = new URL(value);
        if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
        const host = url.hostname;
        const stack = host.match(/(?:^|\.)(s\d+)\.(?:exacttarget|marketingcloud|marketingcloudapps)\.com$/i)?.[1].toLowerCase();
        let role;
        if (host === 'querystudio.herokuapp.com') role = 'query';
        else if (stack && /^content-builder\.s\d+\.(?:exacttarget|marketingcloud|marketingcloudapps)\.com$/i.test(host)) role = 'content';
        else if (stack && /^jbinteractions\.s\d+\.(?:exacttarget|marketingcloud|marketingcloudapps)\.com$/i.test(host)) role = 'journey';
        else if (stack && /^mc\.s\d+\.(?:exacttarget|marketingcloud|marketingcloudapps)\.com$/i.test(host) && /^\/contactsmeta\/admin\.html$/i.test(url.pathname)) role = 'contact';
        else if (stack && /^mc\.s\d+\.(?:exacttarget|marketingcloud|marketingcloudapps)\.com$/i.test(host) && /^\/AutomationStudioFuel3(?:\/|$)/i.test(url.pathname)) role = 'automation';
        return role ? { role, stack, page: url.origin + url.pathname } : null;
    } catch (_) { return null; }
}
function source(sender) {
    if (sender.id !== chrome.runtime.id) throw failure('SENDER', 'Mittente non autorizzato.');
    if (sender.url === chrome.runtime.getURL('assets/html/activity-versioning.html')) return { internal: true };
    const page = pageRole(sender.url);
    if (!page) throw failure('DOCUMENT_MODULE', 'Il documento non appartiene a un modulo Salesforce supportato. Riapri il modulo dal menu Marketing Cloud.');
    // The browser supplies this identifier: treat it as opaque, never derive or
    // replace it with a page-provided value, URL, tab ID or frame ID.
    if (typeof sender.documentId !== 'string' || !sender.documentId.length || sender.documentId.length > 128 ||
        /[\s\u0000-\u001f\u007f]/.test(sender.documentId) || forbidden(sender.documentId)) {
        throw failure('DOCUMENT_ID', 'Il browser non ha fornito un identificativo documento utilizzabile. Aggiorna il browser e ricarica l’estensione e la scheda Marketing Cloud.');
    }
    if (!Number.isInteger(sender.tab?.id) || sender.tab.id < 0) throw failure('DOCUMENT_TAB', 'Scheda del documento non riconosciuta. Riapri Marketing Cloud in una scheda normale.');
    return { ...page, id: sender.documentId, tabId: sender.tab.id };
}
async function registerDocument(caller, scope) {
    return enqueue(async () => {
        const docs = (await read('session', [DOCUMENTS]))[DOCUMENTS] || {};
        const previous = docs[caller.id];
        const grant = { page: caller.page, role: caller.role, stack: caller.stack || null, tabId: caller.tabId,
            scope: scope || (previous?.page === caller.page ? previous.scope : null), touched: Date.now() };
        docs[caller.id] = grant;
        const recent = Object.fromEntries(Object.entries(docs).filter(([, d]) => Date.now() - d.touched < 12 * 60 * 60 * 1000)
            .sort((a, b) => b[1].touched - a[1].touched).slice(0, 200));
        await write('session', { [DOCUMENTS]: recent });
        return grant;
    });
}
function testers(value) {
    if (!Array.isArray(value) || value.length > 1000) throw new Error('Rubrica non valida: massimo 1000 tester.');
    return value.map(row => {
        if (!Array.isArray(row) || row.length !== 3 || row.some(v => typeof v !== 'string') || row[0].length > 250 || row[1].length > 250 ||
            row[2].length > 254 || !/^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(row[2])) throw new Error('Dati tester non validi.');
        return row.map(v => v.trim());
    });
}
function preferencesView(all, scope) {
    if (!scope || !plain(all?.[scope])) return {};
    let rows = [];
    try { rows = testers(all[scope].testers || []); } catch (_) { /* Invalid legacy data is not exposed to the page. */ }
    return { [scope]: { testers: rows, testerSource: all[scope].testerSource === 'de' ? 'de' : 'local' } };
}
const versionFields = ['queryDefinitionId', 'name', 'key', 'description', 'queryText', 'targetName', 'targetKey', 'targetId', 'targetDescription',
    'createdDate', 'modifiedDate', 'targetUpdateTypeId', 'targetUpdateTypeName', 'validatedQueryText', 'categoryId', 'folderLocationText', 'isFrozen', 'versioning'];
function activityFields(record) {
    if (!plain(record)) throw new Error('Versione SQL non valida.');
    const result = {};
    for (const key of versionFields) {
        const value = record[key];
        if (typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) result[key] = value;
    }
    return result;
}
function versionView(record, scope) {
    const result = activityFields(record);
    const [stack, mid] = scopeParts(scope);
    result.sfmcfixContext = { stack, mid, scope, persistent: true };
    return result;
}
function versionsView(records, scope) {
    const result = {};
    for (const [key, value] of Object.entries(records || {})) {
        if (forbidden(key) || key.length > 512 || !plain(value)) continue;
        result[key] = versionView(value, scope);
    }
    return result;
}
function uiView(value) { return { hidePreviewIcons: value?.hidePreviewIcons === true }; }
async function grantFor(caller, scope) {
    const parts = scopeParts(scope);
    if (!parts || parts[0] !== caller.stack) throw new Error('Stack o MID non validi per questa pagina.');
    const grant = (await read('session', [DOCUMENTS]))[DOCUMENTS]?.[caller.id];
    if (!grant || grant.page !== caller.page || grant.scope !== scope || Date.now() - grant.touched >= 12 * 60 * 60 * 1000) {
        throw new Error('Accesso ai dati di questa BU non autorizzato. Riapri il modulo e conferma l’accesso.');
    }
    return grant;
}
async function pageStorage(caller, action, payload, scope) {
    if (action === 'register') { await registerDocument(caller); return true; }
    if (action === 'authorize') {
        const parts = scopeParts(scope);
        if (!['content', 'automation'].includes(caller.role) || !parts || parts[0] !== caller.stack) throw new Error('Contesto non autorizzabile.');
        await registerDocument(caller, scope);
        return true;
    }
    if (!['get', 'merge'].includes(action) || !plain(payload)) throw new Error('Operazione non consentita alla pagina.');
    const keys = action === 'get' ? payload.keys : Object.keys(payload.items || {});
    if (!Array.isArray(keys) || keys.length !== 1 || typeof keys[0] !== 'string') throw new Error('Richiedi una sola chiave autorizzata.');
    const key = keys[0];
    if (key === UI && action === 'get') return { [UI]: uiView((await read('local', [UI]))[UI]) };
    if (key === SETTINGS && caller.role === 'content' && !scope && action === 'get') return { [SETTINGS]: {} };
    await grantFor(caller, scope);
    if (key === SETTINGS && caller.role === 'content') {
        if (action === 'get') return { [SETTINGS]: preferencesView((await read('local', [SETTINGS]))[SETTINGS], scope) };
        const patch = payload.items[SETTINGS];
        if (!plain(patch) || Object.keys(patch).length !== 1 || !Object.hasOwn(patch, scope) || !plain(patch[scope]) ||
            Object.keys(patch[scope]).some(k => !['testers', 'testerSource'].includes(k))) throw new Error('Modifica preferenze non autorizzata.');
        const update = {};
        if (Object.hasOwn(patch[scope], 'testers')) update.testers = testers(patch[scope].testers);
        if (Object.hasOwn(patch[scope], 'testerSource')) {
            if (!['local', 'de'].includes(patch[scope].testerSource)) throw new Error('Sorgente tester non valida.');
            update.testerSource = patch[scope].testerSource;
        }
        return enqueue(async () => {
            const all = (await read('local', [SETTINGS]))[SETTINGS] || {};
            const next = { ...all, [scope]: { ...all[scope], ...update } };
            await write('local', { [SETTINGS]: next });
            return { [SETTINGS]: preferencesView(next, scope) };
        });
    }
    if (key === versionBucket(scope) && caller.role === 'automation') {
        if (action === 'get') return { [key]: versionsView((await read('local', [key]))[key], scope) };
        const patch = payload.items[key];
        if (!plain(patch) || Object.keys(patch).length > 8 || JSON.stringify(patch).length > 2 * 1024 * 1024 ||
            Object.keys(patch).some(k => forbidden(k) || k.length > 512)) throw new Error('Snapshot SQL non valido.');
        const safe = versionsView(patch, scope);
        if (Object.keys(safe).length !== Object.keys(patch).length) throw new Error('Snapshot SQL non valido.');
        return enqueue(async () => {
            const current = (await read('local', [key]))[key] || {};
            const next = { ...current, ...safe };
            if (Object.keys(next).length > 5000) throw new Error('Archivio pieno: esporta ed elimina alcune versioni.');
            await write('local', { [key]: next });
            return { [key]: safe };
        });
    }
    throw new Error('Chiave non autorizzata per questo modulo.');
}
async function internalStorage(action, payload) {
    if (action === 'merge' && plain(payload?.items) && Object.keys(payload.items).length === 1 && plain(payload.items[UI]) &&
        Object.keys(payload.items[UI]).every(k => k === 'hidePreviewIcons') && typeof payload.items[UI].hidePreviewIcons === 'boolean') {
        const value = uiView(payload.items[UI]);
        await enqueue(() => write('local', { [UI]: value }));
        return { [UI]: value };
    }
    if (action === 'deleteVersions') {
        const entries = payload?.entries;
        if (!Array.isArray(entries) || entries.length > 10000 || entries.some(e => !plain(e) || typeof e.bucket !== 'string' ||
            (e.bucket !== VERSIONS && !/^SFMCFIX:v2:s\d+:\d{1,15}:SFMCFIX---ACTIVITYVERSIONING$/.test(e.bucket)) ||
            typeof e.key !== 'string' || forbidden(e.key) || e.key.length > 512)) throw new Error('Versioni non valide.');
        return enqueue(async () => {
            const buckets = [...new Set(entries.map(e => e.bucket))];
            const data = await read('local', buckets);
            for (const { bucket, key } of entries) if (plain(data[bucket])) delete data[bucket][key];
            await write('local', data);
            return true;
        });
    }
    throw new Error('Operazione interna non consentita.');
}
chrome.runtime.onMessage.addListener((msg, sender, respond) => {
    if (!msg?.__sfmcfixStorage && !msg?.__sfmcfixFetch) return;
    (async () => {
        try { await initialized; }
        catch (_) { throw failure('STORAGE_INIT', 'Archivio protetto non inizializzato. Ricarica l’estensione e tutte le schede Marketing Cloud.'); }
        if (msg.clientVersion && msg.clientVersion !== VERSION) throw failure('VERSION_MISMATCH', 'La scheda usa una versione precedente del loader. Ricarica tutte le schede Marketing Cloud dopo l’estensione.');
        if (msg.__sfmcfixFetch) throw new Error('Il proxy di rete generico è stato rimosso.');
        const caller = source(sender);
        return caller.internal ? internalStorage(msg.action, msg.payload) : pageStorage(caller, msg.action, msg.payload, msg.scope);
    })().then(result => respond({ ok: true, result, version: VERSION })).catch(error =>
        respond({ ok: false, error: error.message, code: error.code || 'STORAGE_REQUEST', version: VERSION }));
    return true;
});
// Notify each registered document of its own projection only. Content scripts
// cannot subscribe to the complete chrome.storage.local change stream.
chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    read('session', [DOCUMENTS]).then(async result => {
        for (const [documentId, grant] of Object.entries(result[DOCUMENTS] || {})) {
            if (Date.now() - grant.touched >= 12 * 60 * 60 * 1000) continue;
            const visible = {};
            if (changes[UI]) visible[UI] = { newValue: uiView(changes[UI].newValue) };
            if (grant.scope && grant.role === 'content' && changes[SETTINGS]) visible[SETTINGS] = {
                newValue: preferencesView(changes[SETTINGS].newValue, grant.scope) };
            const bucket = grant.scope && versionBucket(grant.scope);
            if (bucket && grant.role === 'automation' && changes[bucket]) visible[bucket] = { newValue: versionsView(changes[bucket].newValue, grant.scope) };
            if (!Object.keys(visible).length) continue;
            try { await chrome.tabs.sendMessage(grant.tabId, { __sfmcfixStorageChange: true, changes: visible }, { documentId }); }
            catch (_) { /* Closed or refreshed document. */ }
        }
    }).catch(() => console.error('SFMC Fixer: notifica preferenze non disponibile.'));
});
chrome.action.onClicked.addListener(() => chrome.tabs.create({ url: chrome.runtime.getURL('assets/html/activity-versioning.html') }));
