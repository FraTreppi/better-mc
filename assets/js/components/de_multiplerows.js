(function(){
    const $ = window.jQuery;
    /* window.currentDEData */
    const $wrapper = $('#multiple-rows-content');
    
    const submit = function() {

        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(window.currentDEData?.id || '')) throw new Error("Apri prima la Data Extension di destinazione.");
        if ($wrapper.data('sfmcfixScope') !== sfmcfix.context.current().scope) throw new Error('La BU è cambiata: riapri la tabella prima di salvare.');
        const routeId = location.hash.match(/#admin\/data-extension\/([^/]+)/)?.[1];
        if (routeId !== window.currentDEData.id) throw new Error('La Data Extension è cambiata: riapri la tabella prima di salvare.');

        const isInsert = true;

        const records = $('tbody tr',$wrapper);
        const rowset = [];
        var hasError = false;
        records.each((_i,$row) => {
            var obj = {
                keys: Object.create(null),
                values: Object.create(null)
            };


            $('input',$row).each(function() {
                const $input = $(this);
                const obid = $input.data('definition-id') || $input.parent().data('definition-id');
                const value = $input.val();
                
                if(!obid) return true;

                const fdef = window.currentDEData.fields.find((field) =>field.id === obid);

                if(!fdef) throw new Error('Field not found!');

                if(!this.checkValidity()) {
                    if(!hasError) {
                        this.reportValidity();
                    }
                    $(this).parent().addClass('has-error');
                    hasError = !0;
                } else {
                    $(this).parent().removeClass('has-error');
                }

                if(fdef.isPrimaryKey) {
                    obj.keys[fdef.name] = value;
                } else {
                    obj.values[fdef.name] = value;
                }

            })

            rowset.push(obj);
        });
        
        if(hasError) return;

        var options = {
            url: '/contactsmeta/fuelapi/hub/v1/dataevents/' + window.currentDEData.id + '/rowset?method=' + (isInsert ? 'insert' : 'update'),
            data: JSON.stringify(rowset),
            dataType: 'json',
            contentType: 'application/json',
            type: 'POST',
            error: function (jqxhr, reqStatus, error) {
                sfmcfix.notificationLogger('error', null, `Inserimento non riuscito: HTTP ${jqxhr.status || 'non disponibile'}.`);
            },
            success: function (data, reqStatus, jqxhr) {
                window.sfmcfix.notificationLogger('success',null,`${rowset.length} record salvati con successo`);
                $('.edit-de-grid-cancel-save > div').trigger('click');
            }
        }

        if (window.Contacts.models.config.get('localPlatform')) {
            options.headers = {
                'authorization': 'Bearer ' + window.Contacts.models.config.get('accessToken')
            };
        }

        if (confirm(`Sei sicuro di voler inviare i dati?`) !== true) {
           return false;
        }
        Fuel.ajax(options);
    }


    $('.multiple-rows-actions button[data-action]').on('click',function(e) {
        e.preventDefault();
        const action = $(this).data('action');
        if (action === 'submit') {
            try { submit(); } catch (error) { sfmcfix.notificationLogger('error', null, error.message); }
        }
        if(action == 'cancel') $('.edit-de-grid-cancel-save > div').trigger('click');
        return false;
    });

    $wrapper.on('blur', '.has-error input' , function() {
        this.reportValidity() && $(this).parents('has-error').removeClass('has-error');
    });
})()
