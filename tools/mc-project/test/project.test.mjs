import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Project, merge, entries, verifySaved } from '../lib/project.mjs';
import { json, writeTree, write, walk, lock } from '../lib/files.mjs';
import { importBundle, parseBundle } from '../lib/bundle.mjs';
import { run } from '../lib/provider.mjs';
const bu = 'test/BU';
const query = sql => ({
    'query/demo.query-meta.json': Buffer.from(json({ key: 'demo', name: 'Query demo', targetKey: 'Target' })),
    'query/demo.query-meta.sql': Buffer.from(sql)
});
async function fixture(t, files = query('SELECT 1')) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sfmc-project-test-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    await write(root, 'sfmc-project.json', json({ format: 'sfmc-git-project-v1', types: ['query', 'journey'] }));
    await write(root, '.mcdevrc.json', json({ credentials: { test: { businessUnits: { BU: 123 } } } }));
    await writeTree(path.join(root, 'retrieve', bu), files);
    await writeTree(path.join(root, '.sfmcgit-state/baseline', bu), files);
    const provider = {
        remote: structuredClone(files), writes: [], publications: [], validations: [], ignoreWrite: false,
        async retrieve() { return Object.fromEntries(Object.entries(this.remote).map(([key, bytes]) => [key, Buffer.from(bytes)])); },
        async deploy(unit, type, key, body) { this.writes.push({ unit, type, key }); if (!this.ignoreWrite) this.remote = body; },
        async validate(...args) { this.validations.push(args); },
        async publish(...args) { this.publications.push(args); }
    };
    return { root, provider, project: new Project(root, provider) };
}
test('three-way merge preserves local edits and detects remote edits/deletions without choosing a side', () => {
    const b = text => Buffer.from(text);
    const merged = merge({ a: b('base'), b: b('base') }, { a: b('local'), b: b('base') }, { a: b('base'), b: b('remote') });
    assert.deepEqual(merged.conflicts, []); assert.equal(merged.files.a.toString(), 'local'); assert.equal(merged.files.b.toString(), 'remote');
    assert.deepEqual(merge({ a: b('base') }, { a: b('local') }, { a: b('remote') }).conflicts, ['a']);
    assert.deepEqual(merge({ a: b('base') }, { a: b('local') }, {}).conflicts, ['a']);
});
test('pull conflicts preserve all working files, keep the baseline, and save the remote comparison locally', async t => {
    const f = await fixture(t);
    await writeTree(path.join(f.root, 'retrieve', bu), query('SELECT local'));
    f.provider.remote = query('SELECT remote');
    await assert.rejects(f.project.pull(bu), /Conflitti/);
    assert.equal((await f.project.tree(bu))['query/demo.query-meta.sql'].toString(), 'SELECT local');
    assert.equal((await f.project.tree(bu, true))['query/demo.query-meta.sql'].toString(), 'SELECT 1');
    assert.equal((await walk(path.join(f.root, '.sfmcgit-state/conflicts', bu)))['query/demo.query-meta.sql'].toString(), 'SELECT remote');
    assert.deepEqual(f.provider.writes, []);
});
test('plan is read-only; apply checks the exact files/MID/remote, saves one item, verifies it and cannot replay', async t => {
    const f = await fixture(t);
    await writeTree(path.join(f.root, 'retrieve', bu), query('SELECT 2'));
    const plan = await f.project.plan(bu, { type: 'query', key: 'demo' });
    assert.deepEqual(f.provider.writes, []);
    const saved = await f.project.apply(plan.id);
    assert.equal(saved.state, 'saved'); assert.equal(saved.publication, 'not-requested');
    assert.deepEqual(f.provider.writes, [{ unit: bu, type: 'query', key: 'demo' }]);
    assert.equal((await f.project.tree(bu, true))['query/demo.query-meta.sql'].toString(), 'SELECT 2');
    assert.equal((await walk(path.join(f.root, '.sfmcgit-state/backups', plan.id)))['query/demo.query-meta.sql'].toString(), 'SELECT 1');
    await assert.rejects(f.project.apply(plan.id), /già utilizzato/);
    assert.deepEqual(f.provider.publications, []);
});
for (const mode of ['local', 'remote', 'mid', 'expiry']) test('apply refuses ' + mode + ' changes after the plan with no write', async t => {
    const f = await fixture(t);
    await writeTree(path.join(f.root, 'retrieve', bu), query('SELECT 2'));
    const plan = await f.project.plan(bu, { type: 'query', key: 'demo' });
    if (mode === 'local') await writeTree(path.join(f.root, 'retrieve', bu), query('SELECT 3'));
    if (mode === 'remote') f.provider.remote = query('SELECT 4');
    if (mode === 'mid') await write(f.root, '.mcdevrc.json', json({ credentials: { test: { businessUnits: { BU: 999 } } } }));
    if (mode === 'expiry') await write(f.root, '.sfmcgit-state/plan.json', json({ ...plan, created: '2000-01-01T00:00:00Z' }));
    await assert.rejects(f.project.apply(plan.id)); assert.deepEqual(f.provider.writes, []);
});
test('an unconfirmed API write remains consumed and cannot be reported as saved or published', async t => {
    const f = await fixture(t); f.provider.ignoreWrite = true;
    await writeTree(path.join(f.root, 'retrieve', bu), query('SELECT 2'));
    const plan = await f.project.plan(bu, { type: 'query', key: 'demo' });
    await assert.rejects(f.project.apply(plan.id), /non ha confermato/);
    await assert.rejects(f.project.apply(plan.id), /già utilizzato/);
    assert.equal(f.provider.writes.length, 1); assert.deepEqual(f.provider.publications, []);
});
test('an edited Customer Key cannot turn an update into an unreviewed creation', async t => {
    const f = await fixture(t);
    await write(f.root, 'retrieve/test/BU/query/demo.query-meta.json', json({ key: 'new-key', name: 'Query demo', targetKey: 'Target' }));
    await assert.rejects(f.project.plan(bu, { file: 'query/demo.query-meta.json' }), /Identità/);
    assert.deepEqual(f.provider.writes, []);
});
test('a Git clone uses tracked backup hashes, preserves edits and keeps other component baselines after apply', async t => {
    const second = { 'query/other.query-meta.json': Buffer.from(json({ key: 'other', name: 'Other' })), 'query/other.query-meta.sql': Buffer.from('SELECT other') };
    const f = await fixture(t, { ...query('SELECT 1'), ...second });
    await f.project.record(bu, '123', f.provider.remote);
    await fs.rm(path.join(f.root, '.sfmcgit-state'), { recursive: true });
    await writeTree(path.join(f.root, 'retrieve', bu), query('SELECT 2'));
    const plan = await f.project.plan(bu, { type: 'query', key: 'demo' });
    const deploy = f.provider.deploy.bind(f.provider);
    f.provider.deploy = async (...args) => { await deploy(...args); f.provider.remote = { ...f.provider.remote, ...second }; };
    await f.project.apply(plan.id);
    await writeTree(path.join(f.root, 'retrieve', bu), { ...second, 'query/other.query-meta.sql': Buffer.from('SELECT changed') });
    await f.project.pull(bu);
    assert.equal((await f.project.tree(bu))['query/other.query-meta.sql'].toString(), 'SELECT changed');
    const otherPlan = await f.project.plan(bu, { type: 'query', key: 'other' });
    assert.equal(otherPlan.key, 'other');
});
test('tracked backup MID binding rejects reuse of a BU alias for another MID', async t => {
    const f = await fixture(t); await f.project.record(bu, '123', f.provider.remote);
    await write(f.root, '.mcdevrc.json', json({ credentials: { test: { businessUnits: { BU: 456 } } } }));
    await assert.rejects(f.project.pull(bu), /MID.*cambiato/);
    await assert.rejects(f.project.plan(bu, { type: 'query', key: 'demo' }), /MID.*cambiato/);
    assert.deepEqual(f.provider.writes, []);
});
test('Journey activation is separate, requires the exact draft/version confirmation, and validates first', async t => {
    const file = 'journey/demo.journey-meta.json';
    const draft = { key: 'demo', name: 'Demo', status: 'Draft', version: 1, activities: [] };
    const f = await fixture(t, { [file]: Buffer.from(json(draft)) });
    await writeTree(path.join(f.root, 'retrieve', bu), { [file]: Buffer.from(json({ ...draft, description: 'Reviewed' })) });
    const plan = await f.project.plan(bu, { file }); await f.project.apply(plan.id);
    assert.deepEqual(f.provider.publications, []);
    await assert.rejects(f.project.publishJourney(plan.id, '999/demo/1'));
    await f.project.publishJourney(plan.id, '123/demo/1');
    assert.deepEqual(f.provider.validations, [[bu, 'demo', 1]]); assert.deepEqual(f.provider.publications, [[bu, 'demo', 1]]);
    await assert.rejects(f.project.publishJourney(plan.id, '123/demo/1'));
});
test('browser imports keep native layout and exact source, update stable paths, and protect local edits', async t => {
    const f = await fixture(t);
    const bundle = text => ({ format: 'sfmc-git-export-v1', context: { stack: 's50', mid: '123' }, items: [
        { kind: 'asset', id: '../../unsafe', data: { name: 'Template', views: { html: { content: text, slots: { nested: { content: '<p>Nested</p>' } } } } } }
    ] });
    const first = bundle('<html>One %%FirstName%%</html>'); await importBundle(f.root, first);
    let files = await walk(path.join(f.root, 'browser'));
    const source = Object.keys(files).find(file => file.includes('views__html__content'));
    assert.ok(source); assert.equal(files[source].toString(), '<html>One %%FirstName%%</html>');
    assert.ok(Object.keys(files).some(file => file.endsWith('original.json')));
    await importBundle(f.root, bundle('<html>Two</html>'));
    files = await walk(path.join(f.root, 'browser')); assert.equal(files[source].toString(), '<html>Two</html>');
    await write(path.join(f.root, 'browser'), source, '<html>Local</html>');
    await assert.rejects(importBundle(f.root, bundle('<html>Remote</html>')), /conflitto/);
    assert.equal((await walk(path.join(f.root, 'browser')))[source].toString(), '<html>Local</html>');
    assert.throws(() => parseBundle({ ...first, context: { stack: 's50', mid: '../123' } }));
});
test('file traversal, symlink files and concurrent operations are rejected', async t => {
    const f = await fixture(t);
    await assert.rejects(write(f.root, '../outside', 'bad'));
    await fs.symlink(path.join(f.root, '.mcdevrc.json'), path.join(f.root, 'retrieve', ...bu.split('/'), 'linked.json'));
    await assert.rejects(f.project.tree(bu), /simbolici/);
    await lock(f.root, async () => { await assert.rejects(lock(f.root, async () => {}), /in corso/); });
});
test('demo and copied VS Code project run offline without npm install or Salesforce credentials', async t => {
    const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'sfmc-cli-')); t.after(() => fs.rm(folder, { recursive: true, force: true }));
    const cli = fileURLToPath(new URL('../bin/mc-project.mjs', import.meta.url));
    const output = path.join(folder, 'demo');
    await run(process.execPath, [cli, 'demo', output], folder, false);
    const copied = path.join(output, '.sfmcgit-tool/bin/mc-project.mjs');
    const listed = JSON.parse(await run(process.execPath, [copied, 'list', '--bu', 'demo/BU-demo'], output, false));
    assert.equal(listed.length, 5); assert.ok(listed.some(item => item.type === 'asset-webstudio'));
    assert.ok(await fs.readFile(path.join(output, '.vscode/tasks.json'), 'utf8'));
    await assert.rejects(run(process.execPath, [copied, 'pull', '--bu', 'demo/BU-demo'], output, false), /demo offline/);
});
