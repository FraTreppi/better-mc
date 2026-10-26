(function($) {
    sfmcfix.temp = sfmcfix.temp || [];

    // HANDLERS
    sfmcfix.ajax.success['/fuelapi/asset/v1/content/assets/' ] = function(_data,b,c,options,jqXHR) {
        const url = options.url.split('?')[0];
        if(/\/fuelapi\/asset\/v1\/content\/assets\/(\d)+\/*$/m.test(url)) {
            if (!Number.isSafeInteger(Number(_data?.id)) || !_data?.assetType) return;
            sfmcfix.temp.lastloadedasset = _data;
            if(_data.assetType.id >= 207 && _data.assetType.id <= 209) sfmcfix.temp.currentasset = _data;
            window.dispatchEvent(new CustomEvent('sfmcfix:asset-loaded', { detail: { id: Number(_data.id), typeId: Number(_data.assetType.id) } }));
        }
    }

    const init = function() {
        sfmcfix.addJs('contentbuilder/recent-preview-des', () =>
            sfmcfix.addJs('contentbuilder/tester-source', () => sfmcfix.addJs('contentbuilder/previewandtest')));
        sfmcfix.addCss('contentbuilder/previewandtest');
        sfmcfix.addCss('contentbuilder/advanced-search');
        sfmcfix.addJs('contentbuilder/asset-search', () => sfmcfix.addJs('contentbuilder/asset-navigation', () => sfmcfix.addJs('contentbuilder/advanced-search')));
        sfmcfix.initAjaxHanlders(window.jQuery);
    }

    sfmcfix.retryjQ (() => {init()}, 100);


})();
