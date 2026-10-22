(function() {
    let $;

    const DEHISTORYNAME = 'SFMCFIX---DEHISTORY'
    const gsmBasic = new Set(Array.from('@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà'));
    const gsmExtended = new Set(Array.from('\f^{}\\[~]|€'));
    window.sfmcfix.checkBody = function (body) {
        body = String(body ?? '');
        const characters = Array.from(body);
        const notGsm = characters.some(char => !gsmBasic.has(char) && !gsmExtended.has(char));
        const units = notGsm ? body.length : characters.reduce((sum, char) => sum + (gsmExtended.has(char) ? 2 : 1), 0);
        const single = notGsm ? 70 : 160;
        const multiple = notGsm ? 67 : 153;
        const segmentCount = units === 0 ? 0 : units <= single ? 1 : Math.ceil(units / multiple);
        return { charCount: characters.length, notGsm, units, segmentCount, encoding: notGsm ? 'Unicode' : 'GSM-7' };
    };
    window.sfmcfix.showSmsInfo = function (message) {
        const result = sfmcfix.checkBody(message);
        alert(`Analisi SMS locale\nCaratteri: ${result.charCount}\nCodifica: ${result.encoding}\nUnità: ${result.units}\nSegmenti stimati: ${result.segmentCount}\n\nIl testo resta in questa pagina. Il conteggio effettivo dipende dal servizio di invio e dalle personalizzazioni.`);
    };

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
            sfmcfix.showSmsInfo(message);
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
            const dejson = JSON.parse(dehistoryJsonString).filter(item => Array.isArray(item) &&
                /^#admin\/data-extension\/[0-9a-f-]{36}\/properties\/$/i.test(item[0]) &&
                /^#admin\/data-extension\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/properties\/$/i.test(item[0]));
            if(dejson.length > 0) {
                $historyspace.removeClass('hide');
                //<button class="btn btn-link remove-de-history-item" data-timestemp="${item[2]}"><i></i></button>*/}
                $historyspace.find('ul').html(() => dejson.reverse().map((item) => `<li>
                ${item[3] && `<button data-action="navigate-to-folder" data-categoryid="${sfmcfix.escapeHtml(item[3])}" class="btn btn-link"><span class="glyphicon icon-folder glyphicon-folder-close"></span></button>` || ''}
                <a href="${sfmcfix.escapeHtml(item[0])}">${sfmcfix.escapeHtml(item[1])}</a></li>`).join(''));
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
            $wrapper.data('sfmcfixScope', sfmcfix.context.current().scope);
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

    // A CSV belongs to one completed grid request, not to the global DE metadata.
    const csvRequests = new WeakMap();
    let csvIdentity = null;
    let csvEpoch = 0;
    let csvSequence = 0;
    let csvStatus = 'waiting';
    let csvPage = null;
    const deIdPattern = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

    function csvContext() {
        const match = location.hash.match(new RegExp('^#admin/data-extension/(' + deIdPattern + ')/(records)(?:/|$)', 'i'));
        return match ? { id: match[1].toLowerCase(), scope: sfmcfix.context.current().scope } : null;
    }
    function syncCsvContext() {
        const context = csvContext();
        const identity = context ? `${context.scope}/${context.id}` : null;
        if (identity !== csvIdentity) {
            csvIdentity = identity;
            csvEpoch++;
            csvSequence++;
            csvPage = null;
            csvStatus = 'waiting';
        }
        return context;
    }
    function nativeDeRequest(options) {
        try {
            const url = new URL(options.url, location.href);
            if (url.origin !== location.origin) return null;
            const match = url.pathname.match(new RegExp('^/contactsmeta/fuelapi/internal/v1/(customobjectdata|customobjects)/(' + deIdPattern + ')(/fields)?/?$', 'i'));
            if (!match || (match[1].toLowerCase() === 'customobjectdata' && match[3])) return null;
            return { id: match[2].toLowerCase(), records: match[1].toLowerCase() === 'customobjectdata', fields: Boolean(match[3]), url };
        } catch (_) { return null; }
    }
    function csvReady() {
        syncCsvContext();
        if (csvStatus !== 'ready' || !csvPage?.rows.length) return false;
        const input = document.querySelector('#dataExtension .repeater-pagination .repeater-secondaryPaging');
        const visiblePage = Number(input?.value);
        return !(visiblePage > 0 && csvPage.page > 0 && visiblePage !== csvPage.page);
    }
    function updateCsvButton() {
        const ready = csvReady();
        const messages = {
            waiting: 'CSV non pronto: attendi i record. Se erano già caricati prima dell’estensione, riapri la scheda Records.',
            loading: 'Caricamento della pagina in corso: il CSV precedente non è disponibile.',
            error: 'Lettura dei record non riuscita: ricarica la pagina dei record prima di esportare.',
            empty: 'La pagina caricata non contiene record da esportare.'
        };
        $('#axportascsv').prop('disabled', !ready).attr({
            title: ready ? `Scarica i ${csvPage.rows.length} record della sola pagina caricata.` :
                messages[csvStatus] || 'Attendi il caricamento della pagina selezionata.',
            'aria-busy': String(csvStatus === 'loading'),
            'data-record-count': String(ready ? csvPage.rows.length : 0)
        });
    }
    function storeRecords(e, response, options, data) {
        const request = nativeDeRequest(options);
        if (!request || request.records || !data || typeof data !== 'object') return;
        const id = location.hash.match(new RegExp('^#admin/data-extension/(' + deIdPattern + ')(?:/|$)', 'i'))?.[1].toLowerCase();
        const owner = csvRequests.get(response);
        if (request.id !== id || (owner && owner.scope !== sfmcfix.context.current().scope)) return;
        if (request.fields) {
            currentDEData.fieldCount = data.fieldCount;
            currentDEData.fields = Array.isArray(data.fields) ? data.fields : [];
        } else {
            // Metadata must not overwrite the independently owned CSV rows.
            const { records, ...metadata } = data;
            currentDEData = { ...currentDEData, ...metadata, records: [] };
        }
    }
    function observeDeRequest(options, originalOptions, xhr) {
        const request = nativeDeRequest(options);
        if (!request) return;
        const context = syncCsvContext();
        csvRequests.set(xhr, { scope: sfmcfix.context.current().scope });
        if (!request.records || request.id !== context?.id || String(options.type || options.method || 'GET').toUpperCase() !== 'GET') return;
        const ticket = { epoch: csvEpoch, sequence: ++csvSequence, ...context };
        csvPage = null;
        csvStatus = 'loading';
        updateCsvButton();
        const isCurrent = () => {
            const now = syncCsvContext();
            return now?.id === ticket.id && now.scope === ticket.scope && ticket.epoch === csvEpoch && ticket.sequence === csvSequence;
        };
        // Deferred callbacks also see requests with global:false, and run before
        // native success handlers format/escape the response for the grid.
        xhr.done(data => {
            if (!isCurrent()) return;
            if (!Array.isArray(data?.items) || data.items.some(row => !row || typeof row !== 'object' || Array.isArray(row) ||
                Object.values(row).some(value => value !== null && !['string', 'number', 'boolean', 'undefined'].includes(typeof value)))) {
                csvStatus = 'error';
                updateCsvButton();
                return;
            }
            const rows = data.items.map(row => Object.fromEntries(Object.entries(row)));
            const names = new Set();
            for (const row of rows) for (const key of Object.keys(row)) names.add(key);
            const columns = Array.from(names);
            const params = new URLSearchParams(typeof options.data === 'string' ? options.data : options.data || {});
            const page = Number(request.url.searchParams.get('$page') || params.get('$page'));
            csvPage = { ...ticket, rows, columns, page: Number.isInteger(page) && page > 0 ? page : null };
            csvStatus = rows.length ? 'ready' : 'empty';
            updateCsvButton();
        });
        xhr.fail(() => {
            if (!isCurrent()) return;
            csvPage = null;
            csvStatus = 'error';
            updateCsvButton();
        });
        xhr.always(() => queueMicrotask(() => {
            // The native success handler can update its page selector after
            // our snapshot. Recheck once the complete callback stack finishes.
            if (isCurrent()) updateCsvButton();
        }));
    }

    var exportRexcordsAsCsv = function(event) {
        event?.preventDefault();
        if (!csvReady()) {
            updateCsvButton();
            sfmcfix.notificationLogger('error', null, 'CSV non disponibile: attendi o ricarica i record della pagina corrente.');
            return false;
        }
        const snapshot = csvPage;
        const csv = value => {
            let text = String(value ?? '');
            if (/^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = "'" + text;
            return `"${text.replaceAll('"', '""')}"`;
        };
        // Build bounded chunks; do not allocate one enormous joined string or
        // recompute all columns for every row. BOM preserves accents in Excel.
        const parts = ['\ufeff', snapshot.columns.map(csv).join('|') + '\r\n'];
        let chunk = '';
        for (const row of snapshot.rows) {
            chunk += snapshot.columns.map(key => csv(row[key])).join('|') + '\r\n';
            if (chunk.length >= 256 * 1024) { parts.push(chunk); chunk = ''; }
        }
        if (chunk) parts.push(chunk);
        const file = new Blob(parts, { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(file);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `dataextension-${snapshot.id}-page-${snapshot.page || 'view'}-rows-${snapshot.rows.length}-${Date.now()}.csv`;
        anchor.hidden = true;
        document.body.appendChild(anchor);
        try { anchor.click(); }
        finally {
            anchor.remove();
            setTimeout(() => URL.revokeObjectURL(url), 5000);
        }
        return false;
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
    let recordsScope;

    var hashChange = function() {
        if (!$) return;
        const routeId = location.hash.match(/#admin\/data-extension\/([^/]+)/)?.[1];
        const scope = sfmcfix.context.current().scope;
        if (recordsScope !== scope || window.currentDEData?.id !== routeId) window.currentDEData = { records: [], fields: [], fieldCount: 0 };
        recordsScope = scope;
        syncCsvContext();
        updateCsvButton();


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

                updateCsvButton();

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
        $.ajaxPrefilter(observeDeRequest);
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
