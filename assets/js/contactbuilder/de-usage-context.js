(function () {
    'use strict';
    if (window.sfmcfix.deUsageContext) return;
    window.sfmcfix.deUsageContext = true;
    window.addEventListener('message', event => {
        if (event.source !== window || event.origin !== location.origin || event.data?.channel !== 'sfmcfix-de-usage-context' ||
            event.data.type !== 'request' || !/^[a-f0-9-]{36}$/.test(event.data.id || '')) return;
        const current = window.sfmcfix.context.current();
        window.postMessage({ channel: 'sfmcfix-de-usage-context', type: 'response', id: event.data.id,
            scope: current.persistent ? current.scope : null }, location.origin);
    });
})();
