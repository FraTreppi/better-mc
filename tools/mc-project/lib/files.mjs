import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
export const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ?
    Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
export const json = value => JSON.stringify(stable(value), null, 2) + '\n';
export const hash = value => createHash('sha256').update(value).digest('hex');
export const digest = files => hash(json(Object.fromEntries(Object.entries(files).sort().map(([key, value]) => [key, hash(value)]))));
export function safe(root, relative) {
    if (typeof relative !== 'string' || !relative || relative.includes('\\') || relative.includes('\0') ||
        path.isAbsolute(relative) || relative.split('/').some(part => !part || part === '.' || part === '..' || part.includes(':'))) throw Error('Percorso non valido.');
    return path.join(root, ...relative.split('/'));
}
export function segment(value) {
    if (typeof value !== 'string' || !value || /[\\/:\x00-\x1f]/.test(value) || value.trim() !== value ||
        value.endsWith('.') || value === '.' || value === '..' || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value)) throw Error('Nome cartella non valido.');
    return value;
}
export function buParts(bu) {
    const parts = String(bu || '').split('/');
    if (parts.length !== 2) throw Error('Indica la BU come nome-connessione/nome-BU.');
    return parts.map(segment);
}
export async function readJSON(file) { return JSON.parse(await fs.readFile(file, 'utf8')); }
export async function exists(file) { try { await fs.lstat(file); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } }
export async function checked(root, relative) {
    const file = safe(root, relative);
    let current = root;
    for (const part of relative.split('/')) {
        current = path.join(current, part);
        try { if ((await fs.lstat(current)).isSymbolicLink()) throw Error('Collegamento simbolico nel percorso.'); }
        catch (error) { if (error.code === 'ENOENT') break; throw error; }
    }
    return file;
}
export async function walk(root, prefix = '', budget = { bytes: 0, files: 0 }) {
    if (!await exists(root)) return {};
    if ((await fs.lstat(root)).isSymbolicLink()) throw Error('I collegamenti simbolici non sono ammessi nel progetto.');
    const result = {};
    for (const entry of await fs.readdir(root, { withFileTypes: true })) {
        if (entry.isSymbolicLink()) throw Error('I collegamenti simbolici non sono ammessi nel progetto.');
        const key = prefix + entry.name;
        if (entry.isDirectory()) Object.assign(result, await walk(path.join(root, entry.name), key + '/', budget));
        else if (entry.isFile()) {
            const size = (await fs.stat(path.join(root, entry.name))).size;
            budget.bytes += size; budget.files++;
            if (budget.bytes > 256 * 1024 * 1024 || size > 32 * 1024 * 1024 || budget.files > 100000) throw Error('Progetto troppo grande per una singola operazione: separa le BU o riduci i tipi configurati.');
            result[key] = await fs.readFile(path.join(root, entry.name));
        }
    }
    return result;
}
export async function write(root, relative, value, mode = 0o644) {
    const file = safe(root, relative);
    const parts = relative.split('/'); parts.pop();
    let parent = root;
    if ((await fs.lstat(root)).isSymbolicLink()) throw Error('Cartella del progetto non valida.');
    for (const part of parts) {
        parent = path.join(parent, part);
        await fs.mkdir(parent, { recursive: true });
        if ((await fs.lstat(parent)).isSymbolicLink()) throw Error('Collegamento simbolico nel percorso.');
    }
    if (await exists(file) && (await fs.lstat(file)).isSymbolicLink()) throw Error('File collegato non ammesso.');
    const temporary = file + '.' + randomUUID() + '.tmp';
    await fs.writeFile(temporary, value, { mode });
    await fs.rename(temporary, file);
}
export async function writeTree(root, files) {
    await fs.mkdir(root, { recursive: true });
    for (const [file, data] of Object.entries(files)) await write(root, file, data);
}
export async function lock(root, action) {
    const state = path.join(root, '.sfmcgit-state');
    await fs.mkdir(state, { recursive: true, mode: 0o700 });
    if ((await fs.lstat(state)).isSymbolicLink()) throw Error('Archivio locale non valido.');
    const file = path.join(state, 'lock');
    try { await fs.mkdir(file); } catch (e) { if (e.code === 'EEXIST') throw Error('Un’altra operazione è in corso. Dopo un arresto anomalo verifica i processi prima di rimuovere .sfmcgit-state/lock.'); throw e; }
    try { return await action(); } finally { await fs.rm(file, { recursive: true, force: true }); }
}
