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
                <p id="sfmcfix-tester-description">Aggiungi una riga per persona. Puoi salvare fino a 1000 tester.
                    I contatti restano in questo profilo browser, separati per BU. Salvarli non invia email.</p>
                <div class="sfmcfix-tester-table-wrap">
                    <table>
                        <thead><tr><th scope="col">Cognome</th><th scope="col">Nome</th><th scope="col">Email</th><th scope="col"><span class="sfmcfix-sr-only">Azioni</span></th></tr></thead>
                        <tbody></tbody>
                    </table>
                </div>
                <button type="button" data-tester-action="add">+ Aggiungi tester</button>
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
        let saving = false;

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
            edited();
            const values = [];
            for (const [index, row] of Array.from(body.rows).entries()) {
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
            form.querySelectorAll('input, button').forEach(element => { element.disabled = true; });
            save.textContent = 'Salvataggio…';
            try {
                await api.preferences.save({ testers: values });
                status.textContent = `${values.length} tester salvati per BU ${context.mid} · ${context.stack} in questo browser.`;
                close.textContent = 'Chiudi';
            } catch (error) {
                status.textContent = `Salvataggio non riuscito: ${error.message}`;
                status.dataset.error = 'true';
            } finally {
                saving = false;
                save.textContent = 'Salva tester';
                form.querySelectorAll('input, button').forEach(element => { element.disabled = false; });
            }
        });
        const changedContext = () => {
            if (api.context.current().scope !== context.scope) dialog.close();
        };
        window.addEventListener('sfmcfix:contextchange', changedContext);
        dialog.addEventListener('close', () => {
            window.removeEventListener('sfmcfix:contextchange', changedContext);
            dialog.remove();
            if (previousFocus?.isConnected) previousFocus.focus();
        }, { once: true });
        document.body.appendChild(dialog);
        dialog.showModal();
    };
})();
