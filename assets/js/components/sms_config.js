console.log("SMS CONFIG MODAL HANDLER");
(function() {
    const $ = window.jQuery;
    
    const keypressing = debounce((event) => {
        let message = $('#config-SMS_TEXT').val();
        let response = window.sfmcfix.checkBody(message);
        $('#config-SMS_TEXT-counters .sms-charCount strong').text(response.charCount || 0);
        $('#config-SMS_TEXT-counters .sms-notGsm strong').text(response.notGsm || 0);
        $('#config-SMS_TEXT-counters .sms-segmentCount strong').text(response.segmentCount || 0);
    });

    $('#config-SMS_TEXT').on('keyup', keypressing);

    $('#sms_config .sms-check-message').on('click', function(e) {
        e.preventDefault();
        const message = $('#config-SMS_TEXT').val();
        const url = `https://messente.com/sms-length-calculator?message=${message}`;
        window.open(url, '_blank').focus();
    });

    $(document).on('click','#submitsmsconfig',function(e) {
        e.preventDefault();
        $('#sms_config').trigger('submit');
    });

    $('#sms_config').on('submit', function(e) {
        e.preventDefault();
        const callback = (a) => {
            console.log(a);
        }
        const objectid = window.currentDEData?.id;
        if (!objectid) throw new Error('Apri prima la Data Extension di destinazione.');
        const isInsert = true;
        const COMUNICATION_CODE = $("[name='COMUNICATION_CODE']").val();
        const SMS_TEXT = $("[name='SMS_TEXT']").val();
        const SENDER = $("[name='SENDER']").val();
        const KEYWORD = $("[name='KEYWORD']").val();
        var rowset = [
            {
                "keys": {
                    "COMUNICATION_CODE": COMUNICATION_CODE
                },
                "values": {
                    "SMS_TEXT": SMS_TEXT,
                    "SENDER": SENDER,
                    "KEYWORD_SMS": KEYWORD
                }
            }
        ];
        var options = {
            url: '/contactsmeta/fuelapi/hub/v1/dataevents/' + objectid + '/rowset?method=' + (isInsert ? 'insert' : 'update'),
            data: JSON.stringify(rowset),
            dataType: 'json',
            contentType: 'application/json',
            type: 'POST',
            error: function (jqxhr, reqStatus, error) {
                if (callback) {
                    callback(jqxhr);
                }
            },
            success: function (data, reqStatus, jqxhr) {
                if (callback) {
                    callback(data);
                }
            }
        }

        if (window.Contacts.models.config.get('localPlatform')) {
            options.headers = {
                'authorization': 'Bearer ' + window.Contacts.models.config.get('accessToken')
            };
        }

        Fuel.ajax(options);
    });

})();
