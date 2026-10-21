(function () {
    'use strict';
    if (window === window.top || !/^\/C12\/Default\.aspx$/i.test(location.pathname)) return;
    const stack = location.hostname.match(/^(?:members|mc)\.(s\d+)\.exacttarget\.com$/i)?.[1];
    if (!stack) return;
    const origin = `https://mc.${stack.toLowerCase()}.exacttarget.com`;
    const ancestors = Array.from(location.ancestorOrigins || []);
    if (ancestors.length && ancestors[ancestors.length - 1] !== origin) return;
    const channel = 'sfmcfix-test-tracking';
    let active;
    let timer;
    const transport = new MessageChannel();
    const port = transport.port1;
    function backbone() {
        for (const loader of [window.requirejs, window.require]) {
            if (typeof loader === 'function' && typeof loader.defined === 'function' && loader.defined('backbone')) return loader('backbone');
        }
        return window.Backbone;
    }
    function respond(status) {
        clearInterval(timer);
        active.status = status;
        port.postMessage({ channel, requestId: active.requestId, status });
    }
    function testFolder() {
        // Native Email UI exposes fraLeftNav → fraTree (same-origin).
        // Select the actual folder; never guess a customer-specific category ID.
        const left = document.querySelector('#fraLeftNav')?.contentWindow;
        const tree = left?.frames?.fraTree;
        if (String(tree?.strCurSect).toLowerCase() !== 'tracking') return null;
        const doc = tree?.document;
        if (!doc) return null;
        return Array.from(doc.querySelectorAll('a, [role="treeitem"], [onclick]')).find(node => {
            const text = (node.getAttribute('aria-label') || node.textContent || '').trim().replace(/\s+/g, ' ').toLowerCase();
            return ['test send emails', 'test send e-mails', 'email di test', 'invii email di prova'].includes(text) &&
                node.getClientRects().length > 0 && tree.getComputedStyle(node).visibility !== 'hidden';
        });
    }
    function tick() {
        if (!active) return;
        if (Date.now() >= active.deadline) { respond('error'); return; }
        try {
            const api = backbone();
            const state = window._NavState;
            if (!api?.History?.started || typeof api.history?.navigate !== 'function' || !state?.get?.('sectionId')) return;
            if (String(state.get('sectionId')).toLowerCase() !== 'tracking') {
                if (!active.applied) {
                    active.applied = true;
                    api.history.navigate('Tracking', { trigger: true });
                }
                return;
            }
            const folder = testFolder();
            if (folder) { folder.click(); respond('opened'); }
        } catch (_) { /* Left navigation may still be loading during SSO. */ }
    }
    port.onmessage = event => {
        const data = event.data;
        if (data?.channel !== channel ||
            !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.requestId || '')) return;
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
        active = { requestId: data.requestId, deadline: Date.now() + 20000, applied: false };
        timer = setInterval(tick, 150);
        tick();
    };
    port.start();
    window.top.postMessage({ channel, status: 'ready', path: location.pathname }, origin, [transport.port2]);
    window.addEventListener('pagehide', () => { clearInterval(timer); port.close(); }, { once: true });
})();
