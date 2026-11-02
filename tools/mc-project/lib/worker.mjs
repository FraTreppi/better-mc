// Separate process: mcdev uses process.cwd() and process-wide metadata caches.
import fs from 'node:fs/promises';
import path from 'node:path';
import Mcdev from 'mcdev';
import { Util } from 'mcdev/util/util';
import MetadataTypeInfo from 'mcdev/MetadataTypeInfo';
const request = JSON.parse(await fs.readFile(process.argv[2], 'utf8'));
let errors = 0;
const start = Util.startLogger;
const wrapped = new WeakSet();
Util.startLogger = function (...args) {
    start.apply(Util, args);
    if (wrapped.has(Util.logger)) return;
    wrapped.add(Util.logger);
    for (const method of ['error', 'errorStack', 'warn']) {
        const original = Util.logger[method];
        Util.logger[method] = function (...values) {
            if (method !== 'warn' || /\b(?:skipping|could not|failed|not found|missing|error)\b/i.test(values.join(' '))) errors++;
            return original.apply(this, values);
        };
    }
};
Mcdev.setOptions({ format: false, noLogFile: true });
Mcdev.setSkipInteraction({});
// Temporary Query Studio activities are still SQL code: include them in backups.
MetadataTypeInfo.query.definition.filter = {};
if (!['retrieve', 'deploy', 'validate', 'publish'].includes(request.operation)) throw Error('Operazione non consentita.');
const keys = request.key ? [request.version && ['validate', 'publish'].includes(request.operation) ? `${request.key}/${request.version}` : request.key] : undefined;
const result = await Mcdev[request.operation](request.bu, request.types, keys);
if (result == null || errors) throw Error('SFMC DevTools ha segnalato un errore: verifica permessi e risultato prima di riprovare.');
if (request.operation !== 'retrieve') {
    const affected = result[request.bu];
    const base = request.types[0].split('-')[0];
    const values = affected?.[base] || affected?.[request.types[0]];
    const requestedKey = request.key;
    const present = Array.isArray(values) ? values.some(key => key === requestedKey || key === keys?.[0]) : values && Object.hasOwn(values, requestedKey);
    if (!present) throw Error('La risposta non conferma l’elemento richiesto. L’operazione potrebbe essere parziale: verifica MC.');
}
await fs.writeFile(path.join(process.cwd(), 'result.json'), JSON.stringify({ ok: true }), { mode: 0o600 });
