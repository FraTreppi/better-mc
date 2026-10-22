# Sicurezza e protezione dei dati

Versione 1.1.19 · 22 ottobre 2026

L’estensione non può essere dichiarata sicura al 100%. Questa versione corregge i problemi individuati nel codice della 1.1.10 e riduce l’accesso concesso alle pagine. Non è una certificazione di sicurezza, una revisione del Chrome Web Store o una verifica dell’intera infrastruttura Salesforce.

## Compatibilità con Chrome e Edge

Il pacchetto Manifest V3 usa le API `chrome.*` disponibili anche in Microsoft Edge basato su Chromium. Le verifiche di mittente, documento, contesto BU e accesso allo storage restano le stesse sui due browser. Non vengono aggiunti permessi per Edge. I dati locali appartengono al singolo browser/profilo e non vengono sincronizzati fra Chrome e Edge dall’estensione.

## Accesso ai salvataggi locali

Prima, una pagina sulla quale era attivo il ponte poteva richiedere tutto lo storage dell’estensione, modificarlo o cancellarlo. Le notifiche includevano anche dati di altre BU.

Ora:

- Il ponte è attivo solo nei moduli riconosciuti di Contact Builder, Content Builder, Automation Studio, Journey Builder e Query Studio. Non viene attivato su CloudPages, documenti generici o anteprime degli asset.
- Lo storage locale e di sessione del browser è limitato ai contesti fidati dell’estensione. I content script passano dal service worker e non leggono direttamente l’archivio.
- Il service worker verifica identità dell’estensione, URL reale del mittente, scheda e identificativo del documento forniti dal browser. L’identificativo viene trattato come valore opaco fornito dal browser, senza imporre un formato UUID. Identificativi assenti o non utilizzabili restano rifiutati; non esiste un ripiego su ID dichiarati dalla pagina, URL o numero del frame.
- Le pagine non possono elencare l’intero archivio, cancellarlo globalmente, impostare chiavi arbitrarie o eliminare versioni. Le operazioni pericolose dell’archivio SQL sono riservate alla pagina interna dell’estensione.
- Content Builder riceve soltanto la rubrica della BU autorizzata; Automation Studio può leggere e aggiungere soltanto le versioni del relativo contesto. Una conferma nel mondo isolato del content script autorizza dominio, stack e MID. Lo script della pagina non può sostituire la funzione che mostra questa conferma.
- L’autorizzazione è associata al documento, conservata nello storage di sessione e limitata nel tempo. Un altro documento o un’altra BU richiedono una nuova conferma. Le notifiche contengono solo la proiezione autorizzata, senza i valori precedenti di altre BU.
- Le rubriche ammettono fino a 1000 contatti con forma e lunghezze controllate. Gli snapshot SQL ammettono solo i campi previsti, dimensioni limitate e chiavi valide; le scritture sono serializzate.

Il MID inserito dall’utente non autentica una BU e non cambia la selezione di Salesforce. La conferma autorizza l’accesso alle copie locali: bisogna verificare che il contesto scelto sia quello corretto. Uno script già compromesso nella pagina autorizzata può vedere i dati che quella pagina deve usare; l’integrazione con l’interfaccia nativa non può renderla fidata contro ogni compromissione del sito.

Implementazione: [loader](assets/js/loader.js), [service worker](assets/js/background.js), [contesto](assets/js/context.js).

## Rete e domini

Il vecchio proxy generico permetteva richieste GET autenticate verso molti sottodomini Marketing Cloud, indipendentemente dal modulo e dallo stack della pagina. È stato rimosso sia dalla pagina sia dal service worker: non rimane un proxy di rete utilizzabile dal ponte.

Le richieste operative delle funzioni attive usano gli endpoint Salesforce del modulo e la sessione dell’utente. Il controllo SMS è locale e il relativo collegamento esterno è stato eliminato. Anche il componente SMS aziendale inattivo, che conteneva un vecchio percorso di scrittura, è stato rimosso.

Il dominio `*.sfmc-content.com` è stato eliminato dai permessi. I pattern Salesforce rimasti devono coprire stack diversi, ma il loader applica anche i controlli su host e percorsi dei moduli. Query Studio resta un’applicazione sul dominio separato `querystudio.herokuapp.com`, necessario per la relativa integrazione.

Non è presente un backend di telemetria dell’estensione. Le immagini esterne di un’email sono un’eccezione esplicita: possono essere caricate solo con il comando e la conferma descritti nella guida.

