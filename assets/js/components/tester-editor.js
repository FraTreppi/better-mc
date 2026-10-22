(function () {
    'use strict';
    const api = window.sfmcfix;

    api.openTesterEditor = function () {
        const existing = document.getElementById('sfmcfix-tester-editor');
        if (existing) { existing.querySelector('input, button')?.focus(); return; }
        const context = api.context.current();
        if (!context.persistent) return;
        const previousFocus = document.activeElement;
        const dialog = document.createElement('dialog');
        dialog.id = 'sfmcfix-tester-editor';
        dialog.setAttribute('aria-labelledby', 'sfmcfix-tester-title');
        dialog.setAttribute('aria-describedby', 'sfmcfix-tester-description');
        dialog.innerHTML = `
            <form novalidate>
                <h2 id="sfmcfix-tester-title">Tester BU</h2>
                <p class="sfmcfix-tester-context"></p>
                <label>Sorgente dei destinatari
                    <select data-tester-source>
                        <option value="local">Rubrica locale di questo browser</option>
                        <option value="de">Data Extension condivisa: tester_content_builder</option>
                    </select>
                </label>
                <section data-tester-de hidden>
                    <p>Crea nella BU corrente la cartella <strong>Data Extensions → SFMC_UI_Fixer</strong>.
                        Inserisci una DE con Nome ed External Key <strong>tester_content_builder</strong> e i campi
                        <strong>Nome</strong> (Text), <strong>Cognome</strong> (Text), <strong>Email</strong> (EmailAddress, Primary Key).
                        La rubrica viene letta da Salesforce; gestisci lì i contatti. Nessun invio o modifica alla DE.</p>
                    <button type="button" data-tester-action="load-de">Verifica e carica DE</button>
                    <a data-tester-de-link target="_blank" rel="noopener noreferrer" hidden>Apri la DE</a>
                    <p data-tester-de-status role="status" aria-live="polite"></p>
                </section>
                <section data-tester-local>
                <p id="sfmcfix-tester-description">Aggiungi una riga per persona. Puoi salvare fino a 1000 tester.
                    I contatti restano in questo profilo browser, separati per BU. Salvarli non invia email.</p>
                <div class="sfmcfix-tester-table-wrap">
                    <table>
                        <thead><tr><th scope="col">Cognome</th><th scope="col">Nome</th><th scope="col">Email</th><th scope="col"><span class="sfmcfix-sr-only">Azioni</span></th></tr></thead>
                        <tbody></tbody>
                    </table>
                </div>
                <button type="button" data-tester-action="add">+ Aggiungi tester</button>
                </section>
                <p class="sfmcfix-tester-help">In Preview and Test cerca almeno tre caratteri del nome, cognome o indirizzo nel campo “type a name...”.</p>
                <p class="sfmcfix-tester-status" role="status" aria-live="polite"></p>
                <footer>
                    <button type="button" data-tester-action="close">Annulla</button>
                    <button type="submit" class="sfmcfix-primary">Salva tester</button>
                </footer>
            </form>`;
        dialog.querySelector('.sfmcfix-tester-context').textContent = `BU ${context.mid} · ${context.stack}`;
        const form = dialog.querySelector('form');
        const body = dialog.querySelector('tbody');
        const status = dialog.querySelector('.sfmcfix-tester-status');
        const save = dialog.querySelector('[type="submit"]');
        const close = dialog.querySelector('[data-tester-action="close"]');
        const source = dialog.querySelector('[data-tester-source]');
        source.value = api.preferences.get().testerSource === 'de' ? 'de' : 'local';
        const deStatus = dialog.querySelector('[data-tester-de-status]');
        const deLink = dialog.querySelector('[data-tester-de-link]');
        let loadGeneration = 0;
        let deReady = false;
        let saving = false;

        async function loadDe(refresh = false) {
            const generation = ++loadGeneration;
            deReady = false;
            save.disabled = true;
            deLink.hidden = true;
            deStatus.textContent = 'Lettura della DE nella BU corrente…';
            try {
                if (!api.testerSource) throw new Error('Ricarica la scheda Marketing Cloud per attivare la sorgente DE.');
                const result = await api.testerSource.list({ source: 'de', refresh });
                if (generation !== loadGeneration || source.value !== 'de' || api.context.current().scope !== context.scope) return;
                deReady = result.testers.length > 0 || result.invalid === 0;
                const reasons = { missingEmail: 'campo Email non trovato nella risposta', invalidEmail: 'Email vuota, non valida o di tipo errato',
                    invalidNames: 'Nome/Cognome non testuali o troppo lunghi', ambiguousFields: 'campi duplicati o ambigui', invalidFormat: 'formato record non riconosciuto' };
                const details = Object.entries(result.invalidReasons || {}).filter(([, count]) => count > 0)
                    .map(([reason, count]) => `${count}: ${reasons[reason] || 'record non valido'}`).join('; ');
                deStatus.textContent = `${result.testers.length} tester disponibili. ${result.invalid ? `${result.invalid} righe escluse${details ? ` (${details})` : ''}. ` : ''}${deReady ?
                    'Premi Salva sorgente per usarli. I dati vengono riletti dopo cinque minuti o con Verifica e carica DE.' :
                    'Nessun tester utilizzabile: verifica i Records e premi Verifica e carica DE.'}`;
                deLink.href = api.links.contactBuilder(result.id);
                deLink.hidden = false;
            } catch (error) {
                if (generation === loadGeneration) deStatus.textContent = error.message;
            } finally {
                if (generation === loadGeneration && source.value === 'de') save.disabled = !deReady;
            }
        }
        function renderSource() {
            const shared = source.value === 'de';
            dialog.querySelector('[data-tester-de]').hidden = !shared;
            dialog.querySelector('[data-tester-local]').hidden = shared;
            save.textContent = shared ? 'Salva sorgente' : 'Salva tester';
            save.disabled = shared && !deReady;
            edited();
            if (shared) loadDe();
            else { loadGeneration++; save.disabled = false; }
        }
        source.onchange = renderSource;
        dialog.querySelector('[data-tester-action="load-de"]').onclick = () => loadDe(true);

        function edited() {
            status.textContent = '';
            status.removeAttribute('data-error');
            close.textContent = 'Annulla';
        }

        function renumber() {
            Array.from(body.rows).forEach((row, index) => {
                row.querySelectorAll('input').forEach((input, field) => {
                    input.setAttribute('aria-label', `${['Cognome', 'Nome', 'Email'][field]} tester ${index + 1}`);
                });
                row.querySelector('button').setAttribute('aria-label', `Rimuovi tester ${index + 1}`);
            });
        }

        function addRow(values = ['', '', '']) {
            const row = document.createElement('tr');
            ['text', 'text', 'email'].forEach((type, index) => {
                const cell = row.insertCell();
                const input = document.createElement('input');
                input.type = type;
                input.autocomplete = 'off';
                input.maxLength = index === 2 ? 254 : 250;
                input.placeholder = ['Rossi', 'Mario', 'mario@example.com'][index];
                input.value = values[index] || '';
                cell.appendChild(input);
            });
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.textContent = '×';
            remove.title = 'Rimuovi questa riga; premi Salva tester per confermare';
            remove.onclick = () => {
                if (saving) return;
                const next = row.nextElementSibling || row.previousElementSibling;
                row.remove();
                if (!body.rows.length) addRow();
                renumber();
                edited();
                (next || body.rows[0]).querySelector('input').focus();
            };
            row.insertCell().appendChild(remove);
            body.appendChild(row);
            renumber();
            return row;
        }

        const testers = api.preferences.get().testers || [];
        if (testers.length) testers.forEach(tester => addRow(tester));
        else addRow();
        dialog.querySelector('[data-tester-action="add"]').onclick = () => {
            if (saving) return;
            edited();
            if (body.rows.length >= 1000) { status.textContent = 'Puoi salvare al massimo 1000 tester per BU.'; return; }
            addRow().querySelector('input').focus();
        };
        close.onclick = () => dialog.close();
        form.addEventListener('input', edited);
        form.addEventListener('submit', async event => {
            event.preventDefault();
            if (saving) return;
            if (source.value === 'de' && !deReady) return;
            edited();
            const values = [];
            for (const [index, row] of (source.value === 'de' ? [] : Array.from(body.rows)).entries()) {
                const fields = Array.from(row.querySelectorAll('input'));
                const entry = fields.map(input => input.value.trim());
                if (entry.every(value => !value)) continue;
                if (!/^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(entry[2])) {
                    status.textContent = `Controlla l’email del tester alla riga ${index + 1}. Nessuna modifica salvata.`;
                    status.dataset.error = 'true';
                    fields[2].focus();
                    return;
                }
                values.push(entry);
            }
            if (api.context.current().scope !== context.scope) { dialog.close(); return; }
            saving = true;
            form.querySelectorAll('input, button, select').forEach(element => { element.disabled = true; });
            save.textContent = 'Salvataggio…';
            try {
                await api.preferences.save(source.value === 'de' ? { testerSource: 'de' } : { testers: values, testerSource: 'local' });
                status.textContent = source.value === 'de' ? `Rubrica DE attiva per BU ${context.mid} · ${context.stack}. Cerca un destinatario nel campo type a name...` :
                    `${values.length} tester salvati per BU ${context.mid} · ${context.stack} in questo browser.`;
                close.textContent = 'Chiudi';
            } catch (error) {
                status.textContent = `Salvataggio non riuscito: ${error.message}`;
                status.dataset.error = 'true';
            } finally {
                saving = false;
                save.textContent = source.value === 'de' ? 'Salva sorgente' : 'Salva tester';
                form.querySelectorAll('input, button, select').forEach(element => { element.disabled = false; });
            }
        });
        const changedContext = () => {
            if (api.context.current().scope !== context.scope) dialog.close();
        };
        window.addEventListener('sfmcfix:contextchange', changedContext);
        dialog.addEventListener('close', () => {
            loadGeneration++;
            window.removeEventListener('sfmcfix:contextchange', changedContext);
            dialog.remove();
            if (previousFocus?.isConnected) previousFocus.focus();
        }, { once: true });
        document.body.appendChild(dialog);
        dialog.showModal();
        renderSource();
    };
})();
