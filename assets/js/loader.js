(function() {
    const ignoreList = ['/Init.aspx','/cloud/','/cloud/tools/SessionStatus.ashx','/utils/require-sandbox/'];
    if(ignoreList.some( (item) => location.href.indexOf(item) > -1 )) {
        console.log(`SFMC fixer - ${location.pathname} --- IGNORE`);
        return false;
    }

    const extensionPath = chrome.runtime.getURL("");
    const timestamp = Date.now();

    const writeConfigurations = function(config) {
        var script = document.getElementById('sfmc-fixer-config');
        if(script == null) {
            script = document.createElement("script");
            script.id = 'sfmc-fixer-config';
            script.type = 'json/config';
            document.head.appendChild(script);
            console.log(`SFMC fixer - ${location.pathname} --- config ready`);
        }
        script.innerHTML = JSON.stringify(config);
    }

    // const addCss = function(fileName) {
    //     const link = document.createElement("link");
    //     link.href = `${extensionPath}assets/css/${fileName}.css?t=${timestamp}`;
    //     console.log(`SFMC fixer - ${location.pathname} --- CSS -> ${fileName}.css`);
    //     link.type = "text/css";
    //     link.rel = "stylesheet";
    //     document.head.appendChild(link);
    // }

    const addJs = function(fileName) {
        const script = document.createElement("script");
        script.src = `${extensionPath}assets/js/${fileName}.js?t=${timestamp}`;
        // console.log(`SFMC fixer - ${location.pathname} --- CSS -> ${fileName}.js`);
        document.head.appendChild(script);
    }

    // Bridge storage: gli script iniettati girano nel main world e non vedono chrome.*
    // Qui (content script, mondo isolato) facciamo da ponte verso chrome.storage.local
    // rispondendo alle richieste via window.postMessage con un request id.
    const STORAGE_CHANNEL = 'sfmcfix-storage';

    const storageBridge = function() {
        if(!chrome?.storage?.local) {
            console.log(`SFMC fixer - ${location.pathname} --- storage NON disponibile (manca il permesso "storage"?)`);
            return;
        }

        const respond = function(id, ok, result, error) {
            window.postMessage({
                source: STORAGE_CHANNEL,
                direction: 'response',
                id: id,
                ok: ok,
                result: result,
                error: error
            }, location.origin);
        };

        window.addEventListener('message', function(event) {
            // accetto solo messaggi originati da questa stessa finestra (il main world della pagina)
            if(event.source !== window) return;
            const msg = event.data;
            if(!msg || msg.source !== STORAGE_CHANNEL || msg.direction !== 'request') return;

            const { id, action, payload } = msg;
            const done = (result) => respond(id, true, result);
            const fail = (e) => respond(id, false, undefined, (e && e.message) || String(e));

            try {
                // inoltro al service worker: unico proprietario dello storage,
                // serializza le scritture e rende atomico il merge
                chrome.runtime.sendMessage({ __sfmcfixStorage: true, action, payload }, (resp) => {
                    if(chrome.runtime.lastError) return fail(chrome.runtime.lastError);
                    if(resp && resp.ok) return done(resp.result);
                    fail(new Error(resp?.error || 'storage error'));
                });
            } catch(e) {
                fail(e);
            }
        });

        // propago al main world le modifiche dello storage (anche da altre tab/origin)
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if(areaName !== 'local') return;
            window.postMessage({
                source: STORAGE_CHANNEL,
                direction: 'change',
                changes: changes
            }, location.origin);
        });

        console.log(`SFMC fixer - ${location.pathname} --- storage bridge pronto`);
    };

    // Bridge fetch: gli script iniettati chiedono una fetch via postMessage,
    // qui la inoltriamo al service worker che ha le host_permissions SFMC.
    const FETCH_CHANNEL = 'sfmcfix-fetch';

    const fetchBridge = function() {
        const respond = function(id, ok, result, error) {
            window.postMessage({
                source: FETCH_CHANNEL,
                direction: 'response',
                id, ok, result, error
            }, location.origin);
        };

        window.addEventListener('message', function(event) {
            if(event.source !== window) return;
            const msg = event.data;
            if(!msg || msg.source !== FETCH_CHANNEL || msg.direction !== 'request') return;

            const { id, url, options } = msg;
            const done = (result) => respond(id, true, result);
            const fail = (e) => respond(id, false, undefined, (e && e.message) || String(e));

            try {
                chrome.runtime.sendMessage({ __sfmcfixFetch: true, url, options }, (resp) => {
                    if(chrome.runtime.lastError) return fail(chrome.runtime.lastError);
                    if(resp && resp.ok) return done(resp.result);
                    fail(new Error(resp?.error || 'fetch proxy error'));
                });
            } catch(e) {
                fail(e);
            }
        });

        console.log(`SFMC fixer - ${location.pathname} --- fetch bridge pronto`);
    };

    writeConfigurations({
        extensionPath: extensionPath,
        timestamp: timestamp
    });
    storageBridge();
    fetchBridge();
    addJs('content');
})();