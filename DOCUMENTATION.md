# SFMC UI Fixer: analisi del codice e guida alla versione Multi BU

Analisi del 20 ottobre 2026. Oggetto: i file presenti nella cartella `stable`, non una sessione Marketing Cloud autenticata. Le indicazioni sulle funzionalità derivano dalla lettura dei sorgenti; i test della nuova versione usano dati e interfacce simulate. Dove un comportamento dipende da Salesforce è indicato esplicitamente.

## 1. Che cosa c'è nella cartella

È già una vera estensione Chrome, chiamata **SFMC UI Fixer**, con Manifest V3, versione 1.0, e autore indicato nel package `Simone Luise`. Non è una Salesforce App e non richiede di installare un pacchetto nel tenant per il funzionamento previsto dal codice.

L'estensione aggiunge pulsanti, pannelli, stili e comportamenti alle pagine Marketing Cloud mentre lavori con la tua sessione già autenticata. Può anche inviare richieste alle API interne usate dall'interfaccia, per esempio per leggere una DE o inserire più record. Vale quindi il normale accesso Salesforce dell'utente: l'estensione non concede permessi aggiuntivi su altre BU.

L’autore della versione Multi BU preparata è **Francesco Trepiccioni**. La cartella `stable` è rimasta intatta. La versione modificata è in `sfmc-ui-fixer-multi-bu`. Il pacchetto installabile in modalità sviluppatore viene generato in `dist`.

## 2. Come funziona tecnicamente

Il percorso principale è questo:

```text
Pagina/iframe di Marketing Cloud
  → loader.js (content script Chrome, mondo isolato)
  → content.js (script nel contesto della pagina)
  → modulo del prodotto: Contact / Content / Automation / Journey / Query Studio
  → componenti, stili e template HTML

Script nella pagina
  ↔ messaggi window.postMessage
  ↔ loader.js
  ↔ background.js, service worker Chrome
  ↔ chrome.storage.local
```

`manifest.json` stabilisce domini, permessi e file iniziali. L'opzione `all_frames: true` consente l'esecuzione anche negli iframe, molto usati da Marketing Cloud. Non significa che tutti gli iframe espongano lo stesso contesto o che siano accessibili senza limiti.

`loader.js` crea la configurazione e inietta `content.js`. Fa da ponte per storage e fetch perché lo script nella pagina non può usare direttamente `chrome.*`. Alcune pagine, compreso il contenitore `/cloud/`, vengono ignorate: il lavoro avviene soprattutto nei frame dei singoli prodotti.

`content.js` crea l'oggetto globale `window.sfmcfix`, carica CSS/JS/HTML e sceglie il modulo in base all'URL. Installa intercettori jQuery sulle richieste AJAX: i moduli possono osservare risposte, modificare liste restituite o sostituire alcune risposte con dati locali. Le cartelle "Recently used" del selettore DE sono esempi di cartelle virtuali dell'interfaccia: non sono vere cartelle create nel tenant.

`background.js` legge e scrive lo storage dell'estensione. Serializza le modifiche, così due frame non si sovrascrivono facilmente durante un merge. Il clic sull'icona apre la pagina delle versioni SQL.

Nella nuova versione `context.js` viene inizializzato prima dei moduli: gestisce stack, MID, preferenze, cache separate e costruzione dei link. Il nuovo `contactbuilder/email-studio.js` osserva il dettaglio della DE e mantiene aggiornato il collegamento a Email Studio.

**Dipendenza fondamentale:** molte integrazioni usano API e selettori dell'interfaccia Salesforce, non un contratto API pubblico stabile. Una modifica a Marketing Cloud può richiedere manutenzione dell'estensione.

## 3. Funzioni realmente presenti nell'originale

### Contact Builder

