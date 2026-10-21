(function () {
    const STORAGE_KEY = 'SFMCFIX---ACTIVITYVERSIONING';
    let allData = {};
    let searchTerm = '';

    function safeRecord(record) {
        const safe = {};
        for (const key of ['queryDefinitionId', 'name', 'key', 'description', 'queryText', 'targetName', 'targetKey', 'targetId', 'targetDescription',
            'createdDate', 'modifiedDate', 'targetUpdateTypeId', 'targetUpdateTypeName', 'validatedQueryText', 'categoryId', 'folderLocationText', 'isFrozen', 'versioning']) {
            const value = record?.[key];
            if (typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) safe[key] = value;
        }
        const context = record?.sfmcfixContext;
        if (/^s\d+$/.test(context?.stack || '') && /^\d{1,15}$/.test(context?.mid || '')) {
            safe.sfmcfixContext = { stack: context.stack, mid: context.mid };
        }
        return safe;
    }

    /* ── storage ── */

    const isBucket = key => key === STORAGE_KEY || (key.startsWith('SFMCFIX:v2:') && key.endsWith(':' + STORAGE_KEY));
    function loadData() {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get(null, result => {
                if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
                const flat = {};
                for (const [bucket, records] of Object.entries(result)) {
                    if (!isBucket(bucket)) continue;
                    for (const [key, record] of Object.entries(records || {})) flat[JSON.stringify([bucket, key])] = safeRecord(record);
                }
                resolve(flat);
            });
        });
    }
    async function removeEntries(keys) {
        const entries = keys.map(value => { const [bucket, key] = JSON.parse(value); return { bucket, key }; });
        for (let offset = 0; offset < entries.length; offset += 1000) {
            const response = await chrome.runtime.sendMessage({ __sfmcfixStorage: true, action: 'deleteVersions', payload: { entries: entries.slice(offset, offset + 1000) } });
            if (!response?.ok) throw new Error(response?.error || 'Eliminazione non riuscita');
        }
        allData = await loadData();
    }

    /* ── actions ── */

    async function deleteVersion(storageKey) {
        if (!confirm('Eliminare questa versione?')) return;
        await removeEntries([storageKey]);
        render();
    }

    async function deleteGroup(keys, groupName, count) {
        if (!confirm(`Eliminare tutte le ${count} versioni di "${groupName}"?`)) return;
        await removeEntries(keys);
        render();
    }

    async function clearAll() {
        const total = Object.keys(allData).length;
        if (!total) return;
        if (!confirm(`Eliminare tutte le ${total} versioni salvate?\nL'operazione non è reversibile.`)) return;
        await removeEntries(Object.keys(allData));
        render();
    }

    function downloadVersion(record) {
        const name = String(record.name || record.queryDefinitionId || 'activity')
            .toLowerCase().replace(/[^a-z0-9_-]/g, '_');
        const date = String(record.modifiedDate || 'unknown').replace(/[^0-9T]/g, '');
        const blob = new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        const url = URL.createObjectURL(blob);
        a.href = url;
        a.download = `activity-${name}_${date}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    /* ── helpers ── */

    function escHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /* ── render ── */

    function render() {
        const records = Object.entries(allData);

        const filtered = searchTerm
            ? records.filter(([, v]) => `${v.name || ''} ${v.sfmcfixContext?.mid || ''} ${v.sfmcfixContext?.stack || ''}`.toLowerCase().includes(searchTerm))
            : records;

        const count = filtered.length;
        document.getElementById('total-count').textContent =
            count === 0 ? 'nessuna versione' : `${count} versioni`;

        const container = document.getElementById('main-content');

        if (count === 0) {
            container.innerHTML = `
                <div class="empty">
                    <div class="empty-icon">📂</div>
                    <div>${searchTerm ? 'Nessun risultato per "' + escHtml(searchTerm) + '"' : 'Nessuna versione salvata'}</div>
                    <div style="margin-top:8px;font-size:12px;color:#706e6b">Le versioni vengono create in Automation Studio aprendo una Query Activity e cliccando Edit.</div>
                </div>`;
            return;
        }

        /* raggruppa per queryDefinitionId */
        const groups = {};
        for (const [key, record] of filtered) {
            const context = record.sfmcfixContext;
            const scope = context ? `BU ${context.mid} · ${context.stack}` : 'Storico originale · BU non attribuita';
            const gid = `${scope}:${record.queryDefinitionId || 'unknown'}`;
            if (!groups[gid]) groups[gid] = { name: `${record.name || record.queryDefinitionId} — ${scope}`, keys: [], versions: [] };
            groups[gid].keys.push(key);
            groups[gid].versions.push({ key, record });
        }

        /* ordina versioni per data (più recente prima) */
        for (const g of Object.values(groups)) {
            g.versions.sort((a, b) =>
                String(b.record.modifiedDate || '').localeCompare(String(a.record.modifiedDate || '')));
        }

        /* ordina gruppi per nome */
        const sortedGroups = Object.entries(groups).sort((a, b) =>
            (a[1].name || '').localeCompare(b[1].name || ''));

        container.innerHTML = sortedGroups.map(([gid, group]) => `
            <div class="activity-group" data-gid="${escHtml(gid)}">
                <div class="group-header">
                    <span class="chevron">▶</span>
                    <span class="group-name" title="${escHtml(group.name)}">${escHtml(group.name)}</span>
                    <span class="ver-count">${group.versions.length} ver.</span>
                    <button class="btn btn-danger btn-del-group"
                            data-gid="${escHtml(gid)}"
                            title="Elimina tutte le versioni di questa activity">🗑</button>
                </div>
                <div class="versions-list">
                    ${group.versions.map(({ key, record }) => `
                        <div class="version-row">
                            <div class="version-meta">
                                <span class="version-date">${escHtml(record.modifiedDate || '—')}</span>
                                ${record.targetUpdateTypeName
                                    ? `<span class="version-tag">${escHtml(record.targetUpdateTypeName)}</span>`
                                    : ''}
                                ${record.targetName
                                    ? `<span class="version-tag tag-de" title="Target DE">${escHtml(record.targetName)}</span>`
                                    : ''}
                                <div class="version-actions">
                                    <button class="btn btn-outline btn-view-query" data-key="${escHtml(key)}" title="Mostra SQL">SQL</button>
                                    <button class="btn btn-success btn-download" data-key="${escHtml(key)}" title="Download JSON">↓ JSON</button>
                                    <button class="btn btn-danger btn-delete" data-key="${escHtml(key)}" title="Elimina versione">🗑</button>
                                </div>
                            </div>
                            <div class="query-block" id="qb-${escHtml(key)}">${escHtml(record.queryText || '')}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `).join('');

        /* event delegation */
        container.querySelectorAll('.group-header').forEach((header) => {
            header.addEventListener('click', (e) => {
                if (e.target.closest('button')) return;
                header.closest('.activity-group').classList.toggle('is-open');
            });
        });

        container.querySelectorAll('.btn-view-query').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const block = document.getElementById('qb-' + btn.dataset.key);
                if (block) block.classList.toggle('is-visible');
                btn.classList.toggle('is-active');
            });
        });

        container.querySelectorAll('.btn-download').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                downloadVersion(allData[btn.dataset.key]);
            });
        });

        container.querySelectorAll('.btn-delete').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteVersion(btn.dataset.key).catch(error => alert(error.message));
            });
        });

        container.querySelectorAll('.btn-del-group').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const gid = btn.dataset.gid;
                const group = groups[gid];
                deleteGroup(group.keys, group.name, group.versions.length).catch(error => alert(error.message));
            });
        });
    }

    /* ── init ── */

    async function init() {
        allData = await loadData();
        render();

        document.getElementById('search').addEventListener('input', (e) => {
            searchTerm = e.target.value.toLowerCase().trim();
            render();
        });

        document.getElementById('btn-clear-all').addEventListener('click', () => clearAll().catch(error => alert(error.message)));
        document.getElementById('btn-export-all').addEventListener('click', () => {
            const blob = new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.href = url; link.download = 'sfmc-query-history.json'; link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        });

        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'local' && Object.keys(changes).some(isBucket)) {
                loadData().then(data => { allData = data; render(); }).catch(error => alert(error.message));
            }
        });
    }

    document.addEventListener('DOMContentLoaded', () => init().catch(error => { document.getElementById('main-content').textContent = error.message; }));
})();
