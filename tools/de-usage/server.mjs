import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual } from 'node:crypto';
import { SOAPReader, validateConfig } from './soap.mjs';
import { buildIndex, report, guid } from './index.mjs';
export const PORT = 17638;
export function createService(config, makeReader = () => new SOAPReader(config)) {
    validateConfig(config);
    let index, job, lastError;
    const start = () => {
        if (job) return;
        job = { phase: 'Avvio analisi', current: 0, total: 0, startedAt: new Date().toISOString() }; lastError = null;
        void buildIndex(makeReader(), config, (phase, current = 0, total = 0) => { if (job) Object.assign(job, { phase, current, total }); })
            .then(value => { index = value; }).catch(error => { lastError = error.message; }).finally(() => { job = null; });
    };
    const server = http.createServer(async (req, res) => {
        res.setHeader('Content-Type', 'application/json;charset=utf-8'); res.setHeader('Cache-Control', 'no-store');
        const send = (code, value) => { res.writeHead(code); res.end(JSON.stringify(value)); };
        try {
            if (req.headers.host !== '127.0.0.1:' + PORT) return send(403, { error: 'Host non consentito.' });
            const origin = req.headers.origin;
            if (origin && !/^chrome-extension:\/\/[a-p]{32}$/.test(origin)) return send(403, { error: 'Origine non consentita.' });
            if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
            if (req.method === 'OPTIONS') {
                res.setHeader('Access-Control-Allow-Headers', 'Authorization'); res.setHeader('Access-Control-Allow-Methods', 'GET, POST'); return send(200, {});
            }
            const supplied = Buffer.from(String(req.headers.authorization || '').replace(/^Bearer /, ''));
            const expected = Buffer.from(config.pairingKey);
            if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return send(401, { error: 'Codice di collegamento non valido.' });
            const url = new URL(req.url, 'http://127.0.0.1:' + PORT);
            if (url.searchParams.get('mid') !== String(config.mid) || url.searchParams.get('stack') !== config.stack) return send(409, { error: 'Il collegamento è configurato per una BU diversa.' });
            if (req.method === 'POST' && url.pathname === '/v1/refresh') { start(); return send(202, { state: 'building', progress: job }); }
            if (req.method !== 'GET') return send(405, { error: 'Metodo non consentito.' });
            if (url.pathname === '/v1/status') return send(200, { mid: String(config.mid), stack: config.stack, state: job ? 'building' : lastError ? 'error' : index ? 'ready' : 'empty', progress: job, error: lastError, generatedAt: index?.generatedAt });
            const id = url.pathname.match(/^\/v1\/de\/([a-f0-9-]{36})$/i)?.[1];
            if (!guid(id)) return send(404, { error: 'Risorsa non disponibile.' });
            const offset = Number(url.searchParams.get('offset') || 0);
            if (!Number.isInteger(offset) || offset < 0 || offset > 100000) return send(400, { error: 'Pagina non valida.' });
            if (index && url.searchParams.has('revision') && url.searchParams.get('revision') !== index.generatedAt) return send(409, { error: 'Indice aggiornato: ripeti la ricerca.' });
            if (!index && !job && !lastError) start();
            const result = index ? report(index, id) : null;
            if (result) { result.totalRows = result.rows.length; result.rows = result.rows.slice(offset, offset + 200); }
            return send(200, { state: job ? 'building' : lastError ? 'error' : 'ready', progress: job, error: lastError, result });
        } catch (_) { return send(500, { error: 'Operazione non completata. Verifica configurazione e permessi.' }); }
    });
    server.headersTimeout = 10000; server.requestTimeout = 30000;
    return server;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        const file = new URL('./config.local.json', import.meta.url);
        const config = validateConfig(JSON.parse(await fs.readFile(file, 'utf8')));
        const server = createService(config);
        server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? 'Il componente è già avviato oppure la porta 17638 è occupata.' : 'Avvio del componente non riuscito.'); process.exitCode = 1; });
        server.listen(PORT, '127.0.0.1', () => {
            console.log('Analisi DE avviata per BU ' + config.mid + ' · ' + config.stack + '. Mantieni aperta questa finestra.');
            console.log('Nelle impostazioni Analisi DE dell’estensione inserisci il codice di collegamento:');
            console.log(config.stack + ':' + config.mid + ':' + config.pairingKey);
        });
    } catch (_) { console.error('Configurazione locale assente o non valida. Esegui CONFIGURA.cmd.'); process.exitCode = 1; }
}
