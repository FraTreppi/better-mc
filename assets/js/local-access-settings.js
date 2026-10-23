(function () {
    'use strict';
    const button = document.getElementById('reset-local-access'), status = document.getElementById('local-access-status');
    button.addEventListener('click', async () => {
        button.disabled = true;
        try {
            const response = await chrome.runtime.sendMessage({ __sfmcfixStorage: true, action: 'resetLocalAccess' });
            if (!response?.ok) throw new Error(response?.error || 'Operazione non riuscita.');
            status.textContent = 'Conferme ripristinate. Verranno richieste al prossimo utilizzo dei dati locali. Rubrica e versioni salvate sono conservate.';
        } catch (_) { status.textContent = 'Impossibile ripristinare le conferme. Riapri questa pagina e riprova.'; }
        finally { button.disabled = false; }
    });
})();
