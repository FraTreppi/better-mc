(function () {
    'use strict';
    const api = window.sfmcfix;
    if (api.nativeSession) return;
    const contentType = 'application/json;charset=utf-8;datekind=local';
    function headers() {
        return { Accept: 'application/json', 'Content-Type': contentType,
            'x-fueldata-version': '1.1', 'X-Requested-With': 'XMLHttpRequest' };
    }
    function client() {
        if (typeof window.Fuel?.ajax === 'function') return { kind: 'Fuel', ajax: options => window.Fuel.ajax(options) };
        // Only resolve modules the native app has already initialized. Do not
        // load scripts, inspect module registries or extract session tokens.
        function defined(name) {
            for (const loader of [window.requirejs, window.require]) {
                if (typeof loader !== 'function' || typeof loader.defined !== 'function') continue;
                try { if (loader.defined(name)) return loader(name); }
                catch (_) { /* The module may be unavailable during navigation. */ }
            }
            return null;
        }
        const fuel = defined('fuel-ajax');
        if (typeof fuel?.ajax === 'function') return { kind: 'AMD:fuel-ajax', ajax: options => fuel.ajax(options) };
        if (typeof fuel === 'function') return { kind: 'AMD:fuel-ajax', ajax: options => fuel(options) };
        if (typeof window.Fuel?.ajax === 'function') return { kind: 'Fuel', ajax: options => window.Fuel.ajax(options) };
        // Native collections use Backbone.ajax -> the app's configured jQuery.
        // Bare fetch skips its ajaxSetup, prefilters and beforeSend handlers;
        // a successful category GET therefore does not validate a query POST.
        if (typeof window.Backbone?.ajax === 'function') return { kind: 'Backbone', ajax: options => window.Backbone.ajax(options) };
        const backbone = defined('backbone');
        if (typeof backbone?.ajax === 'function') return { kind: 'AMD:backbone', ajax: options => backbone.ajax(options) };
        if (typeof window.jQuery?.ajax === 'function') return { kind: 'jQuery', ajax: options => window.jQuery.ajax(options) };
        const jquery = defined('jquery');
        if (typeof jquery?.ajax === 'function') return { kind: 'AMD:jquery', ajax: options => jquery.ajax(options) };
        return null;
    }
    const mid = value => /^\d{1,15}$/.test(String(value ?? '')) && Number(value) > 0 ? String(value) : null;
    function contextMid(data) {
        // organization.id is the MID of this token context. user.id and
        // organization.enterpriseId are deliberately excluded.
        return mid(data?.organization?.id);
    }
    async function readMid() {
        const path = '/fuelapi/platform/v1/tokenContext', native = client();
        let xhr, timer;
        const controller = new AbortController();
        const timeout = new Promise(resolve => {
            timer = setTimeout(() => {
                controller.abort();
                try { xhr?.abort?.(); } catch (_) { /* Bounded even without native cancellation. */ }
                resolve(null);
            }, 1800);
        });
        try {
            const request = native ? new Promise(resolve => {
                xhr = native.ajax({ url: path, type: 'GET', dataType: 'json', contentType,
                    headers: headers(), useFuel2Token: true, cache: false, timeout: 1800,
                    success: data => resolve(contextMid(data)), error: () => resolve(null) });
            }) : fetch(path, { method: 'GET', headers: headers(), credentials: 'same-origin', mode: 'same-origin',
                redirect: 'error', cache: 'no-store', signal: controller.signal })
                .then(response => response.ok ? response.json() : null).then(contextMid);
            return await Promise.race([request, timeout]);
        } catch (_) { return null; }
        finally { clearTimeout(timer); }
    }
    api.nativeSession = { client, headers, contentType, readMid };
})();
