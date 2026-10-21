(function () {
    'use strict';
    const api = window.sfmcfix;
    const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let generation = 0;
    let controller;
    let timeout;
    let routeKey;
    let entry;
    let queued = false;

    function route() {
        const match = location.hash.match(/^#\/?([0-9a-f-]{36})(?:\/(\d+))?(?:\/|$)/i);
        if (!match || !GUID.test(match[1])) return null;
        return { id: match[1], version: match[2], scope: api.context.current().scope,
            key: `${match[1].toLowerCase()}/${match[2] || ''}/${api.context.current().scope}` };
    }

    async function read(path, signal) {
        const response = await fetch('/fuelapi/interaction/v1/' + path, {
            credentials: 'same-origin', headers: { Accept: 'application/json' }, signal
        });
        if (!response.ok) throw new Error(`Lettura della configurazione non riuscita (${response.status}).`);
        return response.json();
    }

    function deId(source) {
        for (const value of [source?.dataExtensionId, source?.dataExtensionID]) {
            if (GUID.test(String(value || '')) && !/^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(value)) return String(value);
        }
        return null;
    }

    async function resolve(current, signal) {
        const query = new URLSearchParams({ extras: 'all' });
        if (current.version) query.set('versionNumber', current.version);
        const definition = await read(`interactions/${encodeURIComponent(current.id)}?${query}`, signal);
        if (String(definition.id).toLowerCase() !== current.id.toLowerCase() ||
            (current.version && String(definition.version ?? definition.versionNumber) !== current.version)) {
            throw new Error('La definizione restituita non corrisponde alla versione del Journey aperta.');
        }
        // Never derive an entry DE from activities, names, external keys or asset owners.
        if (!Array.isArray(definition.triggers) || definition.triggers.length !== 1) return null;
        const trigger = definition.triggers[0];
        const meta = trigger.metaData || {};
        const config = trigger.configurationArguments || {};
        let id = deId(trigger) || deId(meta) || deId(config);
        if (!id) {
            const eventId = meta.eventDefinitionId || trigger.eventDefinitionId || config.eventDefinitionId;
            const eventKey = meta.eventDefinitionKey || trigger.eventDefinitionKey || config.eventDefinitionKey;
            let path;
            if (GUID.test(String(eventId || ''))) path = encodeURIComponent(eventId);
            else if (typeof eventKey === 'string' && eventKey) path = 'key:' + encodeURIComponent(eventKey);
            else return null;
            const event = await read('eventDefinitions/' + path, signal);
            if (eventId && GUID.test(eventId) && String(event.id).toLowerCase() !== eventId.toLowerCase()) return null;
            if (!eventId && eventKey && event.key !== eventKey) return null;
            id = deId(event);
        }
        return id ? { trigger, id, route: current } : null;
    }

    function targetFor(trigger) {
        const values = new Set([trigger.key, trigger.id, trigger.metaData?.eventDefinitionId,
            trigger.metaData?.eventDefinitionKey, trigger.eventDefinitionId, trigger.eventDefinitionKey,
            trigger.configurationArguments?.eventDefinitionId, trigger.configurationArguments?.eventDefinitionKey]
            .filter(value => typeof value === 'string' && value));
        // Match explicit entry identifiers exposed by the native UI, not arbitrary DE text.
        const attributes = ['data-key', 'data-activity-key', 'data-event-key', 'data-event-definition-id', 'data-event-definition-key'];
        const candidates = Array.from(document.querySelectorAll(attributes.map(name => `[${name}]`).join(',')));
        const identified = candidates.find(node => node instanceof HTMLElement &&
            attributes.some(name => values.has(node.getAttribute(name))) && node.getClientRects().length);
        if (identified) return identified;
        for (const value of values) {
            const node = document.getElementById(value);
            if (node instanceof HTMLElement && node.getClientRects().length) return node;
        }
        const nativeEntries = Array.from(document.querySelectorAll('[data-activity-type="EmailAudience"], [data-activity-type="DEAudience"], [data-entry-source="data-extension"]'))
            .filter(node => node instanceof HTMLElement && node.getClientRects().length);
        return nativeEntries.length === 1 ? nativeEntries[0] : null;
    }

    function render() {
        queued = false;
        const previous = document.getElementById('sfmcfix-entry-de');
        const current = route();
        if (!entry || current?.key !== entry.route.key || !api.context.current().stack) { previous?.remove(); return; }
        const target = targetFor(entry.trigger);
        if (!target) { previous?.remove(); return; }
        const link = previous || document.createElement('a');
        if (!previous) {
            link.id = 'sfmcfix-entry-de';
            link.className = 'slds-button slds-button_neutral sfmcfix-entry-de';
            link.textContent = 'Apri Data Extension ↗';
            link.title = 'Apri la Data Extension dell’entry in Contact Builder';
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            const guard = event => {
                if (route()?.key !== entry?.route.key) { event.preventDefault(); changed(); }
            };
            link.addEventListener('click', guard);
            link.addEventListener('auxclick', guard);
            link.addEventListener('pointerdown', guard);
            // Keep native tile clicks from opening the entry configuration as well.
            link.addEventListener('click', event => event.stopPropagation());
        }
        const href = api.links.contactBuilder(entry.id);
        if (link.href !== href) link.href = href;
        if (target.matches('button, a, [role="button"]')) {
            if (target.nextElementSibling !== link) target.after(link);
        } else if (link.parentElement !== target) target.appendChild(link);
    }

    function schedule() {
        if (!queued) { queued = true; requestAnimationFrame(render); }
    }

    async function changed() {
        const current = route();
        if (current?.key === routeKey) { schedule(); return; }
        routeKey = current?.key;
        const ticket = ++generation;
        controller?.abort();
        clearTimeout(timeout);
        entry = null;
        document.getElementById('sfmcfix-entry-de')?.remove();
        if (!current) return;
        controller = new AbortController();
        timeout = setTimeout(() => controller.abort(), 15000);
        try {
            const result = await resolve(current, controller.signal);
            if (ticket === generation && current.key === route()?.key) { entry = result; render(); }
        } catch (error) {
            if (ticket === generation && error.name !== 'AbortError') console.info('SFMC Fixer: DE entry non disponibile:', error.message);
        } finally { if (ticket === generation) clearTimeout(timeout); }
    }

    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true,
        attributes: true, attributeFilter: ['class', 'style', 'hidden', 'id', 'data-key', 'data-activity-key', 'data-event-key',
            'data-event-definition-id', 'data-event-definition-key', 'data-activity-type', 'data-entry-source'] });
    window.addEventListener('hashchange', changed);
    window.addEventListener('sfmcfix:contextchange', changed);
    changed();
})();
