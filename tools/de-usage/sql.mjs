import parserModule from 'node-sql-parser';
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
const parser = new parserModule.Parser();
export function sources(sql) {
    if (typeof sql !== 'string' || !sql.trim() || Buffer.byteLength(sql) > 500000) throw Error('SQL assente o oltre 500 KB.');
    const refs = new Map();
    function walk(value, inherited = new Set(), depth = 0) {
        if (depth > 70) throw Error('SQL troppo annidato.');
        if (!value || typeof value !== 'object') return;
        if (Array.isArray(value)) { for (const item of value) walk(item, inherited, depth + 1); return; }
        let scope = inherited;
        if (value.type === 'select') {
            scope = new Set(inherited);
            for (const cte of value.with || []) scope.add(String(cte.name?.value || cte.name).toLowerCase());
            for (const table of value.from || []) {
                if (typeof table.table === 'string') {
                    const schema = table.db || table.schema || '';
                    if (!schema && scope.has(table.table.toLowerCase())) continue;
                    refs.set(JSON.stringify([schema, table.table]), { schema, name: table.table });
                } else if (!table.expr) throw Error('Sorgente SQL non statica.');
            }
        } else if (value.type && ['update', 'delete', 'insert', 'exec', 'call', 'create', 'drop'].includes(value.type)) throw Error('Il testo non è una sola lettura SELECT.');
        for (const [key, child] of Object.entries(value)) if (!['tableList', 'columnList', 'name'].includes(key)) walk(child, scope, depth + 1);
    }
    const ast = parser.astify(sql, { database: 'TransactSQL' });
    const statements = Array.isArray(ast) ? ast : [ast];
    if (!statements.length || statements.some(statement => statement?.type !== 'select')) throw Error('Sono ammesse solo definizioni SELECT statiche.');
    walk(ast);
    return [...refs.values()];
}
if (!isMainThread) parentPort.on('message', ({ id, sql }) => {
    try { parentPort.postMessage({ id, refs: sources(sql) }); }
    catch (_) { parentPort.postMessage({ id, error: 'SQL non analizzabile in modo affidabile.' }); }
});
export class SQLReader {
    async analyze(sql) {
        if (!this.worker) this.worker = new Worker(new URL(import.meta.url));
        const worker = this.worker, id = crypto.randomUUID();
        return new Promise((resolve, reject) => {
            const cleanup = () => { clearTimeout(timer); worker.off('message', message); worker.off('error', failed); };
            const failed = () => { cleanup(); this.worker = null; void worker.terminate(); reject(Error('Analisi SQL interrotta.')); };
            const message = value => { if (value.id !== id) return; cleanup(); value.error ? reject(Error(value.error)) : resolve(value.refs); };
            const timer = setTimeout(failed, 2500);
            worker.on('message', message); worker.on('error', failed); worker.postMessage({ id, sql });
        });
    }
    async close() { if (this.worker) await this.worker.terminate(); this.worker = null; }
}
