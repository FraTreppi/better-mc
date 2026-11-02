(function () {
    'use strict';
    const api = window.sfmcfix;
    if (api.codeProject) return;
    const GUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
    let busy = false;
    let generation = 0;
    let xhr;
    const clean = (value, depth = 0) => {
        if (depth > 60) throw Error('La struttura del contenuto è troppo profonda.');
        if (Array.isArray(value)) return value.map(item => clean(item, depth + 1));
        if (!value || typeof value !== 'object') return value;
        return Object.fromEntries(Object.entries(value).filter(([key]) =>
            !/^(?:access_?token|refresh_?token|client_?secret|authorization|cookie|password|__proto__|constructor|prototype)$/i.test(key))
            .map(([key, item]) => [key, clean(item, depth + 1)]));
    };
    function currentAsset() {
        // An editor may have loaded before our AJAX hooks. Use its explicit
        // route identity, never the last asset fetched by an unrelated panel.
        const paths = [api.nativeSession?.backbone?.()?.history?.fragment, location.pathname, location.hash.slice(1)].filter(value => typeof value === 'string' && value);
        const ids = new Set();
        for (const value of paths) {
            let route;
            try { route = decodeURIComponent(value.split('?')[0]).replace(/^#?\/?/, ''); } catch (_) { return null; }
            if (/(?:^|\/)(?:folder|folders|category|categories|recyclebin|delete|copy|create)(?:\/|$)/i.test(route)) return null;
            if (!/(?:^|\/)(?:asset|assets|content|email|emails|editor|contenteditor(?:\.aspx)?)(?:\/|$)/i.test(route)) continue;
            const numbers = route.split('/').filter(part => /^[1-9]\d{0,14}$/.test(part));
            if (numbers.length > 1) return null;
            if (numbers.length) ids.add(Number(numbers[0]));
        }
        for (const query of [location.search, ...paths.filter(value => value.includes('?')).map(value => value.slice(value.indexOf('?')))]) {
            const values = Array.from(new URLSearchParams(query)).filter(([key]) => /^assetId$/i.test(key)).map(([, value]) => value);
            if (values.some(value => !/^[1-9]\d{0,14}$/.test(value))) return null;
            for (const value of values) ids.add(Number(value));
        }
        const [id] = ids;
        return ids.size === 1 && Number.isSafeInteger(id) ? { id } : null;
    }
    function describe() {
        if (/^content-builder\./i.test(location.hostname)) {
            const current = currentAsset();
            if (current) return { kind: 'asset', id: current.id, path: '/fuelapi/asset/v1/content/assets/' + current.id };
        }
        const query = location.hash.match(/^#ActivityDetails\/300\/([a-f0-9-]{36})\/?$/i);
        if (/^\/AutomationStudioFuel3(?:\/|$)/i.test(location.pathname) && query && GUID.test(query[1])) {
            return { kind: 'query', id: query[1], path: '/AutomationStudioFuel3/fuelapi/automation/v1/queries/' + query[1] };
        }
        const journey = location.hash.match(/^#\/?([a-f0-9-]{36})(?:\/(\d+))?(?:\/|$)/i);
        if (/^jbinteractions\./i.test(location.hostname) && journey && GUID.test(journey[1])) {
            return { kind: 'journey', id: journey[1], version: journey[2] || null, path: '/fuelapi/interaction/v1/interactions/' + journey[1] + '?extras=all' + (journey[2] ? '&versionNumber=' + journey[2] : '') };
        }
        return null;
    }
    function read(path) {
        const client = api.nativeSession?.client();
        if (!client) throw Error('Attendi il caricamento del modulo e riprova.');
        return new Promise((resolve, reject) => {
            xhr = client.ajax({ url: path, type: 'GET', dataType: 'json', contentType: api.nativeSession.contentType,
                headers: api.nativeSession.headers(), useFuel2Token: true, cache: false, timeout: 30000,
                success: resolve, error: response => reject(Error('Esportazione non disponibile (HTTP ' + (Number(response?.status) || 0) + ').')) });
        });
    }
    function download(text, filename, type) {
        const blob = new Blob([text], { type });
        if (blob.size > 20 * 1024 * 1024) throw Error('Il contenuto supera 20 MB. Usa il backup del progetto locale.');
        const url = URL.createObjectURL(blob), link = document.createElement('a');
        link.href = url; link.download = filename;
        link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    function htmlEditors() {
        if (!/^content-builder\./i.test(location.hostname)) return [];
        const readers = [], seen = new Set();
        const add = (node, editor, read) => {
            if (node && editor && !seen.has(editor) && visible(node)) { seen.add(editor); readers.push({ node, read }); }
        };
        for (const node of document.querySelectorAll('.CodeMirror')) {
            const editor = node.CodeMirror;
            if (typeof editor?.getValue === 'function') add(node, editor, () => editor.getValue());
        }
        for (const node of document.querySelectorAll('.ace_editor')) {
            const editor = node.env?.editor;
            if (typeof editor?.getValue === 'function') add(node, editor, () => editor.getValue());
        }
        for (const node of document.querySelectorAll('.cm-editor')) {
            const editor = node.cmView?.view || node.querySelector('.cm-content')?.cmView?.view;
            if (editor?.state?.doc && typeof editor.state.doc.toString === 'function') add(node, editor, () => editor.state.doc.toString());
        }
        for (const editor of window.monaco?.editor?.getEditors?.() || []) {
            if (typeof editor.getValue === 'function') add(editor.getDomNode?.(), editor, () => editor.getValue());
        }
        for (const node of document.querySelectorAll('textarea[data-language="html"], textarea[data-mode*="html"], textarea[name="html"], textarea[name="content"], textarea[name="source"]')) {
            add(node, node, () => node.value);
        }
        return readers;
    }
    function exportHTML() {
        const scope = api.context.current().scope, href = location.href;
        const readers = htmlEditors(), sources = new Set();
        for (const reader of readers) {
            const text = reader.read();
            if (typeof text !== 'string' || !/<(?:!doctype\b|\/?[a-z][a-z0-9:-]*(?:\s|>|\/))/i.test(text)) continue;
            if (!reader.node.isConnected || !visible(reader.node)) throw Error('Editor cambiato durante l’esportazione. Riprova.');
            sources.add(text);
        }
        if (!sources.size) throw Error('Sorgente HTML non disponibile. Apri la scheda Content e la vista codice HTML, poi riprova.');
        if (sources.size !== 1) throw Error('Sono aperti più editor HTML. Apri soltanto il sorgente da esportare e riprova.');
        if (scope !== api.context.current().scope || href !== location.href) throw Error('Esportazione interrotta: contenuto o BU cambiati.');
        const [text] = sources;
        // Read the complete native document, never the rendered preview or
        // virtualized DOM lines. A plain-text Blob also avoids executing it.
        download(text, 'sfmc-sorgente-editor-' + new Date().toISOString().replace(/[:.]/g, '-') + '.html', 'text/plain;charset=utf-8');
        return text;
    }
    async function exportCurrent() {
        if (busy) return;
        const selected = describe();
        if (!selected) throw Error('Identificativo del contenuto non disponibile. Apri il contenuto dall’elenco e riprova.');
        busy = true;
        try {
            await api.context.refresh();
            const context = api.context.current();
            const ticket = ++generation;
            const sessionMid = await api.nativeSession.readMid?.();
            const mid = sessionMid || context.mid;
            if (api.nativeSession.readMid && !sessionMid || !/^[1-9]\d{0,14}$/.test(String(mid || '')) || !/^s\d+$/.test(context.stack || '')) throw Error('BU non rilevata. Apri il modulo dal menu Salesforce e verifica il MID prima di esportare.');
            if (ticket !== generation || context.scope !== api.context.current().scope) throw Error('Esportazione interrotta: BU cambiata.');
            const data = await read(selected.path);
            if (ticket !== generation || context.scope !== api.context.current().scope || JSON.stringify(selected) !== JSON.stringify(describe())) throw Error('Esportazione interrotta: contenuto o BU cambiati.');
            const actual = selected.kind === 'asset' ? data?.id : selected.kind === 'query' ? data?.queryDefinitionId : data?.id;
            if (String(actual).toLowerCase() !== String(selected.id).toLowerCase()) throw Error('La risposta non corrisponde al contenuto aperto.');
            if (selected.version && Number(data.version ?? data.versionNumber) !== Number(selected.version)) throw Error('La risposta non corrisponde alla versione del Journey aperta.');
            if (sessionMid && String(await api.nativeSession.readMid()) !== String(sessionMid)) throw Error('Esportazione interrotta: BU cambiata.');
            if (ticket !== generation || context.scope !== api.context.current().scope) throw Error('Esportazione interrotta: BU cambiata.');
            const kind = selected.kind === 'asset' && [205, 246, 247].includes(Number(data.assetType?.id)) ? 'cloudpage' : selected.kind;
            const snapshot = { format: 'sfmc-git-export-v1', exportedAt: new Date().toISOString(), source: 'saved-in-salesforce',
                context: { stack: context.stack, mid: String(mid) }, items: [{ kind, id: String(actual) + (kind === 'journey' ? '.v' + (data.version ?? data.versionNumber ?? '') : ''), data: clean(data) }] };
            const text = JSON.stringify(snapshot, null, 2);
            if (text.length > 20 * 1024 * 1024) throw Error('Il contenuto supera 20 MB. Usa il backup del progetto locale.');
            download(text, 'sfmc-git-' + kind + '-' + String(actual) + '.json', 'application/json');
            return snapshot;
        } finally { busy = false; xhr = null; }
    }
    const button = document.createElement('button');
    button.id = 'sfmcfix-export-git'; button.type = 'button'; button.textContent = 'Esporta per Git';
    button.title = 'Scarica il contenuto salvato in Salesforce per il progetto locale. Le modifiche non salvate nell’editor sono escluse.';
    button.hidden = true;
    document.body.append(button);
    const htmlButton = document.createElement('button');
    htmlButton.id = 'sfmcfix-download-html'; htmlButton.type = 'button'; htmlButton.textContent = 'Scarica HTML';
    htmlButton.title = 'Scarica il sorgente HTML completo dell’editor, comprese le modifiche non salvate. AMPscript e JavaScript rimangono codice nel file.';
    htmlButton.hidden = true;
    document.body.append(htmlButton);
    const status = document.createElement('span');
    status.setAttribute('role', 'status'); status.style.cssText = 'position:fixed;right:16px;top:176px;z-index:2147483646;max-width:420px;background:white;color:#243746;font:13px/1.5 Arial,sans-serif;pointer-events:none';
    document.body.append(status);
    button.onclick = async () => {
        button.disabled = true; status.textContent = 'Esportazione del contenuto salvato…';
        try { await exportCurrent(); status.textContent = 'File pronto. Nel progetto locale usa il comando import per estrarre codice e documentazione.'; }
        catch (error) { status.textContent = error.message; }
        finally { button.disabled = false; }
    };
    htmlButton.onclick = () => {
        try { exportHTML(); status.textContent = 'HTML scaricato: contiene il sorgente attuale dell’editor, comprese le modifiche non salvate.'; }
        catch (error) { status.textContent = error.message; }
    };
    const contentBuilder = /^content-builder\./i.test(location.hostname);
    const visible = node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden';
    let queued = false, boundHistory, lastURL = location.href;
    const queueSync = () => { if (!queued) { queued = true; requestAnimationFrame(sync); } };
    const changed = () => { generation++; try { xhr?.abort?.(); } catch (_) {} status.textContent = ''; queueSync(); };
    function sync() {
        queued = false;
        if (lastURL !== location.href) { lastURL = location.href; changed(); }
        const history = api.nativeSession?.backbone?.()?.history;
        if (history !== boundHistory) {
            boundHistory?.off?.('route', changed); boundHistory = history;
            boundHistory?.on?.('route', changed);
        }
        const save = contentBuilder && Array.from(document.querySelectorAll('button, [role="button"], input[type="submit"]')).find(node =>
            node !== button && /^(save|salva)$/i.test((node.value || node.textContent || '').trim()) && visible(node));
        const editorHeading = save && Array.from(document.querySelectorAll('h1, h2, h3, [role="heading"]')).some(node =>
            /^(?:edit\s+(?:email|content|template|block)|modifica\s+(?:email|contenuto|modello|blocco))(?:\s|$)/i.test(node.textContent.trim()) && visible(node));
        const show = Boolean(describe() || editorHeading), showHTML = contentBuilder && htmlEditors().length > 0;
        const position = save && (show || showHTML) ? 'toolbar' : contentBuilder ? 'top' : 'bottom';
        for (const [control, active] of [[button, show], [htmlButton, showHTML]]) {
            if (control.dataset.position !== position) {
                control.dataset.position = position;
                control.style.cssText = (position === 'toolbar' ? 'position:relative;margin-right:8px;vertical-align:middle;' :
                    'position:fixed;right:' + (position === 'top' ? (control === htmlButton ? '312px;' : '160px;') + 'top:64px;' : '16px;bottom:16px;')) +
                    'z-index:2147483646;padding:8px 12px;border:1px solid #b5c8da;border-radius:4px;background:white;color:#145b92;font:13px Arial,sans-serif;cursor:pointer';
            }
            if (control.hidden !== !active) control.hidden = !active;
            const display = active ? 'inline-flex' : 'none';
            if (control.style.display !== display) control.style.display = display;
        }
        if (save && (show || showHTML)) {
            const target = save.closest('.btn-group, .slds-button-group') || save;
            if (button.nextElementSibling !== target) target.before(button);
            if (htmlButton.nextElementSibling !== button) button.before(htmlButton);
        } else {
            if (button.parentElement !== document.body) document.body.append(button);
            if (htmlButton.parentElement !== document.body) document.body.append(htmlButton);
        }
    }
    const observer = new MutationObserver(queueSync);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
    window.addEventListener('hashchange', changed);
    window.addEventListener('popstate', changed);
    window.addEventListener('resize', queueSync);
    window.addEventListener('sfmcfix:contextchange', changed);
    window.addEventListener('sfmcfix:asset-loaded', queueSync);
    window.addEventListener('pagehide', () => { observer.disconnect(); boundHistory?.off?.('route', changed); generation++; try { xhr?.abort?.(); } catch (_) {} }, { once: true });
    sync();
    api.codeProject = { exportCurrent, exportHTML, describe };
})();
