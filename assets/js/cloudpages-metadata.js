(function () {
    'use strict';

    const pageNumber = value => /^\d+$/.test(value.trim()) ? value.trim().replace(/^0+(?=\d)/, '') : null;
    const portName = 'sfmcfix-cloudpages-site-metadata';

    async function read(origin, assetId, signal, sameOrigin) {
        if (!/^[1-9]\d{0,14}$/.test(assetId)) return null;
        const url = new URL('/fuelapi/internal/v2/cloudpages/sites', origin);
        url.searchParams.set('siteAssetId', assetId);
        const response = await fetch(url, {
            method: 'GET',
            mode: sameOrigin ? 'same-origin' : 'cors',
            credentials: sameOrigin ? 'same-origin' : 'include',
            redirect: 'error',
            cache: 'no-store',
            headers: { Accept: 'application/json' },
            signal: AbortSignal.any([signal, AbortSignal.timeout(8000)])
        }).catch(() => {
            signal.throwIfAborted();
            throw new Error('La lettura dei metadati CloudPages è scaduta o non è disponibile.');
        });
        if (response.status === 404) return null;
        if (response.status === 401 || response.status === 403) {
            throw new Error(`Salesforce ha rifiutato la lettura dei metadati nella sessione della scheda (HTTP ${response.status}).`);
        }
        if (response.status === 429) throw new Error('Salesforce ha limitato le richieste di metadati (HTTP 429). Riprova più tardi.');
        if (!response.ok) throw new Error(`Lettura dei metadati non riuscita (HTTP ${response.status}).`);
        const data = await response.json().catch(() => {
            signal.throwIfAborted();
            throw new Error('Salesforce ha restituito una risposta non JSON per i metadati CloudPages.');
        });
        const site = Array.isArray(data?.entities) && data.totalCount === 1 && data.entities.length === 1 && data.entities[0];
        if (!site || pageNumber(String(site.siteAssetId ?? '')) !== assetId) return null;
        const pageId = pageNumber(String(site.defaultPageId ?? ''));
        return pageId && pageId !== '0' ? pageId : null;
    }

    globalThis.sfmcfixCloudPagesMetadata = { pageNumber, portName, read };
})();
