(function(){
    const $ = window.jQuery;

    const $form = $('#advanced-de-serach_form');
    const $input = $('#advanced-de-term');
    const $list = $('#advanced-de-search_list');
    const $inputs = $('input', $form);

    
    const renderList = (data, value) => {
        var htmllist = data.items.map((item) => 
            `<li>
                <div>
                    <a title="open data extension" href="#admin/data-extension/${encodeURIComponent(item.id)}/properties/">${sfmcfix.escapeHtml(item.name)}</a>
                    <button title="open folder" data-deid="${sfmcfix.escapeHtml(item.id)}" data-categoryid="${sfmcfix.escapeHtml(item.categoryId)}" class="btn btn-link advanced-show-infolder"><span class="glyphicon icon-folder glyphicon-folder-close"></span></button>
                </div>
                <div>
                    <small>${sfmcfix.escapeHtml(item.categoryFullPath||'-')}</small>
                </div>
                </li>`);
        htmllist = htmllist.length ? htmllist : [`<li>No Data Extension found with term: <b>${sfmcfix.escapeHtml(value)}</b></li>`]
        $list.html(htmllist.join(''));
        lock = false;
    }

    var lock = false;
    let controller;
    $inputs.on('input', debounce(async () => {
        controller?.abort();
        const value = $input.val();
        if(value.length > 2) {
            controller = new AbortController();
            const request = controller;
            const scope = sfmcfix.context.current().scope;
            $form.addClass('is-loading');
            lock = true;
            try {
            const searchmode = $('#advanced-de-serach_form [name="searchmode"]:checked').val();
            const term = encodeURIComponent(`${(searchmode=='contains'||searchmode=='end')?'%':''}${value}${(searchmode=='contains'||searchmode=='start')?'%':''}`);
            const response = await fetch(`/contactsmeta/fuelapi/data-internal/v1/customobjects/category/0?retrievalType=1&$page=1&$pagesize=25&includeFullPath=true&$orderBy=CustomerKey%20ASC%20&name=${term}`, { signal: request.signal });
            if (!response.ok) throw new Error(`Ricerca fallita: HTTP ${response.status}`);
            const data = await response.json();
            if (request !== controller || scope !== sfmcfix.context.current().scope) return;
            renderList(data, value);
            } catch (error) {
                if (error.name !== 'AbortError') sfmcfix.notificationLogger('error', null, error.message);
            } finally {
                if (request === controller) { lock = false; $form.removeClass('is-loading'); }
            }
        } else {
            $list.empty();
            $form.removeClass('is-loading');
        }
    }));

    $list.on('click', 'li a', () => {
        $('#advanced-de-search_modal').modal('hide');
    });

    $list.on('click', '.advanced-show-infolder', async function() {
        const id = $(this).data('categoryid');
        var $li = $(`#${id}.tree-branch`);
        
        $('#advanced-de-search_modal').modal('hide');

        if($(`#${id}.tree-branch`).length) {
            $li.find('> .tree-branch-header .tree-branch-name').trigger('click');
        } else {
            let data;
            try { data = await window.sfmcfix.getDeFullPath(id); }
            catch (error) { sfmcfix.notificationLogger('error', null, error.message); return; }
            const pathArray = data?.items || [];

            var _k = 0;
            var _iterations = 0;
            window.sfmcfix.notificationLogger('info',null,`Sto navigando le folder per te.... attendi per favore...`);
            const clickFolder = (_i) => {
                if(pathArray[_k]?.id) {
                    if($(`#${pathArray[_k].id}.tree-branch`).length) {
                        $(`#${pathArray[_k].id}.tree-branch > .tree-branch-header`).addClass('is-highlighted');
                        const $trigger = (_k+1 < pathArray.length) 
                            ? $(`#${pathArray[_k].id}.tree-branch:not(.tree-open) > .tree-branch-header .glyphicon-play`).click()
                            : $(`#${pathArray[_k].id}.tree-branch:not(.tree-open) > .tree-branch-header .tree-branch-name`).click()
                        _k++;
                    } else {
                        _iterations++;
                        if(_iterations>10) {
                            window.sfmcfix.notificationLogger('error',null,`Non sono riuscito a trovare la folder richiesta entro 10s, riprova.`);
                            console.error('SFMCFIX --- CANT FIND FOLDER PATH FOR --- ', data)
                            return;
                        }
                    }
                    setTimeout(() => {
                        clickFolder();
                    }, 500);
                }
            }

            if(pathArray.length) clickFolder();
        }
    });
    
})();
