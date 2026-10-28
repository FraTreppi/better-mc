(function () {
    'use strict';
    // Do not expose extension bridges on CloudPages, email previews, asset hosts
    // or unrelated SFMC documents, even when a host permission matches them.
    const host = location.hostname;
    const stack = host.match(/(?:^|\.)(s\d+)\.(?:exacttarget|marketingcloud|marketingcloudapps)\.com$/i)?.[1].toLowerCase();
    const role = host === 'querystudio.herokuapp.com' ? 'query' : !stack ? null :
        /^content-builder\.s\d+\.(?:exacttarget|marketingcloud|marketingcloudapps)\.com$/i.test(host) ? 'content' : /^jbinteractions\.s\d+\.(?:exacttarget|marketingcloud|marketingcloudapps)\.com$/i.test(host) ? 'journey' :
        /^mc\.s\d+\.(?:exacttarget|marketingcloud|marketingcloudapps)\.com$/i.test(host) && /^\/contactsmeta\/admin\.html$/i.test(location.pathname) ? 'contact' :
        /^mc\.s\d+\.(?:exacttarget|marketingcloud|marketingcloudapps)\.com$/i.test(host) && /^\/AutomationStudioFuel3(?:\/|$)/i.test(location.pathname) ? 'automation' : null;
    if (location.protocol !== 'https:' || !role) return;
    const VERSION = '1.1.31';
    const CHANNEL = 'sfmcfix-storage';
    let approvedScope = null;
    let authorization;
    let accessGeneration = 0;
    const send = message => new Promise((resolve, reject) => {
        function fail(code, message) { reject(Object.assign(new Error(`[${code}] ${message}`), { code })); }
        try {
            chrome.runtime.sendMessage({ __sfmcfixStorage: true, ...message, clientVersion: VERSION }, response => {
                if (chrome.runtime.lastError) return fail('EXTENSION_CONNECTION', 'Collegamento all’estensione interrotto. Dopo aver premuto Ricarica sull’estensione, ricarica tutte le schede Marketing Cloud.');
                if (response?.version !== VERSION) return fail('VERSION_MISMATCH', `Il worker e la scheda non usano la stessa versione (${VERSION}). Sostituisci tutti i file, premi Ricarica sull’estensione e poi ricarica tutte le schede Marketing Cloud.`);
                response.ok ? resolve(response.result) : fail(response.code || 'STORAGE_REQUEST', response.error || 'Storage non disponibile.');
            });
        } catch (_) {
            fail('EXTENSION_CONTEXT', 'La scheda è collegata a una vecchia istanza dell’estensione. Ricarica tutte le schede Marketing Cloud.');
        }
    });
    async function approve(scope) {
        if (!['content', 'automation'].includes(role) || typeof scope !== 'string' ||
            !/^(s\d+):(\d{1,15})$/.test(scope) || scope.split(':')[0] !== stack || Number(scope.split(':')[1]) <= 0) {
            throw new Error('Stack o MID non validi per questo modulo.');
        }
        if (approvedScope === scope) return;
        if (authorization) {
            await authorization;
            if (approvedScope === scope) return;
            throw new Error('È già in corso la conferma per una diversa BU.');
        }
        const generation = accessGeneration;
        const checkGeneration = () => {
            if (generation !== accessGeneration) throw new Error('Conferme di accesso ripristinate. Riprova la funzione.');
        };
        authorization = (async () => {
            for (;;) {
                checkGeneration();
                const permission = await send({ action: 'requestAccess', scope });
                checkGeneration();
                if (permission?.state === 'granted') { approvedScope = scope; return; }
                if (permission?.state === 'denied') {
                    throw new Error('Accesso locale non consentito. Puoi ripristinare le conferme dalla pagina dell’estensione.');
                }
                if (permission?.state === 'waiting') { await new Promise(resolve => setTimeout(resolve, 400)); continue; }
                if (permission?.state !== 'ask') throw new Error('Stato delle autorizzazioni locali non riconosciuto.');
                // Native isolated-world confirm: page scripts cannot replace it.
                const allowed = window.confirm(`SFMC UI Fixer\nConsentire a ${host} di usare i dati locali della BU ${scope.split(':')[1]} · ${stack}?\n\n${role === 'content' ? 'Verrà resa disponibile la rubrica tester di questa BU.' : 'Potrai leggere e salvare le copie SQL di questa BU.'}\nLa scelta vale per questo dominio, modulo e BU durante la sessione del browser, fino a 12 ore. Non verrà richiesta a ogni rientro.\nI dati restano in questo profilo browser. Verifica che la BU sia corretta.`);
                if (!allowed) {
                    await send({ action: 'denyAccess', scope });
                    throw new Error('Accesso ai dati locali annullato. Puoi ripristinare le conferme dalla pagina dell’estensione.');
                }
                await send({ action: 'authorize', scope });
                checkGeneration();
                approvedScope = scope;
                return;
            }
        })();
        try { await authorization; } finally { authorization = null; }
    }
    function reply(id, ok, result, error) {
        window.postMessage({ source: CHANNEL, direction: 'response', id, ok, result, error }, location.origin);
    }
    window.addEventListener('message', async event => {
        if (event.source !== window || event.origin !== location.origin) return;
        const msg = event.data;
        if (msg?.source !== CHANNEL || msg.direction !== 'request' || !/^[a-z0-9-]{1,80}$/i.test(msg.id || '')) return;
        try {
            if (!['get', 'merge'].includes(msg.action) || !msg.payload || typeof msg.payload !== 'object') throw new Error('Operazione non consentita.');
            const keys = msg.action === 'get' ? msg.payload.keys : Object.keys(msg.payload.items || {});
            if (!Array.isArray(keys) || keys.length !== 1) throw new Error('La pagina non può leggere o cancellare l’intero archivio.');
            const key = keys[0];
            const uiRead = msg.action === 'get' && key === 'SFMCFIX---UI-PREFERENCES';
            const emptyPreferences = msg.action === 'get' && key === 'SFMCFIX---SETTINGS-V2' && !msg.scope && role === 'content';
            const sensitive = role === 'content' && key === 'SFMCFIX---SETTINGS-V2' ||
                role === 'automation' && key === `SFMCFIX:v2:${msg.scope}:SFMCFIX---ACTIVITYVERSIONING`;
            if (!uiRead && !emptyPreferences) {
                if (!sensitive) throw new Error('Chiave non autorizzata per questo modulo.');
                await approve(msg.scope);
            }
            let result;
            try { result = await send({ action: msg.action, payload: msg.payload, scope: msg.scope }); }
            catch (error) {
                if (!sensitive || error.code !== 'LOCAL_ACCESS_REQUIRED') throw error;
                approvedScope = null;
                await approve(msg.scope);
                result = await send({ action: msg.action, payload: msg.payload, scope: msg.scope });
            }
            reply(msg.id, true, result);
        } catch (error) { reply(msg.id, false, undefined, error.message); }
    });
    chrome.runtime.onMessage.addListener((message, sender) => {
        if (sender.id !== chrome.runtime.id) return;
        if (message?.__sfmcfixLocalAccessReset === true) {
            const previous = approvedScope;
            accessGeneration++;
            approvedScope = null;
            const changes = role === 'content' ? { 'SFMCFIX---SETTINGS-V2': { newValue: {}, accessReset: true } } :
                previous && role === 'automation' ? { [`SFMCFIX:v2:${previous}:SFMCFIX---ACTIVITYVERSIONING`]: { newValue: {} } } : {};
            window.postMessage({ source: CHANNEL, direction: 'change', changes }, location.origin);
            return;
        }
        if (message?.__sfmcfixStorageChange !== true) return;
        const visible = {};
        const changes = message.changes || {};
        if (changes['SFMCFIX---UI-PREFERENCES']) visible['SFMCFIX---UI-PREFERENCES'] = changes['SFMCFIX---UI-PREFERENCES'];
        if (approvedScope && role === 'content' && changes['SFMCFIX---SETTINGS-V2']) visible['SFMCFIX---SETTINGS-V2'] = changes['SFMCFIX---SETTINGS-V2'];
        const bucket = approvedScope && `SFMCFIX:v2:${approvedScope}:SFMCFIX---ACTIVITYVERSIONING`;
        if (bucket && role === 'automation' && changes[bucket]) visible[bucket] = changes[bucket];
        if (Object.keys(visible).length) window.postMessage({ source: CHANNEL, direction: 'change', changes: visible }, location.origin);
    });
    send({ action: 'register' }).catch(error => console.error(
        `SFMC Fixer ${VERSION}: registrazione non riuscita. ${error.message} Documento: ${location.origin}${location.pathname}`));
    const config = document.createElement('script');
    config.id = 'sfmc-fixer-config';
    config.type = 'application/json';
    config.textContent = JSON.stringify({ extensionPath: chrome.runtime.getURL(''), timestamp: Date.now() });
    document.head.appendChild(config);
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('assets/js/content.js');
    document.head.appendChild(script);
})();