| Funzione | Comportamento letto nel codice | Limiti |
| --- | --- | --- |
| Ricerca avanzata DE | Ricerca per nome con contiene, inizia con, finisce con; mostra nome e percorso | Legge la prima pagina, fino a 25 risultati. Non è una ricerca simultanea in tutte le BU |
| DE recenti | Memorizza le ultime DE visitate e offre un collegamento alla cartella | Circa 9 voci; nell'originale cache non separata per BU |
| Prima/ultima pagina | Aggiunge pulsanti per saltare agli estremi nella vista Record | Dipende dal pager corrente dell'interfaccia |
| Clone | Copia una riga visibile nel modulo di nuova riga | Usa il testo delle celle: HTML, date e formattazioni richiedono controllo prima del salvataggio; non duplica la definizione della DE |
| Multi Rows | Costruisce una tabella per inserire più righe; distingue chiavi e valori dalla definizione dei campi | Scrive dati reali dopo conferma; la validazione locale non sostituisce quella Salesforce |
| CSV | Esporta i record già caricati nella pagina corrente | Non esporta automaticamente l'intera DE; separatore `|` |
| Strumenti SMS | Evidenzia caratteri non GSM nel campo riconosciuto `sMS_TEXT`; collegamento a Messente | Riconoscimento del campo specifico; conteggio segmenti originale approssimativo |
| Campi più comodi | Rende più agevole l'editing di alcuni input | Dipende dai selettori dell'interfaccia |
| Validazione URL media | Nell'originale applicata a una sola DE con GUID fisso | Nella nuova versione applicata al campo `mediaURL` quando presente |

L'originale contiene anche componenti per una configurazione SMS aziendale, ma il caricamento del relativo pulsante è commentato e gli identificativi erano specifici del team. Non è una funzione generale attiva pronta per tutte le organizzazioni.

### Content Builder / Preview & Test

| Funzione | Comportamento letto nel codice | Limiti |
| --- | --- | --- |
| Autocompletamento tester | Cerca nome, cognome ed email in un elenco JSON statico; propone fino a 5 indirizzi | L'originale include contatti personali; nella nuova versione il file con i contatti è escluso e la rubrica è configurabile localmente per BU |
| Log test send | Registra localmente il payload del tentativo di invio, con data, destinatari, email e origine dati | Conservazione effettiva **60 giorni**, non 90 come scritto nel documento originale |
| Anteprima da log | Richiede una nuova preview usando email, DE e riga del test registrato | Non è una fotografia storica del rendering: asset e dati vengono riletti e possono essere cambiati |
| DE recenti per preview | Aggiunge cartelle virtuali per le DE utilizzate nell'email corrente e nei test recenti | Nell'originale legate alla cartella 782; nella nuova versione serve che la radice DE venga riconosciuta dalla risposta nativa |

Il log viene scritto **prima della risposta dell'invio**: documenta il tentativo e non certifica che l'email sia stata inviata o consegnata. Il tasto Remove è disabilitato nel template dei singoli log dell'originale.

### Automation Studio

- Mostra le ultime automation visitate, fino a circa 10.
- Aggiunge collegamenti per aprire un'attività dal canvas in una scheda separata, quando la risposta nativa contiene i relativi identificativi.
- Nella Query Activity aggiunge download JSON della configurazione, copia SQL e alternanza tra SQL scritto e SQL validato/generato da Marketing Cloud.
- Collega la DE target al dettaglio in Contact Builder.
- Salva uno snapshot locale della query/configurazione quando si entra in modifica tramite i pulsanti intercettati. Non è un audit completo di ogni modifica e non intercetta modifiche effettuate fuori dal percorso osservato, da altri utenti o via API.
- Il visualizzatore aperto dall'icona consente ricerca, lettura SQL, download ed eliminazione delle copie locali. Non ripristina automaticamente una Query Activity in Salesforce.

La nuova versione separa gli snapshot per stack/MID, mostra il contesto nel visualizzatore e aggiunge esportazione dello storico JSON. Le cancellazioni sono passate al service worker per non sovrascrivere versioni appena salvate da altri frame.

