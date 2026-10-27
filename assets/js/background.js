// Privileged storage stays in the extension. Page scripts receive only an
// explicitly approved BU view, never the full archive or a network proxy.
'use strict';
const VERSION = '1.1.26';
function failure(code, message) { return Object.assign(new Error(message), { code }); }
const SETTINGS = 'SFMCFIX---SETTINGS-V2';
const UI = 'SFMCFIX---UI-PREFERENCES';
const VERSIONS = 'SFMCFIX---ACTIVITYVERSIONING';
const DOCUMENTS = 'SFMCFIX---DOCUMENT-GRANTS';
const APPROVALS = 'SFMCFIX---SESSION-APPROVALS';
const ACCESS_LIFETIME = 12 * 60 * 60 * 1000;
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
        return role ? { role, stack, origin: url.origin, page: url.origin + url.pathname } : null;
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
function documentGrant(caller, scope, expiresAt) {
    return { page: caller.page, role: caller.role, stack: caller.stack || null, tabId: caller.tabId,
        scope: scope || null, expiresAt: expiresAt || null, touched: Date.now() };
}
function recentDocuments(docs) {
    return Object.fromEntries(Object.entries(docs).filter(([, d]) => Date.now() - d.touched < ACCESS_LIFETIME)
        .sort((a, b) => b[1].touched - a[1].touched).slice(0, 200));
}
function approvalKey(caller, scope) { return `${caller.origin}|${caller.role}|${scope}`; }
async function registerDocument(caller) {
    return enqueue(async () => {
        const docs = (await read('session', [DOCUMENTS]))[DOCUMENTS] || {};
        const previous = docs[caller.id];
        const keep = previous?.page === caller.page && previous.role === caller.role && previous.tabId === caller.tabId && previous.expiresAt > Date.now();
        const grant = documentGrant(caller, keep ? previous.scope : null, keep ? previous.expiresAt : null);
        docs[caller.id] = grant;
        await write('session', { [DOCUMENTS]: recentDocuments(docs) });
        return grant;
    });
}
async function localAccess(caller, action, scope) {
    const parts = scopeParts(scope);
    if (!['content', 'automation'].includes(caller.role) || !parts || parts[0] !== caller.stack) throw new Error('Contesto non autorizzabile.');
    return enqueue(async () => {
        const state = await read('session', [APPROVALS, DOCUMENTS]), now = Date.now(), key = approvalKey(caller, scope);
        const approvals = Object.fromEntries(Object.entries(state[APPROVALS] || {}).filter(([, entry]) => entry.expiresAt > now));
        let entry = approvals[key];
        if (action === 'requestAccess') {
            if (entry?.decision === 'denied') return { state: 'denied' };
            if (entry?.decision === 'pending' && entry.documentId !== caller.id) return { state: 'waiting' };
            if (entry?.decision !== 'allowed') {
                entry = { decision: 'pending', documentId: caller.id, expiresAt: now + 120000 };
            }
        } else entry = { decision: action === 'authorize' ? 'allowed' : 'denied', expiresAt: now + ACCESS_LIFETIME };
        approvals[key] = entry;
        const patch = { [APPROVALS]: Object.fromEntries([[key, entry], ...Object.entries(approvals).filter(([k]) => k !== key)
            .sort((a, b) => b[1].expiresAt - a[1].expiresAt).slice(0, 199)]) };
        if (entry.decision === 'allowed') {
            const docs = state[DOCUMENTS] || {};
            docs[caller.id] = documentGrant(caller, scope, entry.expiresAt);
            patch[DOCUMENTS] = recentDocuments(docs);
        }
        if (entry.decision === 'denied') {
            const docs = state[DOCUMENTS] || {};
            patch[DOCUMENTS] = Object.fromEntries(Object.entries(docs).map(([id, grant]) =>
                grant.scope === scope && grant.role === caller.role && grant.page.startsWith(caller.origin + '/') ?
                    [id, { ...grant, scope: null, expiresAt: null }] : [id, grant]));
        }
        await write('session', patch);
        return { state: entry.decision === 'allowed' ? 'granted' : entry.decision === 'denied' ? 'denied' : 'ask' };
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
function testerFolderPath(value) {
    if (!Array.isArray(value) || !value.length || value.length > 20 || value.at(-1) !== 'SFMC_UI_Fixer' ||
        value.some(part => typeof part !== 'string' || !part.trim() || part !== part.trim() || part.length > 250 || /[\x00-\x1f\x7f/\\→>]/.test(part)) ||
        value.join('/').length > 2048) throw new Error('Percorso cartella tester non valido.');
    return value.slice();
}
function preferencesView(all, scope) {
    if (!scope || !plain(all?.[scope])) return {};
    let rows = [];
    try { rows = testers(all[scope].testers || []); } catch (_) { /* Invalid legacy data is not exposed to the page. */ }
    let path = ['SFMC_UI_Fixer'];
    try { path = testerFolderPath(all[scope].testerFolderPath || path); } catch (_) {}
    return { [scope]: { testers: rows, testerSource: all[scope].testerSource === 'de' ? 'de' : 'local', testerFolderPath: path } };
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
    if (!grant || grant.page !== caller.page || grant.role !== caller.role || grant.tabId !== caller.tabId || grant.scope !== scope ||
        !Number.isFinite(grant.expiresAt) || Date.now() >= grant.expiresAt) {
        throw failure('LOCAL_ACCESS_REQUIRED', 'Accesso locale da autorizzare per questa BU.');
    }
    return grant;
}
async function pageStorage(caller, action, payload, scope) {
    if (action === 'register') { await registerDocument(caller); return true; }
    if (['requestAccess', 'authorize', 'denyAccess'].includes(action)) return localAccess(caller, action, scope);
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
            Object.keys(patch[scope]).some(k => !['testers', 'testerSource', 'testerFolderPath'].includes(k))) throw new Error('Modifica preferenze non autorizzata.');
        const update = {};
        if (Object.hasOwn(patch[scope], 'testerFolderPath')) update.testerFolderPath = testerFolderPath(patch[scope].testerFolderPath);
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
    if (action === 'resetLocalAccess') {
        const docs = await enqueue(async () => {
            const docs = (await read('session', [DOCUMENTS]))[DOCUMENTS] || {};
            await write('session', { [APPROVALS]: {}, [DOCUMENTS]: Object.fromEntries(Object.entries(docs)
                .map(([id, grant]) => [id, { ...grant, scope: null, expiresAt: null }])) });
            return docs;
        });
        await Promise.allSettled(Object.entries(docs).filter(([, grant]) => ['content', 'automation'].includes(grant.role)).map(([documentId, grant]) =>
            chrome.tabs.sendMessage(grant.tabId, { __sfmcfixLocalAccessReset: true }, { documentId })));
        return true;
    }
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
            if (Date.now() - grant.touched >= ACCESS_LIFETIME) continue;
            const visible = {};
            if (changes[UI]) visible[UI] = { newValue: uiView(changes[UI].newValue) };
            const active = Number.isFinite(grant.expiresAt) && grant.expiresAt > Date.now();
            if (active && grant.scope && grant.role === 'content' && changes[SETTINGS]) visible[SETTINGS] = {
                newValue: preferencesView(changes[SETTINGS].newValue, grant.scope) };
            const bucket = active && grant.scope && versionBucket(grant.scope);
            if (bucket && grant.role === 'automation' && changes[bucket]) visible[bucket] = { newValue: versionsView(changes[bucket].newValue, grant.scope) };
            if (!Object.keys(visible).length) continue;
            try { await chrome.tabs.sendMessage(grant.tabId, { __sfmcfixStorageChange: true, changes: visible }, { documentId }); }
            catch (_) { /* Closed or refreshed document. */ }
        }
    }).catch(() => console.error('SFMC Fixer: notifica preferenze non disponibile.'));
});
chrome.action.onClicked.addListener(() => chrome.tabs.create({ url: chrome.runtime.getURL('assets/html/activity-versioning.html') }));
