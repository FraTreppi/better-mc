import { createEngine } from './engine.mjs';
import { publicError } from './errors.mjs';
let worker;
function analyze(sql) {
    if (!worker) worker = new Worker(chrome.runtime.getURL('assets/js/de-usage-sql-worker.js'));
    const active = worker, id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
        const cleanup = () => { clearTimeout(timeout); active.removeEventListener('message', answer); active.removeEventListener('error', failed); };
        const failed = () => { cleanup(); active.terminate(); if (worker === active) worker = null; reject(Error('Analisi SQL interrotta.')); };
        const answer = ({ data }) => { if (data.id !== id) return; cleanup(); data.error ? reject(Error(data.error)) : resolve(data.refs); };
        const timeout = setTimeout(failed, 2500);
        active.addEventListener('message', answer); active.addEventListener('error', failed); active.postMessage({ id, sql });
    });
}
const run = createEngine(undefined, analyze);
chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (!message?.__sfmcfixDEEngine) return;
    if (sender.id !== chrome.runtime.id || sender.tab || sender.url && sender.url !== chrome.runtime.getURL('assets/js/background.js')) return;
    run(message).then(result => respond({ ok: true, result })).catch(error => respond({ ok: false, error: publicError(error) }));
    return true;
});