### Query Studio

- Comprimi/riapri la sidebar.
- Salva nuove query, aggiorna bozze, elenca e visualizza quelle salvate.
- Mantiene copie speciali dell'ultima query lanciata e dell'editor alla chiusura.
- Tenta di recuperare l'ultima query quando l'editor è vuoto.
- Copia la lista dei campi per preparare una SELECT; non genera una query completa con FROM e JOIN.
- Il pulsante originariamente chiamato `PKs` selezionava i campi **obbligatori**, non verificava le vere chiavi primarie. Nella nuova versione è denominato `Required`.

La nuova versione gestisce testo Unicode nel salvataggio locale. Il recupero alla chiusura resta dipendente dagli eventi del browser: non è un backup garantito contro crash o chiusura forzata.

### Journey Builder

Il collegamento preesistente apre un Journey referenziato da un elemento riconosciuto (`.ixn-collection-definition`) usando lo stack corrente.

Dalla versione 1.1.6 il modulo `journey/entry-de.js` legge esclusivamente i metadati della versione aperta: GET `/fuelapi/interaction/v1/interactions/<GUID>?extras=all&versionNumber=<n>` e, quando necessario, GET `/fuelapi/interaction/v1/eventDefinitions/<GUID>` oppure `key:<chiave>`. Richiede corrispondenza di ID e versione e una sola entry; accetta solo un GUID esplicito `dataExtensionId`/`dataExtensionID` nel trigger o nella definizione dell’evento. Non usa i dati delle attività successive, il nome della DE o l’External Key come se fossero il GUID.

Il comando **Apri Data Extension** viene aggiunto a elementi HTML con identificatori nativi corrispondenti al trigger (`data-key`, `data-activity-key`, `data-event-key`, riferimenti espliciti alla definizione evento o ID dell’elemento); sono supportati anche contenitori univoci di entry DE con tipo esplicito. Non viene costruito un overlay sul canvas SVG né aggiunta una barra generale. L’HTML effettivo dell’entry dell’utente non è ancora disponibile: il posizionamento resta da verificare/adattare nel tenant. Se il riquadro non è riconosciuto non compare alcun link.

Al cambio di route, versione o contesto il comando viene rimosso, la richiesta precedente annullata e le risposte tardive ignorate. Errori di accesso, eventi senza DE e più trigger non generano una destinazione di ripiego. Le letture non interrogano record delle DE e non modificano Journey o configurazioni.

## 4. Voci previste ma assenti o incomplete

Il file originale elenca come "upcoming", "to be analyzed" o commentati, fra gli altri:

- reinvio di un test dal log e indicazione log obsoleti;
- rinnovo automatico del token;
- trasferimento di record selezionati a un'altra DE;
- apertura DE da Query Studio in Contact Builder;
- collegamento DE da Email Studio a Contact Builder;
- apertura Journey dalle interazioni in Email Studio;
- impostazioni generali e Data Viewer.

Questa versione aggiunge preferenze essenziali per BU, l'esportazione dello storico SQL e la struttura del collegamento Contact Builder → Email Studio. Non presenta tutte le voci future come già implementate.

## 5. Perché l'originale non era universale per BU

**Stack e Business Unit sono cose diverse.** Il riferimento `s7` indica l'istanza/stack di Marketing Cloud, non il MID. Due BU possono condividere lo stesso stack e dominio; sostituire soltanto `s7` non separa i loro dati locali.

Ho trovato riferimenti operativi fissi allo stack s7 nei collegamenti Journey, Automation e Contact Builder, nella risoluzione delle cartelle e negli endpoint di inserimento righe. C'erano inoltre una cartella DE radice 782, GUID specifici per strumenti SMS/push e un elenco tester incorporato.

Cronologie DE, automation, test send e Query Studio usavano chiavi generiche nel `localStorage` del dominio. Le versioni SQL usavano uno spazio condiviso dell'estensione senza contesto BU esplicito.

