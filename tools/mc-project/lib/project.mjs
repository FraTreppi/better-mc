import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { stable, json, hash, digest, safe, checked, buParts, readJSON, exists, walk, write, writeTree, lock } from './files.mjs';
export const TYPES = ['asset-email', 'asset-template', 'asset-block', 'asset-code', 'asset-other', 'asset-textfile', 'asset-webstudio', 'query', 'journey', 'script', 'automation', 'event'];
const plain = value => String(value ?? '').replace(/[\r\n|]/g, ' ');
const belongs = (name, file, type) => type.startsWith('asset-') ? name.startsWith(file.slice(0, file.lastIndexOf('/') + 1)) : name.startsWith(file.slice(0, -'json'.length));
function identity(local, remote) {
    for (const field of ['key', 'customerKey', 'id', 'queryDefinitionId', 'definitionId', 'version', 'assetType', 'r__folder_Path', 'categoryId', 'category']) {
        if (JSON.stringify(stable(local[field])) !== JSON.stringify(stable(remote[field]))) throw Error('Identità, tipo, versione e cartella devono restare quelli del backup: ' + field);
    }
}
export function verifySaved(before, intended, confirmed) {
    const changed = [];
    function fields(a, b, c, pointer = '') {
        if (JSON.stringify(stable(a)) === JSON.stringify(stable(b))) return;
        if (b && typeof b === 'object' && !Array.isArray(b)) {
            for (const key of new Set([...Object.keys(a || {}), ...Object.keys(b)])) fields(a?.[key], b[key], c?.[key], pointer + '/' + key);
        } else if (JSON.stringify(stable(b)) !== JSON.stringify(stable(c))) changed.push(pointer);
    }
    for (const file of new Set([...Object.keys(before.files), ...Object.keys(intended.files)])) {
        const a = before.files[file], b = intended.files[file], c = confirmed.files[file];
        if (a && b && hash(a) === hash(b)) continue;
        if (file.endsWith('-meta.json') && b && c) fields(a ? JSON.parse(a) : {}, JSON.parse(b), JSON.parse(c), file);
        else if ((b == null) !== (c == null) || b && hash(b) !== hash(c)) changed.push(file);
    }
    if (changed.length) throw Error('MC non ha confermato tutte le modifiche inviate. Non ripetere il salvataggio: controlla MC e poi esegui pull. Campi/file: ' + changed.join(', '));
}
function journeyDiagram(metadata) {
    if (!Array.isArray(metadata.activities)) return [];
    const nodes = [...(metadata.triggers || []), ...metadata.activities];
    const ids = new Map(nodes.filter(node => typeof node.key === 'string').map(node => [node.key, 'n' + hash(node.key).slice(0, 12)]));
    const result = ['', '## Flusso Journey', '', '```mermaid', 'flowchart TD'];
    for (const node of nodes) {
        if (!ids.has(node.key)) continue;
        const name = plain(node.name || node.key).replace(/["<>`&]/g, ' ');
        result.push(`  ${ids.get(node.key)}["${name}"]`);
        for (const outcome of node.outcomes || []) if (ids.has(outcome.next)) result.push(`  ${ids.get(node.key)} --> ${ids.get(outcome.next)}`);
    }
    return [...result, '```', ''];
}
export function entries(files, bu) {
    const result = [];
    for (const [file, data] of Object.entries(files)) {
        const match = file.match(/\.((?:asset-[a-z]+)|query|journey|script|automation|event|dataExtension)-meta\.json$/);
        if (!match) continue;
        const metadata = JSON.parse(data.toString());
        const key = metadata.customerKey || metadata.key;
        if (typeof key !== 'string' || !key || key.includes('\0')) throw Error('Customer Key assente o non valida: ' + file);
        // Each asset has its own directory. Other metadata types share a directory.
        const selected = Object.fromEntries(Object.entries(files).filter(([name]) => belongs(name, file, match[1])));
        result.push({ file, bu, type: match[1], key, name: metadata.name || key, version: metadata.version, metadata, files: selected, hash: digest(selected) });
    }
    return result.sort((a, b) => a.file.localeCompare(b.file));
}
export function select(files, bu, options) {
    const matches = entries(files, bu).filter(item => options.file ? item.file === options.file :
        item.key === options.key && item.type === options.type && (options.version == null || Number(item.version) === Number(options.version)));
    if (matches.length !== 1) throw Error('Selezione assente o ambigua: usa --file con il percorso mostrato da list.');
    return matches[0];
}
export function merge(base, local, remote, recorded) {
    const output = {}, conflicts = [];
    const same = (a, b) => a === undefined ? b === undefined : b !== undefined && hash(a) === hash(b);
    for (const file of new Set([...Object.keys(base), ...Object.keys(recorded || {}), ...Object.keys(local), ...Object.keys(remote)])) {
        const b = base[file], l = local[file], r = remote[file];
        const baseHash = recorded ? recorded[file] : b === undefined ? undefined : hash(b);
        const localSame = (l === undefined ? undefined : hash(l)) === baseHash;
        const remoteSame = (r === undefined ? undefined : hash(r)) === baseHash;
        if (localSame || same(l, r)) { if (r !== undefined) output[file] = r; }
        else if (remoteSame) { if (l !== undefined) output[file] = l; }
        else conflicts.push(file);
    }
    return { files: output, conflicts };
}
export function dependencies(value, at = '', out = []) {
    if (!value || typeof value !== 'object') return out;
    for (const [key, child] of Object.entries(value)) {
        const location = at ? at + '.' + key : key;
        if ((/^r__/.test(key) || /(?:assetId|eventDefinitionKey|dataExtensionId|targetKey|templateId)$/i.test(key)) && ['string', 'number'].includes(typeof child)) out.push({ field: location, value: child });
        if (child && typeof child === 'object') dependencies(child, location, out);
    }
    return out;
}
export class Project {
    constructor(root, provider) { this.root = path.resolve(root); this.provider = provider; }
    async config() {
        const config = await readJSON(path.join(this.root, 'sfmc-project.json'));
        if (config.format !== 'sfmc-git-project-v1' || !Array.isArray(config.types) || !config.types.length || config.types.some(type => !TYPES.includes(type))) throw Error('Progetto o tipi di backup non riconosciuti.');
        return config;
    }
    async mid(bu) {
        const [credential, name] = buParts(bu);
        const config = await readJSON(path.join(this.root, '.mcdevrc.json'));
        const mid = String(config.credentials?.[credential]?.businessUnits?.[name] || '');
        if (!/^[1-9]\d{0,14}$/.test(mid)) throw Error('BU non configurata. Esegui connect e usa il nome mostrato nella configurazione.');
        return mid;
    }
    async recorded(bu, mid) {
        const file = path.join(this.root, 'sfmc-baselines.json');
        const all = await exists(file) ? await readJSON(file) : {};
        const record = all[bu];
        if (record && record.mid !== mid) throw Error('Il MID di questa BU è cambiato rispetto al backup. Usa una connessione/cartella distinta.');
        if (record && (!record.files || Object.entries(record.files).some(([file, value]) => { safe(this.root, file); return !/^[a-f0-9]{64}$/.test(value); }))) throw Error('Manifest del backup non valido.');
        return record;
    }
    async record(bu, mid, files, hashes) {
        const file = path.join(this.root, 'sfmc-baselines.json');
        const all = await exists(file) ? await readJSON(file) : {};
        all[bu] = { mid, files: hashes || Object.fromEntries(Object.entries(files).map(([file, bytes]) => [file, hash(bytes)])) };
        await write(this.root, 'sfmc-baselines.json', json(all));
    }
    async tree(bu, baseline = false) {
        buParts(bu);
        return walk(await checked(this.root, (baseline ? '.sfmcgit-state/baseline/' : 'retrieve/') + bu));
    }
    async pull(bu) { return lock(this.root, async () => {
        const config = await this.config(), mid = await this.mid(bu);
        const recorded = await this.recorded(bu, mid);
        const remote = await this.provider.retrieve(bu, config.types);
        const local = await this.tree(bu), base = await this.tree(bu, true);
        const merged = merge(base, local, remote, recorded?.files);
        if (merged.conflicts.length) {
            await writeTree(path.join(this.root, '.sfmcgit-state/conflicts', ...buParts(bu)), remote);
            await write(this.root, '.sfmcgit-state/conflicts.json', json({ bu, files: merged.conflicts }), 0o600);
            throw Error('Conflitti: nessun file di lavoro è stato sostituito. Consulta .sfmcgit-state/conflicts.json e confronta le versioni in conflicts.');
        }
        const target = path.join(this.root, 'retrieve', ...buParts(bu));
        await writeTree(target, merged.files);
        for (const file of Object.keys(local)) if (!(file in merged.files)) await fs.unlink(safe(target, file));
        const baseline = path.join(this.root, '.sfmcgit-state/baseline', ...buParts(bu));
        await fs.rm(baseline, { recursive: true, force: true }); await writeTree(baseline, remote);
        await this.record(bu, mid, remote);
        await this.document(bu);
        return { bu, assets: entries(remote, bu).length, files: Object.keys(remote).length };
    }); }
    async document(bu) {
        const items = entries(await this.tree(bu), bu);
        const index = ['# Inventario Marketing Cloud', '', `BU: ${plain(bu)} · MID: ${await this.mid(bu)}`, '', '| Nome | Tipo | Customer Key | Sorgente |', '| --- | --- | --- | --- |'];
        for (const item of items) {
            const filename = hash(item.file).slice(0, 20) + '.md';
            index.push(`| ${plain(item.name)} | ${item.type} | ${plain(item.key)} | [Apri](assets/${filename}) |`);
            const deps = dependencies(item.metadata);
            await write(this.root, `docs/${bu}/assets/${filename}`, ['# ' + plain(item.name), '', '- Tipo: ' + item.type, '- Customer Key: ' + plain(item.key), '- BU: ' + plain(bu), '- Versione: ' + plain(item.version || ''), '', '## File', '', ...Object.keys(item.files).map(file => '- `' + file + '`'), '', '## Dipendenze dichiarate', '', ...(deps.length ? deps.map(dep => '- `' + plain(dep.field) + '`: ' + plain(dep.value)) : ['Nessun riferimento rilevato. Le dipendenze dinamiche AMPscript/SSJS richiedono verifica del codice.']), ...journeyDiagram(item.metadata), '', '## Pubblicazione', '', item.type.startsWith('asset-') ? 'L’invio salva il contenuto. Per CloudPages, Preview e Publish avvengono in Salesforce. I blocchi riutilizzati possono essere letti a runtime da altri contenuti.' : item.type === 'journey' ? 'L’attivazione è un’operazione separata, dopo validazione e revisione della versione.' : 'L’invio salva la definizione; non esegue query, script o automation.', ''].join('\n'));
        }
        await write(this.root, `docs/${bu}/README.md`, index.join('\n') + '\n');
        return { assets: items.length };
    }
    async plan(bu, options) { return lock(this.root, async () => {
        const mid = await this.mid(bu); await this.config();
        const recorded = await this.recorded(bu, mid);
        const item = select(await this.tree(bu), bu, options);
        const baseFiles = await this.tree(bu, true);
        const fresh = select(await this.provider.retrieve(bu, [item.type]), bu, { file: item.file });
        if (recorded) {
            const expected = Object.fromEntries(Object.entries(recorded.files).filter(([file]) => belongs(file, item.file, item.type)));
            const actual = Object.fromEntries(Object.entries(fresh.files).map(([file, bytes]) => [file, hash(bytes)]));
            if (json(expected) !== json(actual)) throw Error('La base remota è cambiata o manca: esegui pull prima del piano.');
        }
        const baseline = recorded ? fresh : select(baseFiles, bu, { file: item.file });
        identity(item.metadata, baseline.metadata);
        if (item.type === 'journey' && item.metadata.status !== 'Draft') throw Error('Modifica una versione Journey in stato Draft. Le versioni attive restano backup.');
        if (item.type === 'automation') throw Error('Le automation sono esportate e documentate. Per aggiornare le attività usa query/script; pianificazione e attivazione restano in MC.');
        if (fresh.hash !== baseline.hash) throw Error('Il contenuto è cambiato in MC. Esegui pull e risolvi il confronto prima di inviare.');
        if (item.hash === baseline.hash) throw Error('Nessuna modifica locale da inviare.');
        const plan = { format: 'sfmc-git-plan-v1', id: randomUUID(), created: new Date().toISOString(), bu, mid,
            file: item.file, type: item.type, key: item.key, version: item.version || null, source: item.hash, remote: fresh.hash,
            files: Object.fromEntries(Object.entries(item.files).map(([file, bytes]) => [file, hash(bytes)])) };
        await fs.rm(path.join(this.root, '.sfmcgit-state/review'), { recursive: true, force: true });
        await writeTree(path.join(this.root, '.sfmcgit-state/review/base'), baseline.files);
        await writeTree(path.join(this.root, '.sfmcgit-state/review/local'), item.files);
        await write(this.root, '.sfmcgit-state/plan.json', json(plan), 0o600);
        await write(this.root, 'docs/INVIO.md', ['# Invio da revisionare', '', `BU: ${plain(bu)} · MID: ${mid}`, `Tipo: ${item.type} · Customer Key: ${plain(item.key)}`, '', `Piano: ${plan.id}`, '', ...Object.keys(plan.files).map(file => '- `' + file + '`'), '', 'Confronta le cartelle .sfmcgit-state/review/base e local, oppure usa il comando diff. Il piano scade dopo un’ora e viene ricontrollato prima dell’invio. Nessuna query o automation viene eseguita. I blocchi condivisi possono essere usati subito dai contenuti che li richiamano a runtime.', ''].join('\n'));
        return plan;
    }); }
    async apply(id) { return lock(this.root, async () => {
        const plan = await readJSON(path.join(this.root, '.sfmcgit-state/plan.json'));
        if (plan.format !== 'sfmc-git-plan-v1' || plan.id !== id || plan.applied || Date.now() - Date.parse(plan.created) > 3600000 || !Number.isFinite(Date.parse(plan.created))) throw Error('Piano assente, scaduto o già utilizzato.');
        if (await this.mid(plan.bu) !== plan.mid) throw Error('La configurazione MID è cambiata.');
        const recorded = await this.recorded(plan.bu, plan.mid);
        const local = select(await this.tree(plan.bu), plan.bu, { file: plan.file });
        if (local.hash !== plan.source || local.key !== plan.key || local.type !== plan.type) throw Error('I file sono cambiati dopo la revisione. Ricrea il piano.');
        const remote = select(await this.provider.retrieve(plan.bu, [plan.type]), plan.bu, { file: plan.file });
        if (remote.hash !== plan.remote) throw Error('Conflitto remoto: nessuna scrittura eseguita.');
        identity(local.metadata, remote.metadata);
        // Consume before the write: a partial/uncertain API response must never replay a save.
        plan.applied = true; plan.state = 'sending';
        await write(this.root, '.sfmcgit-state/plan.json', json(plan), 0o600);
        const archive = `.sfmcgit-state/backups/${plan.id}`;
        await writeTree(safe(this.root, archive), remote.files);
        await this.provider.deploy(plan.bu, plan.type, plan.key, local.files);
        const confirmed = select(await this.provider.retrieve(plan.bu, [plan.type]), plan.bu, { file: plan.file });
        verifySaved(remote, local, confirmed);
        plan.state = 'saved'; plan.confirmed = confirmed.hash;
        await write(this.root, '.sfmcgit-state/plan.json', json(plan), 0o600);
        const now = select(await this.tree(plan.bu), plan.bu, { file: plan.file });
        if (now.hash === local.hash) {
            const target = path.join(this.root, 'retrieve', ...buParts(plan.bu));
            await writeTree(target, confirmed.files);
            for (const file of Object.keys(local.files)) if (!(file in confirmed.files)) await fs.unlink(await checked(target, file));
            plan.source = confirmed.hash;
        }
        const baseTarget = path.join(this.root, '.sfmcgit-state/baseline', ...buParts(plan.bu));
        const oldBase = await this.tree(plan.bu, true);
        await writeTree(baseTarget, confirmed.files);
        for (const file of Object.keys(oldBase)) if (belongs(file, plan.file, plan.type) && !(file in confirmed.files)) await fs.unlink(await checked(baseTarget, file));
        const hashes = recorded?.files || Object.fromEntries(Object.entries(oldBase).map(([file, bytes]) => [file, hash(bytes)]));
        for (const file of Object.keys(hashes)) if (belongs(file, plan.file, plan.type)) delete hashes[file];
        for (const [file, bytes] of Object.entries(confirmed.files)) hashes[file] = hash(bytes);
        await this.record(plan.bu, plan.mid, {}, hashes);
        await write(this.root, '.sfmcgit-state/last-save.json', json({ ...plan, publication: 'not-requested' }), 0o600);
        return { id: plan.id, bu: plan.bu, state: plan.state, publication: 'not-requested' };
    }); }
    async publishJourney(id, confirm) { return lock(this.root, async () => {
        const saved = await readJSON(path.join(this.root, '.sfmcgit-state/last-save.json'));
        if (saved.id !== id || saved.type !== 'journey' || saved.state !== 'saved' || saved.published ||
            confirm !== `${saved.mid}/${saved.key}/${saved.version}`) throw Error('Conferma richiesta: MID/CustomerKey/Versione dell’ultimo Journey salvato.');
        const remote = select(await this.provider.retrieve(saved.bu, ['journey']), saved.bu, { file: saved.file });
        const local = select(await this.tree(saved.bu), saved.bu, { file: saved.file });
        if (await this.mid(saved.bu) !== saved.mid || remote.hash !== saved.confirmed || local.hash !== saved.source || remote.metadata.status !== 'Draft') throw Error('Journey modificato dopo il salvataggio o versione non Draft.');
        await this.provider.validate(saved.bu, saved.key, saved.version);
        if (await this.mid(saved.bu) !== saved.mid || select(await this.provider.retrieve(saved.bu, ['journey']), saved.bu, { file: saved.file }).hash !== saved.confirmed) throw Error('Journey o BU cambiati durante la validazione: attivazione interrotta.');
        // Activation can start a real Journey; it is never part of apply or a Git push.
        saved.published = true; saved.publication = 'requested';
        await write(this.root, '.sfmcgit-state/last-save.json', json(saved), 0o600);
        await this.provider.publish(saved.bu, saved.key, saved.version);
        return { publication: 'requested', bu: saved.bu, key: saved.key, version: saved.version };
    }); }
}
