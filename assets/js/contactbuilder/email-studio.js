(function () {
    'use strict';
    const api = window.sfmcfix;
    const BUTTON_ID = 'sfmcfix-open-email-studio';
    const DE_ROUTE = /^#admin\/data-extension\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/|$)/i;
    let scheduled = false;

    function render() {
        scheduled = false;
        const match = location.hash.match(DE_ROUTE);
        let link = document.getElementById(BUTTON_ID);
        if (!match) { link?.remove(); return; }
        const container = document.querySelector('#dataExtension');
        if (!container) { link?.remove(); return; }
        if (!link) {
            link = document.createElement('a');
            link.id = BUTTON_ID;
            link.className = 'btn btn-secondary sfmcfix-email-studio-link';
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.addEventListener('click', event => {
                // Resolve at click time too: avoid a stale GUID during SPA navigation.
                const id = location.hash.match(DE_ROUTE)?.[1];
                let url = null;
                try { if (id) url = api.links.emailStudio(id); } catch (error) { alert(error.message); }
                if (!url) {
                    event.preventDefault();
                    if (id) api.preferences.configureEmailStudio();
                } else {
                    link.href = url;
                }
            });
            link.addEventListener('keydown', event => {
                if (!link.hasAttribute('href') && (event.key === 'Enter' || event.key === ' ')) {
                    event.preventDefault();
                    link.click();
                }
            });
            container.prepend(link);
        }
        let url = null;
        try { url = api.links.emailStudio(match[1]); } catch (_) { /* Configuration can belong to a previous context. */ }
        const label = url ? 'Apri in Email Studio ↗' : 'Configura apertura in Email Studio ↗';
        if (link.textContent !== label) link.textContent = label;
        if (url) {
            link.removeAttribute('role');
            if (link.getAttribute('href') !== url) link.setAttribute('href', url);
        } else { link.removeAttribute('href'); link.setAttribute('role', 'button'); link.tabIndex = 0; }
        const title = `Data Extension ${match[1]} · ${api.context.current().mid ? 'BU ' + api.context.current().mid : 'sessione SFMC corrente'}`;
        if (link.title !== title) link.title = title;
    }

    function schedule() {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(render);
    }
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    window.addEventListener('hashchange', schedule);
    window.addEventListener('sfmcfix:preferences', schedule);
    window.addEventListener('sfmcfix:contextchange', schedule);
    render();
})();
