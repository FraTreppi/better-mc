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
    function navDataReady() {
        const entries = window.ET?.Config?.navData?.entry;
        return Array.isArray(entries) && entries.some(item => item.sectionID === 'Tracking');
    }
    function diagnostics() {
        const report = { host: location.hostname, path: location.pathname, documentReady: document.readyState,
            rootPresent: Boolean(document.querySelector('#etEmail')), navbarPresent: Boolean(document.querySelector('#navbar')),
            leftFramePresent: Boolean(document.querySelector('#fraLeftNav')), contentFramePresent: Boolean(document.querySelector('#fraContent')),
            stage: active?.stage || 'starting', recoveryAttempted: active?.recoveryAttempted === true };
        const section = value => ['overview', 'subscribers', 'tracking', 'content', 'interactions', 'admin'].includes(String(value).toLowerCase()) ? String(value).toLowerCase() : null;
        try {
            const state = window._NavState;
            const nav = state?.get?.('curNavItem');
            report.statePresent = Boolean(state);
            report.stateWritable = typeof state?.set === 'function';
            report.section = section(state?.get?.('sectionId'));
            report.currentNavPresent = Boolean(nav);
            report.currentNavSection = section(nav?.get?.('sectionID'));
            report.trackingInNativeMenu = navDataReady();
            const left = document.querySelector('#fraLeftNav')?.contentWindow;
            report.leftFrameReady = left?.isReady === true;
            report.treeSection = section(left?.frames?.fraTree?.strCurSect);
        } catch (_) { report.someFieldsUnavailable = true; }
        return report;
    }
    function respond(status) {
        clearInterval(timer);
        active.status = status;
        delete active.previousDocument;
        port.postMessage({ channel, requestId: active.requestId, status, stage: active.stage,
            ...(status === 'error' ? { diagnostics: diagnostics() } : {}) });
    }
    function stage(value) {
        if (active.stage === value) return;
        active.stage = value;
        port.postMessage({ channel, requestId: active.requestId, status: 'progress', stage: value });
    }
    function contentReady() {
        const frame = document.querySelector('#fraContent');
        const doc = frame?.contentDocument;
        if (!doc || doc.readyState !== 'complete' || !doc.body?.childElementCount) return false;
        const url = new URL(doc.URL);
        if (url.protocol !== 'https:' || !['mc', 'members'].some(host => url.hostname === `${host}.${stack.toLowerCase()}.exacttarget.com`) ||
            /\/(?:blank\.html|blank\.aspx)$/i.test(url.pathname)) return false;
        return doc !== active.previousDocument || /^test\s*send\s*e-?mails$/i.test(doc.title.trim());
    }
    function testFolder() {
        // Native Email UI exposes fraLeftNav → fraTree (same-origin).
        // Select the actual folder; never guess a customer-specific category ID.
        const left = document.querySelector('#fraLeftNav')?.contentWindow;
        const tree = left?.frames?.fraTree;
        if (String(tree?.strCurSect).toLowerCase() !== 'tracking') return null;
        const doc = tree?.document;
        if (!doc) return null;
        return Array.from(doc.querySelectorAll('a, [role="treeitem"], [onclick], span')).find(node => {
            const text = (node.getAttribute('aria-label') || node.textContent || '').trim().replace(/\s+/g, ' ').toLowerCase();
            return ['test send emails', 'test send e-mails', 'email di test', 'invii email di prova'].includes(text) &&
                node.getClientRects().length > 0 && tree.getComputedStyle(node).visibility !== 'hidden';
        });
    }
    function tick() {
        if (!active) return;
        if (Date.now() >= active.deadline) { respond('error'); return; }
        try {
            if (active.folderClicked) {
                if (contentReady()) respond('opened');
                return;
            }
            const state = window._NavState;
            const navItem = state?.get?.('curNavItem');
            if (typeof state?.set !== 'function') { stage('email'); return; }
            if (typeof navItem?.get !== 'function' || !navItem.get('sectionID')) {
                stage('email');
                // legacyView is created after navView has registered its model
                // listeners. If its iframe exists and Tracking is in navData,
                // activate that native listener even when startup left curNavItem null.
                if (!active.recoveryAttempted && document.querySelector('#fraLeftNav') && navDataReady()) {
                    active.recoveryAttempted = true;
                    const alreadyTracking = state.get('sectionId') === 'Tracking';
                    state.set({ startData: null, curSubNavItem: null, sectionId: 'Tracking' });
                    if (alreadyTracking && typeof state.trigger === 'function') state.trigger('change:sectionId', state);
                    active.applied = true;
                }
                return;
            }
            // Native menu clicks may leave sectionId null. curNavItem is the
            // selected menu and remains authoritative during legacy loading.
            if (String(navItem.get('sectionID')).toLowerCase() !== 'tracking') {
                stage('tracking');
                if (!active.applied) {
                    active.applied = true;
                    // Native navView._selectItem selects the existing Tracking menu
                    // and loads its legacy view. Triggering the root router instead
                    // calls switchPage(), which removes the current base view.
                    state.set({ startData: null, curSubNavItem: null, sectionId: 'Tracking' });
                }
                return;
            }
            stage('folder');
            const folder = testFolder();
            if (folder) {
                active.previousDocument = document.querySelector('#fraContent')?.contentDocument;
                active.folderClicked = true;
                stage('content');
                folder.click();
            }
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
