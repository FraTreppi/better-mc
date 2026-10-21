// DEPRECATED
// (function() {
//     sfmcfix.temp = sfmcfix.temp || {};
//     const $ = window.jQuery;
//     console.log('SFMC fixer -- Assets grabber')
//     $(document).on('ajaxSuccess', (e, res, xhr, _data) => {
//         const url = xhr.url.split('?')[0];
//         if(/\/fuelapi\/asset\/v1\/content\/assets\/(\d)+\/*$/m.test(url)) {
//             console.log("SFMC fixer -- asset data grabbed -- ", _data.id, _data.name)
//             sfmcfix.temp.lastloadedasset = _data;
//             if(_data.assetType.id >= 207 && _data.assetType.id <= 209) sfmcfix.temp.currentasset = _data;
//         }
//     });

// })();