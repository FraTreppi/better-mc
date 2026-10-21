(async function() {
    const $ = window.jQuery;
    window.debounce = (callback, wait) => {
        let timeoutId = null;
        return (...args) => {
            window.clearTimeout(timeoutId);
            timeoutId = window.setTimeout(() => {
            callback(...args);
            }, wait);
        };
    }

    const getTesters = () => sfmcfix.preferences.get().testers || [];

    console.log(`SFMC fixer - PREVIEW AND SEND`);

    const generateInput = debounce(($parent) => {
        var $input = $parent.find('#tester-input');
        if(!$input.length) {
            const $wrap = $(`<div class="input-suggestion">
                <input type="text" id="tester-input" class="form-control" placeholder="type a name..." />
                <div class="suggestion-list-wrapper">
                <ul id="suggestion-items"></ul></div>
            </div>`);
            $parent.append($wrap);
        }
    },500);
    
    const searchOnType = debounce(($input) => {
        const val = $input.val().toLowerCase();
        var lis = [];
        const $ul = $('#suggestion-items');
        if(val && val.length > 2) {
            lis = getTesters().filter((tester) =>  !!tester[2] && (tester[0]?.toLowerCase().indexOf(val) != -1 || tester[1]?.toLowerCase().indexOf(val) != -1 || tester[2]?.toLowerCase().indexOf(val) != -1)).map((tester) => `<li class="suggestion-list-item" data-email="${tester[2]}">${sfmcfix.escapeHtml(tester[2])}</li>`).slice(0,5);
            lis = [...new Set(lis)]
        }
        $ul.html(lis.join(''));
        $ul.show();
    },300);

    var dempreviewmodal;
    const reponseTemplate = (data) => `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>${data.title}</title><style>*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}:root{--bg:#0f0f10;--tp:#f0ede8;--ts:#7a7873;--ac:#c4503a;--ad:rgba(196,80,58,0.12);--ab:rgba(196,80,58,0.3);--fm:'Courier New',Courier,monospace;--fd:Georgia,'Times New Roman',serif}html,body{height:100%;background:var(--bg);color:var(--tp);font-family:var(--fm);overflow:hidden}body{display:flex;align-items:center;justify-content:center;padding:2rem}.c{max-width:520px;width:100%;animation:f 0.4s ease both}@keyframes f{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}.b{display:inline-flex;align-items:center;gap:6px;background:var(--ad);border:1px solid var(--ab);color:var(--ac);font-size:10px;letter-spacing:.14em;text-transform:uppercase;padding:4px 10px;border-radius:3px;margin-bottom:1.5rem}.b::before{content:'';display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--ac);animation:p 1.8s ease-in-out infinite}@keyframes p{0%,100%{opacity:1}50%{opacity:.3}}.e{font-size:11px;color:var(--ts);letter-spacing:.05em;margin-bottom:.75rem}h1{font-family:var(--fd);font-size:clamp(1.6rem,4vw,2.2rem);font-weight:400;line-height:1.15;letter-spacing:-.01em;color:var(--tp);margin-bottom:1rem}.d{width:32px;height:1px;background:var(--ac);margin-bottom:1.25rem;opacity:.6}.t{font-size:13px;line-height:1.7;color:var(--ts)}</style></head><body><main class="c" role="main"><div class="b">${data.header}</div><p class="e">${data.code}</p><h1>${data.title}</h1><div class="d"></div><p class="t">${data.message}</p></main></body></html>`;

    const getPreviewCallback = function(data) {
        $.ajax({method: 'POST',
            url: `/fuelapi/guide/v1/emails/${data.emailID}/dataExtension/${data.dataSource.id}/row/${data.dataSource.row}/preview`,
            headers: {
                'Content-Type': 'application/json; charset=UTF-8',
            },
            success : function(data) {
                console.log("SFMC Fixer -- ", data);
                sfmcfix.notificationLogger('success', null, "Preview ottenuta con successo, la sto elaborando.");
                const view  = data.message.views.find((v) => v.contentType === "vnd.exacttarget.message.email.htmlBody");
                const subject  = data.message.views.find((v) => v.contentType === "vnd.exacttarget.message.email.subjectLine");
                if(view?.content) {
                    dempreviewmodal.$modal.find('iframe')[0].srcdoc = view.content;
                }
                if(subject?.content) {
                    dempreviewmodal.$modal.find('.modal-title').html(subject.content)
                }
            },
            error: function() {
                sfmcfix.notificationLogger('error', null, "Non è stato possibile caricare la preview");
                dempreviewmodal.$modal.find('iframe')[0].srcdoc = reponseTemplate({
                    title: 'WOPS... Errore nel caricamento della preview',
                    header: 'Errore',
                    code: 'PREVIEW_UPDATE_ERROR',
                    message: 'Non è stato possibile replicare la preview, verifica che esistano ancora i record di preview nella DE su cui è stata fatta preview, la cui mancanza è il motivo classico di questo erore.'
                });
                dempreviewmodal.$modal.find('.modal-title').text('Preview Error');
            }
        });
    }

    const getPreview = function(data) {

        let url;
        if(!data || data.dataSource?.row == null) {
            sfmcfix.notificationLogger('error', null, "Posso generare preview solo per le send su base Data Extension con una row seleizionata!");
            return false;
        }

        if(!dempreviewmodal) {
            sfmcfix.addJs('components/modal', () => {
                dempreviewmodal = new window.sfmcfix.customModal({
                    title: 'DEM preview',
                    footer: 'SFMC Fixer',
                    id: 'dempreview-iframe-modal',
                    show: true
                });
                dempreviewmodal.htmlBodyLoad('dem-preview', () => {
                    dempreviewmodal.place();
                    getPreviewCallback(data);
                });
            });
        } else {
            dempreviewmodal.$modal.find('.modal-title').text('Caricamento Preview');
            dempreviewmodal.$modal.find('iframe')[0].srcdoc = reponseTemplate({
                title: 'Caricamente preview in corso...',
                header: 'Attendere',
                code: 'PREVIEW_UPDATE_LOADING',
                message: 'Stiamo generando la preview, per favore attendere.'
            });
            dempreviewmodal.show();
            getPreviewCallback(data);
        }

        
        
        return true;
    }

    const logitem = function(data) {
        const { datetime, message, details } = data;
        const formatDate = new Date(datetime).toISOString().split('T');
        return `<div class="log-row">
            <header><span class="timestamp">${formatDate[0]}<br>${formatDate[1].replace(/\.\d\d\dZ/,'')}</span>
            <span class="message">${sfmcfix.escapeHtml(message)}</span></header>
            <article>
                <ul>
                    <li class="log-row_name"><strong>Name: </strong><span>${sfmcfix.escapeHtml(details.name || '--')}</span></li>
                    <li class="log-row_emailid"><strong>Id: </strong><span>${details.emailID || '--'}</span></li>
                    ${details.dataSource && `<li class="log-row_source"><strong>Test source: </strong><a data-action="show-source-data" data-exid="${details.dataSource.id}" data-row="${details.dataSource.row}" target="_blank" rel="noopener noreferrer" href="${sfmcfix.links.contactBuilder(details.dataSource.id)}">${details.dataSource.type}</a></li>` || ''}
                    <li class="log-row_prefix"><strong>Subject Prefix: </strong><span data-original="${sfmcfix.escapeHtml(details.subjectPrefix)}">${sfmcfix.escapeHtml(details.subjectPrefix)}</span></li>
                    <li class="log-row_recipients"><strong>Testers</strong> ${details.recipients.map((t) => `<b>${sfmcfix.escapeHtml(t)}</b>`).join('')}
                    </li>
                </ul>
                <footer>
                    <button disabled data-action="logitem-remove" data-uuid="${details.uuid||''}" data-logdate="${datetime}" class="btn btn-danger btn-sm">Remove</button>
                    <button ${details.dataSource?.row == null && 'disabled'||''}data-action="logitem-preview" data-uuid="${details.uuid||''}" data-logdate="${datetime}" class="btn btn-primary btn-sm">Preview</button>
                </footer>
            </article>
        </div>`;
    }

    const loglist = function() {
        var testsendlogs = sfmcfix.local.getItem("testsendlogs") || '[]';
        var testsendlogsArray = JSON.parse(testsendlogs);

        const milliseconds60days = 60 * 24 * 60 * 60 * 1000;
        const now = Date.now();

        try {
            testsendlogsArray = testsendlogsArray.filter((a) => (now - new Date(a.logdate).getTime()) < milliseconds60days);
            sfmcfix.local.setItem("testsendlogs", JSON.stringify(testsendlogsArray));
        } catch(e) {}

        return testsendlogsArray.sort((a, b) => new Date(b.logdate) - new Date(a.logdate)).map((data) => logitem({
            datetime: data.logdate,
            message: `${data.name || data.emailID}`,
            details: data, 
        }));
    }

    /** JQUERY ajax handlers */

    sfmcfix.ajax.prefilter['fuelapi/guide/v1/emails/preview/send'] = function(options) {
        try {
            const testsendlogs = sfmcfix.local.getItem("testsendlogs") || '[]';
            let testsendlogsArray = JSON.parse(testsendlogs);
            const _data = JSON.parse(options.data);
            let _overrides = {logdate:new Date(),uuid:crypto.randomUUID(), version:1};
            if(sfmcfix.temp?.currentasset?.legacyData?.legacyId === _data?.emailID) {
                _overrides.name = sfmcfix.temp.currentasset.name;
            } 
            testsendlogsArray.push({..._data, ..._overrides});
            sfmcfix.local.setItem("testsendlogs",JSON.stringify(testsendlogsArray));
            $('#testsendlog-viewer').trigger('updateview');
            // scommetnare la riga sotto per fare dei test senza inviare continuamente email
            //jqXHR.abort();
        } catch(e) {
            sfmcfix.notificationLogger(null, null, "Ops, non sono riuscito a salvare questo invio di test, consulta la console JS (F12) per maggiri info.")
            console.log("SFMC Fixer -- ",e);
        }
    }
    sfmcfix.ajax.transport['/999999999/children'] = function(options) {
        /* CARTELLE */
        return {
            send: function(headers, completeCallback) {
                completeCallback(200, 'success', { json: {"count":0,"page":1,"pageSize":25,"links":{},"items":[]} }, '');
            },
            abort: function() {}
        };
    }
    sfmcfix.ajax.transport['/999999990/children'] = function(options) {
        /* CARTELLE */
        return {
            send: function(headers, completeCallback) {
                completeCallback(200, 'success', { json: {"count":0,"page":1,"pageSize":25,"links":{},"items":[]} }, '');
            },
            abort: function() {}
        };
    }
    sfmcfix.ajax.transport["/customobjects/category/999999999?"] = function(options) {
        return {
            send : function(headers, completeCallback){
                const testsendlogs = sfmcfix.local.getItem("testsendlogs") || '[]';
                const testsendlogsArray = JSON.parse(testsendlogs);
                const current = sfmcfix.temp.currentasset;
                if(current?.id && testsendlogsArray?.length) {
                    const tests = [...new Set(testsendlogsArray.filter((test) => test.emailID && (test.emailID == current.id || test.emailID == current.legacyData?.legacyId) && test.dataSource?.type === 'DataExtension' && !!test.dataSource.id).map((test) => test.dataSource.id))];
                    Promise.all(tests.map(
                        (deId) => fetch(`/fuelapi/data-internal/v1/customobjects/${deId}`).then((response) => response.json()) 
                    )).then((items) => {
                        completeCallback(200, 'success', { json: {
                            count: items?.length || 0,
                            page: 1,
                            pageSize: 25,
                            links: {},
                            items: items || []
                        } }, '');
                    });
                } else {
                    completeCallback(200, 'not found', { json: {
                        count: 0,
                        page: 1,
                        pageSize: 25,
                        links: {},
                        items: []
                    } }, '');
                }
            },
            abord : function(){}
        }
    }
    sfmcfix.ajax.transport["/customobjects/category/999999990?"] = function(options) {
        return {
            send : function(headers, completeCallback){
                const testsendlogs = sfmcfix.local.getItem("testsendlogs") || '[]';
                const testsendlogsArray = JSON.parse(testsendlogs);
                const current = sfmcfix.temp.currentasset;
                if(current?.id && testsendlogsArray?.length) {
                    const tests = [...new Set(testsendlogsArray.filter(test => test.dataSource?.type === 'DataExtension' && test.dataSource.id).slice(-8).reverse().map((test) => test.dataSource.id))];
                    Promise.all(tests.map(
                        (deId) => fetch(`/fuelapi/data-internal/v1/customobjects/${deId}`).then((response) => response.json()) 
                    )).then((items) => {
                        completeCallback(200, 'success', { json: {
                            count: items?.length || 0,
                            page: 1,
                            pageSize: 25,
                            links: {},
                            items: items || []
                        } }, '');
                    });
                } else {
                    completeCallback(200, 'not found', { json: {
                        count: 0,
                        page: 1,
                        pageSize: 25,
                        links: {},
                        items: []
                    } }, '');
                }
            },
            abord : function(){}
        }
    } 
    sfmcfix.ajax.success['/fuelapi/platform-internal/v1/categories/'] = function(data, b, c, options) {
        const url = new URL(options.url, location.href);
        if (!/\/categories\/\d+\/children$/.test(url.pathname) || !Array.isArray(data.items)) return;
        // Find the actual DE root in the response; never assume a customer-specific folder ID.
        const root = data.items.find(item => item.categoryType === 'dataextension' &&
            (Number(item.parentId) === 0 || item.isRoot === true));
        if (root) sfmcfix.temp.deRootCategoryId = root.id;
        const parent = url.pathname.match(/categories\/(\d+)\/children$/)?.[1];
        if (!parent || String(sfmcfix.temp.deRootCategoryId) !== parent) return;
        const folders = [[999999999, 'DEM - Recently used'], [999999990, 'Recently used']];
        const extra = folders.filter(([id]) => !data.items.some(item => item.id === id)).map(([id, name]) => ({
            categoryType: 'dataextension', editable: 0, extendable: 0, hasChildren: false,
            iconType: 'dataextension', id, parentId: Number(parent), name,
            objectId: `sfmcfix-${id}`, links: { children: { href: `/v1/categories/${id}/children` } }
        }));
        data.items = [...extra, ...data.items];
        data.count += extra.length;
    };

    $(document).on('click', '[data-action="logitem-preview"]', function(e) {
        e.preventDefault();
        const dataset = $(this).data();
        if(dataset.uuid || dataset.logdate) {
            const testsendlogs = sfmcfix.local.getItem("testsendlogs") || '[]';
            const testsendlogsArray = JSON.parse(testsendlogs);

            const log = testsendlogsArray.find((item) => (dataset.uuid && item.uuid === dataset.uuid) || (dataset.logdate && item.logdate === dataset.logdate));

            getPreview(log);
        }
        return false;
    });

    $(document).on('keyup','#tester-input', function(e) {
        searchOnType($(this));
    });

    $(document).on('focusout','#tester-input', function(e) {
        setTimeout(() => $('#suggestion-items').hide(), 150);
    });

    $(document).on('mouseenter','.test-send-recipients-tab-content', function(e) {
        generateInput($(this));
    });

    $(document).on('click','.log-row button', function(e) {
        if($(this).data('action') === 'logitem-remove') {
            const logdate = $(this).data('logdate');
            const testsendlogs = sfmcfix.local.getItem("testsendlogs") || '[]';
            const testsendlogsArray = JSON.parse(testsendlogs);
            const newlogArray = testsendlogsArray.filter((i) => i.logdate !== logdate);
            sfmcfix.local.setItem("testsendlogs",JSON.stringify(newlogArray));
            $('#testsendlog-viewer').trigger('updateview');
        }
    });

    $(document).on('click', '.suggestion-list-item', function(e){
        const email = $(this).data('email');
        $('#tester-input').val('');
        $('.test-send-recipients-pillbox .pillbox-add-item').val(email);
        $('.test-send-recipients-pillbox .pillbox-add-item').trigger('focusout');
    });

    $(document).on('click', '[data-action="close-log-container"], [data-action="open-log-container"]', function() {
        const _action = $(this).data('action');
        $('#testsendlog-viewer')[_action=='close-log-container'?'removeClass':'addClass']('is-open');
        return false;
    })

    window.addEventListener('sfmcfix:contextchange', () => {
        delete sfmcfix.temp.deRootCategoryId;
        delete sfmcfix.temp.currentasset;
        $('#testsendlog-viewer').trigger('updateview');
    });
    window.sfmcfix.addHtml('previewandtest/testsendlog-viewer', true, () => {
        const toolbox = document.querySelector('.previewandtest-toolbox');
        sfmcfix.context.mountControls(toolbox);
        let queued = false;
        const syncTrackingButton = active => {
            const existing = document.getElementById('sfmcfix-test-tracking');
            const labels = ['send test', 'send test email', 'send test emails', 'invia test', 'invia email di test'];
            const send = active && Array.from(document.querySelectorAll('button, [role="button"], a.btn, input[type="submit"], input[type="button"]')).find(button =>
                !button.closest('#sfmcfix-context, #sfmcfix-tester-editor, #testsendlog-viewer') &&
                labels.includes((button.value || button.textContent || '').trim().replace(/\s+/g, ' ').toLowerCase()) &&
                button.getClientRects().length > 0 && getComputedStyle(button).visibility !== 'hidden');
            if (!send || !sfmcfix.context.current().stack) { existing?.remove(); return; }
            const link = existing || document.createElement('a');
            if (!existing) {
                link.id = 'sfmcfix-test-tracking';
                link.className = 'btn btn-default sfmcfix-test-tracking';
                link.textContent = 'Tracking test';
                link.title = 'Apri Email Studio → Tracking → Test Send Emails';
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
            }
            const href = sfmcfix.links.testTracking();
            if (link.href !== href) link.href = href;
            if (send.nextElementSibling !== link) send.after(link);
        };
        const syncVisibility = () => {
            queued = false;
            // This native surface belongs to Preview and Test. Its own tab can
            // be hidden while Preview is active, so check the containing panel.
            const surfaces = Array.from(document.querySelectorAll('.test-send-recipients-tab-content'));
            const active = surfaces.some(surface => {
                const panel = surface.parentElement;
                return panel && panel.getClientRects().length > 0 && getComputedStyle(panel).visibility !== 'hidden';
            });
            const showIcons = active && !sfmcfix.uiPreferences.get().hidePreviewIcons;
            syncTrackingButton(active);
            if (toolbox.hidden === showIcons) toolbox.hidden = !showIcons;
            if (!showIcons) {
                const options = toolbox.querySelector('#sfmcfix-context-options');
                if (options && !options.hidden) {
                    options.hidden = true;
                    toolbox.querySelector('[data-context-action="toggle"]').setAttribute('aria-expanded', 'false');
                }
                const history = document.getElementById('testsendlog-viewer');
                if (history?.classList.contains('is-open')) history.classList.remove('is-open');
                if (!active) document.getElementById('sfmcfix-tester-editor')?.close();
            }
        };
        syncVisibility();
        window.addEventListener('sfmcfix:ui-preferences', syncVisibility);
        const observer = new MutationObserver(() => {
            if (!queued) { queued = true; requestAnimationFrame(syncVisibility); }
        });
        observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
        setTimeout(() => {
            const $wrapper = $('#testsendlog-viewer');
            $wrapper.find('#log-body').html(loglist());
            $wrapper.on('updateview', function() {
                $wrapper.find('#log-body').html(loglist());
            });
        },1000);
    });
    
})();
