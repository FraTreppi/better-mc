# Analisi utilizzi DE — una sola Business Unit

Componente locale per il pulsante **Dove viene usata** di SFMC UI Fixer 1.1.38. Legge le definizioni delle query e le relazioni con le automation tramite le API SOAP documentate Salesforce Marketing Cloud Engagement. Non legge i record delle DE, non esegue query e non modifica automation o altri oggetti.

## Prima configurazione

Serve **Node.js 24.15 o successivo**, con npm, sul PC dove usi Edge/Chrome. Git non serve. Se hai già Node installato sotto `MC-Code-Tools` con fnm, gli avviatori lo cercano automaticamente. Il primo avvio scarica le dipendenze npm; deve essere consentito dalla rete aziendale.

Chiedi all’amministratore Salesforce un **Installed Package → API Integration → Server-to-Server** autorizzato per la sola BU interessata. Servono **Data → Data Extensions: Read** (`data_extensions_read`) e **Automation → Automations: Read** (`automations_read`), con accesso ai metadati delle Query Activities. Le etichette possono variare nel pannello Salesforce. Non abilitare scrittura o esecuzione per questo componente. Le funzionalità SOAP disponibili dipendono da oggetto, proprietà e autorizzazioni: l’accesso al pacchetto non garantisce che ogni relazione automation sia recuperabile.

Prepara **MID** della BU, **stack** (es. `s10`, dall’indirizzo Salesforce), **Authentication Base URI**, **Client ID**, **Client Secret** del pacchetto. Non inviare il Client Secret in chat o nei file del progetto condivisi.

1. Estrai questo ZIP in una cartella personale permanente, separata dalla cartella dell’estensione.
2. Su Windows apri **CONFIGURA.cmd**. Inserisci i dati sopra; il Client Secret non viene mostrato durante la digitazione. La configurazione viene scritta in `config.local.json` sul PC. Su altri sistemi: `npm ci --ignore-scripts`, poi `npm run configure`.
3. Apri **AVVIA.cmd** e lascia aperta la finestra. Su altri sistemi: `npm start`. Il servizio ascolta soltanto su `127.0.0.1:17638`.
4. Copia il **codice di collegamento** mostrato nella finestra, nel formato `s10:MID:codice`. Questo codice autorizza l’accesso locale ai metadati: trattalo come un dato riservato. Non è il Client Secret Salesforce.
5. Clicca l’icona dell’estensione → **Collegamento Analisi DE**. Incolla il codice e premi **Verifica e salva collegamento**. In alternativa apri una DE in Contact Builder, premi **Dove viene usata → Collega Analisi DE**.
6. Torna alla DE in **Contact Builder → Data Extensions**, nelle proprietà o nei record, e premi **Dove viene usata**. Il MID rilevato nella pagina deve corrispondere a quello configurato. Se manca, riapri il modulo nella BU corretta; il componente non presume il MID e non cerca in altre BU.

La verifica del codice prova il collegamento locale. **Il primo avvio dell’analisi verifica anche OAuth e permessi Salesforce**: eventuali errori compaiono nel pannello. Non occorre usare la console del browser.

## Come leggere il risultato

La prima ricerca costruisce in memoria un indice dei metadati della BU. Le ricerche successive lo riusano; **Aggiorna analisi** lo ricostruisce dopo modifiche a query o automation. Alla chiusura del componente l’indice viene perso. Mantieni aperta AVVIA.cmd mentre usi la funzione.

Ogni riga indica la query che **legge**, **scrive** o **legge e scrive** la DE. La scrittura mostra Append/Update/Overwrite quando disponibile. Per ogni occorrenza viene mostrata l’automation, lo step, la posizione e lo stato configurato, con link di apertura. Una stessa query può comparire più volte. I link si aprono nella sessione e nello stack correnti; non cambiano BU. Lo stato non è una prova che l’automation abbia effettivamente elaborato record di recente.

**Analisi parziale** significa che alcuni SQL, target o collegamenti automation non sono stati risolti. I contatori e **Riferimenti da verificare** indicano cosa manca. Se Salesforce non permette il recupero di attività/step, i riferimenti query restano visibili e le relazioni automation vengono segnalate come incomplete. Un elenco vuoto indica soltanto che non sono stati trovati riferimenti nel perimetro esaminato: non certifica che la DE sia inutilizzata.

Il perimetro comprende le Query Activities della **singola BU configurata** e i loro collegamenti alle automation leggibili. Le fonti sono riconosciute analizzando SQL TransactSQL, senza confondere commenti, stringhe o nomi parziali con DE. SQL non supportato o nomi ambigui restano da verificare. Riferimenti `ENT` e altri schemi esterni non vengono cercati in altre BU. Non è un inventario degli utilizzi in email, AMPscript, SSJS, Journey, import, estrazioni o integrazioni esterne, né uno storico di esecuzione.

La lettura ha limiti di dieci minuti, 100 MB complessivi, 100.000 elementi per tipo e 1.000 pagine; il parsing SQL ha limiti di tempo/dimensione. Se vengono superati, il pannello segnala l’analisi incompleta o fallita. Durante una ricostruzione fallita i precedenti risultati, se presenti, sono identificati come precedenti.

## Se il collegamento non funziona

- **Componente non raggiungibile**: apri AVVIA.cmd sullo stesso PC; controlla Node e che la porta 17638 sia libera. Eventuali restrizioni aziendali del browser sulle connessioni locali devono essere autorizzate dall’IT.
- **Codice non valido**: ricopia il codice corrente; CONFIGURA.cmd ne genera uno nuovo. Aggiorna il codice nell’estensione.
- **BU diversa**: torna nella BU configurata. Questa versione non gestisce scansioni o cambi BU.
- **OAuth, HTTP 401/403 o metadati necessari non leggibili**: verifica i dati del pacchetto, l’accesso alla BU e i permessi con l’amministratore. Il programma non ripiega sui cookie del browser o su API private dell’interfaccia.
- **Rete/certificati**: gli avviatori usano proxy di ambiente e certificati di sistema supportati da Node. Non disabilitare la verifica TLS; chiedi all’IT la configurazione aziendale.

## Dati e sorgenti

Client Secret e configurazione sono nel file locale **non cifrato** `config.local.json`; i permessi file richiesti sono 0600 dove supportati, mentre su Windows valgono le ACL dell’account. Conserva la cartella nel profilo personale, senza condividerla o aggiungerla a Git. Il token Salesforce vive solo nel processo locale e l’SQL viene elaborato in memoria; l’estensione riceve nomi, identificativi e relazioni, non credenziali Salesforce o testo SQL. L’estensione conserva soltanto il codice di collegamento nel proprio storage protetto. Rimuovere il collegamento non revoca l’Installed Package: per revocarlo interviene l’amministratore.

Dipendenze fissate nel lockfile: [node-sql-parser](https://github.com/taozhi8833998/node-sql-parser) (Apache-2.0), [fast-xml-parser](https://github.com/NaturalIntelligence/fast-xml-parser) (MIT). Le licenze vengono installate con i pacchetti npm.

Riferimenti API: [OAuth server-to-server](https://developer.salesforce.com/docs/marketing/marketing-cloud/guide/access-token-s2s.html), [QueryDefinition](https://developer.salesforce.com/docs/marketing/marketing-cloud/guide/querydefinition.html), [Automation](https://developer.salesforce.com/docs/marketing/marketing-cloud/guide/automation.html), [Retrieve](https://developer.salesforce.com/docs/marketing/marketing-cloud/guide/retrieve.html), [Describe](https://developer.salesforce.com/docs/marketing/marketing-cloud/guide/describe.html).
