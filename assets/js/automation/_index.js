(function() {
    const STORAGEID = 'SFMCFIX---AUTOMATIONSHISTORY'
    const VERSIONING_STORAGEID = 'SFMCFIX---ACTIVITYVERSIONING'
    sfmcfix.temp = sfmcfix.temp || {};
    const automations = sfmcfix.temp.automations = {}
    const activities = sfmcfix.temp.activities = {}
    const additionalData = sfmcfix.temp.automationadditionaldata = {}
    let $;
    
    function automationid(input) {
        input = input || location.hash;
        // La regex cerca ciò che sta tra il primo e il secondo slash
        const regex = /#Instance\/([^/]+)\//;
        const match = input.match(regex);

        // Se trova una corrispondenza, restituisce il primo gruppo di cattura [1]
        return match ? match[1] : null;
    }

    function moveAutomationsToStorage(autom) {
        if(!autom.id || !autom.name) return false;
        var aHistory = JSON.parse(sfmcfix.local.getItem(STORAGEID)||"[]");
        if(aHistory?.length > 0) {
            aHistory = aHistory.filter((a) => a.id !== autom.id).slice(-9);
        }
        aHistory.push({
            id: autom.id,
            name: autom.name
        });
        sfmcfix.local.setItem(STORAGEID, JSON.stringify(aHistory));
        window.sfmcfix.notificationLogger('info',null,`Automation aggiunta alle viste recentemente`)
    }
    
    const storeAdditionalData = function(obj) {
        const _id = obj.id;
        delete obj.id;
        if(!additionalData[_id]) {
            const autom = Object.values(automations).find((au) => au.data.guidId === _id);
            if(!!autom) {
                autom.updateData(obj);
            } else {
                additionalData[_id] = obj;
            }
        }
    }

    const AutomationInstance = function(obj) {
        if(!obj?.id) {
            window.sfmcfix.notificationLogger('error',null,`Ops... non ho trovato l'id di questa automation, non poss abilitarmi correttamente (verifica la console))`)
            throw new Error("SFMC fixer - automation instance init - missing id", obj);
        }

        if(automations[obj.id]) {
            return automations[obj.id].updateData(obj);
        }

        automations[obj.id] = this;
        console.log(`SFMC fixer - automation [${obj.id}] - CRETED`);
        return this.updateData(obj);
    }

    AutomationInstance.prototype.updateData = function(obj) {
        console.log(`SFMC fixer - automation [${obj.id}] - UPDATED`);
        const _default = this.data || {};
        this.id = obj.id || this.id;
        this.data = {..._default, ...obj};
        moveAutomationsToStorage(this.data);
        return this;
    }

    const ActivityInstance = function(obj) {
        var $this = this;
        if(!obj?.queryDefinitionId) {
            window.sfmcfix.notificationLogger('error',null,`Ops... non ho trovato l'id di questa activity, non poss abilitarmi correttamente (verifica la console))`)
            throw new Error("SFMC fixer - activity instance init - missing id", obj);
        }

        if(activities[obj.queryDefinitionId]) {
            $this = activities[obj.queryDefinitionId];
        }
        
        const data = $this.data = {...$this.data || {}, ...obj};
        $this.id = obj.queryDefinitionId;

        if(data.modifiedDate) {
            data.versioning = `${data.queryDefinitionId}_${data.modifiedDate}`;
        }

        activities[obj.queryDefinitionId] = $this;
        console.log(`SFMC fixer - activity [${$this.id}] - CRETED`);
        return $this;
    }

    ActivityInstance.prototype.getVersions = async function() {
        if (!sfmcfix.context.current().persistent) return [];
        const activities = await sfmcfix.storage.getItem(sfmcfix.context.scopedKey(VERSIONING_STORAGEID))||{};
        return Object.values(activities).filter((act) => act.queryDefinitionId === this.id);
    }

    window.debounce = (callback, wait) => {
        let timeoutId = null;
        return (...args) => {
            window.clearTimeout(timeoutId);
            timeoutId = window.setTimeout(() => {
            callback(...args);
            }, wait||1000);
        };
    }

    const initOverviewFolders = function () {

        const aHistory = JSON.parse(sfmcfix.local.getItem(STORAGEID)||"[]");
        var $lastView = $('.automation-view-history');
        if(!$lastView.length) {
            $lastView = $(`<div class="automation-view-history"><header><h2>Last Viewed Automations</h2><button class="bth btn-secondary" id="clear-automation-history">Clear</button></header><section><ul></ul></section></div>`);
        }

        $lastView.find('ul').html(`${aHistory?.filter((item) => !!item.name).reverse().map((item) => `<li><a href="#Instance/${encodeURIComponent(item.id)}">${sfmcfix.escapeHtml(item.name)}</a></li>`).join('') || '<li>--</li>'}`);

        $('#AutomationFolderTreeContainer .panel-body').prepend($lastView);
    }

    let activityModalOpened = false;

    const hashChange = function() {

        const hash = window.location.hash;
        const id = automationid(hash);
        let currentAutomation = null;
        if(id) {
            currentAutomation = new AutomationInstance({
                id: id
            });
        }

        if (!hash) {
            console.log(`SFMC fixer - HASH[${hash}] --- automation -- overview`);
        } else if(hash.indexOf('/workflow') > -1) {
            console.log(`SFMC fixer - HASH[${hash}] --- automation -- instance/workflow`);
        } else if (hash.indexOf('/activity') > -1) {
            console.log(`SFMC fixer - HASH[${hash}] --- automation -- activity/details -- in modal: ${activityModalOpened}`);
        } else if (hash.indexOf('Instance/') > -1) {
            console.log(`SFMC fixer - HASH[${hash}] --- automation -- instance`);
        } else if (hash.indexOf('/ActivityDetails')) {
            console.log(`SFMC fixer - HASH[${hash}] --- automation -- acitivty/details`);
        } else {
            console.log(`SFMC fixer - HASH[${hash}] --- automation -- other`);
        }
    }

    const filename = (text) => {
        let filename = text
        // Normalizza gli accenti (è → e, à → a, ecc.)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        // Sostituisce i caratteri non validi nei nomi di file
        // (non ammessi su Windows/Linux/macOS: \ / : * ? " < > | e caratteri di controllo)
        .replace(/[\\/:*?"<>|\x00-\x1f\x7f]/g, '_')
        // Sostituisce spazi con il carattere sostituto
        .replace(/\s+/g, '_')
        // Elimina punti e _ multipli consecutivi
        .replace(/\.{2,}/g, '.')
        .replace(new RegExp(`\\_{2,}`, 'g'), '_')
        // Rimuove _ o punti iniziali/finali
        .replace(new RegExp(`^[._]+|[._]+$`, 'g'), '')
        // tutto miniscolo
        .toLowerCase();

    // Fallback se il risultato è vuoto
    return filename || 'file';
    }

    // HANDLERS
    sfmcfix.ajax.success['fuelapi/automation/v1/queries/' ] = function(_data,b,c,options,jqXHR) {
        if(_data.queryDefinitionId) {
            const activityScope = sfmcfix.context.current().scope;
            const currentact = new ActivityInstance(_data);
            const $wrapper = $('<div class="mcefix-activity-toolbar"></div>');

            const $buttonVersioning = $(`<button class="btn btn-primary act-downloadVersion">Download Version</button>`);
            const $buttonToggleQuery = $(`<button class="btn btn-primary act-togglequery">Toggle Query</button>`);
            const $buttonCopyQuery = $(`<button class="btn btn-primary act-copyequery">Copy</button>`);

            $wrapper.append([$buttonVersioning,$buttonToggleQuery,$buttonCopyQuery]);

            $buttonVersioning.on('click', () => {
                var a = document.createElement("a");
                var file = new Blob([JSON.stringify(sfmcfix.activitySnapshot(currentact.data))], {type: 'application/json'});
                a.href = URL.createObjectURL(file);
                a.download = filename(`activity-${currentact.data.name}_${currentact.data.versioning}.json`);
                a.click();
            });

            $buttonToggleQuery.on('click', function() {
                const $editor = $('#summaryQueryEditor');
                let query =  currentact.data.validatedQueryText;
                if ($editor.hasClass('is-validated')) {
                    query =  currentact.data.queryText;
                    $editor.removeClass('is-validated');
                } else {
                    $editor.addClass('is-validated');
                }
                ace.edit($editor.get(0)).setValue(query);
            });

            $buttonCopyQuery.on('click', function() {
                const editor = ace.edit($('#summaryQueryEditor').get(0))
                editor.selectAll();
                editor.focus();
                document.execCommand('copy');
                window.sfmcfix.notificationLogger('info',null,`Query copiata nella clipboard!`)
            });

            setTimeout(async () => {
                if (activityScope !== sfmcfix.context.current().scope) return;
                $(".mcefix-activity-toolbar").remove();
                $wrapper.insertAfter('#summaryQueryEditor');
                if (currentact.data?.targetId) {
                    const link = $('<a class="btn btn-link" target="_blank" rel="noopener noreferrer"></a>');
                    link.attr('href', sfmcfix.links.contactBuilder(currentact.data.targetId)).text(currentact.data.targetName || 'Data Extension');
                    $('.summaryPane .summary--dataExtension').empty().append(link);
                }

                $('.editProperties, button.editTargetDe, button.editQuery').off('click.sfmcfixVersion').on('click.sfmcfixVersion', function(e) {
                    if (activityScope !== sfmcfix.context.current().scope) return;
                    if (currentact.data && sfmcfix.context.current().persistent) {
                        const record = { ...sfmcfix.activitySnapshot(currentact.data), sfmcfixContext: sfmcfix.context.current() };
                        sfmcfix.storage.mergeItem(sfmcfix.context.scopedKey(VERSIONING_STORAGEID), {
                            [btoa(currentact.data.versioning)]: record
                        }).then(() => {
                            sfmcfix.notificationLogger('info', null, `Query versionata [${currentact.data.versioning}]`);
                        }).catch(error => sfmcfix.notificationLogger('error', null, error.message));
                    } else {
                        sfmcfix.notificationLogger('warn', null, 'Imposta il MID per salvare le versioni di questa BU.');
                    }
                });



            },1000);
        }
    }

    sfmcfix.ajax.success['fuelapi/automation/v1/folders/' ] = function(_data,b,c,options,jqXHR) {
        initOverviewFolders();
    }

    sfmcfix.ajax.success['fuelapi/legacy/v1/beta/bulk/automations/automation/definition/' ] = function(_data,b,c,options,jqXHR) {
        new AutomationInstance(_data);
    }

    sfmcfix.ajax.success['fuelapi/automation/v1/automations/' ] = function(_data,b,c,options,jqXHR) {
        storeAdditionalData(_data);
            
        setTimeout(function(){
            $('.activityBox').each((_i,el) => {
                const classname = 'type__'+(el.innerText||'none').toLowerCase().replace(/ /g, '-').replace(':','-');
                $(el).find('.activity-icon-container').addClass(classname);
            });
        },1000);

        setTimeout(function(){
            let activityBoxes = $('#canvas').find('.selectedName');
            activityBoxes.each((_i,el) => {
                const title = el.innerText;
                const $el = $(el);
                const $box = $el.parents('.codeBlock-wrapper');
                const $dropdownlist = $box.find('.dropdown-menu');
                const activityName = 'type__' +  ($box.find('.activityName').text()||'none').toLowerCase().replace(/ /g, '-').replace(':','-');
                $box.addClass(activityName);
                _data.steps?.forEach(step => {
                    step.activities?.forEach(activity => {
                        if(activity.name == title && !$dropdownlist.find('.btn-to-activity-page').length) {
                            $dropdownlist.append(`<li><a target="_blank" rel="noopener noreferrer" href="${sfmcfix.links.activity(activity.objectTypeId, activity.activityObjectId)}" class="action-item btn-to-activity-page"><strong>View</strong> <span class="glyphicon glyphicon-new-window" aria-hidden="true"></span></a></li>`)
                        }
                    });
                });
            });
        },1000);
    }


    const initAll = function() {
        
        $ = window.jQuery;
        sfmcfix.initAjaxHanlders($);
        sfmcfix.addJs('automation/run-log-refresh');
        window.addEventListener('sfmcfix:contextchange', () => {
            for (const cache of [automations, activities, additionalData]) Object.keys(cache).forEach(key => delete cache[key]);
            $('.mcefix-activity-toolbar, .automation-view-history').remove();
        });

        addEventListener("hashchange", hashChange);

        $(document).on('click','#clear-automation-history',function(e){
            e.preventDefault();
            if (confirm(`Sicuro di voler svuotare lo storico?\n(non ci sono impatti su MCE)`) !== true) {
               return false;
            } else {
                sfmcfix.local.removeItem(STORAGEID);
                initOverviewFolders();
            }
        })

        $(document).on('shown.bs.modal', function(e) {
            activityModalOpened = $(e.target).find('.activityConfig').length > 0
        });
    }

    sfmcfix.retryjQ(() => {
        initAll();
        hashChange();
    },100)

})();