Altri limiti riscontrati: il modulo DE non veniva caricato entrando direttamente sul dettaglio in alcune condizioni; il riconoscimento Journey era esclusivo di s7; i domini esposti dalle risorse del manifest non coincidevano interamente con quelli di caricamento; mancavano veri test; alcuni errori di ricerca lasciavano lo stato bloccato.

## 6. Che cosa cambia nella versione preparata

- Lo stack viene letto dal dominio corrente, dal referrer o dagli ancestor origin; non esiste un fallback silenzioso a s7.
- Il MID è letto solo da campi espliciti riconosciuti nel contesto nativo o nell'URL. Poiché non tutte le UI lo espongono nello stesso modo, esiste l'inserimento manuale per documento. Dopo un ricaricamento il MID manuale non viene riattivato automaticamente: un suggerimento validato in `sessionStorage` per scheda/origine permette di riconfermarlo. Il suggerimento non identifica la BU e non apre alcuna rubrica prima della conferma; un MID nativo riconosciuto ha sempre priorità. Non è stato verificato quali campi esponga il vostro tenant.
- Le cache sono prefissate con versione, stack e MID. Esempio concettuale: `SFMCFIX:v2:s42:123456:...`. L'isolamento evita di riusare cronologie di un'altra BU riconosciuta; non è una barriera di sicurezza contro altri script che girano nella stessa pagina.
- Se il contesto non è disponibile, le cronologie sono solo temporanee; niente archivio persistente in una BU "sconosciuta" condivisa. Il versionamento SQL chiede prima di impostare il MID.
- Le preferenze e i tester sono salvati nello storage Chrome per contesto; il collegamento Email Studio non richiede più un modello di URL. Il MID manuale non è un cambio BU Salesforce: devi aver selezionato la BU corretta nell'interfaccia.
- Gli endpoint di scrittura delle righe usano l'origine corrente e la DE aperta, con un controllo prima dell'inserimento multiplo.
- I link esistenti verso attività, Journey e Contact Builder usano lo stack corrente. Continuano a dipendere dalla sessione e dalla BU attiva di Salesforce; non effettuano un cambio account automatico.
- La ricerca gestisce caratteri speciali, cancellazione delle richieste superate ed errori HTTP. L'esportazione CSV gestisce virgolette, separatori e ritorni a capo.
- Il proxy fetch esegue soltanto GET HTTPS sui domini Marketing Cloud ammessi. Il permesso `tabs` è stato rimosso: aprire la pagina interna non richiede il permesso di leggere le schede.
- Le anteprime email sono mostrate in un iframe sandbox. L'elenco personale dei tester non viene incluso nel pacchetto.

Questi cambiamenti rendono il codice **configurabile e collaudabile su BU e stack diversi**. Non costituiscono una certificazione di compatibilità con qualsiasi configurazione Salesforce.

## 7. La nuova funzione Contact Builder → Email Studio

Il comando compare dentro il contenitore del dettaglio DE, nelle schede Proprietà o Record. Legge il GUID dalla route Contact Builder `#admin/data-extension/<GUID>/...`. L'osservazione del DOM e il listener `hashchange` lo aggiornano quando Salesforce cambia pagina senza ricaricare il documento. Il GUID è riletto anche al clic, evitando un collegamento rimasto sulla DE precedente.

Il collegamento è automatico: lo stack deriva dal contesto corrente e il GUID dalla route Contact Builder. Non richiede un modello URL o l’inserimento manuale del MID. Dalla versione 1.1.5 MID e Tester BU si aprono dall’icona Impostazioni SFMC accanto a Test History, solo in Preview and Test. La barra flottante generale è stata rimossa dalle Data Extension e dagli altri moduli; nel Journey Builder e nei suoi frame i controlli restano esclusi. Il rilevamento del contesto continua a funzionare anche senza interfaccia flottante.

