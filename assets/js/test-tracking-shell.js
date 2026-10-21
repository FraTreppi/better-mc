(function () {
    'use strict';
    if (window !== window.top || location.pathname !== '/cloud/') return;
    const stack = location.hostname.match(/^mc\.(s\d+)\.exacttarget\.com$/i)?.[1];
    const queryIndex = location.hash.indexOf('?');
    const params = new URLSearchParams(queryIndex < 0 ? '' : location.hash.slice(queryIndex + 1));
    const isEmail = () => /^#app\/Email(?:\/|$)/i.test(location.hash);
    if (!stack || params.get('sfmcfix_tracking') !== 'tests' || !isEmail()) return;
    const origins = new Set([`https://members.${stack.toLowerCase()}.exacttarget.com`, `https://mc.${stack.toLowerCase()}.exacttarget.com`]);
    const channel = 'sfmcfix-test-tracking';
    const requestId = crypto.randomUUID();
    const deadline = Date.now() + 30000;
    let timer;
    let toast;
    let stopped = false;
    let progress = 'Apertura di Tracking → Test Send Emails…';
    let latestDiagnostics = null;
    let nativeHandshakeReceived = false;
    const connections = new Map();
    function frames() {
        return Array.from(document.querySelectorAll('iframe')).filter(frame => {
            try {
                const url = new URL(frame.src, location.href);
                return origins.has(url.origin) && /^\/(?:C12\/Default\.aspx|cloud\/tools\/SSO\.aspx)$/i.test(url.pathname);
            } catch (_) { return false; }
        });
    }
    function send(status) {
        for (const [source, connection] of connections) {
            if (connection.frame.isConnected && connection.frame.contentWindow === source && frames().includes(connection.frame)) {
                connection.port.postMessage({ channel, requestId, status });
            } else {
                connection.port.close();
                connections.delete(source);
            }
        }
    }
    function show(message, error = false) {
        if (!document.body) return;
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'sfmcfix-tracking-opening';
            toast.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:1200;max-width:calc(100% - 40px);padding:10px 16px;background:white;border:1px solid #b5c8da;border-radius:5px;box-shadow:0 2px 8px #0002;font:14px/1.5 Arial,sans-serif;pointer-events:none';
            document.body.appendChild(toast);
        }
        toast.setAttribute('role', error ? 'alert' : 'status');
        toast.textContent = message;
        if (error) {
            toast.style.pointerEvents = 'auto';
            const download = document.createElement('button');
            download.type = 'button';
            download.textContent = 'Scarica diagnostica tracking';
            download.style.cssText = 'display:block;margin-top:8px;padding:6px 10px;border:1px solid #b5c8da;border-radius:4px;background:#fff;color:#145b92;cursor:pointer';
            download.onclick = () => {
                const report = { format: 'sfmcfix-test-tracking-v1', extensionVersion: '1.1.9', capturedAt: new Date().toISOString(),
                    shellHost: location.hostname, stage: progress, nativeHandshakeReceived,
                    native: latestDiagnostics };
                const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
                const link = document.createElement('a');
                link.href = url;
                link.download = 'sfmc-tracking-diagnostica.json';
                link.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
            };
            toast.appendChild(download);
        }
    }
    function stop(cancel = false) {
        stopped = true;
        clearInterval(timer);
        if (cancel) send('cancel');
        connections.forEach(connection => connection.port.close());
        connections.clear();
        window.removeEventListener('message', receive);
        window.removeEventListener('hashchange', routeChanged);
    }
    function receive(event) {
        const data = event.data;
        if (stopped || data?.channel !== channel || data.status !== 'ready') return;
        if (!isEmail()) { routeChanged(); return; }
        const frame = frames().find(frame => frame.contentWindow === event.source);
        if (!origins.has(event.origin) || data.path !== '/C12/Default.aspx' || event.ports.length !== 1 || !frame) {
            event.ports.forEach(port => port.close());
            return;
        }
        connections.get(event.source)?.port.close();
        const connection = { frame, port: event.ports[0] };
        connections.set(event.source, connection);
        nativeHandshakeReceived = true;
        connection.port.onmessage = event => {
            if (!stopped && connections.get(frame.contentWindow) === connection && frame.isConnected) completed(event.data);
        };
        connection.port.start();
        send('open');
    }
    function completed(data) {
        if (data?.channel !== channel || data.requestId !== requestId) return;
        if (data.status === 'progress') {
            const messages = {
                email: 'Attendo il caricamento di Email Studio…',
                tracking: 'Apertura del menu Tracking…',
                folder: 'Ricerca della cartella Test Send Emails…',
                content: 'Caricamento dell’elenco Test Send Emails…'
            };
            if (messages[data.stage]) { progress = messages[data.stage]; show(progress); }
        } else if (data.status === 'opened') {
            stop();
            toast?.remove();
            const index = location.hash.indexOf('?');
            if (index >= 0) {
                const query = new URLSearchParams(location.hash.slice(index + 1));
                query.delete('sfmcfix_tracking');
                history.replaceState(history.state, '', location.pathname + location.search + location.hash.slice(0, index) + '?' + query.toString());
            }
        } else if (data.status === 'error') {
            latestDiagnostics = data.diagnostics || null;
            stop();
            const messages = {
                email: 'Email Studio non ha completato l’inizializzazione. Ricarica la scheda e riprova Tracking test.',
                tracking: 'Il menu Tracking non si è inizializzato. Aprilo dal menu Email Studio e riprova.',
                content: 'La cartella dei test è stata selezionata, ma l’elenco non si è caricato. Ricarica Email Studio e apri Tracking → Test Send Emails.'
            };
            show(messages[data.stage] || 'Non trovo la cartella Test Send Emails. Aprila dal menu Tracking di Email Studio e verifica i permessi della BU.', true);
        }
    }
    function routeChanged() { if (!isEmail()) { stop(true); toast?.remove(); } }
    function tick() {
        if (stopped) return;
        if (!isEmail()) { routeChanged(); return; }
        if (Date.now() >= deadline) {
            stop(true);
            show('Il tracking non ha completato il caricamento. Riprova da Tracking test o apri Test Send Emails dal menu Tracking.', true);
            return;
        }
        show(progress);
        send('open');
    }
    window.addEventListener('message', receive);
    window.addEventListener('hashchange', routeChanged);
    window.addEventListener('pagehide', () => stop(true), { once: true });
    timer = setInterval(tick, 300);
    tick();
})();
