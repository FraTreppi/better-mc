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

    let searchGeneration = 0;
    function clearTesterSearch() {
        searchGeneration++;
        $('#tester-input').val('');
        $('#suggestion-items').empty().hide();
        $('#sfmcfix-tester-search-status').text('');
    }
    window.addEventListener('sfmcfix:contextchange', clearTesterSearch);
    window.addEventListener('sfmcfix:preferences', clearTesterSearch);
    window.addEventListener('sfmcfix:tester-loading', clearTesterSearch);

    console.log(`SFMC fixer - RUBRICA TESTER`);

    const generateInput = debounce(($parent) => {
        var $input = $parent.find('#tester-input');
        if(!$input.length) {
            const $wrap = $(`<div class="input-suggestion">
                <input type="text" id="tester-input" class="form-control" placeholder="type a name..." aria-label="Cerca un tester per nome, cognome o email" aria-describedby="sfmcfix-tester-search-status" autocomplete="off" />
                <p id="sfmcfix-tester-search-status" role="status" aria-live="polite"></p>
                <div class="suggestion-list-wrapper">
                <ul id="suggestion-items"></ul></div>
            </div>`);
            $parent.append($wrap);
        }
    },500);

    const searchOnType = debounce(async ($input, generation) => {
        const val = $input.val().trim().toLowerCase();
        const $ul = $('#suggestion-items');
        const $status = $('#sfmcfix-tester-search-status');
        $ul.empty().hide();
        if (val.length < 3) { $status.text('Digita almeno tre caratteri.'); return; }
        const scope = sfmcfix.context.current().scope;
        $status.text('Ricerca tester…');
        try {
            if (sfmcfix.preferences.get().testerSource !== 'de') {
                $status.text('Premi Carica tester dalla DE nelle Impostazioni SFMC per attivare la rubrica.');
                return;
            }
            const result = await sfmcfix.testerSource.list();
            if (generation !== searchGeneration || scope !== sfmcfix.context.current().scope || !$input[0]?.isConnected) return;
            const found = result.testers.filter(tester => tester.some(value => value.toLowerCase().includes(val)));
            const emails = new Set();
            for (const tester of found) {
                if (emails.has(tester[2].toLowerCase())) continue;
                emails.add(tester[2].toLowerCase());
                const person = [tester[1], tester[0]].filter(Boolean).join(' ');
                $('<li class="suggestion-list-item">').attr('data-email', tester[2]).text(person ? `${person} · ${tester[2]}` : tester[2]).appendTo($ul);
                if (emails.size === 5) break;
            }
            $status.text(emails.size ? `${emails.size} suggerimenti${found.length > 5 ? '; precisa la ricerca per vedere gli altri' : ''}.` : 'Nessun tester trovato.');
            $ul.toggle(emails.size > 0);
        } catch (error) {
            if (generation === searchGeneration && scope === sfmcfix.context.current().scope) $status.text(error.message);
        }
    },300);

    $(document).on('input keyup','#tester-input', function(e) {
        const generation = ++searchGeneration;
        $('#suggestion-items').empty().hide();
        searchOnType($(this), generation);
    });

    $(document).on('focusout','#tester-input', function(e) {
        setTimeout(() => $('#suggestion-items').hide(), 150);
    });

    $(document).on('mouseenter','.test-send-recipients-tab-content', function(e) {
        generateInput($(this));
    });

    $(document).on('click', '.suggestion-list-item', function(e){
        const email = $(this).attr('data-email');
        clearTesterSearch();
        $('.test-send-recipients-pillbox .pillbox-add-item').val(email);
        $('.test-send-recipients-pillbox .pillbox-add-item').trigger('focusout');
    });

    const toolbox = document.createElement('div');
    toolbox.className = 'previewandtest-toolbox';
    toolbox.hidden = true;
    document.body.appendChild(toolbox);
    sfmcfix.context.mountControls(toolbox);
    let queued = false;
    const syncVisibility = () => {
        queued = false;
        // This native surface belongs to Preview and Test. Its own tab can
        // be hidden while Preview is active, so check the containing panel.
        const surfaces = Array.from(document.querySelectorAll('.test-send-recipients-tab-content'));
        const active = surfaces.some(surface => {
            const panel = surface.parentElement;
            return panel && panel.getClientRects().length > 0 && getComputedStyle(panel).visibility !== 'hidden';
        });
        const showSettings = active && !sfmcfix.uiPreferences.get().hidePreviewIcons;
        if (toolbox.hidden === showSettings) toolbox.hidden = !showSettings;
        if (!showSettings) {
            const options = toolbox.querySelector('#sfmcfix-context-options');
            if (options && !options.hidden) {
                options.hidden = true;
                toolbox.querySelector('[data-context-action="toggle"]').setAttribute('aria-expanded', 'false');
            }
        }
    };
    syncVisibility();
    window.addEventListener('sfmcfix:ui-preferences', syncVisibility);
    const observer = new MutationObserver(() => {
        if (!queued) { queued = true; requestAnimationFrame(syncVisibility); }
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
})();
