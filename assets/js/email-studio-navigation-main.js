(function () {
    'use strict';
    // Runs in the native Email Studio frame, without extension APIs or storage.
    if (window === window.top || !/^\/C12\/Default\.aspx$/i.test(location.pathname)) return;
    const stack = location.hostname.match(/^members\.(s\d+)\.exacttarget\.com$/i)?.[1];
    if (!stack) return;
    const origin = `https://mc.${stack.toLowerCase()}.exacttarget.com`;
    const channel = 'sfmcfix-email-navigation';
    const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let active;
    let timer;

    function backbone() {
        for (const loader of [window.requirejs, window.require]) {
            if (typeof loader === 'function' && typeof loader.defined === 'function' && loader.defined('backbone')) {
                const api = loader('backbone');
                if (api?.history) return api;
            }
        }
        return window.Backbone?.history ? window.Backbone : null;
    }

    function respond(status) {
        active.status = status;
        window.top.postMessage({ channel, requestId: active.requestId, id: active.id, status }, origin);
    }

    function requestedView(state, id) {
        const content = state.get('carbonContent');
        if (content?.content === 'de-pages' && String(content.id).toLowerCase() === id.toLowerCase()) return true;
        // The native router also supports the legacy UI with the same GUID.
        try {
            const url = new URL(state.get('startData')?.startUrl, location.href);
            return /\/Content\/Subscribers\/CustomObjects\/ObjectDetails\.aspx$/i.test(url.pathname) &&
                url.searchParams.get('id')?.toLowerCase() === id.toLowerCase();
        } catch (_) { return false; }
    }

    function tick() {
        if (!active) return;
        if (Date.now() >= active.deadline) { clearInterval(timer); respond('error'); return; }
        try {
            const api = backbone();
            const state = window._NavState;
            if (!api?.History?.started || typeof api.history?.navigate !== 'function' ||
                typeof state?.get !== 'function' || !state.get('sectionId')) return;
            if (requestedView(state, active.id)) { clearInterval(timer); respond('opened'); return; }
            if (!active.applied) {
                active.applied = true;
                const route = `Subscribers/Data_Extensions/${active.id}/edit`;
                if (api.history.fragment === route) api.history.loadUrl(route);
                else api.history.navigate(route, { trigger: true });
            }
        } catch (_) { clearInterval(timer); respond('error'); }
    }

    window.addEventListener('message', event => {
        const data = event.data;
        if (event.source !== window.top || event.origin !== origin || data?.channel !== channel ||
            !GUID.test(data.id || '') || !GUID.test(data.requestId || '')) return;
        if (data.status === 'cancel') {
            if (active?.requestId === data.requestId) { clearInterval(timer); active = null; }
            return;
        }
        if (data.status !== 'open') return;
        if (active?.requestId === data.requestId) {
            if (active.status) respond(active.status);
            return;
        }
        clearInterval(timer);
        active = { id: data.id, requestId: data.requestId, applied: false, deadline: Date.now() + 20000 };
        timer = setInterval(tick, 150);
        tick();
    });
    window.addEventListener('pagehide', () => clearInterval(timer), { once: true });
})();
