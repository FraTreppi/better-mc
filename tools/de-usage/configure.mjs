import fs from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import readline from 'node:readline/promises';
import { Writable } from 'node:stream';
import { validateConfig } from './soap.mjs';
let muted = false;
const output = new Writable({ write(chunk, encoding, callback) { if (!muted) process.stdout.write(chunk); callback(); } });
output.isTTY = Boolean(process.stdout.isTTY); output.columns = process.stdout.columns || 80;
const rl = readline.createInterface({ input: process.stdin, output, terminal: output.isTTY });
try {
    console.log('Collegamento in sola lettura a una BU. Inserisci qui i dati dell’Installed Package, mai in chat.');
    const mid = (await rl.question('MID della BU: ')).trim();
    const stack = (await rl.question('Stack, per esempio s10: ')).trim().toLowerCase();
    const authUrl = (await rl.question('Authentication Base URI: ')).trim();
    const clientId = (await rl.question('Client ID: ')).trim();
    const secret = rl.question('Client Secret (nascosto): '); muted = true;
    const clientSecret = (await secret).trim(); muted = false; console.log();
    const config = validateConfig({ mid, stack, authUrl, clientId, clientSecret, pairingKey: randomBytes(32).toString('hex') });
    await fs.writeFile(new URL('./config.local.json', import.meta.url), JSON.stringify(config, null, 2), { mode: 0o600 });
    await fs.chmod(new URL('./config.local.json', import.meta.url), 0o600);
    console.log('Configurazione salvata sul PC. Avvia AVVIA.cmd per ottenere il codice di collegamento.');
} catch (_) { muted = false; console.error('Configurazione non salvata: verifica MID, stack e Authentication Base URI.'); process.exitCode = 1; }
finally { rl.close(); }
