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
    let queued = false;
    let watchedState;
    const watchedDocuments = new Map();
    const transport = new MessageChannel();
    const port = transport.port1;
    const folderNames = new Set(['test send emails', 'test send e-mails', 'email di test', 'invii email di prova']);
    const normalize = text => String(text || '').trim().replace(/\s+/g, ' ').toLowerCase();
    function documents(frame, depth = 0) {
        if (!frame || depth > 3) return [];
        try {
            const doc = frame.contentDocument;
            if (!doc) return [];
            return [doc, ...Array.from(doc.querySelectorAll('iframe, frame')).flatMap(child => documents(child, depth + 1))];
        } catch (_) { return []; }
    }
    function scheduleTick() {
        if (queued || !active || active.status === 'opened') return;
        queued = true;
        queueMicrotask(() => { queued = false; tick(); });
    }
    function watch() {
        const state = window._NavState;
        if (watchedState !== state && typeof state?.on === 'function') {
            watchedState?.off?.('change:curNavItem change:sectionId change:modifiedDate', scheduleTick);
            watchedState = state;
            state.on('change:curNavItem change:sectionId change:modifiedDate', scheduleTick);
        }
        const current = new Set([document, ...documents(document.querySelector('#fraLeftNav')), ...documents(document.querySelector('#fraContent'))]);
        for (const [doc, observer] of watchedDocuments) {
            if (current.has(doc)) continue;
            observer.disconnect();
            doc.removeEventListener('load', scheduleTick, true);
            watchedDocuments.delete(doc);
        }
        for (const doc of current) {
            if (watchedDocuments.has(doc)) continue;
            const observer = new MutationObserver(scheduleTick);
            observer.observe(doc, { childList: true, subtree: true });
            doc.addEventListener('load', scheduleTick, true);
            watchedDocuments.set(doc, observer);
        }
    }
    function clean() {
        clearInterval(timer);
        watchedState?.off?.('change:curNavItem change:sectionId change:modifiedDate', scheduleTick);
        watchedState = null;
        for (const [doc, observer] of watchedDocuments) {
            observer.disconnect();
            doc.removeEventListener('load', scheduleTick, true);
        }
        watchedDocuments.clear();
        if (active) delete active.previousDocument;
    }
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
        if (active.status === status) return;
        active.status = status;
        if (status === 'opened') clean();
        else {
            // A slow native page may finish after the error. Keep observing it
            // without making any more navigation requests or folder clicks.
            active.observeUntil = Date.now() + 120000;
            clearInterval(timer);
            timer = setInterval(tick, 500);
        }
        port.postMessage({ channel, requestId: active.requestId, status, stage: active.stage,
            ...(status === 'error' ? { diagnostics: diagnostics() } : {}) });
    }
    function stage(value) {
        if (active.stage === value) return;
        active.stage = value;
        active.deadline = Math.min(active.started + 60000, Date.now() + 20000);
        port.postMessage({ channel, requestId: active.requestId, status: 'progress', stage: value });
    }
    function loaded(doc) {
        if (!doc || doc.readyState !== 'complete' || !doc.body?.childElementCount) return false;
        const url = new URL(doc.URL);
        return url.protocol === 'https:' && ['mc', 'members'].some(host => url.hostname === `${host}.${stack.toLowerCase()}.exacttarget.com`) &&
            !/\/(?:blank\.html|blank\.aspx)$/i.test(url.pathname);
    }
    function testListingReady() {
        return documents(document.querySelector('#fraContent')).some(doc => {
            if (!loaded(doc)) return false;
            if (folderNames.has(normalize(doc.title))) return true;
            // Legacy breadcrumb labels are often bold, rather than headings.
            // Restrict this check to the content frame, never the folder tree.
            return Array.from(doc.querySelectorAll('h1, h2, h3, [role="heading"], .breadcrumb, [class*="breadcrumb" i], [id*="breadcrumb" i], b, strong')).some(node =>
                folderNames.has(normalize(node.textContent)) && node.getClientRects().length > 0 && doc.defaultView.getComputedStyle(node).visibility !== 'hidden');
        });
    }
    function contentReady() {
        const doc = document.querySelector('#fraContent')?.contentDocument;
        return loaded(doc) && (doc !== active.previousDocument || testListingReady());
    }
    function testFolder() {
        // Use the native folder label under fraLeftNav. strCurSect and frame
        // names vary across legacy pages and are not needed to select it.
        for (const doc of documents(document.querySelector('#fraLeftNav'))) {
            const folder = Array.from(doc.querySelectorAll('a, [role="treeitem"], [onclick], span, font')).find(node =>
                folderNames.has(normalize(node.getAttribute('aria-label') || node.textContent)) &&
                node.getClientRects().length > 0 && doc.defaultView.getComputedStyle(node).visibility !== 'hidden');
            if (folder) return folder;
        }
        return null;
    }
    function tick() {
        if (!active || active.status === 'opened') return;
        try {
            watch();
            if (testListingReady() || (active.folderClicked && contentReady())) { respond('opened'); return; }
            if (active.status === 'error') {
                if (Date.now() >= active.observeUntil) clean();
                return;
            }
            if (Date.now() >= active.deadline) { respond('error'); return; }
            if (active.folderClicked) return;
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
            if (active?.requestId === data.requestId) { clean(); active = null; }
            return;
        }
        if (data.status !== 'open') return;
        if (active?.requestId === data.requestId) {
            return;
        }
        clean();
        const started = Date.now();
        active = { requestId: data.requestId, started, deadline: started + 20000, applied: false };
        timer = setInterval(tick, 100);
        tick();
    };
    port.start();
    window.top.postMessage({ channel, status: 'ready', path: location.pathname }, origin, [transport.port2]);
    window.addEventListener('pagehide', () => { clean(); active = null; port.close(); }, { once: true });
})();
