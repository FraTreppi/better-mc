(function() {
    let $;

    const DEHISTORYNAME = 'SFMCFIX---DEHISTORY'
    const gsmChars = [  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
        'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
        'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
        'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
        '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
        '!', '#', ' ', '"', '%', '&', '\'', '(', ')', '*', ',', '.', '?',
        '+', '-', '/', ';', ':', '<', '=', '>', '¡', '¿', '_', '@',
        '$', '£', '¥', '¤',
        'è', 'é', 'ù', 'ì', 'ò', 'Ç', 'Ø', 'ø', 'Æ', 'æ', 'ß', 'É', 'Å',
        'å', 'Ä', 'Ö', 'Ñ', 'Ü', '§', 'ä', 'ö', 'ñ', 'ü', 'à',
        'Δ','Φ','Ξ','Γ','Ω','Π','Ψ','Σ','Θ','Λ','€'];

    window.sfmcfix.checkBody = function(body) {
        body = String(body ?? "");
        var charCount = body.length;
        var segmentCount = null;
        let bodyCharSet = new Set(body.split(""));
        let bodyCharArray = Array.from(bodyCharSet);
        var notGsm = ((bodyCharArray.filter(e => !gsmChars.includes(e)).length > 0));
        if(notGsm){
            segmentCount = Math.ceil(charCount / 67);
        }else {
            segmentCount = Math.ceil(charCount / 153);
        }
        return { charCount, notGsm, segmentCount }
    }

    window.sfmcfix.isUrlValid = function(userInput) {
        var res = userInput.match(/(https:\/\/.)?(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/g);
        if(res == null)
            return false;
        else
            return true;
    }

    var focusListener = function() {
        var $el = $(this);
        $(this).addClass('wrapped');
        $(this).wrap('<div class="resizable-wrapper"></div>');
        setTimeout(() => {
            $el.focus();
        }, 200);
    }

    var smsTextTester = function(event) {
        let message = $(this).data('originaldata');
        if(!message || $(this).is('input') || $(this).find('.testgsm').length) return;
        let $button = $('<button class="btn btn-primary testgsm"></button>');
        $button.on('click', function() {
            let url = `https://messente.com/sms-length-calculator?message=${encodeURIComponent(message.replace(/%%cod_sms%% */gi,''))}`;
            window.open(url, '_blank', 'noopener,noreferrer');
        });
        $(this).append($button);
    }

    var smsTextTesterOut = function() {
        $(this).find('button').remove();
    }

    // var removeDeItemhistory = function() {
    //     var uuid = $(this).data('timestamp');
    //     const dehistoryJsonString = sfmcfix.local.getItem(DEHISTORYNAME);
    //     let dehistory = [];

    //     if (dehistoryJsonString) dehistory = JSON.parse(dehistoryJsonString);
        
    //     if (!!dehistory.length) {
    //         let idnx = dehistory.findIndex((item) => item[2] === uuid);
    //         if(idnx !== -1){
    //             dehistory.slice(idnx, 1);
    //             sfmcfix.local.setItem(DEHISTORYNAME, JSON.stringify(dehistory));
    //         }
    //     }

    //     $(this).parent().remove();
    // }

    const clearDeHistory = function() {
        if (confirm(`Sicuro di voler svuotare lo storico?\n(non ci sono impatti su MCE)`) !== true) {
            return false;
        }
        sfmcfix.local.removeItem(DEHISTORYNAME);
        $('#de-history').hide();
        $('#de-history').find('ul').html('');
    }

    const initDeHistory = function() {
        const dehistoryJsonString = sfmcfix.local.getItem(DEHISTORYNAME);
        const $cat = $('#js-de-categories-nav-tree');
        if (!dehistoryJsonString) { $('#de-history').remove(); return; }
        if(dehistoryJsonString && $cat.length > 0) {
            var $historyspace = $('#de-history');
            if(!$historyspace.length) {
                $historyspace = $(`<div class="de-history hide" id="de-history">
                    <header>
                        <h4>Last DE views</h4>
                        <button class="btn btn-secondary btn-sm" id="clear-de-history">Clear</button>
                    </header>
                    <ul></ul></div>`);
                $cat.before($historyspace);
            }
            const dejson = JSON.parse(dehistoryJsonString);
            if(dejson.length > 0) {
                $historyspace.removeClass('hide');
                //<button class="btn btn-link remove-de-history-item" data-timestemp="${item[2]}"><i></i></button>*/}
                $historyspace.find('ul').html(() => dejson.reverse().map((item) => `<li>
                ${item[3] && `<button data-action="navigate-to-folder" data-categoryid="${item[3]}" class="btn btn-link"><span class="glyphicon icon-folder glyphicon-folder-close"></span></button>` || ''}
                <a href="${item[0]}">${sfmcfix.escapeHtml(item[1])}</a></li>`).join(''));
            } else {
                $historyspace.addClass('hide');
            }
        }
    }

    const initFullSearch = function() {
        if($('#advanced-de-serach-btn').length) return;

        const $btn = $('<button class="btn btn-secondary advanced-de-button" id="advanced-de-serach-btn">Advanced</button>');
        
        sfmcfix.addJs('components/modal', () => {
            const advsearch = new window.sfmcfix.customModal({
                title: 'Data Extension Search',
                footer: 'SFMC Fixer',
                id: 'advanced-de-search_modal',
                size: 'stanrdard-size'
            });
            advsearch.htmlBodyLoad('advanced-de-search', () => {
                advsearch.place();

                $btn.on('click', function() {
                    advsearch.show();
                });

                $('#js-de-items-header .search-container').append($btn);
            });
        });
        
    }

    var initRoot = function() {
        initDeHistory();
        initFullSearch();
        $(document).on('click','#clear-de-history', clearDeHistory);
        // $(document).off('click','button.remove-de-history-item', removeDeItemhistory);
        // $(document).on('click','button.remove-de-history-item', removeDeItemhistory);
    }

    var rootDataExtension = function(retray) {
        retray = retray || 0;
        console.log(`SFMC fixer - DE ROOT INITED --- [retray ${retray}]`);
        const $cat = $('#js-de-categories-nav-tree');

        if($cat.length > 0 || retray >= 10) {
            initRoot();
            return true;
        }

        setTimeout(() => {
            rootDataExtension(retray+1);
        }, 2000);

        return false;
    }

    var dataExtansionPropsLoad = function (uuid, e, res, xhr, _data) {
        try{
            setTimeout(() => {
                if(xhr.url.indexOf('/fields') == -1 && xhr.url.includes(`contactsmeta/fuelapi/internal/v1/customobjects/${uuid}`)) {
                    if(_data && uuid && _data.id === uuid && !!_data.name) {
                        const dehistoryJsonString = sfmcfix.local.getItem(DEHISTORYNAME);
                        let dehistory = [];

                        if (dehistoryJsonString) dehistory = JSON.parse(dehistoryJsonString);
                        
                        if (!!dehistory.length) {
                            //elimino eventuali duplicati gia presenti
                            const dehistorytemp = dehistory.filter((item) => item[0].indexOf(uuid) === -1);
                            dehistory = dehistorytemp.slice(-8);
                        }
                            
                        dehistory.push([`#admin/data-extension/${uuid}/properties/`,_data.name, new Date().getTime(),_data.categoryId||null]);
                        sfmcfix.local.setItem(DEHISTORYNAME, JSON.stringify(dehistory));
                        $(document).off('ajaxSuccess.sfmcfixHistory');
                    }
                }
            }, 10);
        }catch(e){}
    }

    var fieldSaveAjaxError = function (e, res, xhr) {
        if(xhr.url.indexOf('?method=') >= 0 && res.responseJSON?.additionalErrors?.length > 0) {
            res.responseJSON.additionalErrors.forEach( (err) => {
                window.sfmcfix.notificationLogger('error',err.errorcode, err.message);
            });
        }
    }

    var cloneItem = function($trtoclone, $tr, $btn) {
        var $tds = $tr.find('td');
        var $tdsClone = $trtoclone.find('td');

        $btn.removeClass('active').removeAttr('disabled');
        $tr.parents('table.table').removeClass('in-cloning');
        $tr.siblings('tr').off('click');

        if($tds.length === $tdsClone.length) {
            $tdsClone.each((_i,coltoclone) => {
                const $coltoclone = $(coltoclone);
                //var value = $coltoclone.data('originaldata');
                var value = $coltoclone.text();
                if(typeof value !== 'string') {
                    value = JSON.stringify(value);
                }
                const $input = $tds.eq(_i).find('input');

                try{
                    if($input.hasClass('selectlist')) {
                        //custom select
                        $tds.eq(_i).find(`li[data-value="${value||''}"] a`).trigger('click');
                    } else {
                        //simple input
                        $input.val(value);
                    }
                }catch(e){
                    const title = $coltoclone.data('originalcolumn');
                    window.sfmcfix.notificationLogger('error',`td-${_i}`, `Non riesco a clonare il campo "${title}"`);
                    console.log(`SFMC fixer - CLONE ERROR`, e);
                }

            });
            $tr.find('input:last').trigger('change');

        } else {
            console.log(`SFMC fixer - COLUMNS DIFFERENT NUMBER! CAN'T CLONE`);
        }
    }

    var multiRowManager = function() {
        var $wrapper = $('#multiple-rows-content');
        const $container = $('#dataExtension .repeater-records');
        const $table = $('.repeater-list-wrapper table',$container);
    
        const afterInit = function() {
            const $tableClone = $table.clone();
            ['data-preserve','aria-readonly'].map((attr) => $tableClone.removeAttr(attr));
            $tableClone.find('tbody tr:not(.new-record)').remove();
            var $toolboxtd;
            if($tableClone.find('tbody .checkbox-custom').length) {
                $toolboxtd = $tableClone.find('tbody > tr > td:eq(0)')
            } else {
                $toolboxtd = $('<td />');
                $tableClone.find('thead tr').prepend('<th/>');
                $tableClone.find('tbody tr').prepend($toolboxtd);
            }
            $toolboxtd.addClass('multirow-row-toolbox').append('<button class="btn p-0 multirow-addrow" data-action="add"><i class="glyphicon glyphicon-add"></i></button><button class="btn p-0 multirow-removerow" data-action="remove"><i class="glyphicon glyphicon-remove"></i></button>');
            const $tfoot = $('<tfoot />');
            $tfoot.append($tableClone.find('tbody > tr').clone());
            $tableClone.append($tfoot);
            $wrapper.empty().append($tableClone);
            $table.find('.rowSelected.new-record').hide();

            $tableClone.on('click', '.btn', function(e){
                const $btn = $(this);
                const $tr = $btn.parents('tr').eq(0);
                const action = $btn.data('action');
                $('.clone-info-message').addClass('')
                switch(action) {
                    case 'add':
                        const $newTr = $tr.clone();
                        $tr.after($newTr);
                        $tr.addClass('is-cloned');
                        break;
                    case 'remove':
                        $tr.remove();
                        break;
                }
                setTimeout(() => {
                    const action = $tableClone.find('tbody > tr').length > 1 ? 'addClass' : 'removeClass';
                    $tableClone[action]('is-multiple');
                },200);
                return false;
            });

            $tableClone.on('click', '.dropdown-menu li',function(e) {
                const val = $(this).data('value');
                $(this).parent().siblings('input').val(val).trigger('change');
            });

            $tfoot.on('change','input', function() {
                const $input = $(this);
                const value = $input.val();
                const preval = $input.data('originalvalue') || "";
                try{
                    if($input.hasClass('selectlist')) {
                        //custom select
                        const definitionid = $input.parent().data('definition-id');
                        $input.parents('table').find(`tbody [data-definition-id=${definitionid}]`).each((_i,_el) => {
                            const $el = $(_el);
                            $el.find('input').val(value);
                            $el.find('li').removeAttr('data-selected').filter(`[data-value="${value}"]`).attr('data-selected', 'true');
                        })
                    } else {
                        //simple input
                        const definitionid = $input.data('definition-id');
                        const _val = $input.val();
                        $input.parents('table').find(`tbody [data-definition-id=${definitionid}]`).each(function() {
                            if($(this).val() === "" || $(this).val() === preval) $(this).val(_val)
                        });
                    }
                }catch(e){
                    window.sfmcfix.notificationLogger('error',"Non riesco a riportare il valore su tutti i record!");
                    console.log(`SFMC fixer - CLONE ERROR`, e);
                }
                $input.data('originalvalue', value)
            });

            if(window.currentDEData?.fields) {
                window.currentDEData?.fields?.forEach(field => {
                    const $input = $tableClone.find(`[data-definition-id="${field.id}"]`);
                    if($input.length) {
                        $input.attr({
                            'placeholder': field.type,
                            'required': !field.isNullable,
                            'maxlength': field.length
                        });
                        switch(field.type) {
                            case 'Date' :
                                $input.attr('type','datetime-local');
                            break;
                            case 'Decimal' : 
                                $input.attr({'type':'number', 'step':'.01', 'min':0});
                            break;
                            case 'Number' :
                                $input.removeAttr('maxlength');
                            break;
                        }

                        if(field.isPrimaryKey) {
                            $input.addClass('is-primarykey');
                        } else if(!field.isNullable) {
                            $input.addClass('is-nonullable');
                        }
                    }
                });
            }
        }
        

        if(!$wrapper.length) {
            sfmcfix.addHtml(`contactbuilder/multiplerows`, false, (html) => {
                if($('#multiple-rows-content').length) return;
                const $html = $(html);
                $wrapper = $('#multiple-rows-content',$html);
                $('.repeater-header',$container).after($html);
                afterInit();
                setTimeout(() => {
                    $html.filter('script[data-filename]').each(function() {
                        const filename = $(this).data('filename');
                        filename && sfmcfix.addJs(filename);
                    });
                },200);
            });
        } else {
            afterInit();
        }
    }

    var cloneButton = function() {
        let $btn = $(this);
        $btn.addClass('active').attr('disabled',true);
        var $tr = $('.rowSelected.new-record');
        $tr.parents('table.table').addClass('in-cloning');
        $('.clone-info-message').addClass('show')
        $tr.siblings('tr').on('click', function() {
            cloneItem($(this), $tr, $btn);
            return false;
        });
    }

    window.currentDEData = {
        records: [],
        fieldCount: 0,
        fields: [],
    };

    var storeRecords = function(e, res, xhr, _data) {
        const routeId = location.hash.match(/#admin\/data-extension\/([^/]+)/)?.[1];
        if (!routeId || !xhr.url.toLowerCase().includes(routeId.toLowerCase())) return;

        if(xhr.url.includes(`/contactsmeta/fuelapi/internal/v1/CustomObjectData/`)) {
            currentDEData.records = _data.items || [];
        } else if(xhr.url.includes(`/contactsmeta/fuelapi/internal/v1/customobjects/`)) {
            if(xhr.url.includes(`/fields`)) {
                currentDEData.fieldCount = _data.fieldCount;
                currentDEData.fields = _data.fields;   
            } else {
                currentDEData = {...currentDEData, ..._data};
            }
        }
    }

    var exportRexcordsAsCsv = function() {
        if(currentDEData?.records?.length) {
            const csv = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
            let headline = Object.keys(currentDEData?.records[0]).map((field) => {
                const ff = currentDEData?.fields?.find((f) => f.name.toLowerCase() === field.toLowerCase());
                return csv(ff?.name || field);
            }).join('|') + '\r\n';
            let values = currentDEData?.records.map((row) => Object.keys(currentDEData.records[0]).map(key => csv(row[key])).join('|')).join('\r\n');
            var a = document.createElement("a");
            var file = new Blob([headline+values], {type: 'text/csv'});
            a.href = URL.createObjectURL(file);
            a.download = `dataextension-view-${new Date().getTime()}.csv`;
            a.click();

            setTimeout(() => {
                $(a).remove();
            },5000);
        }
    }

    var moveFast = function() {
        const $this = $(this);
        const $wrapper = $this.parent();
        const $input = $wrapper.find('.repeater-secondaryPaging');

        if($this.hasClass('repeater-last')) {
            let last = $wrapper.find('li:last').data('value') || $wrapper.find('.repeater-pages').text();
            if(last){
                $input.val(last);
                $input.trigger('change');
                $input.trigger('blur');
            }
        } else if($this.hasClass('repeater-first')) {
            $input.val(1);
            $input.trigger('change');
            $input.trigger('blur');
        }
    }

    var recordsobserver;

    var hashChange = function() {
        if (!$) return;
        const routeId = location.hash.match(/#admin\/data-extension\/([^/]+)/)?.[1];
        if (window.currentDEData?.id !== routeId) window.currentDEData = { records: [], fields: [], fieldCount: 0 };


        $(document).off('focus','.editableInput.form-control:not(.wrapped)', focusListener);
        $(document).off('mouseenter','td[data-originalcolumn="sMS_TEXT"]', smsTextTester);
        $(document).off('mouseleave','td[data-originalcolumn="sMS_TEXT"]', smsTextTesterOut);
        // $(document).off('click','button.remove-de-history-item', removeDeItemhistory);
        $(document).off('click','#clear-de-history', clearDeHistory);
        $(document).off('click','button.clone-btn', cloneButton);
        $(document).off('click','#axportascsv', exportRexcordsAsCsv);
        $(document).off('click','.multirow-btn', multiRowManager);

        $(document).off('ajaxSuccess.sfmcfixHistory');
        $(document).off( "ajaxError", fieldSaveAjaxError);
        $(document).off( "ajaxSuccess", storeRecords);
        $(document).off('click','.btn-navigate-fast', moveFast);

        $(document).on("ajaxSuccess", storeRecords);

        recordsobserver?.disconnect();

        if(/^#admin\/data-extensions\/?$/.test(location.hash)){

            /**
             * DATA EXTENSION ROOT
             */

            console.log(`SFMC fixer - ROOT DE`);

            rootDataExtension();

        } else if ((/#admin\/data-extension\/[^/]+\/records/.test(location.hash))) {

            /**
             * DATA EXTENSION RECORDS VIEW
             */

            console.log(`SFMC fixer - RECORDS DE`);
            $(document).on('focus','.editableInput.form-control:not(.wrapped)', focusListener);
            $(document).on('mouseenter','td[data-originalcolumn="sMS_TEXT"]', smsTextTester);
            $(document).on('mouseleave','td[data-originalcolumn="sMS_TEXT"]', smsTextTesterOut);
            $(document).on('click','#axportascsv', exportRexcordsAsCsv);
            $(document).on('click','button.clone-btn', cloneButton);
            $(document).on('click','.multirow-btn', multiRowManager);
            $(document).on("ajaxError", fieldSaveAjaxError);
            $(document).on('click','.btn-navigate-fast', moveFast);

            const observations = debounce(() => {
                $('td[data-originalcolumn="sMS_TEXT"]:not(.gsm-ready)').each(function() {
                    $(this).addClass('gsm-ready');
                    //sms text
                    var originalData = $(this).data('originaldata');
                    var checkGsm = window.sfmcfix.checkBody(originalData);
                    if(checkGsm.notGsm) {
                        $(this).addClass('has-nogsm');
                    } else {
                        $(this).removeClass('has-nogsm');
                    }
                });

                if($('.edit-de-grid-cancel-save:visible').length) {
                    let $container = $('.edit-de-grid-cancel-save .mcefix-de-record-toolbox');
                    if(!$container.length) {
                        $container = $('<aside class="mcefix-de-record-toolbox"><span>Toolbox</span><section class="inner-toolbox"></section></aside>');
                        $('.edit-de-grid-cancel-save').append($container);
                    }
                    let buttons = [];
                    if ($('.clone-btn',$container).length < 1) {
                        buttons.push('<button class="btn btn-secondary clone-btn" title="Clone row form list below">CLONE</button>');
                    }
                    if($('.multirow-btn',$container).length < 1) {
                        buttons.push('<button class="btn btn-secondary multirow-btn" title="Create Multiple Rows">MULTI ROWS</button>');
                    }

                    if(buttons.length) $('.inner-toolbox', $container).append(buttons.join(''));

                    if(!$('.clone-info-message').length){
                        $('#dataExtension .repeater-records .repeater-header').after('<div class="clone-info-message">Seleziona un record nella lista per copiarlo, <strong>VERIFICARE SEMPRE</strong> che i campi clonati siano presenti e siano correttamente valorizzati! Codice HTML o caratteri speciali potrebbero creare essere copiati in modo inaspettato e diverso dal dato orignale!</div>');
                    } else {
                        $('#dataExtension .repeater-records .repeater-header .clone-info-messag').addClass('show');    
                    }
                } else {
                    $('#dataExtension .repeater-records .repeater-header .clone-info-messag').removeClass('show');
                }

                if($('.btn.btn-default.export').length) {
                    if(!$('#axportascsv').length) {
                        let $button = $('<button id="axportascsv" class="btn btn-default">CSV</button>');
                        $('.btn.btn-default.export').after($button);
                    }
                }

                const $pager = $('#dataExtension .repeater-pagination');
                if($pager.length) {
                    if(!$pager.find('.repeater-last').length) $pager.find('.repeater-next').after(`<button type="button" class="btn btn-default btn-sm btn-navigate-fast repeater-last"><span class="glyphicon glyphicon-chevron-right"></span><span class="glyphicon glyphicon-chevron-right"></span><span class="sr-only">Last Page</span></button>`);
                    if(!$pager.find('.repeater-first').length) $pager.find('.repeater-prev').after(`<button type="button" class="btn btn-default btn-sm btn-navigate-fast repeater-first" style="float:left"><span class="glyphicon glyphicon-chevron-left"></span><span class="glyphicon glyphicon-chevron-left"></span><span class="sr-only">First Page</span></button>`);
                }

                $('td[data-originalcolumn="mediaURL"]').each(function() {
                    const value = $(this).data('originaldata');
                    $(this).toggleClass('is-invalid', Boolean(value) && !sfmcfix.isUrlValid(String(value)));
                });
            }, 500);

            recordsobserver = new MutationObserver(observations);

            observations();
            recordsobserver.observe(document.body, {
                childList: true,
                subtree: true
            });

        } else if ((/#admin\/data-extension\/[^/]+\/properties/.test(location.hash))) {

            /**
             * DATA EXTENSION PROPERTIES VIEW
             */

            console.log(`SFMC fixer - PROPS DE`);

            const regexUUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
            const match = location.hash.match(regexUUID);
            const uuid = match && match[0];

            if(!!uuid) $(document).on('ajaxSuccess.sfmcfixHistory', (a,b,c,d) => dataExtansionPropsLoad(uuid,a,b,c,d));

        } else {
            console.log(`SFMC fixer - FALLBACK DE`);
            recordsobserver?.disconnect();
        }
    }

    addEventListener("hashchange", (e) => {
        console.log(`SFMC fixer - HASH[${location.hash}] --- CHANGE`);
        hashChange();

    })

    sfmcfix.retryjQ (() => {
        $ = window.jQuery;
        $(document).on('click','[data-action="navigate-to-folder"]', function() {
            const catid = $(this).data('categoryid');
            const obj = {
                "name": `<span id="${catid}">test</span>`,
                "namePlainText": "test",
                "type": "folder",
                "additionalParameters": {
                    "id": catid,
                    "type": "dataextension",
                    "parentId": null
                },
                "attr": {
                    "id": catid
                },
                "template": "treebranch"
            };
            $('#js-de-categories-nav-tree').trigger('selected.fu.tree', {
                target: obj,
                selected: { "0": obj }
            });
        });
        hashChange();
        window.addEventListener("sfmcfix:contextchange", hashChange);
    }, 100);

})();
