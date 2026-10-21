(function () {
    'use strict';
    const select = document.getElementById('source-tab');
    const refresh = document.getElementById('refresh');
    const collect = document.getElementById('collect');
    const download = document.getElementById('download');
    const status = document.getElementById('status');
    const preview = document.getElementById('preview');
    let report = null;

    function clearReport() {
        report = null;
        download.disabled = true;
        preview.hidden = true;
        document.getElementById('report').textContent = '';
    }

    async function loadTabs() {
        clearReport();
        select.replaceChildren();
        select.disabled = collect.disabled = refresh.disabled = true;
        try {
            const tabs = await chrome.tabs.query({ url: [
                'https://*.exacttarget.com/*', 'https://*.marketingcloud.com/*', 'https://*.marketingcloudapps.com/*'
            ] });
            for (const tab of tabs) {
                const url = new URL(tab.url);
                if (!/^#app\/Email(?:\/|$)/i.test(url.hash) && !/^\/C12\//i.test(url.pathname)) continue;
                const option = document.createElement('option');
                option.value = tab.id;
                option.textContent = `Email Studio · ${url.hostname} · scheda ${tab.id}`;
                select.append(option);
            }
            select.disabled = collect.disabled = !select.options.length;
            status.textContent = select.options.length ? 'Seleziona la scheda con la DE aperta.' : 'Nessuna scheda Email Studio trovata. Aprila in questo profilo del browser, poi aggiorna l’elenco.';
        } catch (_) {
            status.textContent = 'Impossibile leggere l’elenco delle schede. Ricarica l’estensione e riprova.';
        } finally { refresh.disabled = false; }
    }

    collect.addEventListener('click', async () => {
        clearReport();
        collect.disabled = refresh.disabled = select.disabled = true;
        status.textContent = 'Raccolta dei percorsi di navigazione…';
        const tabId = Number(select.value);
        const requestId = crypto.randomUUID();
        const frames = new Map();
        const pending = new Set();
        let lastResponse = Date.now();
        const receive = (message, sender) => {
            if (message?.type !== 'sfmcfix:de-diagnostics-result' || message.requestId !== requestId ||
                sender.id !== chrome.runtime.id || sender.tab?.id !== tabId ||
                (frames.size >= 100 && !frames.has(sender.frameId))) return;
            frames.set(sender.frameId, { frameId: sender.frameId, ...message.frame });
            if (message.pending) pending.add(sender.frameId);
            else pending.delete(sender.frameId);
            lastResponse = Date.now();
            status.textContent = `Raccolta da ${frames.size} frame; analisi delle rotte native in corso…`;
        };
        chrome.runtime.onMessage.addListener(receive);
        try {
            await chrome.tabs.sendMessage(tabId, { type: 'sfmcfix:de-diagnostics', requestId });
            const deadline = Date.now() + 10000;
            do {
                await new Promise(resolve => setTimeout(resolve, 200));
            } while (Date.now() < deadline && (pending.size || Date.now() - lastResponse < 800));
            if (!frames.size) throw new Error('no frames');
            report = { format: 'sfmcfix-email-studio-routing-v2', capturedAt: new Date().toISOString(),
                incompleteFrameIds: [...pending], frameLimitReached: frames.size >= 100,
                frames: [...frames.values()].sort((a, b) => a.frameId - b.frameId) };
            document.getElementById('report').textContent = JSON.stringify(report, null, 2);
            preview.hidden = false;
            download.disabled = false;
            const routeCount = report.frames.reduce((total, frame) => total + (frame.nativeScripts || [])
                .reduce((count, script) => count + script.routeLiterals.length, 0), 0);
            status.textContent = `Rapporto raccolto da ${frames.size} frame; ${routeCount} stringhe di navigazione native trovate.` +
                (pending.size ? ' Alcuni frame non hanno completato l’analisi.' : '') +
                ' Puoi controllarlo e scaricarlo per condividerlo nella chat.';
        } catch (_) {
            status.textContent = 'Nessun rapporto disponibile. Ricarica l’estensione, aggiorna la pagina Email Studio, riapri il dettaglio della DE e riprova.';
        } finally {
            chrome.runtime.onMessage.removeListener(receive);
            collect.disabled = refresh.disabled = select.disabled = false;
        }
    });

    refresh.addEventListener('click', loadTabs);
    select.addEventListener('change', () => { clearReport(); status.textContent = 'Premi Raccogli diagnostica per la scheda selezionata.'; });
    download.addEventListener('click', () => {
        if (!report) return;
        const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = 'sfmc-email-studio-diagnostica.json';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    loadTabs();
})();
