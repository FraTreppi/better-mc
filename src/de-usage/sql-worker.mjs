import { sources } from './sql.mjs';
self.onmessage = ({ data }) => {
    try { self.postMessage({ id: data.id, refs: sources(data.sql) }); }
    catch (_) { self.postMessage({ id: data.id, error: 'SQL non analizzabile in modo affidabile.' }); }
};
