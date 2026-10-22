(function () {
    'use strict';
    if (window.sfmcfix.runLogRefresh) return;
    const api = window.sfmcfix;
    const ownId = 'sfmcfix-run-log-refresh';
    let enabled = false;
    let timer = null;
    let scheduled = null;
    let binding = null;
    let identity = null;
    let clickWindow = 0;
    const pending = new Set();

    function context() {
        const hash = location.hash;
        const instance = hash.match(/^#Instance\/([^/?#]+)/i);
        const activity = hash.match(/^#ActivityDetails\/([^/?#]+)\/([^/?#]+)/i);
        const route = instance ? `instance/${instance[1]}` : activity ? `activity/${activity[1]}/${activity[2]}` : hash;
        return `${api.context.current().scope}/${route}`;
    }
    function visible(node) {
        return Boolean(node?.isConnected && node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden');
    }
    function isRefresh(control) {
        // Match the native button supplied from Automation Studio, rather
        // than activating another control with a generic refresh label.
        return control.matches('button.refresh-button') &&
            Boolean(control.querySelector('i.fuelux-icon.fuelux-icon-refresh-hover'));
    }
    function find() {
        const labels = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6,span,label,strong,b,legend,div,p,a'))
            .filter(node => /^run\s*log$/i.test(node.textContent.trim()) && visible(node));
        const matches = [];
        for (const label of labels) {
            let toolbar = label.parentElement;
            for (let level = 0; toolbar && toolbar !== document.body && level < 7; level++, toolbar = toolbar.parentElement) {
                const dates = Array.from(toolbar.querySelectorAll('input')).filter(input => visible(input) &&
                    (input.type === 'date' || /date|calendar/i.test(`${input.className} ${input.name} ${input.getAttribute('aria-label') || ''}`) ||
                    /^\d{1,4}[/-]\d{1,2}[/-]\d{1,4}$/.test(input.value.trim())));
                if (dates.length !== 2) continue;
                const controls = Array.from(toolbar.querySelectorAll('button,a,[role="button"]')).filter(control => visible(control) && isRefresh(control));
                if (controls.length !== 1) continue;
                let anchor = dates[1];
                // Include the date's calendar addon, while remaining after the
                // second date and before the status/refresh controls.
                while (anchor.parentElement && anchor.parentElement !== toolbar && !anchor.parentElement.contains(controls[0]) &&
                    !anchor.parentElement.contains(dates[0])) anchor = anchor.parentElement;
                matches.push({ toolbar, refresh: controls[0], anchor });
                break;
            }
        }
        const unique = Array.from(new Map(matches.map(item => [item.refresh, item])).values());
        return unique.length === 1 ? unique[0] : null;
    }
    function available(control) {
        return visible(control) && !control.disabled && !control.classList.contains('disabled') &&
            control.getAttribute('aria-disabled') !== 'true' && control.getAttribute('aria-busy') !== 'true';
    }
    function render() {
        const toggle = document.getElementById(ownId);
        if (!toggle) return;
        const label = `Auto refresh 5s: ${enabled ? 'ON' : 'OFF'}`;
        if (toggle.textContent !== label) toggle.textContent = label;
        toggle.setAttribute('aria-pressed', String(enabled));
        toggle.classList.toggle('btn-primary', enabled);
        toggle.classList.toggle('btn-default', !enabled);
        toggle.title = enabled ? 'Aggiornamento del Run Log ogni 5 secondi. Clicca per fermarlo; attende se un refresh è già in corso.' :
            'Attiva l’aggiornamento del Run Log ogni 5 secondi, usando il pulsante refresh nativo.';
    }
    function stop(clearPending = false) {
        enabled = false;
        if (timer !== null) clearInterval(timer);
        timer = null;
        clickWindow = 0;
        if (clearPending) pending.clear();
        render();
    }
    function ensureContext() {
        const next = context();
        if (identity !== next) {
            stop(true);
            identity = next;
        }
    }
    function reconcile() {
        scheduled = null;
        ensureContext();
        binding = find();
        const existing = document.getElementById(ownId);
        if (!binding) {
            existing?.remove();
            return;
        }
        if (existing && binding.toolbar.contains(existing)) { render(); return; }
        existing?.remove();
        const toggle = document.createElement('button');
        toggle.id = ownId;
        toggle.type = 'button';
        toggle.className = 'btn btn-sm btn-default sfmcfix-run-log-refresh';
        toggle.setAttribute('data-sfmcfix-run-log', 'true');
        toggle.addEventListener('click', event => {
            event.preventDefault();
            ensureContext();
            if (enabled) stop();
            else {
                enabled = true;
                timer = setInterval(tick, 5000);
                render();
            }
        });
        binding.anchor.after(toggle);
        render();
    }
    function schedule() {
        if (scheduled === null) scheduled = setTimeout(reconcile, 100);
    }
    function tick() {
        ensureContext();
        if (!enabled) return;
        // Re-find the current native element on every tick: Salesforce can
        // replace the complete toolbar during a refresh.
        binding = find();
        if (!binding || pending.size || !available(binding.refresh)) return;
        clickWindow = Date.now() + 50;
        binding.refresh.click();
    }
    document.addEventListener('click', event => {
        if (!enabled) return;
        const current = find();
        if (current?.refresh.contains(event.target)) clickWindow = Date.now() + 50;
    }, true);
    // Observe only completion of native requests created by the refresh click.
    // No endpoint calls, response access or request changes are introduced.
    if (window.jQuery?.ajaxPrefilter) window.jQuery.ajaxPrefilter((options, original, xhr) => {
        if (!enabled || !clickWindow || Date.now() > clickWindow) return;
        pending.add(xhr);
        xhr.always(() => pending.delete(xhr));
    });
    for (const event of ['hashchange', 'sfmcfix:contextchange']) window.addEventListener(event, () => { ensureContext(); schedule(); });
    window.addEventListener('pagehide', () => stop(true));
    document.addEventListener('input', schedule);
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true,
        attributeFilter: ['disabled', 'aria-disabled', 'aria-busy', 'class', 'hidden', 'style'] });
    api.runLogRefresh = { stop: () => stop(), isEnabled: () => enabled };
    reconcile();
})();
