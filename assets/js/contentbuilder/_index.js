(function($) {
    sfmcfix.temp = sfmcfix.temp || [];

    // HANDLERS
    sfmcfix.ajax.success['/fuelapi/asset/v1/content/assets/' ] = function(_data,b,c,options,jqXHR) {
        const url = options.url.split('?')[0];
        if(/\/fuelapi\/asset\/v1\/content\/assets\/(\d)+\/*$/m.test(url)) {

            sfmcfix.temp.lastloadedasset = _data;
            if(_data.assetType.id >= 207 && _data.assetType.id <= 209) sfmcfix.temp.currentasset = _data;
        }
    }

    const init = function() {
        sfmcfix.addJs('contentbuilder/tester-source', () => sfmcfix.addJs('contentbuilder/previewandtest'));
        sfmcfix.addCss('contentbuilder/previewandtest');
        sfmcfix.initAjaxHanlders(window.jQuery);
    }

    sfmcfix.retryjQ (() => {init()}, 100);


})();