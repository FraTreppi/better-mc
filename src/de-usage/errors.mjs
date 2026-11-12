export function publicError(error) {
    const message = typeof error?.message === 'string' ? error.message : '';
    return /^(?:Salesforce HTTP \d{3}:|(?:DataExtension|QueryDefinition|Automation|AutomationTask|AutomationActivity):|Connessione Salesforce non riuscita\.|Risposta OAuth non valida\.|SOAP ha rifiutato la lettura:|Tempo massimo di analisi raggiunto|Analisi interrotta o tempo massimo raggiunto|Analisi oltre 100 MB|Troppi metadati|Risposta Salesforce oltre il limite|Configurazione sostituita:)/.test(message) ? message.slice(0, 250) :
        'Lettura API non riuscita. Verifica accesso al pacchetto, permessi e rete Salesforce.';
}
