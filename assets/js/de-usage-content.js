(function () {
    'use strict';
    if (location.protocol !== 'https:' || !/^mc\.s\d+\.(?:exacttarget|marketingcloud|marketingcloudapps)\.com$/i.test(location.hostname) || !/^\/contactsmeta\/admin\.html$/i.test(location.pathname)) return;
    const route = () => location.hash.match(/^#admin\/data-extension\/([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})(?:\/|$)/i)?.[1].toLowerCase();
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = chrome.runtime.getURL('assets/css/de-usage.css'); document.head.append(css);
    const make = (tag, text, className) => { const node = document.createElement(tag); if (text) node.textContent = text; if (className) node.className = className; return node; };
    let button, dialog, generation = 0, timer, openedId, scope, revision, rowsLoaded = 0;
    const send = payload => new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ __sfmcfixDEUsage: true, ...payload, deId: openedId || route(), scope }, response => {
            if (chrome.runtime.lastError) return reject(Error('Collegamento all’estensione interrotto. Ricarica estensione e scheda MC.'));
            response?.ok ? resolve(response.result) : reject(Object.assign(Error(response?.error || 'Analisi DE non disponibile.'), { code: response?.code }));
        });
    });
    const authorized = async payload => {
        try { return await send(payload); }
        catch (error) {
            if (error.code !== 'LOCAL_ACCESS_REQUIRED' || !globalThis.sfmcfixLocalAccess) throw error;
            await globalThis.sfmcfixLocalAccess.ensure(scope, true);
            return send(payload);
        }
    };
    const context = () => new Promise((resolve, reject) => {
        const id = crypto.randomUUID(), timeout = setTimeout(() => { window.removeEventListener('message', answer); reject(Error('BU non rilevata. Riapri Contact Builder e verifica il contesto Salesforce.')); }, 3000);
        function answer(event) {
            if (event.source !== window || event.origin !== location.origin || event.data?.channel !== 'sfmcfix-de-usage-context' || event.data.type !== 'response' || event.data.id !== id) return;
            clearTimeout(timeout); window.removeEventListener('message', answer);
            /^s\d+:[1-9]\d{0,14}$/.test(event.data.scope || '') ? resolve(event.data.scope) : reject(Error('MID della BU corrente non rilevato.'));
        }
        window.addEventListener('message', answer); window.postMessage({ channel: 'sfmcfix-de-usage-context', type: 'request', id }, location.origin);
    });
    function close() { generation++; clearTimeout(timer); dialog?.close(); openedId = null; }
    function openSettings(event) { if (event.isTrusted) void send({ action: 'settings' }).catch(error => { dialog.querySelector('[data-status]').textContent = error.message; }); }
    function createDialog() {
        const panel = make('dialog', '', 'sfmcfix-de-usage-panel'); panel.setAttribute('aria-labelledby', 'sfmcfix-de-usage-title');
        const header = make('header'), title = make('h2', 'Dove viene usata questa DE'); title.id = 'sfmcfix-de-usage-title';
        const exit = make('button', 'Chiudi'); exit.type = 'button'; exit.onclick = close; header.append(title, exit); panel.append(header);
        const identity = make('p'); identity.dataset.identity = ''; panel.append(identity);
        const actions = make('div', '', 'sfmcfix-de-usage-actions');
        const refresh = make('button', 'Aggiorna analisi'); refresh.type = 'button'; refresh.onclick = event => { if (event.isTrusted) void lookup(true); };
        const settings = make('button', 'Collega Analisi DE'); settings.type = 'button'; settings.onclick = openSettings; actions.append(refresh, settings); panel.append(actions);
        const status = make('p'); status.dataset.status = ''; status.setAttribute('role', 'status'); panel.append(status);
        const coverage = make('p'); coverage.dataset.coverage = ''; panel.append(coverage);
        const issues = make('details'), issuesTitle = make('summary', 'Riferimenti da verificare'), issuesList = make('ul'); issues.dataset.issues = ''; issues.append(issuesTitle, issuesList); issues.hidden = true; panel.append(issues);
        const table = make('table'), head = make('thead'), line = make('tr');
        for (const text of ['Utilizzo DE', 'Query', 'Scrittura', 'Automation', 'Step / attività', 'Stato']) line.append(make('th', text));
        head.append(line); table.append(head, make('tbody')); panel.append(table);
        const more = make('button', 'Carica altri risultati'); more.type = 'button'; more.hidden = true; more.dataset.more = ''; more.onclick = event => { if (event.isTrusted) void lookup(false, rowsLoaded); }; panel.append(more);
        panel.append(make('p', 'Sono cercati riferimenti configurati nella sola BU corrente. Lo stato di un’automation non dimostra un’esecuzione recente.', 'sfmcfix-de-usage-note'));
        panel.addEventListener('cancel', event => { event.preventDefault(); close(); });
        document.body.append(panel); return panel;
    }
    function render(result, offset) {
        const tbody = dialog.querySelector('tbody');
        if (!offset) { tbody.replaceChildren(); rowsLoaded = 0; revision = result.generatedAt; }
        if (revision !== result.generatedAt) throw Error('Indice aggiornato: premi Aggiorna analisi per ricominciare.');
        dialog.querySelector('[data-identity]').textContent = (result.de?.name || 'DE non identificata nell’indice') + ' · BU ' + result.mid + ' · ' + result.stack;
        const complete = ['metadata', 'sources', 'targets', 'automations'].every(key => result.coverage?.[key] === true);
        const counts = result.counts || {};
        const issues = dialog.querySelector('[data-issues]'), list = issues.querySelector('ul'); list.replaceChildren();
        const reasons = { TARGET_NON_RISOLTO: 'Target non risolto', SORGENTE_FUORI_PERIMETRO_O_NON_RISOLTA: 'Fonte fuori perimetro o non risolta', NOME_DE_NON_RISOLTO: 'Nome DE non risolto', SQL_NON_ANALIZZATO: 'SQL non analizzato', ATTIVITA_NON_RISOLTA: 'Attività non risolta', AUTOMATION_NON_RISOLTA: 'Automation non risolta', AUTOMATION_LETTURA_INCOMPLETA: 'Metadati automation incompleti', POSIZIONE_ATTIVITA_NON_RISOLTA: 'Posizione attività non risolta' };
        for (const issue of result.issues || []) list.append(make('li', (reasons[issue.code] || 'Riferimento non risolto') + (issue.name ? ': ' + issue.name : '')));
        issues.hidden = !list.children.length;
        dialog.querySelector('[data-coverage]').textContent = (complete ? 'Analisi completata per i metadati esaminati.' : 'Analisi parziale: alcuni riferimenti non sono stati risolti.') +
            ' DE: ' + counts.des + ' · Query: ' + counts.queries + ' · Automation: ' + counts.automations +
            ' · SQL non analizzati: ' + counts.sourceErrors + ' · Fonti non risolte: ' + counts.unresolvedSources + ' · Target non risolti: ' + counts.targetErrors +
            ' · Problemi automation: ' + counts.automationErrors + ' · Aggiornata: ' + new Date(result.generatedAt).toLocaleString();
        const shell = 'https://mc.' + result.stack + '.exacttarget.com';
        for (const row of result.rows || []) {
            const tr = make('tr'); tr.append(make('td', row.reads && row.writes ? 'Legge e scrive' : row.reads ? 'Legge' : 'Scrive'));
            const query = make('td'), queryLink = make('a', row.query.name || row.query.key);
            queryLink.href = shell + '/cloud/#app/Automation%20Studio/AutomationStudioFuel3/%23ActivityDetails/300/' + encodeURIComponent(row.query.id); queryLink.target = '_blank'; queryLink.rel = 'noopener noreferrer'; query.append(queryLink); tr.append(query, make('td', row.mode));
            const automation = make('td');
            if (row.automation) {
                const link = make('a', row.automation.name); link.href = shell + '/cloud/#app/Automation%20Studio/AutomationStudioFuel3/%23Instance/' + encodeURIComponent(row.automation.id) + '/Workflow';
                link.target = '_blank'; link.rel = 'noopener noreferrer'; automation.append(link);
            } else automation.textContent = result.coverage.automations ? 'Nessuna automation trovata' : 'Collegamenti automation incompleti';
            const states = { '-1': 'Errore', 0: 'Creazione', 1: 'Errore di creazione', 2: 'Pronta', 3: 'In esecuzione', 4: 'In pausa', 5: 'Arrestata', 6: 'Pianificata', 7: 'In attesa di trigger', 8: 'Inattiva' };
            tr.append(automation, make('td', row.automation ? row.automation.step + ' / ' + row.automation.activity : '—'), make('td', states[row.automation?.status] || row.automation?.status || '—')); tbody.append(tr);
        }
        rowsLoaded += result.rows?.length || 0;
        dialog.querySelector('[data-more]').hidden = rowsLoaded >= result.totalRows;
        if (!rowsLoaded) dialog.querySelector('[data-status]').textContent = result.message || 'Nessun riferimento trovato nell’ambito esaminato.';
    }
    async function lookup(refresh = false, offset = 0) {
        clearTimeout(timer);
        const ticket = ++generation, id = openedId;
        const status = dialog.querySelector('[data-status]'); status.textContent = 'Lettura analisi…';
        try {
            const current = await context();
            if (scope && scope !== current) throw Error('La BU aperta non corrisponde a questa analisi. Riapri il pannello.');
            scope = current;
            if (ticket !== generation || route() !== id) return;
            if (refresh) await authorized({ action: 'refresh' });
            const value = await authorized({ action: 'lookup', offset, ...(offset ? { revision } : {}) });
            if (ticket !== generation || route() !== id || !dialog.open) return;
            if (value.state === 'setup-required') { status.textContent = 'Configura una volta il pacchetto API Salesforce e autorizza questa BU. Premi Collega Analisi DE: la lettura avviene direttamente nell’estensione.'; return; }
            if (value.state === 'building') {
                status.textContent = (value.progress?.phase || 'Analisi in corso') + (value.progress?.total ? ' · ' + value.progress.current + '/' + value.progress.total : '');
                timer = setTimeout(() => { if (route() === id && dialog.open) void lookup(); }, 1500); return;
            }
            status.textContent = '';
            if (value.result) render(value.result, offset);
            if (value.error) status.textContent = value.error + (value.result ? ' Sono mostrati i risultati precedenti.' : '');
        } catch (error) { if (ticket === generation && dialog.open) status.textContent = error.message; }
    }
    function sync() {
        const id = route(), container = document.querySelector('#dataExtension');
        if (!id || !container) { button?.remove(); if (dialog?.open) close(); return; }
        if (openedId && openedId !== id) close();
        if (!button) {
            button = make('button', 'Dove viene usata', 'btn btn-secondary sfmcfix-de-usage-button'); button.id = 'sfmcfix-de-usage'; button.type = 'button';
            button.onclick = event => {
                if (!event.isTrusted) return;
                dialog ||= createDialog(); openedId = route(); scope = null; revision = null; rowsLoaded = 0;
                dialog.querySelector('tbody').replaceChildren(); dialog.querySelector('[data-coverage]').textContent = ''; dialog.querySelector('[data-identity]').textContent = 'DE ' + openedId;
                dialog.querySelector('[data-issues]').hidden = true;
                dialog.querySelector('[data-more]').hidden = true; dialog.showModal(); void lookup();
            };
        }
        if (button.parentElement !== container) container.prepend(button);
    }
    chrome.runtime.onMessage?.addListener((message, sender) => {
        if (sender.id !== chrome.runtime.id || !message?.__sfmcfixLocalAccessReset) return;
        close(); dialog?.querySelector('tbody').replaceChildren();
    });
    let queued = false;
    const queue = () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; sync(); }); } };
    new MutationObserver(queue).observe(document.body, { subtree: true, childList: true });
    window.addEventListener('hashchange', queue); window.addEventListener('pagehide', close); sync();
})();