La rotta nativa è `Subscribers/Data_Extensions/<GUID>/edit`. È stata individuata nel codice Email Studio fornito per l’analisi: `js/router` inoltra `data_extensions` a `loadDE`, quindi a `loadExistingDE`; il ramo della UI moderna apre `de-pages` con `job: properties` e lo stesso identificativo, mentre quello legacy apre `ObjectDetails.aspx` con quel GUID. Il modello nativo carica i metadati da `internal/v1/customobjects/<GUID>`, coerentemente con il dettaglio di Contact Builder.

La shell può riportare il percorso al solo Subscribers durante l’avvio, scartando il dettaglio. Dalla versione 1.1.4 il link passa il GUID come parametro `sfmcfix_de` nel frammento della pagina Email. Uno script isolato a `document_start` lo conserva prima della normalizzazione del percorso, poi attende il documento C12 effettivamente caricato. Dalla versione 1.1.7 il documento può essere su `members.<stack>.exacttarget.com` oppure `mc.<stack>.exacttarget.com`, sempre sullo stesso stack: annuncia un `MessageChannel` alla shell, che verifica origine effettiva, finestra dell’iframe e percorso dichiarato prima di accettarne la porta. Richieste e risposte passano attraverso questa porta, legata al documento, anche se `iframe.src` conserva l’indirizzo precedente a SSO. La shell non invia più postMessage a un’origine ipotizzata dal src durante il caricamento. Uno script nel mondo principale del frame attende il router Backbone nativo e `_NavState`, quindi richiama la rotta del dettaglio e conferma che lo stato nativo contiene il GUID richiesto. Non esegue scritture sui dati della DE.

L’annuncio iniziale verifica origine e finestra; i messaggi sul canale dedicato verificano GUID e identificativo della richiesta. Annunci da finestre estranee o stack diversi vengono scartati. Le porte vengono chiuse al completamento o all’annullamento. Le richieste duplicate non provocano nuove navigazioni; l’attesa è limitata e si annulla se si lascia Email Studio. Le schede Email aperte senza il parametro dell’estensione mantengono il comportamento ordinario. Non servono nuovi permessi. L’apertura usa un normale link HTTPS con destinazione `_blank` e `noopener noreferrer`; il GUID viene ricalcolato al clic e prima della destinazione del pulsante centrale.

Il collegamento usa la sessione Email Studio corrente e non cambia automaticamente cliente o BU. Seleziona la BU corretta e riapri Contact Builder dopo un cambio di contesto. Per DE condivise, sincronizzate o di altri tipi speciali occorre verificare disponibilità e permessi nel tenant. La verifica locale del router non equivale a un collaudo autenticato su ogni tenant.

### Visibilità e tracking dei test dalla versione 1.1.6

La chiave generale `SFMCFIX---UI-PREFERENCES` in `chrome.storage.local` contiene `hidePreviewIcons`. La pagina dell’estensione la salva attraverso il service worker e i frame recepiscono gli aggiornamenti tramite il bridge esistente. Non dipende da stack/MID e non altera `SFMCFIX---SETTINGS-V2` o i log. Le icone possono essere riattivate dalla pagina dell’estensione anche quando entrambe sono nascoste.

Il nuovo collegamento accanto a Send Test usa il percorso Tracking fornito dall’utente con lo stack corrente e un marcatore nel frammento. Gli script dedicati conservano l’intento prima della normalizzazione della shell, usano lo stesso annuncio verificato e canale privato della navigazione DE, controllano l’identificativo della richiesta, attendono il router nativo e il frame `fraLeftNav.frames.fraTree` con `strCurSect` uguale a `tracking`, poi cliccano la voce nativa Test Send Emails. Non viene dedotto un category ID dal nome e non viene selezionata la cartella generica Sends. L’attesa è limitata; le normali pagine senza marcatore non vengono modificate. Il comando apre la cartella generale dei test e non identifica un singolo job.

