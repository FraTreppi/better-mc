import test from 'node:test';
import assert from 'node:assert/strict';
import { sources } from '../src/de-usage/sql.mjs';
import { createEngine } from '../src/de-usage/engine.mjs';
import { buildIndex as build, report } from '../src/de-usage/index.mjs';
import { SOAPReader, validateConfig } from '../src/de-usage/soap.mjs';
const buildIndex = (reader, config, progress) => build(reader, config, progress, sources);
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const config = { mid: '123', stack: 's10', pairingKey: 'a'.repeat(64), authUrl: 'https://fixture.auth.marketingcloudapis.com/', clientId: 'fixture-client', clientSecret: 'fixture-secret' };
const de = (n, name) => ({ ObjectID: id(n), CustomerKey: 'key' + n, Name: name });
const query = (n, sql, target = 1) => ({ ObjectID: id(n), CustomerKey: 'q' + n, Name: 'Query ' + n, QueryText: sql, TargetUpdateType: 'Overwrite', DataExtensionTarget: { ObjectID: id(target), CustomerKey: 'key' + target } });
const activity = n => ({ ActivityObject: { ObjectID: id(n), '@_type': 'QueryDefinition' } });
function reader(patch = {}) {
    const data = { DataExtension: [de(1, 'Customers'), de(2, 'Orders')], QueryDefinition: [query(10, 'SELECT * FROM [Customers]')], Automation: [], ...patch };
    return { async retrieve(type) { if (data[type] instanceof Error) throw data[type]; return { items: data[type] || [], fields: new Set() }; } };
}
test('SQL resolves physical sources through CTEs, unions and subqueries without comment/string false positives', () => {
    const refs = sources("WITH c AS (SELECT * FROM [Customers]) SELECT 'FROM [Fake]' x FROM c JOIN (SELECT * FROM dbo.[Orders]) o ON 1=1 UNION SELECT * FROM [ENT].[Shared DE] -- FROM [Ghost]");
    assert.deepEqual(refs, [{ schema: '', name: 'Customers' }, { schema: 'dbo', name: 'Orders' }, { schema: 'ENT', name: 'Shared DE' }]);
    assert.deepEqual(sources('SELECT 1'), []);
    assert.throws(() => sources('DELETE FROM Customers'));
    assert.throws(() => sources('x'.repeat(500001)));
});
test('parser rejects malformed roots rather than treating them as no references', () => { assert.throws(() => sources('not SQL')); assert.throws(() => sources('invalid SQL')); });
test('index preserves read/write and all automation occurrences with native step numbering', async () => {
    const auto = (n, tasks) => ({ ObjectID: id(n), ProgramID: id(n + 100), Name: 'Automation ' + n, Status: 6, AutomationTasks: { AutomationTask: tasks } });
    const index = await buildIndex(reader({ Automation: [auto(20, [{ Sequence: 0, Activities: { AutomationActivity: [activity(10)] } }, { Sequence: 1, Activities: { AutomationActivity: [activity(10), activity(10)] } }]), auto(21, [{ Sequence: 1, Activities: { AutomationActivity: activity(10) } }])] }), config);
    const result = report(index, id(1));
    assert.equal(result.rows.length, 4); assert.ok(result.rows.every(r => r.reads && r.writes && r.mode === 'Overwrite'));
    assert.deepEqual(result.rows.map(r => [r.automation.step, r.automation.activity]), [['1','1'],['2','1'],['2','2'],['1','1']]);
    assert.equal(result.rows[0].automation.id, id(120)); assert.ok(Object.values(result.coverage).every(Boolean));
    assert.ok(!JSON.stringify(result).includes('QueryText')); assert.equal(report(index, id(999)).de, null);
});
test('exact DE names and IDs avoid substring matches and ambiguous source names', async () => {
    const index = await buildIndex(reader({ DataExtension: [de(1, 'Customers'), de(2, 'Customers_old'), de(3, 'Duplicate'), de(4, 'duplicate')], QueryDefinition: [query(10, 'SELECT * FROM Customers_old'), query(11, 'SELECT * FROM Duplicate')] }), config);
    const result = report(index, id(1)); assert.ok(result.rows.every(r => !r.reads && r.writes));
    assert.equal(index.coverage.sources, false); assert.equal(index.counts.unresolvedSources, 1);
});
test('unsupported automations, ENT sources, broken SQL and inconsistent targets remain explicitly partial', async () => {
    const conflicting = query(12, 'SELECT * FROM Customers'); conflicting.DataExtensionTarget.CustomerKey = 'wrong';
    const index = await buildIndex(reader({ QueryDefinition: [query(10, 'SELECT * FROM ENT.Customers'), query(11, 'invalid SQL'), conflicting], Automation: Error('unsupported') }), config);
    assert.equal(index.counts.sourceErrors, 1); assert.equal(index.counts.unresolvedSources, 1); assert.equal(index.counts.targetErrors, 1);
    assert.deepEqual(index.coverage, { metadata: true, sources: false, targets: false, automations: false });
    assert.equal(index.queries[2].target, null); assert.equal(report(index, id(1)).rows[0].automation, null);
});
test('separately retrieved activity parents map to the configured automation', async () => {
    const index = await buildIndex(reader({ Automation: [{ ObjectID: id(20), Name: 'A' }], AutomationTask: [{ ObjectID: id(30), Sequence: 1, Automation: { ObjectID: id(20) } }], AutomationActivity: [{ ObjectID: id(40), Sequence: 1, AutomationTask: { ObjectID: id(30) }, ...activity(10) }] }), config);
    assert.equal(report(index, id(1)).rows[0].automation.step, '1'); assert.equal(index.coverage.automations, true);
});
test('failed base metadata and duplicate DE IDs never produce an empty usage conclusion', async () => {
    await assert.rejects(buildIndex(reader({ QueryDefinition: Error('denied') }), config));
    await assert.rejects(buildIndex(reader({ DataExtension: [de(1, 'A'), de(1, 'B')] }), config));
});
const envelope = body => `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body>${body}</s:Body></s:Envelope>`;
const retrieveXML = (status, n, mid = '123') => envelope(`<RetrieveResponseMsg><OverallStatus>${status}</OverallStatus><RequestID>same-request</RequestID><Results><ObjectID>${id(n)}</ObjectID><Client><ID>${mid}</ID></Client></Results></RetrieveResponseMsg>`);
function soapFixture(pages) {
    const calls = [];
    const transport = async (url, options) => {
        calls.push({ url, ...options });
        if (url.endsWith('/v2/token')) return Response.json({ access_token: 'TOKEN_NOT_FOR_EXTENSION', expires_in: 1200, soap_instance_url: 'https://fixture.soap.marketingcloudapis.com/' });
        if (options.headers.SOAPAction === 'Describe') return new Response(envelope('<DefinitionResponseMsg><ObjectDefinition><IsRetrievable>true</IsRetrievable><Properties><Name>ObjectID</Name><IsRetrievable>true</IsRetrievable></Properties><Properties><Name>Client.ID</Name><IsRetrievable>true</IsRetrievable></Properties></ObjectDefinition></DefinitionResponseMsg>'));
        return new Response(pages.shift());
    };
    return { reader: new SOAPReader(config, transport), calls };
}
test('SOAP uses token account_id and fixed ClientIDs, permits repeated RequestID with distinct pages, caches OAuth/Describe', async () => {
    const f = soapFixture([retrieveXML('MoreDataAvailable', 1), retrieveXML('OK', 2)]);
    assert.equal((await f.reader.retrieve('DataExtension', ['ObjectID','Client.ID'], ['ObjectID'])).items.length, 2);
    assert.equal(f.calls.filter(c => c.url.endsWith('/v2/token')).length, 1);
    assert.equal(JSON.parse(f.calls[0].body).account_id, 123);
    for (const call of f.calls.filter(c => c.headers.SOAPAction === 'Retrieve')) { assert.match(call.body, /<ClientIDs><ID>123<\/ID>/); assert.match(call.body, /<QueryAllAccounts>false/); }
    assert.match(f.calls[1].body, /DefinitionRequestMsg/); assert.equal(f.calls[0].redirect, 'error');
    await assert.rejects(f.reader.retrieve('DataExtensionObject', ['ObjectID']));
    await assert.rejects(f.reader.soap('Perform', ''));
});
test('SOAP rejects another BU, repeated result pages and unavailable required fields', async () => {
    await assert.rejects(soapFixture([retrieveXML('OK', 1, '999')]).reader.retrieve('DataExtension', ['ObjectID']), /BU diversa/);
    await assert.rejects(soapFixture([retrieveXML('MoreDataAvailable', 1), retrieveXML('MoreDataAvailable', 1)]).reader.retrieve('DataExtension', ['ObjectID']), /paginazione/);
    await assert.rejects(soapFixture([]).reader.retrieve('QueryDefinition', ['ObjectID','QueryText'], ['QueryText']), /necessari/);
    assert.throws(() => validateConfig({ ...config, authUrl: 'https://elsewhere.example/' }));
    const bad = new SOAPReader(config, async () => Response.json({ access_token: 's', expires_in: 1200, soap_instance_url: 'https://evil.example/' }));
    await assert.rejects(bad.authenticate(), /OAuth/);
    const malformed = new SOAPReader(config, async () => new Response('PRIVATE_BAD_RESPONSE'));
    await assert.rejects(malformed.authenticate(), e => e.message === 'Risposta OAuth non valida.');
});
test('SOAP faults and entities cannot turn into successful empty scans or expose raw errors', async () => {
    await assert.rejects(soapFixture([envelope('<s:Fault><faultstring>PRIVATE_SECRET</faultstring></s:Fault>')]).reader.retrieve('DataExtension', ['ObjectID']), e => !e.message.includes('PRIVATE_SECRET'));
    await assert.rejects(soapFixture(['<!DOCTYPE x [<!ENTITY x "bad">]>']).reader.retrieve('DataExtension', ['ObjectID']), /non valida/);
});
test('browser engine shares a scan, reuses credentials and retains dated results after a failed refresh', async () => {
    let scans = 0, auth = 0;
    const instance = reader(); instance.authenticate = async () => { auth++; };
    const retrieve = instance.retrieve;
    instance.retrieve = async type => { if (type === 'DataExtension') scans++; if (scans > 1 && type === 'QueryDefinition') throw Error('PRIVATE_RESPONSE'); return retrieve(type); };
    const engine = createEngine(() => instance, sources), message = { mid:'123',stack:'s10',configVersion:'v1',deId:id(1) };
    await engine({action:'configure',config:{...config,version:'v1'}});
    assert.equal((await engine({...message,action:'lookup'})).state,'building'); await engine({...message,action:'lookup'});
    let response;
    for(let i=0;i<20;i++){ await new Promise(resolve=>setImmediate(resolve)); response=await engine({...message,action:'lookup'});if(response.state !== 'building')break; }
    assert.equal(response.state,'ready'); assert.equal(response.result.rows.length,1); assert.equal(scans,1); assert.equal(auth,1);
    assert.ok(!JSON.stringify(response).includes(config.clientSecret)); assert.ok(!JSON.stringify(response).includes('QueryText'));
    assert.equal((await engine({...message,action:'lookup',mid:'999'})).state,'not-configured');
    assert.equal((await engine({...message,action:'lookup',configVersion:'old'})).state,'not-configured');
    await assert.rejects(engine({...message,action:'lookup',offset:-1}));
    const date=response.result.generatedAt;
    await engine({...message,action:'refresh'});
    for(let i=0;i<20;i++){ await new Promise(resolve=>setImmediate(resolve)); response=await engine({...message,action:'lookup'});if(response.state !== 'building')break; }
    assert.equal(response.state,'error');assert.equal(response.result.generatedAt,date);assert.ok(!response.error.includes('PRIVATE_RESPONSE'));
    await engine({action:'clear'});assert.equal((await engine({...message,action:'lookup'})).state,'not-configured');
});
test('clearing the browser engine prevents a delayed login or scan from reviving removed configuration', async () => {
    let release, cancelled=0;
    const instance=reader();instance.authenticate=()=>new Promise(resolve=>{release=resolve;});instance.cancel=()=>cancelled++;
    const engine=createEngine(()=>instance,sources), configuring=engine({action:'configure',config:{...config,version:'v1'}});
    await engine({action:'clear'});release();await assert.rejects(configuring,/sostituita/);
    assert.equal((await engine({action:'status',mid:'123',stack:'s10',configVersion:'v1'})).state,'not-configured');
    instance.authenticate=async()=>{};await engine({action:'configure',config:{...config,version:'v2'}});
    await engine({action:'clear'});assert.equal(cancelled,2);
});
