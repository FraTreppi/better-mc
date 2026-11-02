import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { json, readJSON, walk, writeTree, buParts, exists } from './files.mjs';
const worker = fileURLToPath(new URL('./worker.mjs', import.meta.url));
export function run(program, args, cwd, inherit = true) {
    return new Promise((resolve, reject) => {
        const child = spawn(program, args, { cwd, shell: false, stdio: inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'] });
        let output = '', error = '';
        if (!inherit) { child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { error += data; }); }
        child.on('error', reject);
        child.on('exit', code => code === 0 ? resolve(output) : reject(Object.assign(Error('Operazione non completata (' + code + '). ' + (inherit ? 'Consulta il messaggio precedente.' : error)), { code, output })));
    });
}
export class McdevProvider {
    constructor(root) { this.root = path.resolve(root); }
    async operation(operation, bu, types, key, files, version) {
        buParts(bu);
        const config = await readJSON(path.join(this.root, '.mcdevrc.json')).catch(() => { throw Error('Collegamento non configurato. Esegui npm run mc -- connect quando avrai il pacchetto Salesforce.'); });
        const auth = path.join(this.root, '.mcdev-auth.json');
        if (!await exists(auth) || (await fs.lstat(auth)).isSymbolicLink()) throw Error('Credenziali locali assenti o non valide. Esegui connect; non inserire credenziali in Git.');
        const job = path.join(this.root, '.sfmcgit-state/jobs', randomUUID());
        await fs.mkdir(job, { recursive: true, mode: 0o700 });
        try {
            config.directories = { businessUnits: 'businessUnits/', deploy: 'deploy/', docs: 'docs/', retrieve: 'retrieve/', template: 'template/', templateBuilds: ['retrieve/', 'deploy/'] };
            config.options = { ...config.options, formatOnSave: false, documentType: 'md' };
            config.metaDataTypes = { ...config.metaDataTypes, documentOnRetrieve: [] };
            await fs.writeFile(path.join(job, '.mcdevrc.json'), json(config), { mode: 0o600 });
            await fs.copyFile(auth, path.join(job, '.mcdev-auth.json'));
            await fs.chmod(path.join(job, '.mcdev-auth.json'), 0o600);
            if (files) await writeTree(path.join(job, 'deploy', ...buParts(bu)), files);
            const request = { operation, bu, types, key, version };
            await fs.writeFile(path.join(job, 'request.json'), json(request), { mode: 0o600 });
            await run(process.execPath, [worker, path.join(job, 'request.json')], job);
            const result = await readJSON(path.join(job, 'result.json'));
            if (!result.ok) throw Error('Salesforce non ha confermato l’operazione.');
            return operation === 'retrieve' ? await walk(path.join(job, 'retrieve', ...buParts(bu))) : result;
        } finally { await fs.rm(job, { recursive: true, force: true }); }
    }
    retrieve(bu, types) { return this.operation('retrieve', bu, types); }
    deploy(bu, type, key, files) { return this.operation('deploy', bu, [type], key, files); }
    validate(bu, key, version) { return this.operation('validate', bu, ['journey'], key, undefined, version); }
    publish(bu, key, version) { return this.operation('publish', bu, ['journey'], key, undefined, version); }
}
