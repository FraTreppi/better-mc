(function () {
    'use strict';
    const api = window.sfmcfix;
    const SETTINGS = 'SFMCFIX---SETTINGS-V2';
    const CONTEXT_HINT = 'SFMCFIX---MANUAL-CONTEXT-HINT';
    const memory = new Map();
    const pageId = crypto.randomUUID();
    let manualMid = null;
    let manualStack = null;
    let settings = {};

    function asMid(value) {
        return /^\d{1,15}$/.test(String(value ?? '')) && Number(value) > 0 ? String(value) : null;
    }

    function detectMid() {
        // Read only explicit BU identifiers. Never infer a MID from an asset owner or enterprise ID.
        try {
            const config = window.Contacts?.models?.config;
            for (const key of ['memberId', 'memberID', 'mid', 'businessUnitId']) {
                const mid = asMid(config?.get?.(key));
                if (mid) return mid;
            }
        } catch (_) { /* App model may not be initialized yet. */ }
        for (const source of [window.fuel?.context, window.Fuel?.context, window.App?.context]) {
            for (const key of ['memberId', 'memberID', 'mid', 'businessUnitId']) {
                const mid = asMid(source?.[key]);
                if (mid) return mid;
            }
        }
        const params = new URL(location.href).searchParams;
        for (const key of ['mid', 'MID', 'memberId', 'memberID']) {
            const mid = asMid(params.get(key));
            if (mid) return mid;
        }
        return null;
    }

    function stackFrom(url) {
        try {
            const host = new URL(url).hostname;
            if (!/\.(exacttarget|marketingcloud|marketingcloudapps)\.com$/i.test(host)) return null;
            return host.match(/(?:^|\.)(s\d+)(?:\.|$)/i)?.[1].toLowerCase() || null;
        } catch (_) { return null; }
    }

    function stack() {
        for (const url of [location.href, document.referrer, ...Array.from(location.ancestorOrigins || [])]) {
            const found = stackFrom(url);
            if (found) return found;
        }
        return manualStack;
    }

    function rememberedContext() {
        // A hint only: never restore a manual BU without confirmation after reload.
        // The user may have selected a different customer on the same SFMC stack.
        try {
            const hint = JSON.parse(sessionStorage.getItem(CONTEXT_HINT));
            if (!asMid(hint?.mid) || !/^s\d+$/.test(hint?.stack || '')) return null;
            if (stack() && stack() !== hint.stack) return null;
            return hint;
        } catch (_) { return null; }
    }

    function rememberContext() {
        try { sessionStorage.setItem(CONTEXT_HINT, JSON.stringify({ mid: manualMid, stack: stack() })); }
        catch (_) { /* Confirmation still works when session storage is unavailable. */ }
    }

    function current() {
        const mid = detectMid() || manualMid;
        const instance = stack();
        return { mid, stack: instance, persistent: Boolean(mid && instance),
            scope: `${instance || location.hostname}:${mid || pageId}` };
    }

    function scopedKey(key) { return `SFMCFIX:v2:${current().scope}:${key}`; }
    api.context = { current, stackFrom, scopedKey };
    api.escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

    // Unknown MID: preserve features in memory for this document, never mix two BUs in a shared fallback.
    api.local = {
        getItem(key) {
            if (!current().persistent) return memory.get(scopedKey(key)) ?? null;
            try { return localStorage.getItem(scopedKey(key)); } catch (_) { return memory.get(scopedKey(key)) ?? null; }
        },
        setItem(key, value) {
            memory.set(scopedKey(key), String(value));
            if (current().persistent) localStorage.setItem(scopedKey(key), String(value));
        },
        removeItem(key) {
            memory.delete(scopedKey(key));
            if (current().persistent) localStorage.removeItem(scopedKey(key));
        },
        getObj(key) { try { return JSON.parse(this.getItem(key)); } catch (_) { return null; } },
        setObj(key, value) { this.setItem(key, JSON.stringify(value)); }
    };

    api.links = {
        shell() {
            const instance = stack();
            if (!instance) throw new Error('Stack SFMC non rilevato: apri il modulo dal menu Marketing Cloud.');
            return `https://mc.${instance}.exacttarget.com`;
        },
        contactBuilder(id) {
            return `${this.shell()}/contactsmeta/admin.html#admin/data-extension/${encodeURIComponent(id)}/properties/`;
        },
        activity(type, id) {
            return `${this.shell()}/cloud/#app/Automation%20Studio/AutomationStudioFuel3/%23ActivityDetails/${encodeURIComponent(type)}/${encodeURIComponent(id)}`;
        },
        journey(id, version) {
            return `${this.shell()}/cloud/#app/Journey%20Builder/%23${encodeURIComponent(id)}/${encodeURIComponent(version)}`;
        },
        emailStudio(id) {
            if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id))) {
                throw new Error('Identificativo della Data Extension non valido.');
            }
            // The shell can discard the detail fragment while loading Email.
            // Capture the GUID at document_start, then pass it to the C12 router.
            return `${this.shell()}/cloud/#app/Email/C12/Default.aspx?entityType=none&entityID=0&ks=ks%23Subscribers&sfmcfix_de=${encodeURIComponent(id)}`;
        }
    };

    api.preferences = {
        get() { return settings[current().scope] || {}; },
        async save(patch) {
            const context = current();
            if (!context.persistent) throw new Error('Imposta il MID della BU prima di salvare le preferenze.');
            const result = await api.storage.mergeItem(SETTINGS, { [context.scope]: patch });
            settings = result[SETTINGS] || settings;
            window.dispatchEvent(new Event('sfmcfix:preferences'));
        },
        async configureTesters() {
            const context = current();
            if (!context.persistent) {
                alert('Per salvare i destinatari di test, imposta prima il MID della BU corrente con il pulsante Imposta MID o Conferma MID.');
                return;
            }
            const previous = (this.get().testers || []).map(t => `${t[0]};${t[1]};${t[2]}`).join('\n');
            const input = prompt(`Rubrica per le email di prova in Content Builder (BU ${context.mid} · ${context.stack}). Salvata solo in questo profilo browser, separata per stack e MID. Una riga per persona: Cognome;Nome;email. Il salvataggio non invia email. Lascia vuoto per rimuovere i destinatari.`, previous);
            if (input === null) return;
            try {
                const testers = input.split(/\r?\n/).filter(line => line.trim()).map(line => {
                    const fields = line.split(';').map(field => field.trim());
                    if (fields.length !== 3 || !/^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(fields[2])) throw new Error('Formato non valido: Cognome;Nome;email');
                    return fields;
                });
                await this.save({ testers });
            } catch (error) { alert(error.message); }
        }
    };

    function renderContext() {
        const bar = document.getElementById('sfmcfix-context');
        if (!bar) return;
        const context = current();
        const hint = rememberedContext();
        bar.querySelector('button').textContent = context.mid ? `BU ${context.mid} · ${context.stack || '?'}` :
            hint ? `Conferma MID ${hint.mid} · ${hint.stack}` : 'SFMC Fixer · Imposta MID';
        bar.title = context.persistent ? 'Cronologie e preferenze separate per stack e MID.' :
            hint ? 'Riconferma il MID della BU attuale per ritrovare i tester salvati nel browser. Puoi correggerlo se hai cambiato BU.' :
            'MID non rilevato. Imposta il MID per accedere alle preferenze salvate per questa BU. Cronologie temporanee finché il contesto non è completo.';
    }

    function isJourneyDocument() {
        const urls = [location.href, ...Array.from(location.ancestorOrigins || [])];
        // A Contact Builder or activity frame can have a different hostname.
        // Only consider the referrer for embedded documents, not new tabs.
        if (window !== window.top) urls.push(document.referrer);
        return urls.some(value => {
            try { return /^jbinteractions\./i.test(new URL(value).hostname); }
            catch (_) { return false; }
        });
    }

    function mountContextBar() {
        if (isJourneyDocument()) return;
        const bar = document.createElement('aside');
        bar.id = 'sfmcfix-context';
        bar.innerHTML = '<button type="button"></button><button type="button">Tester BU</button>';
        const buttons = bar.querySelectorAll('button');
        buttons[0].title = 'Identifica la BU per separare cronologie e preferenze dell’estensione. Non cambia la BU in Marketing Cloud.';
        buttons[1].title = 'Configura la rubrica dei destinatari di prova per Content Builder, separata per BU. Non invia email.';
        buttons[0].onclick = () => {
            const detected = detectMid();
            if (detected) { alert(`MID rilevato dalla pagina: ${detected}`); return; }
            const hint = rememberedContext();
            const value = prompt('Conferma o inserisci il MID della BU attualmente selezionata in Marketing Cloud. Con lo stesso MID e stack ritrovi i tester già salvati nel browser. Verificalo dopo ogni ricaricamento o cambio BU.', manualMid || hint?.mid || '');
            if (value === null) return;
            if (!asMid(value.trim())) { alert('Inserisci un MID numerico valido.'); return; }
            if (!stack()) {
                const instance = prompt('Stack di questa BU (per esempio s10), come nel dominio Marketing Cloud.', hint?.stack || '');
                if (instance === null) return;
                if (!/^s\d+$/i.test(instance.trim())) { alert('Stack non valido. Esempio: s10'); return; }
                manualStack = instance.trim().toLowerCase();
            }
            manualMid = value.trim();
            rememberContext();
            renderContext();
            window.dispatchEvent(new Event('sfmcfix:contextchange'));
        };
        buttons[1].onclick = () => api.preferences.configureTesters();
        document.body.appendChild(bar);
        renderContext();
    }

    api.context.ready = (async () => {
        settings = await api.storage.getItem(SETTINGS, {});
        api.storage.onChange(changes => {
            if (changes[SETTINGS]) {
                settings = changes[SETTINGS].newValue || {};
                window.dispatchEvent(new Event('sfmcfix:preferences'));
            }
        });
        mountContextBar();
        let lastScope = current().scope;
        setInterval(() => {
            const scope = current().scope;
            if (scope !== lastScope) {
                lastScope = scope;
                renderContext();
                window.dispatchEvent(new Event('sfmcfix:contextchange'));
            }
        }, 1000);
    })();
})();
