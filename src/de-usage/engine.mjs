import { SOAPReader, validateConfig } from './soap.mjs';
import { buildIndex, report, guid } from './index.mjs';
import { publicError } from './errors.mjs';
export function createEngine(makeReader = config => new SOAPReader(config), analyze) {
    let config, reader, pendingReader, index, job, lastError, generation = 0;
    const reset = () => { generation++; reader?.cancel?.(); pendingReader?.cancel?.(); config = reader = pendingReader = index = job = lastError = null; };
    const start = () => {
        if (job) return;
        const ticket = generation;
        reader.deadline = Date.now() + 10 * 60 * 1000; reader.bytes = 0;
        job = { phase: 'Avvio analisi', current: 0, total: 0 };
        lastError = null;
        void buildIndex(reader, config, (phase, current = 0, total = 0) => { if (ticket !== generation) throw Error('Analisi annullata.'); if (job) Object.assign(job, { phase, current, total }); }, analyze)
            .then(value => { if (ticket === generation) index = value; })
            .catch(error => { if (ticket === generation) lastError = publicError(error); })
            .finally(() => { if (ticket === generation) job = null; });
    };
    return async message => {
        if (message.action === 'clear') { reset(); return true; }
        if (message.action === 'configure') {
            reset(); const ticket = generation;
            const value = validateConfig(message.config), candidate = makeReader(value);
            pendingReader = candidate;
            try { await candidate.authenticate(); } finally { if (pendingReader === candidate) pendingReader = null; }
            if (ticket !== generation) throw Error('Configurazione sostituita: riprova.');
            config = { ...value }; reader = candidate;
            return { mid: String(config.mid), stack: config.stack, authenticated: true };
        }
        if (!config || message.mid !== String(config.mid) || message.stack !== config.stack || message.configVersion !== config.version) return { state: 'not-configured' };
        if (message.action === 'status') return { state: job ? 'building' : lastError ? 'error' : index ? 'ready' : 'empty', progress: job };
        if (message.action === 'refresh') { start(); return { state: 'building', progress: job }; }
        if (message.action !== 'lookup' || !guid(message.deId)) throw Error('Richiesta analisi non valida.');
        const offset = message.offset ?? 0;
        if (!Number.isInteger(offset) || offset < 0 || offset > 100000) throw Error('Pagina non valida.');
        if (index && message.revision && message.revision !== index.generatedAt) throw Error('Indice aggiornato: ripeti la ricerca.');
        if (!index && !job && !lastError) start();
        const result = index ? report(index, message.deId) : null;
        if (result) { result.totalRows = result.rows.length; result.rows = result.rows.slice(offset, offset + 200); }
        return { state: job ? 'building' : lastError ? 'error' : 'ready', progress: job, error: lastError, result };
    };
}