Dalla versione 1.1.8 Tracking usa `_NavState.curNavItem` per riconoscere il menu selezionato: `sectionId` può legittimamente essere nullo dopo un clic nativo. Per cambiare sezione imposta `sectionId: Tracking`, lasciando a `navView._selectItem` e `uiView/legacyView` il caricamento della vista già presente. Non invoca `Backbone.history.navigate(..., {trigger:true})` sul percorso generale Tracking: il router nativo `switchPage` rimuove `currentView` prima di costruire la nuova vista e può rimuovere il contenitore di base.

Dopo il clic sulla cartella, l’apertura viene confermata solo quando `fraContent` ha un documento caricato, non vuoto e diverso dal documento precedente (oppure già intitolato Test Send Emails). Il controllo è strutturale e non legge i record dell’elenco. Le fasi comunicate alla shell e gli errori distinguono inizializzazione, cambio di menu, ricerca della cartella e caricamento del contenuto.

Dalla versione 1.1.9 l’URL iniziale di Tracking test usa `ks#Subscribers`, già impiegato dal collegamento DE funzionante; `sfmcfix_tracking=tests` mantiene separata la destinazione finale. Per un modello di stato esistente ma senza `curNavItem`, il codice verifica la presenza di `fraLeftNav` e della voce Tracking in `ET.Config.navData.entry`, quindi attiva una sola volta la selezione nativa, azzerando soltanto gli argomenti di navigazione transitori. Quando `sectionId` è già Tracking, riemette l’evento pubblico del modello perché il valore identico non genera un evento Backbone. Il listener nativo resta responsabile della scelta della voce; non vengono inventati modelli o identificativi.

In caso di errore la shell permette di scaricare `sfmc-tracking-diagnostica.json`. Il documento C12 riporta solo host/percorso senza query, stato del documento, presenza di stato/menu/frame, sezioni appartenenti a un elenco fisso e flag del tentativo di recupero. La shell aggiunge versione, data e presenza del canale nativo. Non vengono esportati campi arbitrari del modello, nomi di utenti, MID, record, token o contenuti delle risposte. Il file viene creato solo al clic dell’utente e non inviato automaticamente.

## 8. Dove finiscono i dati

| Dati | Posizione nella nuova versione | Note |
| --- | --- | --- |
| DE recenti, automation, test send, query salvate | `localStorage` del modulo, separato per stack/MID | Non si sincronizzano automaticamente tra dispositivi o domini diversi |
| Cache quando manca il contesto | Memoria del documento | Si perde al ricaricamento |
| Preferenze e tester | `chrome.storage.local`, per stack/MID | Persistono al ricaricamento; il MID manuale va riconfermato per accedere alla stessa rubrica |
| Suggerimento del MID manuale | `sessionStorage` della pagina, per scheda/origine | Solo promemoria per la conferma; non attiva il contesto né assegna automaticamente i tester alla BU |
| Versioni Query Activity | `chrome.storage.local`, per stack/MID | Restano finché eliminate o rimossa l'estensione; esportabili JSON |
| Dati reali DE e asset | Salesforce | Le funzioni di scrittura modificano il tenant con la sessione dell'utente |

Non ho trovato un backend di telemetria dell'estensione. Le richieste operative vanno a Salesforce e alle risorse locali. Il collegamento SMS a **Messente**, quando cliccato, apre invece un servizio esterno mettendo il testo nel parametro URL: quel testo è quindi inviato al sito. Il pacchetto mantiene questa funzione esplicita dell'originale.

Il `localStorage` non equivale a un archivio protetto o a un backup centralizzato. Disinstallazione, pulizia dei dati browser, profili differenti e limiti di quota possono far perdere i salvataggi. I file JSON esportati possono contenere SQL, nomi di DE e configurazioni interne.

## 9. Installazione e distribuzione

