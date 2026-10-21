(function() {
    sfmcfix.retryjQ(() => {
    const $ = window.jQuery;

    const encodeQuery = text => btoa(unescape(encodeURIComponent(text)));
    const decodeQuery = text => decodeURIComponent(escape(atob(text)));
    window.debounce = (callback, wait) => {
        let timeoutId = null;
        return (...args) => {
            window.clearTimeout(timeoutId);
            timeoutId = window.setTimeout(() => {
            callback(...args);
            }, wait);
        };
    }

    $(document).on('click', '.btn-copy', function() { 
        const $btn = $(this);
        const content = $btn.data('content');
        const $card = $btn.parents('.slds-card');
        $card.find('textarea').text(content);
        $card.find('textarea').get(0).select();
        document.execCommand('copy');
    });

    $(document).on('click', '#hide-sidebar', function(e) {
        $('body').addClass('hide-aside');
    });

    $(document).on('click', '#show-sidebar', function(e) {
        $('body').removeClass('hide-aside');
    });

    var stagedListItemTemplate = function(key, query) {
        var name;
        switch (key) {
            case 'last':
            name = 'LAST';
                break;
            case 'lastunloaded':
            name = 'SAVE ON CLOSE';
                break;
            case 'lastruntry':
            name = 'LAST RUN';
                break;
            default:
            name = query.name || query.id;
                break;
        }
        return `<li class="item--${sfmcfix.escapeHtml(key)}" data-id="${sfmcfix.escapeHtml(query.id)}">
            <p>${sfmcfix.escapeHtml(name)}</p><pre>${sfmcfix.escapeHtml(decodeQuery(query.query).substring(0,100))}</pre>
            ${key.id !== 'last' && `<div class="on-hover">
                <button data-action="remove-stash" data-key="${sfmcfix.escapeHtml(key)}" class="slds-button slds-button_neutral">REMOVE</button>
                <button data-action="unstash" data-key="${sfmcfix.escapeHtml(key)}" class="slds-button slds-button_brand">SHOW EDITOR</button>
            </div>` || ''}
        </li>`
    }

    var stagedQueries;
    $(document).on('click', '#btn-open-stage', function(e) {
        const $panel = $('#stage__left-panel');
        if($panel.hasClass('left-panel-hide')) {
            stagedQueries = sfmcfix.local.getObj('stagedQueries') || {};
            $panel.find('ul').html(Object.keys(stagedQueries).map((key) => stagedListItemTemplate(key,stagedQueries[key])));
            $panel.removeClass('left-panel-hide').addClass('left-panel-show');
        } else {
            $panel.removeClass('left-panel-show').addClass('left-panel-hide');
        }
    });

    $(document).on('click','#stage__left-panel [data-action]', function() {
        const key = $(this).data('key');
        const action = $(this).data('action');
        stagedQueries = sfmcfix.local.getObj('stagedQueries') || {};
        const currentQuery = stagedQueries[key];
        if(currentQuery) {
            if(action == 'remove-stash') {
                delete stagedQueries[key];
                sfmcfix.local.setObj('stagedQueries',stagedQueries);
                $(this).parents('li').hide();
            } else if (action == 'unstash') {
                const querytext = decodeQuery(currentQuery.query || '');
                querytext && currentQuery.query && editor.setValue(querytext);
                $('#staged-query-id').val(currentQuery.id);
                $('#update-query, #clear-query').removeClass('sfmcfix-hide');
                $('#stage__left-panel').removeClass('left-panel-show').addClass('left-panel-hide');
            } else if (action == 'edit-stash') {
                $('#query-preview fieldset').attr('disabled', false);
                $('#query-preview [data-action=update-stash]').attr('disabled', false);
                $('#query-preview [data-action=edit-stash]').attr('disabled', 'disabled');
            } else if (action == 'update-stash') {
                const values = $('#query-preview fieldset').serializeArray();
                $('#query-preview fieldset').attr('disabled', true);
                $('#query-preview [data-action=update-stash]').attr('disabled', 'disabled');
                $('#query-preview [data-action=edit-stash]').attr('disabled', false);
                const data = values.reduce((obj, item) => {
                    return {
                        ...obj,
                        [item.name]: item.value,
                    };
                }, {});
                updateStash(key, data);
                window.sfmcfix.notificationLogger('success', null, `Query [${data.name || data.id || key}] aggiornata`);
                
                $('#stage__left-panel ul').html(Object.keys(stagedQueries).map((key) => stagedListItemTemplate(key,stagedQueries[key])));
            }
        }
    });

    let editorScope = sfmcfix.context.current().scope;
    const updateStash = function(currentid, data) {
        if (editorScope !== sfmcfix.context.current().scope) throw new Error('Contesto BU cambiato: copia il testo da conservare e premi Clear prima di salvare.'); 
        stagedQueries = sfmcfix.local.getObj('stagedQueries') || {};
        var currentQuery = stagedQueries[currentid] = stagedQueries[currentid] || {};

        if(!data) {
            currentQuery.id = currentid;
            currentQuery.createDate = new Date();
            currentQuery.query = encodeQuery(editor.getValue());
            if(currentid !== 'lastunloaded') stagedQueries.last = currentQuery;
        } else {
            if(data.query) data.query = encodeQuery(data.query);
            if(data.key) delete data.key;
            currentQuery = Object.assign(currentQuery, data);
        }

        currentQuery.changeDate = new Date();

        sfmcfix.local.setObj('stagedQueries',stagedQueries);
        
        return currentQuery;
    }

    const stageQuery = function(queryId) {
        const currentid = queryId || crypto.randomUUID();
        const currentQuery = updateStash(currentid, null);
        if(currentid.indexOf('last') != 0) $('#staged-query-id').val(currentid);
        return currentQuery.name || currentQuery.id;
    }

    $(document).on('click', '#stage-query', function(e) {
        const id = stageQuery();
        window.sfmcfix.notificationLogger('success', null, `La query [${id}] è stata salvata, vai su "Lista query" per visualizzarle tutte`);
        $('#update-query, #clear-query').removeClass('sfmcfix-hide');
    });

    $(document).on('click', '#update-query', function(e) {
        const id = $('#staged-query-id').val();
        const res = stageQuery(id);
        window.sfmcfix.notificationLogger('success', null, `Aggiormaneto della query [${res}] completato`);
    });

    $(document).on('mouseup', '#btn-run', function(e) {
        stageQuery('lastruntry');
        window.sfmcfix.notificationLogger('success', null, `Query running salvata, puoi recuperare la query in "Lista query" `);
    });

    $(document).on('click', '#clear-query', function(e) {
        editorScope = sfmcfix.context.current().scope;
        $('#stage-query, #update-query').prop('disabled', false);
        $('#staged-query-id').val('');
        editor && editor.setValue('');
        $('#update-query, #clear-query').addClass('sfmcfix-hide');
    });

    window.onbeforeunload = function() {
        editorScope === sfmcfix.context.current().scope && !!editor.getValue() && stageQuery('lastunloaded');
    }

    const onReady = () => {
        window.sfmcfix.notificationLogger('info', null, `Recupero ultima query...`);
        stagedQueries = sfmcfix.local.getObj('stagedQueries') || {};
        const cachedQuery = stagedQueries.lastunloaded?.query && decodeQuery(stagedQueries.lastunloaded?.query);
        !editor.getValue() && !!cachedQuery && editor.insert(cachedQuery);

        window.sfmcfix.addHtml('querystudio/stage-sidebar', $('.options-panel').get(0), () => {
            sfmcfix.addCss('querystudio/stage-sidebar');
        });

    };
    if (document.readyState === 'complete') onReady();
    else $(window).on('load', onReady);

    window.addEventListener('sfmcfix:contextchange', () => {
        stagedQueries = {};
        sfmcfix.notificationLogger('warn', null, 'Contesto BU cambiato. Copia il testo da conservare e premi Clear prima di lavorare nella nuova BU.');
        $('#staged-query-id').val('');
        $('#stage__left-panel').removeClass('left-panel-show').addClass('left-panel-hide');
        $('#query-preview').removeClass('is-show');
        $('#stage-query, #update-query').prop('disabled', true);
        $('#update-query').addClass('sfmcfix-hide');
        $('#clear-query').removeClass('sfmcfix-hide');
    });

    $(document).on('mouseenter', '.stage-query-list li', function(e) {
        const key = $(this).data('id');
        const query = stagedQueries[key];
        if(query && query.query){
            $('#query-preview [name=query]').val( decodeQuery(query.query) )
            $('#query-preview [name=name]').val( query.name || '' )
            $('#query-preview [name=id]').val( query.id )
            $('#query-preview [name=key]').val( key )
            $('#query-preview [data-action]').data( 'key', key );
            $('#query-preview').addClass('is-show');
        }
    });

    $(document).on('mouseleave', '#stage__left-panel', function(e) {
        $('#query-preview').removeClass('is-show');
        $('#query-preview [name]').val('');
        $('#query-preview fieldset').attr('disabled', 'disabled');
        $('#query-preview [data-action=update-stash]').attr('disabled', 'disabled');
        $('#query-preview [data-action=edit-stash]').attr('disabled', false);
    });


    $('.object-explorer .toolbar-combobox').append(`<button class="slds-button slds-button_neutral" id="hide-sidebar"><svg class="slds-button__icon slds-button__icon_left" aria-hidden="true"><use xlink:href="/pub/icons/utility-sprite/svg/symbols.svg#hide"></use></svg> HIDE</button>`)
    $('body').append(`<button class="slds-button slds-button_neutral" id="show-sidebar"><svg class="slds-button__icon slds-button__icon_left" aria-hidden="true"><use xlink:href="/pub/icons/utility-sprite/svg/symbols.svg#left"></use></svg></button>`)
    $('.slds-builder-toolbar__actions').append(`<span class="sep"></span>
        <button class="slds-button slds-button_brand" id="stage-query">Save new Query</button>
        <button class="slds-button slds-button_neutral sfmcfix-hide" id="update-query">Update</button>
        <button class="slds-button slds-button_brand sfmcfix-hide" id="clear-query">Clear</button>
        <input type="hidden" id="staged-query-id" disabled />
    `)
    $('.slds-builder-toolbar .toolbar-left').append('<button class="slds-button slds-button_neutral" id="btn-open-stage">Lista query</button>');
    
    
    // sovrascrivo la funzione per agganciare hanlders al click sulla X della dataextension
    const applyOverride = function() {
        if(window.addFieldsToObjectExplorer) {

            window.addFieldsToObjectExplorer = function(dekey,dename) {
                $.ajax({
                    type: "GET",
                    url: "/dataextension/" + encodeURIComponent(dekey) + "/fields",
                    contentType:  "text/xml",
                    success: function(data) {
                        var pks = [];
                        var fiels = [];
                        var lis = data.sort((a,b) => (a?.IsRequired[0] === b?.IsRequired[0]) ? 0 : a?.IsRequired[0] === "true" ? -1 : 1).map(function(i) {
                        var required = i.IsRequired[0] === 'true' ? 'is-required' : ''
                        if(i.Name?.[0]) {
                            fiels.push(i.Name?.[0]);
                        }
                        if(required && i.Name?.[0]) {
                            pks.push(i.Name?.[0]);
                        }
                        if (i.FieldType[0]=== 'Text'){
                                return `<li class="oe-field ${required}" title="${sfmcfix.escapeHtml(i.Name?.[0])} - ${sfmcfix.escapeHtml(i.FieldType?.[0])} (${sfmcfix.escapeHtml(i.MaxLength?.[0]||'none')})">${sfmcfix.escapeHtml(i.Name?.[0])} - ${sfmcfix.escapeHtml(i.FieldType?.[0])} (${sfmcfix.escapeHtml(i.MaxLength?.[0]||'none')}) </li>`
                            } else if  (i.FieldType[0]=== 'Number') {
                                return `<li class="oe-field ${required}"  title="${sfmcfix.escapeHtml(i.Name?.[0])} - ${sfmcfix.escapeHtml(i.FieldType?.[0])}">${sfmcfix.escapeHtml(i.Name?.[0])} - ${sfmcfix.escapeHtml(i.FieldType?.[0])}</li>`
                            } else {
                                return `<li class="oe-field ${required}"  title="${sfmcfix.escapeHtml(i.Name?.[0])} - ${sfmcfix.escapeHtml(i.FieldType?.[0])}">${sfmcfix.escapeHtml(i.Name?.[0])} - ${sfmcfix.escapeHtml(i.FieldType?.[0])}</li>`
                            }
                        })
                    var li_html = lis.join('')
                    var card = `<article data-key="${sfmcfix.escapeHtml(dekey)}" class='slds-card oe-table-card'><div class='slds-card__header'>
                            <svg class="remove-card slds-button__icon_left" aria-hidden='true'><use xlink:href="/pub/icons/utility-sprite/svg/symbols.svg#close"></use></svg>
                            <button data-content="${sfmcfix.escapeHtml(fiels.join(',\n'))}" class="slds-button slds-button_neutral btn-copy"><svg class="slds-button__icon slds-button__icon_left" aria-hidden="true"><use xlink:href="/pub/icons/utility-sprite/svg/symbols.svg#copy"></use></svg>SQL</button>
                            <button data-content="${sfmcfix.escapeHtml(pks.join(',\n'))}" class="slds-button slds-button_neutral btn-copy" data-action="pks">Required</button>
                            <h3 class='slds-card__header-title'>${sfmcfix.escapeHtml(dename)}</h3>
                        </div>`
                    card += `<div class='slds-card__body slds-card__body_inner'>
                        <textarea readonly style="position:absolute;width:0;height:0;z-index:-1"></textarea>
                        <ul style="list-style-type:none;">${li_html}</ul></div>
                        </article>`
                    $('.object-explorer').append(card)
                    addOECardHandlers()
                }});
            }

        } else {
            setTimeout(() => {
                applyOverride();
            },1000);
        }
    }

    applyOverride();
    });

})();