## Aggiornamento del Run Log

L’automatismo è disattivato all’apertura e aziona ogni cinque secondi soltanto l’unico refresh riconosciuto nel Run Log accanto alle due date. Usa la gestione nativa di Salesforce, senza introdurre endpoint, permessi o salvataggi aggiuntivi. Non aziona Run Once, Save o Delete. Si sospende quando il Run Log non è visibile e si disattiva cambiando automation o contesto BU. Le richieste jQuery avviate dal clic riconosciuto vengono osservate soltanto per attenderne il completamento, senza leggerne le risposte o modificarle. Il riconoscimento dipende dal DOM dell’interfaccia nativa.

## Ricerca Advanced in Content Builder

La ricerca usa soltanto la query di lettura `POST /fuelapi/asset/v1/content/assets/query` e l’elenco cartelle `GET /fuelapi/asset/v1/content/categories`, sulla stessa origine del modulo. Se disponibile, il client Fuel nativo fornisce la propria gestione della sessione; in alternativa vengono usate richieste fetch della stessa origine. Non vengono letti o conservati token. Il POST contiene una query sui metadati e non crea, modifica o elimina asset. Non sono aggiunti permessi né un proxy del worker.

Le risposte vengono ridotte ai metadati necessari per un massimo di 50 risultati per pagina. HTML, testo delle email e thumbnail non vengono richiesti né visualizzati. Nomi, chiavi e percorsi sono inseriti con textContent; le destinazioni interne si basano su ID numerici validati. Il clic su una riga nativa già presente viene riutilizzato quando disponibile. Filtri, risultati e modelli dei percorsi nativi rimangono nella scheda; soltanto le cartelle hanno una cache in memoria di cinque minuti, limitata a 2000 voci e separata per contesto. Chiusura e cambio BU interrompono le richieste; le risposte obsolete non possono riempire un nuovo pannello. La funzione non modifica lo storage dell’estensione né introduce azioni sul cestino.

## Rubrica DE condivisa

La sorgente opzionale `tester_content_builder` esegue soltanto GET relativi alla stessa origine Content Builder, con la sessione corrente, senza un proxy dell’estensione. Nome ed External Key sono fissi; la cartella deve essere figlia diretta della radice locale Data Extensions e lo schema viene verificato prima dei record. Non legge automaticamente DE condivise, di altri stack o una DE con nome simile. Non richiede un Installed Package, credenziali aggiuntive né scritture in Salesforce.

I dati letti vengono proiettati sui tre campi previsti, limitati a 1000 righe, validati e conservati solo in memoria per cinque minuti. I nomi dei campi nei record sono confrontati senza distinguere maiuscole e minuscole; sono riconosciute anche le raccolte Salesforce keys/values, senza cercare ricorsivamente indirizzi in altri metadati. Copie identiche dello stesso campo vengono riunite; valori in conflitto vengono esclusi. Nome e Cognome della sorgente DE ammettono fino a 4000 caratteri; il limite della rubrica locale resta invariato. Le motivazioni delle righe escluse sono soltanto categorie e conteggi, senza dati personali nei messaggi. La scelta della sorgente viene salvata per BU; la vecchia rubrica locale non viene eliminata. Cambi contesto interrompono le richieste e svuotano i suggerimenti; gli errori non attivano un ripiego silenzioso sulla rubrica locale. I destinatari scelti possono comunque comparire nello storico locale degli invii di prova. Le chiamate usano API interne Salesforce: disponibilità e autorizzazioni dipendono dal tenant.

## Contenuti mostrati nell’interfaccia

L’oggetto dell’email viene mostrato come testo. I nomi delle automation, delle DE e dei campi, gli attributi dei suggerimenti e i valori visualizzati nei pannelli vengono codificati come testo/attributi, evitando che diventino markup eseguibile. Anche i dati presenti nel vecchio archivio vengono trattati come input non fidato.

Le anteprime email hanno un iframe con sandbox, senza script o accesso alla pagina contenitore. Il contenuto viene preparato in un template inerte e vengono rimossi script, moduli, frame, oggetti, redirect, collegamenti attivi e template dichiarativi. Una Content Security Policy nel documento blocca per impostazione predefinita le risorse esterne. Le immagini HTTPS richiedono un comando esplicito con conferma, valido per quella sola anteprima; script e navigazione restano disabilitati.

