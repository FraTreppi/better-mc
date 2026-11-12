(function() {
    var $ = window.jQuery;
    console.log(`SFMC fixer - ${location.pathname} --- Asset dinamici`);

    window.sfmcfix = {
        config: {},
        temp: undefined,
        ajax : {
            transport: {},
            error: {},
            success: {},
            prefilter: {}
        }
    };

    window.sfmcfix.initAjaxHanlders = ($) => {
        if ($.__sfmcfixHandlers) return;
        $.__sfmcfixHandlers = true;
        $.ajaxTransport('+*', function(options) {
            try{
                if(sfmcfix?.ajax?.transport) {
                    // console.log("SFMC fixer -- ajax prefilter -- ", options, originalOptions, jqXHR);
                    const overrideKey = Object.keys(sfmcfix?.ajax?.transport).find((k) => options.url.indexOf(k)>=0);
                    if(overrideKey) {
                        const response = sfmcfix?.ajax?.transport[overrideKey](options);
                        if(response) return response;
                    }
                }
            }catch(e) {
                console.log('SFMC Fixer - AJAX TRANSPORT ERROR --- ',e);
            }
        });

        $.ajaxPrefilter(function( options, originalOptions, jqXHR ) {

            if(sfmcfix?.ajax?.prefilter) {
                // console.log("SFMC fixer -- ajax prefilter -- ", options, originalOptions, jqXHR);
                try{
                    Object.keys(sfmcfix?.ajax?.prefilter).filter((k) => options.url.indexOf(k)>=0).forEach((k) => {
                        const resp = sfmcfix?.ajax?.prefilter[k](options, originalOptions, jqXHR);
                        options = resp?.options ||options;
                        originalOptions = resp?.originalOptions || originalOptions;
                        jqXHR = resp?.jqXHR || jqXHR;
                    });
                }catch(e) {
                    console.log('SFMC Fixer - AJAX PREFILTER ERROR --- ', e);
                }
            }

            var tempSuccess = options.success;
            var tempError = options.error;

            options.success = function(a,b,c) {
                //console.log("SFMC fixer -- ajax success -- ", a,b,c);
                try{
                    if(sfmcfix?.ajax?.success) {
                        const handeler = Object.keys(sfmcfix?.ajax?.success).filter((k) => options.url.indexOf(k)>=0)
                        if(handeler.length){
                            handeler.forEach((k) => {
                                const resp = sfmcfix?.ajax?.success[k](a,b,c,options,jqXHR);
                                a = resp?.a || a;
                                b = resp?.b || b;
                                c = resp?.c || c;
                            });
                        }
                    }
                }catch(e) {
                    console.log('SFMC Fixer - AJAX SICCESS ERROR --- ', e);
                }
                tempSuccess && tempSuccess(a,b,c);
            }

            options.error = function(a,b,c) {
                // console.log("SFMC fixer -- ajax error -- ", a,b,c);
                try{
                    if(sfmcfix?.ajax?.error) {
                        Object.keys(sfmcfix?.ajax?.error).filter((k) => options.url.indexOf(k)>=0).forEach((k) => {
                            const resp = sfmcfix?.ajax?.error[k](a,b,c,options,jqXHR);
                            a = resp?.a || a;
                            b = resp?.b || b;
                            c = resp?.c || c;
                        });
                    }
                }catch(e) {
                    console.log('SFMC Fixer - AJAX ERROR ERROR --- ', e);
                }
                tempError && tempError(a,b,c);
            }
            
        });
    }

    window.sfmcfix.notificationLogger = (type,errorcode, message) => {
        const $ = window.jQuery;
        type = type || 'error';
        errorcode = errorcode || 'generic';
        var $defixerlog = $('#defixer_logs');
        if( !$defixerlog.length ) {
            $defixerlog = $('<div class="hide" id="defixer_logs"><ul></ul></div>');
            $('body').append($defixerlog);
        }

        let hideall;
        let $li = $('<li></li>').addClass(`is-${type}`).text(String(message));
        $defixerlog.find('ul').append( $li);
        let ti = setTimeout(() => {
            $li.remove();
            clearTimeout(hideall);
            hideall = setTimeout(() => {
                if($defixerlog.find('li').length < 1) $defixerlog.addClass('hide');
            },2000);
        }, 4000);
        $li.data('timeout',ti);
        $defixerlog.removeClass('hide');
    }

    sfmcfix.readConfigurations = function() {
        var script = document.getElementById('sfmc-fixer-config');
        var jsonString = script.innerHTML;
        sfmcfix.config = JSON.parse(jsonString);
        console.log(`SFMC fixer - ${location.pathname} --- config readed`);
        return sfmcfix.config;
    }

    sfmcfix.addCss = function(fileName) {
        let href = `${sfmcfix.config.extensionPath}assets/css/${fileName}.css`;
        let id = window.btoa(href);
        if(document.getElementById(id) != null) return false;
        console.log(`SFMC fixer - ${location.pathname} --- CSS -> ${fileName}.css`);
        const link = document.createElement("link");
        link.href = `${href}?t=${sfmcfix.config.timestamp}&sfmcfix`;
        link.type = "text/css";
        link.rel = "stylesheet";
        link.id = id;
        document.head.appendChild(link);
        return true;
    }

    sfmcfix.addJs = function(fileName,callback) {
        const src = `${sfmcfix.config.extensionPath}assets/js/${fileName}.js`;
        const id =  window.btoa(src);
        const existing = document.getElementById(id);
        if (existing) {
            if (existing.dataset.loaded === 'true') callback && callback(false);
            else if (callback) existing.addEventListener('load', () => callback(false), { once: true });
            return false;
        }
        console.log(`SFMC fixer - ${location.pathname} --- JS -> ${fileName}.js`);
        const script = document.createElement("script");
        script.src = `${src}?t=${sfmcfix.config.timestamp}&sfmcfix`;
        script.id = id;
        script.onload = () => {
            script.dataset.loaded = "true";
            callback && callback(true);
        };
        script.onerror = () => console.error(`SFMC Fixer: impossibile caricare ${fileName}`);
        document.head.appendChild(script);
        return true;
    }

    sfmcfix.addHtml = function(fileName, place, callback) {
        fetch(`${sfmcfix.config.extensionPath}assets/html/${fileName}.html?sfmcfix`).then(r => r.text()).then(html => {
          if(place?.insertAdjacentHTML) {place.insertAdjacentHTML('beforeend', html)}
          else if(place === false) {}
          else {document.body.insertAdjacentHTML('beforeend', html);}

          setTimeout(() => {
            callback && callback(html);
          }, 500);
        });
    }

    sfmcfix.addJson = async function(fileName) {
        try{
            return await fetch(`${sfmcfix.config.extensionPath}assets/json/${fileName}.json`).then(r => r.json());
        }catch(e) {
            return false;
        }
    }

    sfmcfix.getDeFullPath = async function(deid) {
        const resp = await fetch(`/contactsmeta/fuelapi/platform-internal/v1/categories/${encodeURIComponent(deid)}/fullPath?$pageSize=50`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
    });
    if (!resp.ok) throw new Error(`Lettura cartelle fallita: HTTP ${resp.status}`);
    return await resp.json();
    }

    // Scoped local storage bridge. The worker validates module, document and BU;
    // only a single approved key can be read or merged by a page.
    sfmcfix.storage = (function() {
        const CHANNEL = 'sfmcfix-storage';
        const pending = {};
        const changeCallbacks = [];
        let seq = 0;

        window.addEventListener('message', function(event) {
            if(event.source !== window || event.origin !== location.origin) return;
            const msg = event.data;
            if(!msg || msg.source !== CHANNEL) return;

            if(msg.direction === 'response') {
                const p = pending[msg.id];
                if(!p) return;
                delete pending[msg.id];
                msg.ok ? p.resolve(msg.result) : p.reject(new Error(msg.error || 'storage error'));
            } else if(msg.direction === 'change') {
                changeCallbacks.forEach((cb) => {
                    try { cb(msg.changes); } catch(e) { console.log('SFMC fixer - storage onChange handler error -', e); }
                });
            }
        });

        const request = function(action, payload) {
            return new Promise((resolve, reject) => {
                const id = `${Date.now()}-${++seq}`;
                pending[id] = { resolve, reject };
                const context = sfmcfix.context?.current();
                const scope = context?.persistent ? context.scope : null;
                window.postMessage({ source: CHANNEL, direction: 'request', id, action, payload, scope }, location.origin);
                setTimeout(() => {
                    if(pending[id]) {
                        delete pending[id];
                        reject(new Error(`storage timeout (${action})`));
                    }
                }, 120000);
            });
        };

        return {
            // get di una singola chiave restituendo direttamente il valore
            getItem: (key, fallback) => request('get', { keys: [key] }).then((items) => items[key] === undefined ? fallback : items[key]),
            // The worker serializes and validates each permitted BU update.
            mergeItem: (key, partial) => request('merge', { items: { [key]: partial } }),
            onChange: (callback) => {
                changeCallbacks.push(callback);
                return () => {
                    const i = changeCallbacks.indexOf(callback);
                    if(i > -1) changeCallbacks.splice(i, 1);
                };
            }
        };
    })();

    var _interval;
    var jqCallbacks = [];

    sfmcfix.retryjQ = function (callback,duration) {
        if(!window.jQuery) {
            jqCallbacks.push(callback);
            if(!_interval) 
                _interval = setInterval(() => {
                    if(window.jQuery) {
                        clearInterval(_interval);
                        _interval = null;
                        const callbacks = jqCallbacks.splice(0);
                        callbacks.forEach(callback => callback());
                    }
                },duration||500);
        } else {
            callback && callback();
        }
    }
    
    sfmcfix.readConfigurations();

    // aggiungo uno stile generico
    sfmcfix.addCss('styles');

    const supported = location.hostname === 'querystudio.herokuapp.com' ||
        location.pathname.includes('/contactsmeta/admin.html') ||
        location.hostname.startsWith('content-builder.') ||
        location.pathname.includes('/AutomationStudioFuel3') ||
        /^jbinteractions\./.test(location.hostname);
    if (!supported) return;

    sfmcfix.addJs('components/native-session', () => sfmcfix.addJs('context', async () => {
    try { await sfmcfix.context.ready; } catch (error) {
        console.error('SFMC Fixer: inizializzazione contesto fallita', error);
        return;
    }

    if(window.location.href.indexOf('querystudio') != -1) {
        
        //query studio fixes
        sfmcfix.addCss('querystudio/_index');

        sfmcfix.addJs('querystudio/_index');

    }else if (window.location.href.indexOf('/contactsmeta/admin.html') != -1) {

        //contact builder
        sfmcfix.addCss('contactbuilder/_index');

        sfmcfix.addJs('contactbuilder/_index');

    }else if(window.location.href.indexOf('https://content-builder.') != -1){

        //preview and test
        sfmcfix.addJs('contentbuilder/_index');
    
    }else if(window.location.href.indexOf('.marketingcloudapps.com/AutomationStudioFuel3') != -1){

        //automation studio
        sfmcfix.addCss('automation/_index');
        sfmcfix.addJs('automation/_index');
    } else if(/^jbinteractions\./.test(location.hostname)){

        sfmcfix.addCss('journey/_index');
        sfmcfix.addJs('journey/_index');
        sfmcfix.addJs('journey/entry-de');

    } else {

        // CSS GENERICO

        // JS GENERICO
        // sfmcfix.addJs('content');

    }

    // window.jQuery && jQuery.ajaxPrefilter(( _data, originalOptions, jqXHR ) => {});

    // window.jQuery && jQuery(document).on('ajaxSuccess', (e, res, xhr, _data) => {});

    /*
    const observer = new MutationObserver((mutations) => {});

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
*/

    }));

console.log(`SFMC fixer -- ${location.pathname} --- `);

})();
