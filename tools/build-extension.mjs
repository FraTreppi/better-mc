import { build } from 'esbuild';
import fs from 'node:fs/promises';
const common = { bundle: true, platform: 'browser', target: 'chrome116', format: 'iife', minify: true, legalComments: 'eof' };
await build({ ...common, entryPoints: ['src/de-usage/offscreen.mjs'], outfile: 'assets/js/de-usage-offscreen.js' });
await build({ ...common, entryPoints: ['src/de-usage/sql-worker.mjs'], outfile: 'assets/js/de-usage-sql-worker.js' });
const licenses = [];
for (const name of ['fast-xml-parser', 'node-sql-parser', '@nodable/entities', 'fast-xml-builder', 'is-unsafe', 'path-expression-matcher', 'strnum', 'xml-naming', 'anynum', 'big-integer']) {
    try { const pkg = JSON.parse(await fs.readFile('node_modules/' + name + '/package.json', 'utf8'));
        const files = await fs.readdir('node_modules/' + name); const file = files.find(n => /^licen[sc]e(?:\.|$)/i.test(n));
        licenses.push(name + ' ' + pkg.version + '\n' + (file ? await fs.readFile('node_modules/' + name + '/' + file, 'utf8') : String(pkg.license)));
    } catch (_) { /* Not part of this pinned dependency graph. */ }
}
await fs.writeFile('assets/THIRD_PARTY_LICENSES.txt', licenses.join('\n\n--------------------\n\n').replace(/\r\n/g, '\n'));
