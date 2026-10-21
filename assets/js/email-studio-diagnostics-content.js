(function () {
    'use strict';

    // Read routing metadata only, on an explicit request from our diagnostic page.
    // Do not read record contents, form values, cookies, storage or response bodies.
    const REQUEST = 'sfmcfix:de-diagnostics';
    const RESULT = 'sfmcfix:de-diagnostics-result';
    const HOST = /\.(exacttarget|marketingcloud|marketingcloudapps)\.com$/i;
    const ROUTE = /data[-_\s]?extension|customobject|subscriber|\/C12\//i;
    const MAX_URLS = 80;

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

    chrome.runtime.onMessage.addListener((message, sender, respond) => {
        if (message?.type !== REQUEST || typeof message.requestId !== 'string' ||
            sender.id !== chrome.runtime.id ||
            sender.url !== chrome.runtime.getURL('assets/html/email-studio-diagnostics.html')) return;
        const frame = {
            url: cleanUrl(location.href),
            embeddedFrames: routes(Array.from(document.querySelectorAll('iframe[src], frame[src]'), el => el.src)),
            navigation: routes(Array.from(document.querySelectorAll('a[href]'), el => el.href), true),
            resources: routes(performance.getEntriesByType('resource').map(entry => entry.name), true)
        };
        chrome.runtime.sendMessage({ type: RESULT, requestId: message.requestId, frame }).catch(() => {});
        respond({ ok: true });
    });
})();
