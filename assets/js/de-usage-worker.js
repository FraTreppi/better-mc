// Private browser-only API integration. No page cookies, local service or generic proxy.
(function () {
    'use strict';
    const KEY = 'SFMCFIX---DE-USAGE-API', OLD = 'SFMCFIX---DE-USAGE-CONNECTION';
    const OFFSCREEN = 'assets/html/de-usage-offscreen.html';
    const GUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
    let creating, ready, settingsGeneration = 0;
    function configFrom(value) {
        if (!value || !/^[1-9]\d{0,14}$/.test(String(value.mid)) || !/^s\d+$/.test(value.stack) ||
            typeof value.clientId !== 'string' || !value.clientId.trim() || value.clientId.length > 1024 ||
            typeof value.clientSecret !== 'string' || !value.clientSecret.trim() || value.clientSecret.length > 4096) throw Error('Inserisci MID, stack e credenziali del pacchetto API.');
        let url; try { url = new URL(value.authUrl); } catch (_) { throw Error('Authentication Base URI non valida.'); }
        if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.auth\.marketingcloudapis\.com$/.test(url.hostname) || url.port || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw Error('Authentication Base URI Salesforce non valida.');
        return { mid: String(value.mid), stack: value.stack, authUrl: url.href, clientId: value.clientId.trim(), clientSecret: value.clientSecret.trim(), version: crypto.randomUUID() };
    }
    async function hasEngine() {
        return (await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [chrome.runtime.getURL(OFFSCREEN)] })).length > 0;
    }
    async function engine(message) {
        if (!await hasEngine()) {
            creating ||= chrome.offscreen.createDocument({ url: OFFSCREEN, reasons: ['WORKERS'], justification: 'Analizzare SQL in un worker locale e leggere i metadati della BU autorizzata senza bloccare le pagine Salesforce.' }).finally(() => { creating = null; });
            await creating;
        }
        const response = await chrome.runtime.sendMessage({ __sfmcfixDEEngine: true, ...message });
        if (!response?.ok) throw Error(response?.error || 'Motore di analisi non disponibile. Aggiorna il browser e ricarica l’estensione.');
        return response.result;
    }
    async function ensure(config) {
        if (!ready || ready.version !== config.version) {
            const promise = (async () => {
                const status = await engine({ action: 'status', mid: config.mid, stack: config.stack, configVersion: config.version });
                if (status.state === 'not-configured') await engine({ action: 'configure', config });
            })();
            ready = { version: config.version, promise };
        }
        const pending = ready;
        try { await pending.promise; } finally { if (ready === pending) ready = null; }
    }
    globalThis.sfmcfixResetDEUsage = async scope => {
        const config = (await read('local', [KEY]))[KEY];
        if (scope && config && config.stack + ':' + config.mid !== scope) return;
        settingsGeneration++;
        ready = null;
        if (await hasEngine()) await engine({ action: 'clear' });
    };
    chrome.runtime.onMessage.addListener((msg, sender, respond) => {
        if (!msg?.__sfmcfixDEUsage) return;
        (async () => {
            await initialized;
            if (sender.id !== chrome.runtime.id) throw Error('Mittente non autorizzato.');
            const internal = sender.url === chrome.runtime.getURL('assets/html/de-usage-settings.html');
            if (internal) {
                if (msg.action === 'approval') {
                    const scope = msg.stack + ':' + msg.mid;
                    if (!scopeParts(scope)) return { approved: false };
                    const entry = (await read('session', [APPROVALS]))[APPROVALS]?.['bu-v2|' + scope];
                    return { approved: entry?.decision === 'allowed' && entry.expiresAt > Date.now() };
                }
                if (msg.action === 'config') {
                    const config = (await read('local', [KEY]))[KEY];
                    return config ? { configured: true, mid: config.mid, stack: config.stack, authUrl: config.authUrl } : { configured: false };
                }
                if (msg.action === 'save') {
                    const ticket = ++settingsGeneration;
                    const config = configFrom(msg.config);
                    const key = 'bu-v2|' + config.stack + ':' + config.mid;
                    const existing = (await read('session', [APPROVALS]))[APPROVALS]?.[key];
                    if (msg.approveBU !== true && !(existing?.decision === 'allowed' && existing.expiresAt > Date.now())) throw Error('Conferma l’autorizzazione unica per questa BU.');
                    await engine({ action: 'configure', config });
                    await enqueue(async () => {
                        if (ticket !== settingsGeneration) throw Error('Configurazione annullata o sostituita.');
                        const approvals = (await read('session', [APPROVALS]))[APPROVALS] || {};
                        if (msg.approveBU === true) {
                            approvals[key] = { decision: 'allowed', expiresAt: Date.now() + ACCESS_LIFETIME };
                            await write('session', { [APPROVALS]: approvals });
                        } else if (approvals[key]?.decision !== 'allowed' || approvals[key].expiresAt <= Date.now()) throw Error('Approvazione BU scaduta. Conferma l’autorizzazione e riprova.');
                        await write('local', { [KEY]: config, [OLD]: null });
                    });
                    ready = null;
                    return { configured: true, mid: config.mid, stack: config.stack, authenticated: true };
                }
                if (msg.action === 'clear') {
                    settingsGeneration++;
                    await enqueue(() => write('local', { [KEY]: null, [OLD]: null }));
                    await globalThis.sfmcfixResetDEUsage();
                    return { configured: false };
                }
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
            if (!parts || parts[0] !== caller.stack || parts[0] !== config.stack || parts[1] !== config.mid) throw Error('L’analisi API non corrisponde alla BU aperta.');
            await grantFor(caller, msg.scope);
            const offset = msg.offset ?? 0;
            if (!Number.isInteger(offset) || offset < 0 || offset > 100000 || msg.revision && !/^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(msg.revision)) throw Error('Pagina risultati non valida.');
            await ensure(config);
            const value = await engine({ action: msg.action, mid: config.mid, stack: config.stack, configVersion: config.version, deId: msg.deId.toLowerCase(), offset, revision: msg.revision });
            if (value.state === 'not-configured' || (await read('local', [KEY]))[KEY]?.version !== config.version) throw Error('Configurazione API cambiata. Riapri il pannello.');
            if (value.result && (value.result.mid !== config.mid || value.result.stack !== config.stack || value.result.de && value.result.de.id !== msg.deId.toLowerCase())) throw Error('Risultato appartenente a un contesto diverso.');
            await grantFor(caller, msg.scope);
            return value;
        })().then(result => respond({ ok: true, result, version: VERSION })).catch(error => respond({ ok: false, code: error.code || 'DE_USAGE', error: error.message, version: VERSION }));
        return true;
    });
})();
