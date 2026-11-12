(function () {
    'use strict';
    const status = document.getElementById('status'), form = document.getElementById('connection');
    const send = message => chrome.runtime.sendMessage({ __sfmcfixDEUsage: true, ...message }).then(value => { if (!value?.ok) throw Error(value?.error || 'Configurazione API non disponibile.'); return value.result; });
    let approvalGeneration = 0;
    const checkApproval = async () => {
        const ticket = ++approvalGeneration;
        const result = await send({ action: 'approval', mid: document.getElementById('mid').value, stack: document.getElementById('stack').value });
        if (ticket !== approvalGeneration) return;
        const approved = result.approved === true, checkbox = document.getElementById('approveBU');
        document.getElementById('consent').hidden = approved; checkbox.required = !approved; checkbox.checked = false;
        document.getElementById('approvalStatus').textContent = approved ? 'BU già autorizzata: il consenso esistente viene riutilizzato, senza una nuova approvazione.' : '';
        form.querySelector('[type="submit"]').textContent = approved ? 'Salva collegamento API' : 'Salva e autorizza questa BU';
    };
    for (const field of ['mid','stack']) document.getElementById(field).addEventListener('input', () => { void checkApproval().catch(() => {}); });
    const show = value => {
        status.textContent = value.configured ? 'API configurate per BU ' + value.mid + ' · ' + value.stack + '. Non occorre reinserire le credenziali. Apri una DE e premi Dove viene usata.' : 'API non ancora configurate. Inserisci i dati del pacchetto e autorizza la BU.';
        if (value.configured) { document.getElementById('mid').value = value.mid; document.getElementById('stack').value = value.stack; if (value.authUrl) document.getElementById('authUrl').value = value.authUrl; }
        void checkApproval().catch(() => {});
    };
    form.onsubmit = async event => {
        event.preventDefault(); const button = form.querySelector('[type="submit"]'); button.disabled = true; status.textContent = 'Verifica del collegamento API Salesforce…';
        const config = Object.fromEntries(['mid','stack','authUrl','clientId','clientSecret'].map(key => [key, document.getElementById(key).value.trim()]));
        try {
            show(await send({ action: 'save', config, approveBU: document.getElementById('approveBU').checked }));
        } catch (error) { status.textContent = error.message; void checkApproval().catch(() => {}); }
        finally { config.clientSecret = ''; document.getElementById('clientSecret').value = ''; button.disabled = false; }
    };
    document.getElementById('clear').onclick = () => send({ action: 'clear' }).then(value => { form.reset(); show(value); }).catch(error => { status.textContent = error.message; });
    send({ action: 'config' }).then(show).catch(error => { status.textContent = error.message; });
})();
