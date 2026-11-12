// Fixed loopback reader only. Salesforce credentials never enter the extension.
(function () {
    'use strict';
    const KEY = 'SFMCFIX---DE-USAGE-CONNECTION';
    const BASE = 'http://127.0.0.1:17638';
    const GUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
    function connection(code) {
        const match = typeof code === 'string' && code.trim().match(/^(s\d+):([1-9]\d{0,14}):([a-f0-9]{64})$/);
        if (!match) throw Error('Codice di collegamento non valido. Copialo dalla finestra AVVIA.cmd.');
        return { stack: match[1], mid: match[2], key: match[3] };
    }
    async function local(config, endpoint, method = 'GET', params = {}) {
        const query = new URLSearchParams({ mid: config.mid, stack: config.stack, ...params });
        let response;
        try { response = await fetch(BASE + endpoint + '?' + query, { method, credentials: 'omit', redirect: 'error', cache: 'no-store',
            headers: { Authorization: 'Bearer ' + config.key }, signal: AbortSignal.timeout(20000) }); }
        catch (_) { throw Error('Componente Analisi DE non raggiungibile. Avvia AVVIA.cmd e verifica che il browser consenta il collegamento locale.'); }
        const text = await response.text();
        if (text.length > 4 * 1024 * 1024) throw Error('Risposta analisi troppo grande.');
        let value; try { value = JSON.parse(text); } catch (_) { throw Error('Risposta del componente locale non valida.'); }
        if (!response.ok) throw Error(response.status === 401 ? 'Codice non valido: aggiorna il collegamento nelle impostazioni Analisi DE.' : response.status === 409 ? 'BU diversa o indice aggiornato: verifica il collegamento e ripeti l’analisi.' : 'Il componente locale ha rifiutato la richiesta.');
        return value;
    }
    chrome.runtime.onMessage.addListener((msg, sender, respond) => {
        if (!msg?.__sfmcfixDEUsage) return;
        (async () => {
            await initialized;
            if (sender.id !== chrome.runtime.id) throw Error('Mittente non autorizzato.');
            const internal = sender.url === chrome.runtime.getURL('assets/html/de-usage-settings.html');
            if (internal) {
                if (msg.action === 'config') {
                    const config = (await read('local', [KEY]))[KEY];
                    return config ? { configured: true, mid: config.mid, stack: config.stack } : { configured: false };
                }
                if (msg.action === 'save') {
                    const config = connection(msg.code), status = await local(config, '/v1/status');
                    if (status.mid !== config.mid || status.stack !== config.stack) throw Error('Identità del componente non corrispondente.');
                    await write('local', { [KEY]: config });
                    return { configured: true, mid: config.mid, stack: config.stack };
                }
                if (msg.action === 'clear') { await write('local', { [KEY]: null }); return { configured: false }; }
                throw Error('Operazione impostazioni non consentita.');
            }
            const caller = source(sender);
            if (caller.role !== 'contact') throw Error('Analisi DE disponibile soltanto in Contact Builder.');
            const current = new URL(sender.url).hash.match(/^#admin\/data-extension\/([a-f0-9-]{36})(?:\/|$)/i)?.[1];
            if (!GUID.test(msg.deId || '') || current?.toLowerCase() !== msg.deId.toLowerCase()) throw Error('La DE richiesta non è quella aperta.');
            if (msg.action === 'settings') {
                await chrome.tabs.create({ url: chrome.runtime.getURL('assets/html/de-usage-settings.html') }); return true;
            }
            if (!['lookup', 'refresh'].includes(msg.action)) throw Error('Operazione Analisi DE non consentita.');
            const config = (await read('local', [KEY]))[KEY];
            if (!config) return { state: 'setup-required' };
            const parts = scopeParts(msg.scope);
            if (!parts || parts[0] !== caller.stack || parts[0] !== config.stack || parts[1] !== config.mid) throw Error('Il collegamento Analisi DE non corrisponde alla BU aperta.');
            if (msg.action === 'refresh') return local(config, '/v1/refresh', 'POST');
            if (msg.action !== 'lookup') throw Error('Operazione Analisi DE non consentita.');
            const offset = msg.offset ?? 0;
            if (!Number.isInteger(offset) || offset < 0 || offset > 100000 || msg.revision && !/^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(msg.revision)) throw Error('Pagina risultati non valida.');
            const value = await local(config, '/v1/de/' + msg.deId.toLowerCase(), 'GET', { offset: String(offset), ...(msg.revision ? { revision: msg.revision } : {}) });
            if (value.result && (value.result.mid !== config.mid || value.result.stack !== config.stack || value.result.de && value.result.de.id !== msg.deId.toLowerCase())) throw Error('Risultato appartenente a un contesto diverso.');
            return value;
        })().then(result => respond({ ok: true, result })).catch(error => respond({ ok: false, error: error.message }));
        return true;
    });
})();
