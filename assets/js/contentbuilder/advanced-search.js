(function () {
    'use strict';
    const api = window.sfmcfix;
    if (api.openAssetSearch) return;
    const buttonId = 'sfmcfix-asset-search-button', dialogId = 'sfmcfix-asset-search';
    let mountTimer = null, mountedAnchor = null, opening = false;
    const nativeRoutes = new Map();
    function kind(typeId) { return Object.entries(api.assetSearch.types).find(([name, type]) => name !== 'all' && type.ids.includes(typeId))?.[0] || String(typeId); }
    function rememberNativeRoute() {
        const asset = api.temp?.lastloadedasset;
        if (!Number.isSafeInteger(Number(asset?.id)) || Number(asset.id) < 1) return;
        const match = location.hash.match(/^(#\/?asset\/)(\d+)((?:\/[a-z][a-z0-9-]*)*\/?)$/i);
        if (match && Number(match[2]) === Number(asset.id)) nativeRoutes.set(kind(Number(asset.assetType?.id)), { prefix: match[1], suffix: match[3] });
    }
    function visible(element) { return Boolean(element?.isConnected && element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden'); }
    function mount() {
        mountTimer = null;
        rememberNativeRoute();
        const inputs = Array.from(document.querySelectorAll('input[type="search"].form-control.dropdown-toggle'))
            .filter(input => input.placeholder.toLowerCase() === 'search' && visible(input) && !input.closest('dialog, .modal, #preview-panel'));
        const existing = document.getElementById(buttonId);
        if (inputs.length !== 1) { existing?.remove(); mountedAnchor?.classList.remove('sfmcfix-asset-search-anchor'); mountedAnchor = null; return; }
        const input = inputs[0], anchor = input.closest('.input-group') || input;
        if (existing?.previousElementSibling === anchor) {
            if (!anchor.classList.contains('sfmcfix-asset-search-anchor')) anchor.classList.add('sfmcfix-asset-search-anchor');
            return;
        }
        existing?.remove();
        mountedAnchor?.classList.remove('sfmcfix-asset-search-anchor');
        mountedAnchor = anchor; anchor.classList.add('sfmcfix-asset-search-anchor');
        const button = document.createElement('button');
        button.id = buttonId; button.type = 'button'; button.className = 'btn btn-default sfmcfix-asset-search-button';
        button.textContent = 'Advanced'; button.title = 'Cerca in tutte le cartelle di Content Builder';
        button.setAttribute('aria-haspopup', 'dialog'); button.onclick = api.openAssetSearch;
        anchor.after(button);
    }
    function scheduleMount() { if (mountTimer === null) mountTimer = setTimeout(mount, 120); }
    function folderPaths(folders) {
        const map = new Map(folders.map(folder => [folder.id, folder]));
        return new Map(folders.map(folder => {
            const seen = new Set(), parts = []; let current = folder;
            while (current && !seen.has(current.id) && parts.length < 100) {
                seen.add(current.id); parts.unshift(current.name); current = map.get(current.parentId);
            }
            if (current) parts.unshift('…');
            return [folder.id, parts.join(' / ')];
        }));
    }
    function openAsset(asset) {
        const row = document.querySelector(`[data-flow-id="cb:repeater:list:${asset.id}"]`);
        if (visible(row)) { (row.querySelector('.contentitem-table-name, [data-content-field="name"]') || row).click(); return; }
        const route = nativeRoutes.get(kind(asset.typeId));
        // Content Builder handles its asset route inside this module frame.
        // Prefer a route observed during native navigation when available.
        location.hash = route ? `${route.prefix}${asset.id}${route.suffix}` : `asset/${asset.id}${kind(asset.typeId) === 'email' ? '/email' : ''}`;
    }
    api.openAssetSearch = async function () {
        const existing = document.getElementById(dialogId);
        if (existing) { existing.querySelector('input')?.focus(); return; }
        if (opening) return;
        const openRoute = location.href;
        opening = true;
        try { await api.context.refresh?.(); }
        finally { opening = false; }
        if (openRoute !== location.href) return;
        const previousFocus = document.activeElement, context = api.context.current();
        const dialog = document.createElement('dialog'); dialog.id = dialogId;
        dialog.setAttribute('aria-labelledby', 'sfmcfix-asset-search-title');
        dialog.innerHTML = `
            <header><div><h2 id="sfmcfix-asset-search-title">Content Builder · Ricerca Advanced</h2><p data-context></p></div><button type="button" data-close aria-label="Chiudi ricerca">×</button></header>
            <p id="sfmcfix-asset-search-description">Cerca negli asset accessibili della BU corrente, in tutte le cartelle e sottocartelle. La ricerca riguarda nome e Customer Key, non il testo o l’HTML dei contenuti.</p>
            <form aria-describedby="sfmcfix-asset-search-description">
                <div class="sfmcfix-asset-search-filters">
                    <label class="sfmcfix-asset-search-term">Testo da cercare<input name="term" type="search" maxlength="250" autocomplete="off" placeholder="Nome, Customer Key o ID…"></label>
                    <label>Cerca in<select name="field"><option value="both">Nome o Customer Key</option><option value="name">Nome</option><option value="customerKey">Customer Key</option><option value="id">ID asset esatto</option></select></label>
                    <label>Corrispondenza<select name="mode"><option value="contains">Contiene</option><option value="start">Inizia con</option><option value="end">Finisce con</option><option value="equal">Uguale a</option></select></label>
                    <label>Tipo di contenuto<select name="type"></select></label>
                    <label class="sfmcfix-asset-search-folder">Cartella<select name="folder" disabled><option value="">Tutte le cartelle e sottocartelle</option></select></label>
                    <label>Modificato dal (UTC)<input name="from" type="date"></label>
                    <label>Modificato fino al (UTC)<input name="to" type="date"></label>
                    <label>Ordina per<select name="sort"><option value="modified">Ultima modifica</option><option value="name">Nome A–Z</option><option value="created">Creazione più recente</option></select></label>
                </div>
                <div class="sfmcfix-asset-search-actions"><button type="submit" class="primary">Cerca</button><button type="button" data-reset>Azzera filtri</button><button type="button" data-cancel hidden>Interrompi</button><span>Una cartella selezionata limita la ricerca a quella sola cartella.</span></div>
            </form>
            <p data-folder-status role="status">Caricamento dei percorsi delle cartelle…</p>
            <p data-status role="status" aria-live="polite">Inserisci un testo o scegli i filtri, poi premi Cerca. Senza filtri vengono elencati tutti gli asset accessibili.</p>
            <button type="button" data-diagnostics hidden>Scarica diagnostica ricerca</button>
            <div class="sfmcfix-asset-search-results"><table><thead><tr><th scope="col">Nome / Customer Key</th><th scope="col">Tipo</th><th scope="col">Cartella</th><th scope="col">Ultima modifica</th><th scope="col">Apri</th></tr></thead><tbody></tbody></table></div>
            <footer><button type="button" data-prev disabled>Precedente</button><span data-page>Nessuna ricerca</span><button type="button" data-next disabled>Successiva</button><button type="button" data-close>Chiudi</button></footer>`;
        const $ = selector => dialog.querySelector(selector), form = $('form'), status = $('[data-status]'), body = $('tbody');
        $('[data-context]').textContent = `${context.mid ? 'BU ' + context.mid : 'BU della sessione · MID non rilevato'} · ${context.stack || location.hostname}`;
        for (const [value, type] of Object.entries(api.assetSearch.types)) {
            const option = document.createElement('option'); option.value = value; option.textContent = type.label; $('[name="type"]').append(option);
        }
        let paths = new Map(), result = null, filters = null, generation = 0, busy = false, closed = false;
        function paging() {
            $('[data-prev]').disabled = busy || !result || result.page <= 1;
            $('[data-next]').disabled = busy || !result || result.page * result.pageSize >= result.count;
        }
        function loading(value) { busy = value; $('[data-cancel]').hidden = !value; dialog.setAttribute('aria-busy', String(value)); paging(); }
        function clear() { result = null; body.replaceChildren(); $('[data-diagnostics]').hidden = true; $('[data-page]').textContent = 'Nessuna ricerca'; paging(); }
        function stillCurrent(value) { return !closed && value === generation && context.scope === api.context.current().scope; }
        function render() {
            body.replaceChildren();
            for (const asset of result?.items || []) {
                const row = document.createElement('tr');
                const cell = text => { const node = document.createElement('td'); node.textContent = text; row.append(node); return node; };
                const name = cell(''), title = document.createElement('strong'), key = document.createElement('small');
                title.textContent = asset.name; key.textContent = `ID ${asset.id} · ${asset.customerKey || 'Customer Key non disponibile'}`;
                name.append(title, key); cell(asset.type);
                const folder = cell(paths.get(asset.folderId) || asset.folder || (asset.folderId ? 'Cartella #' + asset.folderId : 'Cartella non disponibile'));
                folder.title = folder.textContent;
                const modified = new Date(asset.modified);
                cell(Number.isFinite(modified.getTime()) ? modified.toLocaleString('it-IT') : '—');
                const action = cell(''), button = document.createElement('button');
                button.type = 'button'; button.textContent = 'Apri'; button.setAttribute('aria-label', `Apri ${asset.name}`);
                button.onclick = () => {
                    if (!stillCurrent(generation)) { dialog.close(); return; }
                    dialog.close(); openAsset(asset);
                };
                action.append(button); body.append(row);
            }
        }
        async function search(page) {
            const current = ++generation;
            clear(); loading(true); status.textContent = 'Ricerca in tutte le cartelle della BU corrente…';
            try {
                const data = await api.assetSearch.search(filters, page);
                if (!stillCurrent(current)) return;
                result = data; render();
                const start = data.items.length ? (data.page - 1) * data.pageSize + 1 : 0, end = start ? start + data.items.length - 1 : 0;
                status.textContent = data.count ? `${start}–${end} di ${data.count} risultati.` : 'Nessun contenuto trovato con questi filtri.';
                $('[data-page]').textContent = `Pagina ${data.page} di ${Math.max(1, Math.ceil(data.count / data.pageSize))}`;
            } catch (error) {
                if (stillCurrent(current)) {
                    status.textContent = error.name === 'AbortError' ? 'Ricerca interrotta. Premi Cerca per riprovare.' : error.message;
                    $('[data-diagnostics]').hidden = error.name === 'AbortError';
                }
            }
            finally { if (stillCurrent(current)) loading(false); }
        }
        form.onsubmit = event => { event.preventDefault(); filters = Object.fromEntries(new FormData(form)); search(1); };
        form.oninput = () => {
            generation++; api.assetSearch.cancelSearch(); loading(false); clear();
            status.textContent = 'Filtri modificati. Premi Cerca per aggiornare i risultati.';
        };
        $('[data-prev]').onclick = () => { if (result && !busy) search(result.page - 1); };
        $('[data-next]').onclick = () => { if (result && !busy) search(result.page + 1); };
        $('[data-cancel]').onclick = () => { generation++; api.assetSearch.cancelSearch(); loading(false); clear(); status.textContent = 'Ricerca interrotta. Premi Cerca per riprovare.'; };
        $('[data-reset]').onclick = () => { form.reset(); form.oninput(); $('[name="term"]').focus(); };
        $('[data-diagnostics]').onclick = () => {
            const url = URL.createObjectURL(new Blob([JSON.stringify(api.assetSearch.diagnostics(), null, 2)], { type: 'application/json' }));
            const link = document.createElement('a'); link.href = url; link.download = 'sfmc-content-builder-diagnostica.json';
            dialog.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        };
        dialog.querySelectorAll('[data-close]').forEach(button => { button.onclick = () => dialog.close(); });
        const changeContext = () => { if (context.scope !== api.context.current().scope) dialog.close(); };
        const changeRoute = () => dialog.close();
        window.addEventListener('sfmcfix:contextchange', changeContext); window.addEventListener('hashchange', changeRoute);
        dialog.addEventListener('close', () => {
            closed = true; generation++; api.assetSearch.cancel();
            window.removeEventListener('sfmcfix:contextchange', changeContext); window.removeEventListener('hashchange', changeRoute);
            dialog.remove(); if (previousFocus?.isConnected) previousFocus.focus();
        }, { once: true });
        document.body.append(dialog); dialog.showModal(); $('[name="term"]').focus();
        api.assetSearch.folders().then(folders => {
            if (closed || context.scope !== api.context.current().scope) return;
            paths = folderPaths(folders);
            for (const [value, path] of [...paths.entries()].sort((a, b) => a[1].localeCompare(b[1], 'it'))) {
                const option = document.createElement('option'); option.value = String(value); option.textContent = path; $('[name="folder"]').append(option);
            }
            $('[name="folder"]').disabled = false; $('[data-folder-status]').textContent = '';
            render();
        }).catch(error => {
            if (closed) return;
            $('[data-diagnostics]').hidden = false;
            $('[data-folder-status]').textContent = error.name === 'AbortError' ? 'Percorsi cartelle non caricati. Riapri Advanced per riprovare; la ricerca globale resta disponibile.' :
                `Percorsi cartelle non disponibili: ${error.message} La ricerca globale resta disponibile.`;
        });
    };
    const observer = new MutationObserver(scheduleMount);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'style'] });
    window.addEventListener('hashchange', () => { rememberNativeRoute(); scheduleMount(); });
    window.addEventListener('sfmcfix:contextchange', () => nativeRoutes.clear());
    mount();
})();
