#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { Project, TYPES, entries } from '../lib/project.mjs';
import { McdevProvider, run } from '../lib/provider.mjs';
import { json, readJSON, exists, walk, write, writeTree } from '../lib/files.mjs';
import { importBundle } from '../lib/bundle.mjs';
const home = fileURLToPath(new URL('../', import.meta.url));
const [command = 'help', ...args] = process.argv.slice(2);
const options = {}, positional = [];
for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
        if (!['--bu', '--file', '--type', '--key', '--version', '--plan', '--confirm', '--message'].includes(args[i]) || args[i + 1] == null || args[i + 1].startsWith('--')) throw Error('Opzione non riconosciuta: ' + args[i]);
        options[args[i].slice(2)] = args[++i];
    } else positional.push(args[i]);
}
const root = process.cwd();
async function init(target, demo = false) {
    const destination = path.resolve(target || 'marketing-cloud-project');
    if (await exists(destination) && (await fs.readdir(destination)).length) throw Error('Scegli una cartella nuova o vuota per il progetto.');
    await fs.mkdir(destination, { recursive: true });
    await write(destination, 'sfmc-project.json', json({ format: 'sfmc-git-project-v1', types: TYPES, demo, provider: 'mcdev@10.1.1' }));
    await write(destination, '.gitignore', ['node_modules/', '.mcdev-auth.json', '.sfmcgit-state/', 'logs/', 'deploy/', '.env', '.env.*', '!.env.example', '*.log', ''].join('\n'));
    await write(destination, '.gitattributes', '* text=auto eol=lf\n');
    await write(destination, 'package.json', json({ name: 'marketing-cloud-project', version: '1.0.0', private: true, type: 'module', engines: { node: '>=24.15.0' }, scripts: { mc: 'node .sfmcgit-tool/bin/mc-project.mjs' }, dependencies: { mcdev: '10.1.1' } }));
    if (await exists(path.join(home, 'package-lock.json'))) {
        const pinned = await readJSON(path.join(home, 'package-lock.json'));
        pinned.name = 'marketing-cloud-project'; pinned.packages[''].name = 'marketing-cloud-project';
        await write(destination, 'package-lock.json', json(pinned));
    }
    await writeTree(path.join(destination, '.sfmcgit-tool'), {
        ...Object.fromEntries(Object.entries(await walk(path.join(home, 'lib'))).map(([file, value]) => ['lib/' + file, value])),
        'bin/mc-project.mjs': await fs.readFile(fileURLToPath(import.meta.url))
    });
    const tasks = [
        ['MC: collega Salesforce', ['connect']],
        ['MC: inventario', ['list', '--bu', '${input:bu}']],
        ['MC: backup e sincronizzazione', ['pull', '--bu', '${input:bu}']],
        ['MC: documentazione', ['docs', '--bu', '${input:bu}']],
        ['MC: prepara invio', ['plan', '--bu', '${input:bu}', '--file', '${input:file}']],
        ['MC: confronto del piano', ['diff']],
        ['MC: invia modifica revisionata', ['apply', '--plan', '${input:plan}']],
        ['MC: importa esportazione browser', ['import', '${input:export}']],
        ['MC: valida e attiva Journey', ['publish-journey', '--plan', '${input:plan}', '--confirm', '${input:activation}']]
    ].map(([label, extra]) => ({ label, type: 'process', command: 'node', args: ['.sfmcgit-tool/bin/mc-project.mjs', ...extra], problemMatcher: [], presentation: { reveal: 'always', panel: 'shared' } }));
    await write(destination, '.vscode/tasks.json', json({ version: '2.0.0', tasks, inputs: [
        { id: 'bu', type: 'promptString', description: 'Connessione/BU (nome presente in .mcdevrc.json)', default: demo ? 'demo/BU-demo' : '' },
        { id: 'file', type: 'promptString', description: 'Percorso dell’elemento mostrato da list (relativo alla BU)' },
        { id: 'plan', type: 'promptString', description: 'ID del piano revisionato, mostrato da plan' },
        { id: 'export', type: 'promptString', description: 'Percorso del file JSON esportato dal browser' },
        { id: 'activation', type: 'promptString', description: 'Attivazione di un Journey reale: conferma MID/CustomerKey/Versione' }
    ] }));
    await write(destination, 'README.md', `# Progetto Marketing Cloud\n\nRepository privato per codice e definizioni. Apri questa cartella in VS Code o nel tuo editor.\n\n1. Installa Node.js 24 e Git.\n2. Esegui npm install.\n3. Quando l’amministratore avrà creato l’integrazione, esegui npm run mc -- connect. Le credenziali rimangono nel file locale escluso da Git.\n4. Esegui npm run mc -- pull --bu Connessione/BU.\n5. Modifica i file sotto retrieve; usa Git per confronto, branch e commit.\n6. Crea un piano con npm run mc -- plan --bu Connessione/BU --file percorso-meta.json, consulta docs/INVIO.md e npm run mc -- diff.\n7. Invia solo quel piano con npm run mc -- apply --plan ID.\n\nI task MC sono disponibili da Terminale → Esegui attività in VS Code. Gli snapshot importati dal browser sono in browser, separati dai file distribuibili mcdev di retrieve.\n\nCloudPages: backup e aggiornamento del contenuto esistente; creazione e Publish nell’interfaccia Salesforce. Email: salvataggio del contenuto, poi Preview and Test in MC. I blocchi riutilizzati possono influire sui contenuti che li richiamano a runtime. Query e script: salvataggio della definizione, senza esecuzione. Journey: modifica di Draft, validazione e attivazione con comando separato publish-journey. Automation: backup e documentazione; pianificazione e avvio rimangono in MC.\n\nUsa un repository GitHub privato. Prima di un commit esamina sempre il diff, anche per eventuali segreti scritti dentro al codice. Non aggiungere .mcdev-auth.json, .env o .sfmcgit-state. Non vengono estratti i record delle DE.\n\nIl motore Salesforce è [SFMC DevTools](https://github.com/Accenture/sfmc-devtools) (MIT), versione fissata a 10.1.1.\n`);
    try { await run('git', ['init', '--initial-branch=main'], destination, false); } catch (_) { console.log('Progetto creato. Installa Git ed esegui git init per attivare lo storico.'); }
    if (demo) {
        await write(destination, 'README.md', '# MC Code Project — demo offline\n\nApri questa cartella in VS Code o nel tuo editor. Tutti i contenuti sono fittizi.\n\n- retrieve/demo/BU-demo contiene email, template, CloudPage, query e Journey.\n- docs/demo/BU-demo contiene inventario, dipendenze e diagramma Journey.\n- Modifica HTML e SQL, poi confronta i file con Git. Per iniziare lo storico della demo ZIP scegli Inizializza repository in Source Control oppure git init.\n- Per usare inventario e documentazione installa Node.js 24.15+; non servono npm install o credenziali.\n- I task sono in Terminale → Esegui attività: usa demo/BU-demo per la BU.\n\nLa demo blocca collegamento, pull, invio e attivazione Salesforce. Per un progetto reale scarica lo strumento locale e usa init, mantenendo questa demo separata.\n\n[Guida e strumento locale](https://github.com/FraTreppi/better-mc/tree/main/tools/mc-project)\n\nUsa un repository GitHub privato per i contenuti reali del team. Nessun file viene caricato automaticamente su GitHub o Salesforce.\n');
        await write(destination, '.mcdevrc.json', json({ credentials: { demo: { eid: 123, businessUnits: { 'BU-demo': 123 } } } }));
        const files = {
            'query/esempio.query-meta.json': Buffer.from(json({ key: 'esempio', name: 'Query demo', targetKey: 'DE-demo', targetUpdateTypeName: 'Overwrite' })),
            'query/esempio.query-meta.sql': Buffer.from('-- Esempio fittizio: nessuna query viene eseguita dalla demo\nSELECT SubscriberKey, EmailAddress\nFROM [DE-demo]\nWHERE IsActive = 1\n'),
            'asset/email/email-demo/email-demo.asset-email-meta.json': Buffer.from(json({ customerKey: 'email-demo', name: 'Email demo', assetType: { name: 'htmlemail' } })),
            'asset/email/email-demo/email-demo.asset-email-meta.html': Buffer.from('%%[\nVAR @firstName\nSET @firstName = AttributeValue("FirstName")\nIF Empty(@firstName) THEN SET @firstName = "amico" ENDIF\n]%%\n<!doctype html>\n<html lang="it"><body>\n<h1>Ciao %%=v(@firstName)=%%</h1>\n<p>Questa email dimostra il sorgente modificabile e versionabile con Git.</p>\n<a href="https://example.com">Scopri la collezione demo</a>\n</body></html>\n'),
            'asset/template/template-demo/template-demo.asset-template-meta.json': Buffer.from(json({ customerKey: 'template-demo', name: 'Template demo', assetType: { name: 'template' } })),
            'asset/template/template-demo/template-demo.asset-template-meta.html': Buffer.from('<!doctype html>\n<html lang="it"><head><meta charset="utf-8"><title>Template demo</title></head>\n<body style="margin:0;background:#f4f6f9">\n<table role="presentation" width="600" align="center" style="background:white"><tr><td>\n<header><h1>Il tuo brand</h1></header>\n<main><div data-type="slot" data-key="hero"></div><div data-type="slot" data-key="body"></div></main>\n<footer><p>Template fittizio: lo storico delle modifiche comincia nel repository.</p></footer>\n</td></tr></table></body></html>\n'),
            'asset/webstudio/pagina-demo/pagina-demo.asset-webstudio-meta.json': Buffer.from(json({ customerKey: 'pagina-demo', name: 'CloudPage demo', assetType: { name: 'webpage' } })),
            'asset/webstudio/pagina-demo/pagina-demo.asset-webstudio-meta.html': Buffer.from('<!doctype html>\n<html lang="it"><head><meta charset="utf-8"><title>CloudPage demo</title>\n<style>body{font:18px system-ui;max-width:720px;margin:64px auto;padding:24px}h1{color:#145b92}</style>\n</head><body><h1>CloudPage demo</h1>\n<p>Modifica questo sorgente nell’editor. La demo non si collega a Marketing Cloud.</p>\n<p>Nel progetto reale, dopo il salvataggio del contenuto, Preview e Publish si fanno in Salesforce.</p>\n</body></html>\n'),
            'journey/journey-demo.journey-meta.json': Buffer.from(json({ key: 'journey-demo', name: 'Journey demo', version: 1, status: 'Draft',
                triggers: [{ key: 'entry-demo', name: 'Ingresso contatti demo', type: 'APIEvent', outcomes: [{ next: 'email-demo' }] }],
                activities: [{ key: 'email-demo', name: 'Email di benvenuto', type: 'EMAILV2', outcomes: [{ next: 'wait-demo' }], configurationArguments: { assetId: 1001 } },
                    { key: 'wait-demo', name: 'Attesa di 1 giorno', type: 'WAIT', outcomes: [{ next: 'exit-demo' }] },
                    { key: 'exit-demo', name: 'Fine percorso', type: 'EXIT', outcomes: [] }] }))
        };
        await writeTree(path.join(destination, 'retrieve/demo/BU-demo'), files);
        await writeTree(path.join(destination, '.sfmcgit-state/baseline/demo/BU-demo'), files);
        const example = new Project(destination);
        await example.record('demo/BU-demo', '123', files);
        await example.document('demo/BU-demo');
    }
    return { project: destination, demo, next: demo ? 'Apri la cartella e modifica i sorgenti demo; nessuna connessione Salesforce è stata creata.' : 'npm install, poi npm run mc -- connect quando avrai l’integrazione Salesforce.' };
}
const project = new Project(root, new McdevProvider(root));
async function gitCheck() {
    const names = (await run('git', ['ls-files', '-z', '--cached'], root, false)).split('\0');
    if (names.some(name => /(^|\/)(?:\.mcdev-auth\.json|\.env(?:\..*)?|\.sfmcgit-state)(?:\/|$)/.test(name) && !name.endsWith('.env.example'))) throw Error('Un file privato risulta già aggiunto a Git. Rimuovilo dall’indice prima di creare il commit.');
}
async function main() {
    if (command === 'help') return console.log(`MC Code Project\n\ninit CARTELLA          crea progetto e task VS Code\ndemo CARTELLA          esempio completo offline, senza credenziali\nconnect                configurazione guidata Salesforce (locale)\npull --bu ALIAS/BU     backup con confronto a tre versioni\nlist --bu ALIAS/BU     inventario e percorsi dei sorgenti\ndocs --bu ALIAS/BU     documentazione Markdown e dipendenze\nimport FILE.json       importa Esporta per Git dal browser\nplan --bu ALIAS/BU --file PERCORSO   prepara un singolo invio\ndiff                   mostra differenze del piano\napply --plan ID        ricontrolla e salva la modifica revisionata\npublish-journey --plan ID --confirm MID/KEY/VERSION   valida e attiva il Journey\ncheckpoint --message TESTO   commit locale dei file revisionati\n\nCloudPages Publish e invio email rimangono nell’interfaccia MC. Nessun server o credenziale è necessario per demo/import.`);
    if (command === 'init' || command === 'demo') return init(positional[0], command === 'demo');
    const config = await project.config();
    if (config.demo && ['connect', 'pull', 'plan', 'apply', 'publish-journey'].includes(command)) throw Error('Questo progetto è una demo offline. Crea un progetto init per collegarti a Salesforce.');
    if (command === 'connect') {
        await gitCheck().catch(error => { if (error.code !== 128) throw error; });
        const require = createRequire(path.join(root, 'package.json'));
        let cli;
        try { cli = path.join(path.dirname(require.resolve('mcdev')), 'cli.js'); } catch (_) { throw Error('Esegui npm install nella cartella del progetto.'); }
        await run(process.execPath, [cli, 'init'], root);
        if (await exists(path.join(root, '.mcdev-auth.json'))) await fs.chmod(path.join(root, '.mcdev-auth.json'), 0o600);
        const ignore = path.join(root, '.gitignore');
        const rules = await fs.readFile(ignore, 'utf8').catch(() => '');
        await fs.writeFile(ignore, rules + '\n# MC Code Project private state\n.mcdev-auth.json\n.sfmcgit-state/\nnode_modules/\n.env\n.env.*\n!.env.example\nlogs/\n');
        const packageJSON = await readJSON(path.join(root, 'package.json'));
        packageJSON.private = true;
        packageJSON.scripts = { ...packageJSON.scripts, mc: 'node .sfmcgit-tool/bin/mc-project.mjs' };
        await write(root, 'package.json', json(packageJSON));
        return { connected: true, next: 'Leggi i nomi connessione e BU in .mcdevrc.json, poi esegui pull.' };
    }
    if (command === 'pull') return project.pull(options.bu);
    if (command === 'docs') return project.document(options.bu);
    if (command === 'list') return entries(await project.tree(options.bu), options.bu).map(({ name, type, key, file, version }) => ({ name, type, key, file, version }));
    if (command === 'import') {
        const file = path.resolve(positional[0] || '');
        if ((await fs.stat(file)).size > 25 * 1024 * 1024) throw Error('Il file supera 25 MB.');
        return importBundle(root, await readJSON(file));
    }
    if (command === 'plan') return project.plan(options.bu, options);
    if (command === 'apply') return project.apply(options.plan);
    if (command === 'publish-journey') return project.publishJourney(options.plan, options.confirm);
    if (command === 'diff') {
        const base = path.join(root, '.sfmcgit-state/review/base'), local = path.join(root, '.sfmcgit-state/review/local');
        try { console.log(await run('git', ['diff', '--no-index', '--', base, local], root, false)); }
        catch (error) { if (error.code !== 1) throw error; console.log(error.output); }
        return;
    }
    if (command === 'checkpoint') {
        if (!options.message?.trim()) throw Error('Indica --message con una descrizione delle modifiche.');
        await gitCheck();
        for (const name of ['retrieve', 'browser', 'docs', 'sfmc-project.json', 'sfmc-baselines.json', '.mcdevrc.json', 'package.json', 'package-lock.json', '.gitignore', '.gitattributes', '.vscode', '.sfmcgit-tool', 'README.md']) {
            if (await exists(path.join(root, name))) await run('git', ['add', '--', name], root, false);
        }
        await gitCheck();
        await run('git', ['commit', '-m', options.message], root);
        return { saved: true, next: 'Pubblica il commit nel repository GitHub privato da VS Code o con git push.' };
    }
    throw Error('Comando non riconosciuto. Usa help.');
}
main().then(result => { if (result !== undefined) console.log(json(result)); }).catch(error => { console.error('MC Code Project: ' + error.message); process.exitCode = 1; });
