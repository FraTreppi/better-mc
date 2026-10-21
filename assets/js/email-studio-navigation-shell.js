(function () {
    'use strict';
    if (window !== window.top || location.pathname !== '/cloud/') return;
    const stack = location.hostname.match(/^mc\.(s\d+)\.exacttarget\.com$/i)?.[1];
    const queryIndex = location.hash.indexOf('?');
    const id = new URLSearchParams(queryIndex < 0 ? '' : location.hash.slice(queryIndex + 1)).get('sfmcfix_de');
    const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const isEmail = () => /^#app\/Email(?:\/|$)/i.test(location.hash);
    if (!stack || !GUID.test(id || '') || !isEmail()) return;

    const origin = `https://members.${stack.toLowerCase()}.exacttarget.com`;
    const channel = 'sfmcfix-email-navigation';
    const requestId = crypto.randomUUID();
    const deadline = Date.now() + 30000;
    let toast;
    let timer;
    let stopped = false;

    function showStatus(text, error = false) {
        if (!document.body) return;
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'sfmcfix-email-opening';
            toast.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:1200;max-width:calc(100% - 40px);padding:10px 16px;background:#fff;border:1px solid #b5c8da;border-radius:5px;box-shadow:0 2px 8px #0002;font:14px/1.5 Arial,sans-serif;pointer-events:none';
            document.body.appendChild(toast);
        }
        toast.setAttribute('role', error ? 'alert' : 'status');
        toast.textContent = text;
    }

    function stop(clearMarker = false, cancel = false) {
        stopped = true;
        clearInterval(timer);
        if (cancel) send('cancel');
        window.removeEventListener('message', receive);
        window.removeEventListener('hashchange', onRouteChange);
        if (clearMarker) {
            const url = new URL(location.href);
            const index = url.hash.indexOf('?');
            if (index < 0) return;
            const params = new URLSearchParams(url.hash.slice(index + 1));
            if (!params.has('sfmcfix_de')) return;
            params.delete('sfmcfix_de');
            const remaining = params.toString();
            url.hash = url.hash.slice(0, index) + (remaining ? '?' + remaining : '');
            history.replaceState(history.state, '', url);
        }
    }

    function isTargetFrame(frame) {
        try {
            const url = new URL(frame.src, location.href);
            return url.origin === origin && /^\/C12\/Default\.aspx$/i.test(url.pathname);
        } catch (_) { return false; }
    }

    function send(status) {
        for (const frame of document.querySelectorAll('iframe')) {
            if (isTargetFrame(frame)) frame.contentWindow.postMessage({ channel, requestId, id, status }, origin);
        }
    }

    function receive(event) {
        const data = event.data;
        if (stopped || event.origin !== origin || data?.channel !== channel ||
            data.requestId !== requestId || data.id !== id ||
            !Array.from(document.querySelectorAll('iframe')).some(frame => isTargetFrame(frame) && frame.contentWindow === event.source)) return;
        if (data.status === 'opened') {
            stop(true);
            toast?.remove();
        } else if (data.status === 'error') {
            stop();
            showStatus('Non è stato possibile aprire il dettaglio della DE. Torna a Contact Builder e riprova dal pulsante Apri in Email Studio.', true);
        }
    }

    function onRouteChange() {
        if (!isEmail()) { stop(true, true); toast?.remove(); }
    }

    function tick() {
        if (stopped) return;
        if (!isEmail()) { onRouteChange(); return; }
        if (Date.now() >= deadline) {
            stop(false, true);
            showStatus('Email Studio non ha completato l’apertura della DE. Torna a Contact Builder e riprova dal pulsante Apri in Email Studio.', true);
            return;
        }
        showStatus('Apertura della Data Extension in Email Studio…');
        send('open');
    }

    window.addEventListener('message', receive);
    window.addEventListener('hashchange', onRouteChange);
    window.addEventListener('pagehide', () => stop(false, true), { once: true });
    timer = setInterval(tick, 300);
    tick();
})();
