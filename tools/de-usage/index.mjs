import { array } from './soap.mjs';
import { SQLReader } from './sql.mjs';
export const guid = value => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
const norm = value => String(value ?? '').normalize('NFC').toLowerCase();
const field = (obj, name) => obj?.[name] ?? name.split('.').reduce((a, key) => a?.[key], obj);
function lookup(items, property) {
    const map = new Map();
    for (const item of items) if (item[property] != null) { const key = norm(item[property]); const values = map.get(key) || []; values.push(item); map.set(key, values); }
    return value => { const values = map.get(norm(value)); return values?.length === 1 ? values[0] : null; };
}
const dataViews = new Set(['_subscribers','_sent','_job','_open','_click','_bounce','_unsubscribe','_complaint','_businessunitunsubscribes','_enterpriseattribute','_journey','_journeyactivity','_automationinstance','_automationactivityinstance','_listsubscribers','_smsmessagetracking','_smsmessage','_mobileaddress','_mobilesubscription','_pushaddress','_pushmessagetracking']);
export async function buildIndex(reader, config, progress = () => {}, analyze) {
    const deadline = Date.now() + 10 * 60 * 1000;
    const sql = new SQLReader(), issues = [], coverage = { metadata: true, sources: true, targets: true, automations: true };
    const warn = (code, item) => { if (issues.length < 200) issues.push({ code, name: String(item?.Name || ''), id: String(item?.ObjectID || '') }); };
    try {
        progress('Lettura metadati DE');
        const des = (await reader.retrieve('DataExtension', ['ObjectID','CustomerKey','Name','Client.ID'], ['ObjectID','CustomerKey','Name'])).items;
        const byId = lookup(des, 'ObjectID'), byKey = lookup(des, 'CustomerKey'), byName = lookup(des, 'Name');
        if (des.some(de => !guid(de.ObjectID)) || new Set(des.map(de => norm(de.ObjectID))).size !== des.length) throw Error('Metadati DE con identificativi non validi o duplicati.');
        progress('Lettura definizioni query');
        const retrieved = await reader.retrieve('QueryDefinition', ['ObjectID','CustomerKey','Name','QueryText','TargetUpdateType','DataExtensionTarget','DataExtensionTarget.ObjectID','DataExtensionTarget.CustomerKey','Client.ID'], ['ObjectID','CustomerKey','Name','QueryText']);
        const raw = retrieved.items, queries = [];
        let sourceErrors = 0, unresolvedSources = 0, targetErrors = 0;
        for (let i = 0; i < raw.length; i++) {
            if (Date.now() > deadline) throw Error('Tempo massimo di analisi raggiunto.');
            const item = raw[i];
            if (!guid(item.ObjectID)) throw Error('Query con identificativo non valido.');
            progress('Analisi SQL', i + 1, raw.length);
            const query = { id: item.ObjectID.toLowerCase(), key: item.CustomerKey, name: item.Name, sources: [], target: null, mode: item.TargetUpdateType || 'Non disponibile', automations: [] };
            const targetId = field(item, 'DataExtensionTarget.ObjectID'), targetKey = field(item, 'DataExtensionTarget.CustomerKey');
            const target = targetId ? byId(targetId) : targetKey ? byKey(targetKey) : null;
            if (target && (!targetKey || norm(target.CustomerKey) === norm(targetKey))) query.target = target.ObjectID.toLowerCase();
            else { coverage.targets = false; targetErrors++; warn('TARGET_NON_RISOLTO', item); }
            try {
                const refs = await (analyze || (value => sql.analyze(value)))(item.QueryText);
                for (const ref of refs) {
                    if (ref.schema && norm(ref.schema) !== 'dbo') { unresolvedSources++; coverage.sources = false; warn('SORGENTE_FUORI_PERIMETRO_O_NON_RISOLTA', item); continue; }
                    const source = byName(ref.name);
                    if (source) query.sources.push(source.ObjectID.toLowerCase());
                    else if (!dataViews.has(norm(ref.name))) { unresolvedSources++; coverage.sources = false; warn('NOME_DE_NON_RISOLTO', item); }
                }
                query.sources = [...new Set(query.sources)];
            } catch (_) { sourceErrors++; coverage.sources = false; warn('SQL_NON_ANALIZZATO', item); }
            queries.push(query);
        }
        const queryById = lookup(queries, 'id'), queryByKey = lookup(queries, 'key');
        progress('Lettura automation');
        let automations = [], tasks = [], activities = [], automationErrors = 0;
        try {
            automations = (await reader.retrieve('Automation', ['ObjectID','ProgramID','CustomerKey','Name','Status','AutomationTasks','Client.ID'], ['Name'])).items;
            const autoById = value => value == null ? null : automations.find(a => norm(a.ObjectID) === norm(value) || norm(a.ProgramID) === norm(value));
            const autoByKey = lookup(automations, 'CustomerKey');
            const needTasks = automations.some(a => a.AutomationTasks == null);
            if (needTasks) {
                try { tasks = (await reader.retrieve('AutomationTask', ['ObjectID','Name','Sequence','Automation','Automation.ObjectID','Automation.CustomerKey','Activities','Client.ID'], ['ObjectID'])).items; }
                catch (_) { /* Activity objects may carry task sequence and parent directly. */ }
                activities = (await reader.retrieve('AutomationActivity', ['ObjectID','Name','Sequence','ObjectTypeID','ActivityObject','ActivityObject.ObjectID','ActivityObject.CustomerKey','Definition','Automation','Automation.ObjectID','Automation.CustomerKey','AutomationTask','AutomationTask.ObjectID','AutomationTask.Sequence','Client.ID'], ['ObjectID'])).items;
            }
            const taskById = lookup(tasks, 'ObjectID');
            const add = (activity, automation, step, order) => {
                const object = activity.ActivityObject || activity.Definition || {};
                const id = object.ObjectID || field(activity, 'ActivityObject.ObjectID'), key = object.CustomerKey || field(activity, 'ActivityObject.CustomerKey');
                const isQuery = /(?:^|:)QueryDefinition$/i.test(object['@_type'] || '') || String(activity.ObjectTypeID) === '300';
                const query = id ? queryById(id) : isQuery && key ? queryByKey(key) : null;
                if (!query) { if (isQuery || !object['@_type']) { automationErrors++; warn('ATTIVITA_NON_RISOLTA', activity); } return; }
                const automationId = automation?.ProgramID || automation?.ObjectID;
                if (!automation || !guid(automationId)) { automationErrors++; warn('AUTOMATION_NON_RISOLTA', activity); return; }
                const row = { id: automationId.toLowerCase(), key: automation.CustomerKey || '', name: automation.Name || 'Automation', status: String(automation.Status ?? 'Non disponibile'), step: String(step), activity: String(order) };
                if (!Number.isInteger(Number(step)) || Number(step) < 1 || !Number.isInteger(Number(order)) || Number(order) < 1) { automationErrors++; warn('POSIZIONE_ATTIVITA_NON_RISOLTA', activity); }
                if (!query.automations.some(a => a.id === row.id && a.step === row.step && a.activity === row.activity)) query.automations.push(row);
            };
            for (const automation of automations) {
                const nested = array(automation.AutomationTasks?.AutomationTask || automation.AutomationTasks);
                const localTasks = nested.length ? nested : tasks.filter(t => {
                    const parentId = field(t, 'Automation.ObjectID'), parentKey = field(t, 'Automation.CustomerKey');
                    return parentId && autoById(parentId) === automation || parentKey && autoByKey(parentKey) === automation;
                });
                const zeroBased = localTasks.some(t => String(t.Sequence) === '0');
                for (const [index, task] of localTasks.entries()) {
                    const step = task.Sequence == null ? index + 1 : Number(task.Sequence) + (zeroBased ? 1 : 0);
                    const entries = array(task.Activities?.AutomationActivity || task.Activities);
                    for (const [position, activity] of entries.entries()) add(activity, automation, step, position + 1);
                }
            }
            for (const activity of activities) {
                const task = { ...taskById(field(activity, 'AutomationTask.ObjectID')), ...activity.AutomationTask };
                const parent = activity.Automation || task?.Automation;
                const automation = autoById(parent?.ObjectID || field(activity, 'Automation.ObjectID')) || autoByKey(parent?.CustomerKey || field(activity, 'Automation.CustomerKey'));
                const sequence = task?.Sequence ?? field(activity, 'AutomationTask.Sequence');
                const sameParent = candidate => {
                    const owner = candidate.Automation || taskById(field(candidate, 'AutomationTask.ObjectID'))?.Automation;
                    return automation && (autoById(owner?.ObjectID) === automation || autoByKey(owner?.CustomerKey) === automation);
                };
                const zeroStep = tasks.some(t => sameParent(t) && String(t.Sequence) === '0') || activities.some(a => sameParent(a) && String(field(a, 'AutomationTask.Sequence')) === '0');
                const taskId = field(activity, 'AutomationTask.ObjectID');
                const zeroActivity = taskId && activities.some(a => norm(field(a, 'AutomationTask.ObjectID')) === norm(taskId) && String(a.Sequence) === '0');
                add(activity, automation, sequence == null ? '?' : Number(sequence) + (zeroStep ? 1 : 0), activity.Sequence == null ? '?' : Number(activity.Sequence) + (zeroActivity ? 1 : 0));
            }
        } catch (_) { coverage.automations = false; automationErrors++; warn('AUTOMATION_LETTURA_INCOMPLETA'); }
        if (automationErrors) coverage.automations = false;
        return { format: 'sfmc-de-usage-v1', mid: String(config.mid), stack: config.stack, generatedAt: new Date().toISOString(), coverage,
            counts: { des: des.length, queries: queries.length, automations: automations.length, sourceErrors, unresolvedSources, targetErrors, automationErrors }, issues,
            des: des.map(de => ({ id: de.ObjectID.toLowerCase(), key: de.CustomerKey, name: de.Name })), queries };
    } finally { await sql.close(); }
}
export function report(index, deId) {
    if (!guid(deId)) throw Error('Identificativo DE non valido.');
    const de = index.des.find(de => de.id === deId.toLowerCase());
    if (!de) return { ...summary(index), de: null, rows: [], message: 'DE non presente nell’indice della BU. Verifica permessi e perimetro; nessuna conclusione sugli utilizzi.' };
    const rows = [];
    for (const query of index.queries) {
        const reads = query.sources.includes(de.id), writes = query.target === de.id;
        if (!reads && !writes) continue;
        for (const automation of query.automations.length ? query.automations : [null]) rows.push({ query: { id: query.id, key: query.key, name: query.name }, reads, writes, mode: writes ? query.mode : '', automation });
    }
    return { ...summary(index), de, rows };
}
function summary(index) { return { mid: index.mid, stack: index.stack, generatedAt: index.generatedAt, coverage: index.coverage, counts: index.counts, issues: index.issues }; }
