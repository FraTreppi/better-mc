(function () {
    'use strict';

    // Read routing metadata only, on an explicit request from our diagnostic page.
    // Do not read record contents, form values, cookies, storage or response bodies.
    const REQUEST = 'sfmcfix:de-diagnostics';
    const RESULT = 'sfmcfix:de-diagnostics-result';
    const HOST = /\.(exacttarget|marketingcloud|marketingcloudapps)\.com$/i;
    const ROUTE = /data[-_\s]?extension|customobject|subscriber|fuelapi|fuelproxy|\/C12\//i;
    const MAX_URLS = 80;
    const MAX_SCRIPT_BYTES = 8 * 1024 * 1024;
    const liveResources = new Set();

    function cleanPath(value) {
        return value.slice(0, 2048)
            .replace(/\/(token|access_token|session|sessionid|authorization)\/[^/]+/gi, '/$1/[omesso]')
            .replace(/;[^/]+/g, ';[omesso]')
            .replace(/[A-Za-z0-9_-]{40,}/g, '[omesso]');
    }

    function cleanRoute(value) {
        const split = value.indexOf('?');
        if (split < 0) return /[=&]/.test(value) ? cleanRoute('?' + value) : cleanPath(value);
        const path = cleanPath(value.slice(0, split));
        const params = new URLSearchParams(value.slice(split + 1));
        const cleaned = new URLSearchParams();
        let count = 0;
        for (const [key, raw] of params) {
            if (++count > 40) break;
            let safe = '[omesso]';
            if (/^(id|entityid|objectid|dataextensionid|deid|folderid|categoryid|mid|memberid)$/i.test(key) &&
                /^(?:\d{1,15}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.test(raw)) {
                safe = raw;
            } else if (/^(entitytype|ks|tab|view|section)$/i.test(key) &&
                /^(none|dataextension|subscriber|subscribers|list|properties|records|fields|overview|dataextensions|ks#Subscribers)$/i.test(raw)) {
                safe = raw;
            }
            cleaned.append(key.slice(0, 100), safe);
        }
        return `${path}?${cleaned}`;
    }

    function cleanUrl(value) {
        try {
            const url = new URL(value, location.href);
            if (url.protocol !== 'https:' || !HOST.test(url.hostname)) return null;
            // Rebuild without username/password; sanitize query and nested shell hash.
            return `${url.origin}${cleanRoute(url.pathname + url.search)}${url.hash ? '#' + cleanRoute(url.hash.slice(1)) : ''}`;
        } catch (_) { return null; }
    }

    function routes(values, filter = false) {
        const found = new Set();
        let truncated = false;
        for (const value of values) {
            if (filter && !ROUTE.test(value)) continue;
            const safe = cleanUrl(value);
            if (!safe || found.has(safe)) continue;
            if (found.size === MAX_URLS) { truncated = true; break; }
            found.add(safe);
        }
        return { urls: [...found], truncated };
    }

    // Keep recent request paths as the page runs: the browser's default resource
    // buffer can fill up with startup assets before the user opens a DE.
    try {
        new PerformanceObserver(list => {
            for (const entry of list.getEntries()) {
                if (!ROUTE.test(entry.name) && !/^(fetch|xmlhttprequest)$/.test(entry.initiatorType)) continue;
                const safe = cleanUrl(entry.name);
                if (!safe) continue;
                liveResources.delete(safe);
                liveResources.add(safe);
                if (liveResources.size > 160) liveResources.delete(liveResources.values().next().value);
            }
        }).observe({ type: 'resource', buffered: true });
    } catch (_) { /* The ordinary resource snapshot remains available. */ }

    async function readScript(response) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let bytes = 0;
        let source = '';
        try {
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                bytes += value.byteLength;
                if (bytes > MAX_SCRIPT_BYTES) { await reader.cancel(); return null; }
                source += decoder.decode(value, { stream: true });
            }
            return source + decoder.decode();
        } finally { reader.releaseLock(); }
    }

    async function nativeRoutes() {
        const urls = new Set();
        for (const value of [
            ...Array.from(document.scripts, el => el.src),
            ...performance.getEntriesByType('resource').map(entry => entry.name)
        ]) {
            if (!value) continue;
            try {
                const url = new URL(value, location.href);
                // Only already-loaded, same-origin static application bundles.
                // Never fetch SSO pages, API responses or session-bearing URLs.
                if (url.origin !== location.origin || url.protocol !== 'https:' || !HOST.test(url.hostname) ||
                    !/^\/C12\/js\/(?:all|default|min\/full\.min)\.js$/i.test(url.pathname) ||
                    [...url.searchParams.keys()].some(key => key !== 'v')) continue;
                urls.add(url.href);
            } catch (_) { /* Ignore malformed script elements. */ }
        }
        return Promise.all([...urls].slice(0, 3).map(async url => {
            const result = { url: cleanUrl(url), status: 'unavailable', routeLiterals: [] };
            try {
                const response = await fetch(url, { credentials: 'same-origin', redirect: 'error',
                    cache: 'force-cache', signal: AbortSignal.timeout(6000) });
                if (!response.ok) { result.status = `http-${response.status}`; return result; }
                if (!/(?:java|ecma)script/i.test(response.headers.get('content-type') || '')) {
                    result.status = 'not-javascript'; return result;
                }
                const source = await readScript(response);
                if (source === null) { result.status = 'too-large'; return result; }
                const found = new Set();
                // Export routing string literals only, never the source or its
                // arbitrary string values. Do not evaluate downloaded code.
                for (const match of source.matchAll(/(['"])((?:\\.|[^\\\r\n])*?)\1/g)) {
                    const literal = match[2].replace(/\\\//g, '/');
                    if (literal.length > 512 || !ROUTE.test(literal) || !literal.includes('/') ||
                        !/^[a-z0-9_/:.?&$={}()#%*+!,\-]+$/i.test(literal)) continue;
                    const safe = /^https?:/i.test(literal) ? cleanUrl(literal) : cleanRoute(literal);
                    if (safe) found.add(safe);
                    if (found.size >= 100) { result.truncated = true; break; }
                }
                result.status = 'read';
                result.routeLiterals = [...found];
            } catch (_) { result.status = 'fetch-failed'; }
            return result;
        }));
    }

    chrome.runtime.onMessage.addListener((message, sender, respond) => {
        if (message?.type !== REQUEST || typeof message.requestId !== 'string' ||
            sender.id !== chrome.runtime.id ||
            sender.url !== chrome.runtime.getURL('assets/html/email-studio-diagnostics.html')) return;
        const frame = {
            url: cleanUrl(location.href),
            embeddedFrames: routes(Array.from(document.querySelectorAll('iframe[src], frame[src]'), el => el.src)),
            navigation: routes(Array.from(document.querySelectorAll('a[href]'), el => el.href), true),
            resources: routes([
                ...[...liveResources].reverse(),
                ...performance.getEntriesByType('resource').map(entry => entry.name).reverse().filter(value => ROUTE.test(value))
            ])
        };
        const send = (data, pending) => chrome.runtime.sendMessage({ type: RESULT,
            requestId: message.requestId, frame: data, pending }).catch(() => {});
        send(frame, true);
        nativeRoutes().then(nativeScripts => send({ ...frame, nativeScripts }, false))
            .catch(() => send({ ...frame, nativeScripts: [], nativeScriptsError: true }, false));
        respond({ ok: true });
    });
})();
