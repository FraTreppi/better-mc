import path from 'node:path';
import fs from 'node:fs/promises';
import { json, hash, write, writeTree, walk, checked, safe, lock } from './files.mjs';
import { merge } from './project.mjs';
export function parseBundle(bundle) {
    if (bundle?.format !== 'sfmc-git-export-v1' || !Array.isArray(bundle.items) || bundle.items.length < 1 || bundle.items.length > 100 ||
        !/^s\d+$/.test(bundle.context?.stack || '') || !/^[1-9]\d{0,14}$/.test(String(bundle.context?.mid || ''))) throw Error('Esportazione non riconosciuta o BU assente.');
    const result = {};
    for (const item of bundle.items) {
        if (!['asset', 'query', 'journey', 'cloudpage'].includes(item.kind) || !item.data || typeof item.data !== 'object' || !item.id) throw Error('Elemento dell’esportazione non valido.');
        const base = `${bundle.context.stack}-${bundle.context.mid}/${item.kind}/${hash(String(item.id)).slice(0, 16)}`;
        result[base + '/original.json'] = Buffer.from(json(item.data));
        const sources = [];
        function extract(value, pointer = []) {
            if (pointer.length > 60) throw Error('Esportazione troppo profonda.');
            if (!value || typeof value !== 'object') return;
            for (const [key, child] of Object.entries(value)) {
                const at = [...pointer, key];
                if (typeof child === 'string' && ['content', 'queryText', 'script', 'html', 'css', 'javascript', 'ampScript'].includes(key)) {
                    const extension = key === 'queryText' ? 'sql' : key === 'script' || key === 'javascript' ? 'js' : key === 'css' ? 'css' : 'html';
                    const name = at.map(part => part.replace(/[^a-z0-9_-]/gi, '_')).join('__').slice(0, 100) + '-' + hash(JSON.stringify(at)).slice(0, 8) + '.' + extension;
                    result[base + '/source/' + name] = Buffer.from(child);
                    sources.push({ pointer: at, file: 'source/' + name, sha256: hash(child) });
                } else if (child && typeof child === 'object') extract(child, at);
            }
        }
        extract(item.data);
        result[base + '/sources.json'] = Buffer.from(json(sources));
        result[base + '/README.md'] = Buffer.from(`# ${String(item.data.name || item.id).replace(/[\r\n]/g, ' ')}\n\nBU: ${bundle.context.mid} · ${bundle.context.stack}\n\nSnapshot del contenuto salvato in MC, non delle modifiche non salvate nell’editor. original.json conserva la struttura nativa; source contiene i campi di codice estratti. Questo backup browser non è un pacchetto mcdev da distribuire: per inviare modifiche usa connect e pull.\n`);
    }
    return result;
}
export async function importBundle(root, bundle) { return lock(root, async () => {
    const files = parseBundle(bundle);
    const groups = new Set(Object.keys(files).map(file => file.split('/').slice(0, 3).join('/')));
    const outputs = [];
    for (const group of groups) {
        const prefix = group + '/';
        const remote = Object.fromEntries(Object.entries(files).filter(([file]) => file.startsWith(prefix)).map(([file, bytes]) => [file.slice(prefix.length), bytes]));
        const target = await checked(root, 'browser/' + group);
        const baseline = await checked(root, '.sfmcgit-state/browser-baseline/' + group);
        const local = await walk(target), base = await walk(baseline);
        const result = merge(base, local, remote);
        if (result.conflicts.length) {
            await writeTree(path.join(root, '.sfmcgit-state/browser-conflicts', group), remote);
            throw Error('Importazione in conflitto con modifiche locali: ' + result.conflicts.join(', '));
        }
        outputs.push({ target, baseline, result, remote, local });
    }
    for (const { target, baseline, result, remote, local } of outputs) {
        await writeTree(target, result.files);
        for (const file of Object.keys(local)) if (!(file in result.files)) await fs.unlink(safe(target, file));
        await fs.rm(baseline, { recursive: true, force: true });
        await writeTree(baseline, remote);
    }
    return { groups: groups.size, files: Object.keys(files).length };
}); }
