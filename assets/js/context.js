(function () {
    'use strict';
    const api = window.sfmcfix;
    const SETTINGS = 'SFMCFIX---SETTINGS-V2';
    const CONTEXT_HINT = 'SFMCFIX---MANUAL-CONTEXT-HINT';
    const UI_SETTINGS = 'SFMCFIX---UI-PREFERENCES';
    const memory = new Map();
    const pageId = crypto.randomUUID();
    let manualMid = null;
    let manualStack = null;
    let settings = {};
    let uiSettings = {};
    let lastScope;
    let settingsError = null;
    let settingsLoading = false;
    let settingsGeneration = 0;

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
    api.uiPreferences = {
        get() { return { hidePreviewIcons: uiSettings.hidePreviewIcons === true }; }
    };
    api.escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

    api.activitySnapshot = record => {
        const safe = {};
        for (const key of ['queryDefinitionId', 'name', 'key', 'description', 'queryText', 'targetName', 'targetKey', 'targetId', 'targetDescription',
            'createdDate', 'modifiedDate', 'targetUpdateTypeId', 'targetUpdateTypeName', 'validatedQueryText', 'categoryId', 'folderLocationText', 'isFrozen', 'versioning']) {
            const value = record?.[key];
            if (typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) safe[key] = value;
        }
        return safe;
    };

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
        testTracking() {
            // Bootstrap through the same entry point used by the working DE link.
            // The marker preserves the intent to select Tracking after startup.
            return `${this.shell()}/cloud/#app/Email/C12/Default.aspx?entityType=none&entityID=0&ks=ks%23Subscribers&sfmcfix_tracking=tests`;
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
            if (context.scope !== current().scope) return;
            settings = result[SETTINGS] || settings;
            window.dispatchEvent(new Event('sfmcfix:preferences'));
        },
        configureTesters() {
            const context = current();
            if (!context.persistent) {
                alert('Per salvare i destinatari di test, apri Impostazioni SFMC e scegli Imposta MID o Conferma MID per la BU corrente.');
                return;
            }
            if (settingsLoading) return;
            if (settingsError) { alert(`Rubrica non disponibile: ${settingsError}`); return; }
            if (api.openTesterEditor) api.openTesterEditor();
            else api.addJs('components/tester-editor', () => api.openTesterEditor());
        }
    };

    function renderContext() {
        const bar = document.getElementById('sfmcfix-context');
        if (!bar) return;
        const context = current();
        const hint = rememberedContext();
        bar.querySelector('[data-context-action="configure"]').textContent = context.mid ? `BU ${context.mid} · ${context.stack || '?'}` :
            hint ? `Conferma MID ${hint.mid} · ${hint.stack}` : 'SFMC Fixer · Imposta MID';
        bar.querySelector('[data-context-action="testers"]').textContent = `Tester BU (${api.preferences.get().testers?.length || 0})`;
        bar.dataset.ready = String(context.persistent);
        bar.querySelector('[data-context-action="testers"]').disabled = settingsLoading;
        const trigger = bar.querySelector('[data-context-action="toggle"]');
        trigger.title = context.persistent ? `Impostazioni SFMC · BU ${context.mid} · ${context.stack}` :
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

    api.context.configure = async function () {
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
        lastScope = current().scope;
        settings = {};
        window.dispatchEvent(new Event('sfmcfix:contextchange'));
        await loadSettings();
        renderContext();
    };

    api.context.mountControls = function (target) {
        // Share the Test History toolbox: no floating controls on Data Extensions.
        if (isJourneyDocument() || !target || document.getElementById('sfmcfix-context')) return;
        const bar = document.createElement('aside');
        bar.id = 'sfmcfix-context';
        bar.innerHTML = `<button type="button" data-context-action="toggle" aria-label="Impostazioni SFMC" aria-expanded="false" aria-controls="sfmcfix-context-options">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 6h3m4 0h9M4 12h9m4 0h3M4 18h3m4 0h9"/><circle cx="9" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="9" cy="18" r="2"/></svg>
            </button>
            <div id="sfmcfix-context-options" role="group" aria-label="Opzioni SFMC" hidden>
                <button type="button" data-context-action="configure"></button>
                <button type="button" data-context-action="testers">Tester BU</button>
            </div>`;
        const trigger = bar.querySelector('[data-context-action="toggle"]');
        const options = bar.querySelector('#sfmcfix-context-options');
        function close() { options.hidden = true; trigger.setAttribute('aria-expanded', 'false'); }
        function open() { renderContext(); options.hidden = false; trigger.setAttribute('aria-expanded', 'true'); }
        trigger.onclick = () => {
            if (options.hidden) { open(); options.querySelector('button').focus(); }
            else close();
        };
        const configure = bar.querySelector('[data-context-action="configure"]');
        const testers = bar.querySelector('[data-context-action="testers"]');
        configure.title = 'Identifica la BU per le preferenze dell’estensione. Non cambia la BU in Marketing Cloud.';
        testers.title = 'Gestisci i destinatari di prova per Content Builder. Non invia email.';
        configure.onclick = () => { close(); trigger.focus(); api.context.configure(); };
        testers.onclick = () => { close(); trigger.focus(); api.preferences.configureTesters(); };
        document.addEventListener('click', event => { if (!bar.contains(event.target)) close(); });
        bar.addEventListener('keydown', event => {
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); trigger.focus(); }
            if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
                event.preventDefault();
                open();
                const buttons = Array.from(options.querySelectorAll('button'));
                const index = buttons.indexOf(document.activeElement);
                const next = index < 0 ? (event.key === 'ArrowDown' ? 0 : buttons.length - 1) :
                    (index + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length;
                buttons[next].focus();
            }
        });
        bar.addEventListener('focusout', event => { if (!bar.contains(event.relatedTarget)) close(); });
        window.addEventListener('sfmcfix:contextchange', close);
        target.appendChild(bar);
        renderContext();
    };

    async function loadSettings() {
        const generation = ++settingsGeneration;
        const context = current();
        settings = {};
        settingsError = null;
        settingsLoading = false;
        if (!/^content-builder\./i.test(location.hostname) || !context.persistent) { renderContext(); return; }
        settingsLoading = true;
        renderContext();
        try {
            const value = await api.storage.getItem(SETTINGS, {});
            if (generation === settingsGeneration && context.scope === current().scope) settings = { [context.scope]: value[context.scope] || {} };
        } catch (error) {
            if (generation === settingsGeneration) settingsError = error.message;
        } finally {
            if (generation === settingsGeneration) { settingsLoading = false; renderContext(); }
        }
    }
    api.context.ready = (async () => {
        await Promise.all([loadSettings(), api.storage.getItem(UI_SETTINGS, {}).then(value => { uiSettings = value; }).catch(() => {})]);
        api.storage.onChange(changes => {
            if (changes[SETTINGS]) {
                const scope = current().scope;
                settings = { [scope]: changes[SETTINGS].newValue?.[scope] || {} };
                window.dispatchEvent(new Event('sfmcfix:preferences'));
            }
            if (changes[UI_SETTINGS]) {
                uiSettings = changes[UI_SETTINGS].newValue || {};
                window.dispatchEvent(new Event('sfmcfix:ui-preferences'));
            }
        });
        window.addEventListener('sfmcfix:preferences', renderContext);
        lastScope = current().scope;
        setInterval(() => {
            const scope = current().scope;
            if (scope !== lastScope) {
                lastScope = scope;
                settings = {};
                renderContext();
                window.dispatchEvent(new Event('sfmcfix:contextchange'));
                loadSettings().then(() => window.dispatchEvent(new Event('sfmcfix:preferences')));
            }
        }, 1000);
    })();
})();
