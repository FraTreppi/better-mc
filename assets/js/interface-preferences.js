(function () {
    'use strict';
    const KEY = 'SFMCFIX---UI-PREFERENCES';
    const toggle = document.getElementById('show-preview-icons');
    const status = document.getElementById('interface-status');
    let saved = true;
    let pending = false;
    function render(value) {
        saved = value?.hidePreviewIcons !== true;
        if (!pending) toggle.checked = saved;
    }
    chrome.storage.local.get([KEY], result => {
        if (chrome.runtime.lastError) {
            status.textContent = `Impossibile leggere le impostazioni: ${chrome.runtime.lastError.message}`;
            return;
        }
        render(result[KEY]);
        toggle.disabled = false;
    });
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes[KEY]) render(changes[KEY].newValue);
    });
    toggle.addEventListener('change', async () => {
        const show = toggle.checked;
        pending = true;
        toggle.disabled = true;
        status.textContent = 'Salvataggio…';
        try {
            const response = await chrome.runtime.sendMessage({ __sfmcfixStorage: true, action: 'merge',
                payload: { items: { [KEY]: { hidePreviewIcons: !show } } } });
            if (!response?.ok) throw new Error(response?.error || 'Salvataggio non riuscito');
            saved = show;
            status.textContent = show ? 'Icone visibili in Preview and Test.' : 'Entrambe le icone sono nascoste. Puoi riattivarle da questa pagina.';
        } catch (error) {
            status.textContent = `Impostazione non salvata: ${error.message}`;
        } finally {
            pending = false;
            toggle.checked = saved;
            toggle.disabled = false;
        }
    });
})();
