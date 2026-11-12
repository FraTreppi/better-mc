(function () {
    'use strict';
    const status = document.getElementById('status'), form = document.getElementById('connection');
    const send = message => chrome.runtime.sendMessage({ __sfmcfixDEUsage: true, ...message }).then(value => { if (!value?.ok) throw Error(value?.error || 'Collegamento non disponibile.'); return value.result; });
    const show = value => { status.textContent = value.configured ? 'Componente collegato per BU ' + value.mid + ' · ' + value.stack + '. Apri una DE in Contact Builder e premi Dove viene usata.' : 'Collegamento non ancora configurato.'; };
    form.onsubmit = async event => {
        event.preventDefault(); const button = form.querySelector('[type="submit"]'); button.disabled = true; status.textContent = 'Verifica del componente locale…';
        try { show(await send({ action: 'save', code: document.getElementById('code').value })); document.getElementById('code').value = ''; }
        catch (error) { status.textContent = error.message; } finally { button.disabled = false; }
    };
    document.getElementById('clear').onclick = () => send({ action: 'clear' }).then(show).catch(error => { status.textContent = error.message; });
    send({ action: 'config' }).then(show).catch(error => { status.textContent = error.message; });
})();