Per provarla ora: estrai `dist/sfmc-ui-fixer-multi-bu-diagnostica.zip`, apri `chrome://extensions`, attiva Modalità sviluppatore, scegli Carica estensione non pacchettizzata e seleziona la cartella estratta contenente `manifest.json`. Disabilita l'originale se era già installata, poi ricarica Marketing Cloud.

Per una distribuzione ordinaria con **Aggiungi a Chrome** serve il Chrome Web Store: account sviluppatore, scheda dell'estensione, descrizioni dei dati/permessi, materiali richiesti dallo store e revisione Google. Il pacchetto ZIP è il sorgente da caricare, non un'installazione automatica già pubblicata. In aziende con Chrome gestito l'amministratore può valutare le policy di distribuzione.

Questa distinzione è prevista dalla [documentazione ufficiale Chrome sulla distribuzione](https://developer.chrome.com/docs/extensions/how-to/distribute). L'installazione di sviluppo è descritta nel [tutorial ufficiale](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world).

Non è stata effettuata una pubblicazione né modificata la configurazione di Chrome dell'utente.

## 10. Verifiche eseguite e collaudo ancora necessario

Le verifiche locali del collegamento coprono URL su stack differenti, MID differenti o assente, vecchi modelli URL ignorati, aggiornamento del GUID durante la navigazione senza ricaricamento, apertura del collegamento, scomparsa tornando all’elenco e assenza di una destinazione con stack ignoto. Sono stati verificati anche sintassi JavaScript e integrità del pacchetto.

I controlli del router utilizzano il modulo nativo `js/router` fornito per l’analisi, con dipendenze e stato applicativo simulati: verificano che il GUID raggiunga Properties nella UI moderna e ObjectDetails nella UI legacy. Le prove con frame di origini diverse riproducono la normalizzazione del percorso esterno, il caricamento ritardato del modulo e del router, l’annullamento quando si cambia modulo, il rifiuto dei messaggi di conferma di origine errata e il timeout. Le prove nel browser usano pagine simulate. Non eseguono le API Salesforce né certificano l’apertura in una sessione autenticata; il collaudo reale resta necessario.

La rubrica mantiene il formato di archivio precedente: un array di triple Cognome/Nome/Email per stack e MID. L’editor a righe non impone un numero massimo; controlla ogni email, mostra gli errori di salvataggio e chiude senza salvare se cambia contesto. Il limite di cinque riguarda soltanto i suggerimenti visibili della ricerca. Il menu e Test History seguono la presenza del pannello nativo Preview and Test; la visibilità si aggiorna anche durante la navigazione senza ricaricamento.

Le verifiche nel browser simulato coprono dieci tester aggiunti e salvati dall’editor, recupero dei contatti preesistenti, annullamento, email non valide, errore dello storage, rimozione di una riga, ricerca e selezione del decimo tester, menu con tastiera, assenza di sovrapposizioni con il footer, uscita da Preview and Test e finestra su schermi piccoli. I controlli della rubrica usano uno storage simulato persistente tra i documenti: verificano salvataggio e recupero dopo il ricaricamento, riconferma obbligatoria del MID manuale, annullamento, separazione di due BU, priorità del MID nativo, rifiuto di suggerimenti di stack diverso o malformati e funzionamento quando `sessionStorage` non è disponibile.

Le nuove prove coprono la scelta di visibilità nella pagina reale dell’estensione con API Chrome simulate, persistenza al ricaricamento, aggiornamento in più pagine, ripristino dopo errore e integrità della rubrica. Il tracking è provato con il router nativo fornito e una navigazione fra tre frame simulati su stack diversi, cartella mancante, timeout, annullamento e pagina senza marcatore. Le prove Journey simulano i metadati: GUID/versione/evento, cambio versione, risposta obsoleta, evento senza DE, più trigger, permessi negati e aggancio a identificatori HTML espliciti. Non certificano la struttura DOM o l’autenticazione effettiva del tenant.

La regressione 1.1.7 riproduce con il codice precedente il messaggio esatto di origine non corrispondente mostrato dall’utente. I nuovi controlli osservano anche gli errori console del browser e coprono iframe.src ancora su members con documento su mc, documento intermedio C12 prima di un secondo reindirizzamento, risposta ritardata e SSO senza aggiornamento del src. Le aperture DE e tracking devono completarsi senza l’errore di origine; un falso annuncio dalla shell non deve ricevere il GUID. Una prova esegue la shell in un mondo isolato del browser e il ricevitore nel mondo principale, anche con reindirizzamento su mc. Queste navigazioni sono simulate e non verificano la catena SSO autenticata del tenant.

La regressione 1.1.8 usa Backbone 0.9.10 e i moduli nativi router, navView, uiView e legacyView forniti per l’analisi; i dati di navigazione e i server restano simulati. Con il codice precedente riproduce la rimozione della vista di base, che i vecchi test non simulavano. Con il nuovo codice verifica menu e vista preservati, sectionId nullo, menu già su Tracking, modello e contenuto ritardati, etichette span, risposta vuota del contenuto, cartella mancante e annullamento. Una prova usa shell isolata e documento reindirizzato da members a mc. Le dipendenze della prova sono esterne al pacchetto e non aggiungono librerie all’estensione.

Le prove 1.1.9 riproducono il timeout con `curNavItem` nullo e verificano il recupero sia quando `sectionId` è diverso, sia quando è già Tracking, inclusi argomenti di navigazione iniziali ancora presenti. Verificano anche il link da Preview and Test con ingresso Subscribers e marcatore Tracking, il download reale del rapporto JSON in caso di modello assente e l’esclusione di valori fittizi di sessione/contatti dai dati esportati. Il bootstrap e i server del tenant restano simulati: il rapporto serve a rilevare lo stato effettivo se il problema persiste nella sessione autenticata.

Prima di distribuire al team, il collaudo sul tenant deve coprire:

1. Caricamento in Chrome senza errori e comportamento con la versione originale disabilitata.
2. Due BU sullo stesso stack: MID mostrato, passaggio tra BU, cronologie e tester distinti.
3. Se disponibile, uno stack diverso da s7 e più moduli con iframe diversi.
4. Ricerca DE con caratteri speciali e apertura cartella; verifica del limite 25 risultati.
5. DE Proprietà/Record, clonazione e inserimento multiplo su dati di prova; CSV con a capo e virgolette.
6. Un test send con esito positivo e uno fallito: il log deve restare inteso come tentativo.
7. Cartelle virtuali delle DE recenti nel vostro selettore Content Builder.
8. Una Query Activity aperta e modificata, storico e download; due schede contemporanee.
9. Query Studio con accenti/Unicode, recupero bozza e passaggio di contesto.
10. Apertura automatica in Email Studio senza configurazione: DE A e poi DE B senza ricaricare, confronto nome e GUID, altre BU e stack, eventuali DE condivise e sessione scaduta.

La compatibilità universale e il collegamento Email Studio non possono essere dichiarati verificati prima di queste prove. Il collaudo deve confermare la destinazione della DE e il contesto della sessione.

## 11. Manutenzione e distribuzione

L’estensione non richiede una build o dipendenze npm. Modifica i sorgenti, ricarica l’estensione dalla pagina Estensioni e aggiorna le pagine Marketing Cloud aperte. Il distribuibile aggiornato si trova in `dist/sfmc-ui-fixer-multi-bu-diagnostica.zip`, con `manifest.json` alla radice.

Il pacchetto caricato originariamente non includeva i file `tests/extension.test.cjs` e `scripts/package_extension.py` citati nella documentazione precedente: quei comandi non sono disponibili in questo checkout. I controlli descritti sopra sono stati eseguiti durante lo sviluppo. La guida di collaudo Markdown e PDF descrive le prove da eseguire sul tenant.
