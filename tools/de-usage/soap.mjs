import { XMLParser } from 'fast-xml-parser';
import { createHash } from 'node:crypto';
const parser = new XMLParser({ removeNSPrefix: true, ignoreAttributes: false, parseTagValue: false, processEntities: true });
const xml = value => String(value).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]);
export const array = value => value == null || value === '' ? [] : Array.isArray(value) ? value : [value];
const yes = value => value === true || value === 'true';
export function validateConfig(c) {
    if (!c || !/^[1-9]\d{0,14}$/.test(String(c.mid)) || !/^s\d+$/.test(c.stack) || !/^[a-f0-9]{64}$/.test(c.pairingKey) ||
        typeof c.clientId !== 'string' || !c.clientId || typeof c.clientSecret !== 'string' || !c.clientSecret) throw Error('Configurazione locale incompleta. Esegui CONFIGURA.cmd.');
    const url = new URL(c.authUrl);
    if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.auth\.marketingcloudapis\.com$/.test(url.hostname) || url.port || url.username || url.password || !['/', ''].includes(url.pathname) || url.search || url.hash) throw Error('Authentication Base URI Salesforce non valida.');
    return c;
}
export class SOAPReader {
    constructor(config, transport = fetch) { this.config = validateConfig(config); this.transport = transport; this.definitions = new Map(); this.deadline = Date.now() + 10 * 60 * 1000; }
    async http(url, options) {
        for (let attempt = 0; attempt < 3; attempt++) {
            if (Date.now() > this.deadline) throw Error('Tempo massimo di analisi raggiunto: risultati non completi.');
            let response;
            try { response = await this.transport(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(25000) }); }
            catch (_) { throw Error('Connessione Salesforce non riuscita. Verifica rete e certificati aziendali.'); }
            if ([429, 502, 503, 504].includes(response.status) && attempt < 2) {
                const wait = Math.max(250, Math.min(3000, Number(response.headers.get('retry-after')) * 1000 || (attempt + 1) * 500));
                await new Promise(resolve => setTimeout(resolve, wait)); continue;
            }
            if (!response.ok) throw Error('Salesforce HTTP ' + response.status + ': verifica autorizzazioni e configurazione.');
            if (Number(response.headers.get('content-length')) > 25 * 1024 * 1024) throw Error('Risposta Salesforce oltre il limite.');
            return response;
        }
    }
    async authenticate() {
        if (this.token && Date.now() < this.expires) return;
        const response = await this.http(new URL('/v2/token', this.config.authUrl).href, { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ grant_type: 'client_credentials', client_id: this.config.clientId, client_secret: this.config.clientSecret, account_id: Number(this.config.mid) }) });
        let data, url;
        try { data = await response.json(); url = new URL(data.soap_instance_url || 'https://invalid'); }
        catch (_) { throw Error('Risposta OAuth non valida.'); }
        const tenant = new URL(this.config.authUrl).hostname.split('.')[0];
        if (url.protocol !== 'https:' || url.hostname !== tenant + '.soap.marketingcloudapis.com' || url.port || url.username || url.password ||
            typeof data.access_token !== 'string' || !data.access_token || !Number.isFinite(Number(data.expires_in)) || Number(data.expires_in) < 1) throw Error('Risposta OAuth non valida.');
        this.token = data.access_token; this.endpoint = new URL('/Service.asmx', url).href;
        this.expires = Date.now() + Math.max(1, Number(data.expires_in) - 60) * 1000;
    }
    async soap(action, body) {
        if (!['Retrieve', 'Describe'].includes(action)) throw Error('Operazione Salesforce non consentita.');
        await this.authenticate();
        const envelope = '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><s:Header><fueloauth xmlns="http://exacttarget.com">' + xml(this.token) + '</fueloauth></s:Header><s:Body>' + body + '</s:Body></s:Envelope>';
        const response = await this.http(this.endpoint, { method: 'POST', headers: { 'Content-Type': 'text/xml;charset=UTF-8', SOAPAction: action }, body: envelope });
        const text = await response.text();
        this.bytes = (this.bytes || 0) + Buffer.byteLength(text);
        if (this.bytes > 100 * 1024 * 1024) throw Error('Analisi oltre 100 MB di metadati: ridurre il perimetro con l’amministratore.');
        if (Buffer.byteLength(text) > 25 * 1024 * 1024 || /<!DOCTYPE|<!ENTITY/i.test(text)) throw Error('Risposta SOAP non valida.');
        let data; try { data = parser.parse(text).Envelope.Body; } catch (_) { throw Error('Risposta SOAP non riconosciuta.'); }
        if (!data || data.Fault) throw Error('SOAP ha rifiutato la lettura: verifica oggetto, proprietà e permessi.');
        return data;
    }
    async describe(type) {
        if (this.definitions.has(type)) return this.definitions.get(type);
        const data = await this.soap('Describe', '<DefinitionRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI"><DescribeRequests><ObjectDefinitionRequest><Client><ID>' + this.config.mid + '</ID></Client><ObjectType>' + xml(type) + '</ObjectType></ObjectDefinitionRequest></DescribeRequests></DefinitionRequestMsg>');
        const definition = array(data.DefinitionResponseMsg?.ObjectDefinition)[0];
        if (!definition || definition.IsRetrievable === 'false') throw Error(type + ': lettura non disponibile.');
        const fields = new Set(array(definition.Properties?.PropertyDefinition || definition.Properties).filter(p => yes(p.IsRetrievable)).map(p => p.Name));
        if (!fields.size) throw Error(type + ': proprietà leggibili non disponibili.');
        this.definitions.set(type, fields); return fields;
    }
    async retrieve(type, wanted, required = []) {
        if (!['DataExtension', 'QueryDefinition', 'Automation', 'AutomationTask', 'AutomationActivity'].includes(type)) throw Error('Tipo Salesforce non consentito.');
        const available = await this.describe(type), fields = wanted.filter(field => available.has(field));
        if (required.some(field => !fields.includes(field))) throw Error(type + ': metadati necessari non leggibili.');
        const items = [], seen = new Set(); let continuation;
        for (let page = 0; page < 1000; page++) {
            const data = await this.soap('Retrieve', '<RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI"><RetrieveRequest><ClientIDs><ID>' + this.config.mid + '</ID></ClientIDs><ObjectType>' + type + '</ObjectType>' + fields.map(field => '<Properties>' + xml(field) + '</Properties>').join('') +
                (continuation ? '<ContinueRequest>' + xml(continuation) + '</ContinueRequest>' : '') + '<QueryAllAccounts>false</QueryAllAccounts></RetrieveRequest></RetrieveRequestMsg>');
            const result = data.RetrieveResponseMsg;
            if (!result || !['OK', 'MoreDataAvailable'].includes(result.OverallStatus)) throw Error(type + ': lettura incompleta o non autorizzata.');
            for (const item of array(result.Results)) {
                const owner = item.Client?.ID;
                if (owner != null && String(owner) !== String(this.config.mid)) throw Error('Salesforce ha restituito dati di una BU diversa.');
                items.push(item);
            }
            if (items.length > 100000) throw Error('Troppi metadati per una singola analisi.');
            if (result.OverallStatus === 'OK') return { items, fields };
            continuation = result.RequestID;
            const signature = createHash('sha256').update(JSON.stringify(result.Results || [])).digest('hex');
            if (!continuation || seen.has(signature)) throw Error(type + ': paginazione non completa.');
            seen.add(signature);
        }
        throw Error(type + ': limite di paginazione raggiunto.');
    }
}
