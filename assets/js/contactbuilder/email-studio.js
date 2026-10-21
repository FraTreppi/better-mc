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
            const openCurrentDE = event => {
                if (event.type === 'auxclick' && event.button !== 1) return;
                // Resolve at click time too: avoid a stale GUID during SPA navigation.
                const id = location.hash.match(DE_ROUTE)?.[1];
                if (!id) {
                    event.preventDefault();
                    link.remove();
                    return;
                }
                try { link.href = api.links.emailStudio(id); }
                catch (error) {
                    event.preventDefault();
                    link.removeAttribute('href');
                    alert(error.message);
                }
            };
            // Browsers may capture the middle-click destination before auxclick.
            link.addEventListener('pointerdown', render);
            link.addEventListener('click', openCurrentDE);
            link.addEventListener('auxclick', openCurrentDE);
            link.addEventListener('keydown', event => {
                if (!link.hasAttribute('href') && (event.key === 'Enter' || event.key === ' ')) {
                    event.preventDefault();
                    link.click();
                }
            });
            container.prepend(link);
        }
        let url = null;
        let errorMessage = '';
        try { url = api.links.emailStudio(match[1]); } catch (error) { errorMessage = error.message; }
        const label = url ? 'Apri in Email Studio ↗' : 'Email Studio non disponibile';
        if (link.textContent !== label) link.textContent = label;
        if (url) {
            link.removeAttribute('role');
            link.removeAttribute('aria-disabled');
            if (link.getAttribute('href') !== url) link.setAttribute('href', url);
        } else {
            link.removeAttribute('href');
            link.setAttribute('role', 'button');
            link.setAttribute('aria-disabled', 'true');
            link.tabIndex = 0;
        }
        const title = errorMessage || `Data Extension ${match[1]} · sessione Email Studio corrente`;
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