Le pagine interne privilegiate dell’estensione non sono più esposte come risorse accessibili ai siti. La policy delle pagine interne ammette script locali, blocca gli oggetti e impedisce l’incorporamento da altre pagine.

Implementazione: [anteprime](assets/js/contentbuilder/previewandtest.js), [Query Studio](assets/js/querystudio/_index.js), [Automation Studio](assets/js/automation/_index.js), [manifest](manifest.json).

## File, cronologie e scritture su Salesforce

Il CSV completo esegue soltanto GET della DE selezionata, sulla stessa origine e con la sessione corrente. Non usa i filtri della griglia, un proxy del worker o credenziali aggiuntive. Il lavoro resta associato a GUID e contesto BU: cambi DE/BU ed annullamento interrompono le richieste e non avviano un download parziale.

Le risposte vengono validate rispetto a conteggio e schema, con controllo delle chiavi primarie ripetute quando presenti. Le pagine vengono convertite in Blob CSV e mantenute nell’ordine corretto; non viene conservata l’intera DE come lista di oggetti JSON, né salvata nello storage dell’estensione. Al termine vengono verificati nuovamente schema e conteggio. La lettura non è transazionale: una modifica che conserva il totale e non genera duplicati può non essere rilevata. L’URL temporaneo del download viene revocato dopo l’avvio e i riferimenti ai blocchi vengono rilasciati.

I CSV neutralizzano i valori con prefissi interpretabili come formule, oltre a gestire separatori e virgolette. Questa protezione può far importare numeri negativi come testo e non sostituisce le impostazioni del programma che apre il file.

Le copie SQL e le esportazioni dell’archivio ammettono una lista di campi applicativi, escludendo proprietà arbitrarie come token o intestazioni eventualmente presenti in una risposta nativa. All’avvio, l’archivio SQL precedente viene ripulito dei campi non previsti; rimangono SQL e metadati utili. Le vecchie preferenze mantengono le rubriche e non conservano più modelli URL inutilizzati. I log dei tentativi di invio conservano soltanto i dati previsti per la funzione, non l’intero payload indiscriminato.

La visualizzazione dell’anteprima e del SQL non viene più riportata integralmente nella console. I messaggi di errore dei salvataggi non riportano la risposta completa contenente eventuali record.

CLONE e MULTI ROWS possono produrre scritture reali nella DE, usando i permessi della sessione corrente. Il salvataggio multiplo richiede conferma e verifica identificativo della DE e contesto BU rispetto alla tabella preparata. Non è stato aggiunto un accesso amministrativo a Salesforce, un aggiramento dei permessi del tenant o un rinnovo automatico dei token.

## Limiti che restano

- **Dati locali leggibili dal profilo browser.** Rubriche, cronologie, SQL e file esportati non hanno una cifratura propria dell’estensione. Lo storage protetto limita le pagine che possono accedervi, ma non protegge da chi controlla il computer o il profilo. Usa un profilo personale, blocco del dispositivo e cifratura del disco; evita profili condivisi tra persone.
- **LocalStorage dei moduli.** Cronologie e bozze Query Studio restano nei dati del relativo sito, accessibili agli script di quella stessa origine. La separazione per MID evita il riuso accidentale del contesto, ma non sostituisce la sicurezza del sito. Non inserirvi password, token o altri segreti nelle query.
- **Sessione Salesforce e dati reali.** Un permesso valido può comunque consentire una modifica sbagliata. Verifica BU, DE, chiavi e valori prima di salvare. L’estensione non può correggere i permessi dell’account o impedire tutte le azioni di un sito già compromesso.
- **Contenuti e API native.** Le integrazioni dipendono dall’interfaccia Salesforce e possono richiedere manutenzione quando cambia. La protezione del browser e l’autenticazione del tenant restano responsabilità dei rispettivi sistemi.
- **Distribuzione e aggiornamenti.** Il pacchetto è un’estensione caricata in modalità sviluppatore. Installa versioni provenienti dal repository atteso e mantieni aggiornati il browser e il sistema operativo. Una distribuzione aziendale tramite browser gestiti, Microsoft Edge Add-ons o Chrome Web Store può migliorare controllo delle versioni e provenienza; non è una garanzia automatica di assenza di vulnerabilità.

Per dati che richiedono protezioni ulteriori serve una scelta architetturale: per esempio rinunciare al salvataggio locale del SQL, oppure introdurre un archivio cifrato con una chiave gestita fuori dal codice dell’estensione. Inserire una chiave fissa nel pacchetto non renderebbe sicuro l’archivio.
