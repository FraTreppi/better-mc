# 1.1.22 — 23 ottobre 2026

- Corretto Apri sui risultati Advanced fuori dalla griglia: la navigazione viene risolta e invocata attraverso i gestori registrati da Content Builder, anche con pushState e hashchange disattivato. Eliminata l’assegnazione di hash ipotizzati.
- Conferma dell’asset caricato tramite evento dei metadati, oppure cambio di vista con quello stesso asset in cache. Aperture non riconosciute o senza conferma ripristinano pannello, filtri e risultati. Cambio BU e annullamento invalidano le conferme tardive.
- Diagnostica estesa con metodo/esito e schemi statici di navigazione limitati e ripuliti dei numeri, senza ID o nomi degli asset. Nessun nuovo permesso o proxy.
- Verifiche con Backbone reale per risultato fuori pagina, apertura a freddo, cache, rotta assente, comando senza effetto e ripristino. Aggiunte le sole librerie MIT nei fixture di test, separate dai componenti eseguiti dall’estensione. Guida Markdown/PDF aggiornata.

# 1.1.21 — 23 ottobre 2026

- Corretta la scelta del client per Advanced quando Fuel non è esposto: riconosciuti Backbone.ajax e jQuery.ajax della pagina e i relativi moduli AMD già inizializzati. Conservati ajaxSetup, prefilter, beforeSend e opzione useFuel2Token della gestione nativa.
- La query POST non usa più fetch diretto. Se il client nativo non è disponibile viene segnalato senza inviare la POST; un 403 nativo non genera tentativi con un altro client. MID automatico e isolamento delle risposte restano attivi.
- Riprodotto il caso della diagnostica: MID riconosciuto, GET cartelle 200 e POST fetch 403. Aggiunte verifiche browser che richiedono la configurazione AJAX della pagina per accettare la ricerca, compreso il pacchetto realmente caricato in Edge.
- Aggiornati messaggio 403, diagnostica e guida Markdown/PDF per distinguere il numero MID dal collegamento della ricerca. Nessun nuovo permesso, proxy o dato di sessione esportato.

# 1.1.20 — 22 ottobre 2026

- Richieste Advanced allineate al codice nativo Salesforce fornito: scope ours, intestazioni AJAX/versione dati e Content-Type nativo; operatore contains e array values per i tipi. Riconosciuto anche il client fuel-ajax AMD già inizializzato.
- Rilevamento MID automatico in Content Builder da organization.id del contesto della sessione, con timeout breve, rinnovo prima della ricerca e gestione del cambio BU. Nessun ripristino automatico di un MID manuale di un cliente precedente.
- Messaggio 403 distinto dal MID assente e download diagnostico dal pannello, senza Console, token, termini cercati, metadati degli asset o record. Nessun tentativo per aggirare il rifiuto Salesforce.
- Regressioni per intestazioni/scope obbligatori, contesto senza MID nell’URL, cambio BU, moduli AMD e annullamento durante il rilevamento. Guida Markdown/PDF aggiornata.

# 1.1.19 — 22 ottobre 2026

- Aggiunta ricerca Advanced accanto al campo Search di Content Builder. Cerca per nome, Customer Key o ID in tutte le cartelle della BU corrente, con corrispondenza testuale, tipi di asset, cartella specifica, date UTC di ultima modifica e ordinamento.
- Risultati paginati fino a 50 elementi, percorsi cartelle in memoria e apertura nella stessa scheda tramite riga nativa o percorso interno degli asset. Riconosciuti campo Search e righe Content Builder forniti dall’utente; nessuna operazione nel cestino.
- Lettura dei metadati tramite query asset e categorie della stessa origine, con client Fuel quando disponibile. Interruzione, timeout, errori espliciti e protezione dalle risposte obsolete al cambio filtri o BU; nessun nuovo permesso o salvataggio persistente.
- Aggiunte verifiche della query, del client nativo e dell’interfaccia su Chromium/Edge; estesa la prova del pacchetto realmente caricato. Aggiornate guida Markdown/PDF e documentazione di sicurezza.

# 1.1.18 — 22 ottobre 2026

- Pacchetto unico esplicitamente supportato su Google Chrome e Microsoft Edge basato su Chromium. Aggiornate descrizione e istruzioni di download, installazione manuale da edge://extensions, aggiornamento e separazione dei salvataggi locali fra browser.
- Confermate su Microsoft Edge ufficiale le API native del service worker, l’accesso protetto allo storage, l’identità dei documenti, i salvataggi tester per BU e le notifiche alle pagine. Aggiunta una verifica ripetibile del pacchetto realmente caricato, senza simulare le API dell’estensione o modificare policy del browser.
- Messaggio relativo all’identità del documento reso indipendente dal nome del browser. Permessi e controlli di sicurezza invariati. Guida utente Markdown e PDF aggiornata.

# 1.1.17 — 22 ottobre 2026

- Aggiunto Auto refresh 5s ON/OFF nella barra del Run Log in Automation Studio, accanto alle date. Aziona il refresh nativo ogni cinque secondi senza ricaricare la scheda.
- Riconoscimento del pulsante FuelUX refresh fornito dall’utente, limitato al Run Log con due date e comando univoco. Le richieste native jQuery già osservate e i comandi disabilitati sospendono i nuovi clic; il cambio automation o BU disattiva l’automatismo.
- Stato conservato durante la ricostruzione della barra e sospensione mentre il Run Log è nascosto. Nessun nuovo permesso, endpoint o dato persistente.
- Aggiunta verifica browser con timer controllato, richieste lente, sostituzione della barra, cambio automation/BU e comandi ambigui. Guida utente Markdown e PDF aggiornata con le istruzioni della funzione.

# 1.1.16 — 22 ottobre 2026

- Corretta la lettura della rubrica DE quando Salesforce restituisce i campi Email/Nome/Cognome in minuscolo o con maiuscole diverse dai nomi dichiarati nello schema. Gestiti anche i record suddivisi in keys/values.
- La sorgente DE accetta Nome e Cognome testuali fino a 4000 caratteri, senza escludere un contatto valido per il precedente limite di 250 caratteri. Limiti e validazione della rubrica locale restano invariati.
- Le esclusioni indicano motivo e conteggio: Email mancante o non valida, nomi non validi, formato non riconosciuto o campi ambigui. Nessun valore personale nei messaggi. Copie identiche dello stesso campo vengono riunite; valori in conflitto non vengono risolti scegliendo un indirizzo arbitrariamente.
- Salva sorgente resta disabilitato se tutte le righe presenti sono inutilizzabili; una DE realmente vuota resta configurabile. Aggiornate guida e regressioni su lettura, ricerca e selezione dei tester senza invii.

# 1.1.15 — 22 ottobre 2026

- CSV ora esporta l’intera DE selezionata, senza limitarsi alla pagina caricata e senza ereditare filtri della griglia. Lettura paginata di tutti i record, anche 100.000, con adattamento alla dimensione effettiva restituita dal server.
- Avanzamento leggibile, annullamento e blocco del secondo avvio. Cambio DE/BU o uscita da Records annullano il lavoro; le pagine della stessa DE possono essere navigate durante l’esportazione.
- Fino a tre letture contemporanee con ordine di uscita preservato, timeout e tentativi limitati per errori temporanei e rate limit. Blocchi CSV in Blob senza accumulare tutti gli oggetti JSON, conservazione di UTF-8 e protezione dalle formule.
- Validazione di schema, totale, pagine complete e chiavi primarie uniche; controlli finali e download soltanto a lettura completata. Una DE vuota produce le intestazioni. Nessun limite aggiunto di 1000 o 100.000 record e nessuna scrittura nella DE.
- Aggiornate guida Markdown/PDF e regressioni per esportazione completa, 100.000 record, annullamento, cambi contesto, schema e conteggio modificati, errori ed assenza di file parziali.

# 1.1.14 — 22 ottobre 2026

- CSV della pagina corrente separato dalla cache globale dei metadati DE e associato a GUID, BU e singola richiesta. Una nuova richiesta o un cambio contesto invalidano subito i dati; risposte tardive, fuori ordine, errori e pagine vuote non recuperano la copia precedente.
- Cattura dei record tramite prefilter e Deferred jQuery, anche con global:false e percorsi API con maiuscole/minuscole diverse. Copia dei valori prima della formattazione nativa per la griglia; gestione dei campi presenti soltanto in alcune righe.
- Pulsante disabilitato finché la pagina non è disponibile e coerente con il selettore nativo; tooltip con il numero effettivo di righe esportabili, indipendente dal conteggio totale della DE. Nome file con GUID, pagina e numero di righe.
- CSV UTF-8 con BOM, costruzione in blocchi, mantenimento delle protezioni contro formule e dei caratteri speciali. Revoca degli URL Blob dopo il download per liberare le risorse tra esportazioni.
- Aggiunta regressione browser con richieste concorrenti, errori, navigazione A→B→A, cambio BU, risposte senza eventi globali, pagine da DE grandi e carichi di molte righe. Guida utente aggiornata senza risultati di collaudo.

# 1.1.13 — 22 ottobre 2026

- Il documentId fornito da Chrome viene trattato come identificativo opaco, senza presumere un formato UUID. Restano obbligatori mittente dell’estensione, modulo supportato, scheda valida e identità del documento; nessun ripiego su identificativi dichiarati dalla pagina o sul frame.
- Loader e worker verificano la propria versione per riconoscere aggiornamenti incompleti e schede con script precedenti. Gli errori di connessione indicano di ricaricare le schede dopo l’estensione.
- La registrazione non nasconde più la causa: gli errori distinguono mittente, modulo, identità documento, scheda, archivio e versione. Mostrano versione e percorso effettivo, senza URL di sessione o record.
- Gestita anche un’eccezione sincrona all’avvio dello storage protetto, mantenendo una risposta esplicita e l’accesso bloccato. Aggiunte istruzioni per distinguere vecchie segnalazioni conservate da Chrome dagli errori nuovi.

# 1.1.12 — 22 ottobre 2026

- Corretto il rifiuto “Documento non autorizzato” causato dal controllo che accettava solo identificativi documento con trattini. Sono accettati gli identificativi Chrome di 32 cifre esadecimali, mantenendo controllo del mittente, documento, modulo, stack e BU.
- Aggiunta sorgente tester DE condivisa: Data Extensions → SFMC_UI_Fixer → tester_content_builder, con Nome ed External Key esatti e campi Nome, Cognome ed Email. Scelta salvata per BU; rubrica locale precedente conservata come alternativa esplicita.
- Letture GET sulla stessa origine, controllo percorso e schema, paginazione fino a 1000 righe, cache in memoria di cinque minuti e aggiornamento manuale. Nessuna creazione o modifica dei record. Errori visibili, nessun ripiego silenzioso sulla rubrica locale e scarto delle risposte al cambio BU.
- Ricerca asincrona con nome ed email nei suggerimenti; selezionare un tester compila i destinatari senza inviare. Aggiornate guida Markdown/PDF, informazioni sicurezza e CSV dimostrativo.

# 1.1.11 — 21 ottobre 2026

- Ponte storage limitato ai moduli riconosciuti e a una sola chiave: niente letture globali, cancellazioni generali, scritture arbitrarie o notifiche complete alle pagine. Il worker verifica il mittente Chrome e conserva autorizzazioni per documento e BU; l’accesso ai dati locali richiede una conferma dal content script isolato.
- Storage locale e di sessione ristretto ai contesti fidati. Rubriche e copie SQL vengono validate e proiettate sul contesto autorizzato; le scritture restano serializzate. Rubriche fino a 1000 tester.
- Rimosso il proxy fetch generico, il permesso sul dominio degli asset sfmc-content.com e il componente SMS aziendale inattivo. Le pagine interne privilegiate non sono più risorse accessibili ai siti; aggiunta una policy restrittiva per le pagine dell’estensione.
- Codificati i valori inseriti nelle interfacce, incluso l’oggetto delle anteprime, i nomi delle automation e i metadati Query Studio. Le anteprime usano sandbox, contenuto inerte e policy di rete restrittiva; le immagini esterne richiedono un consenso esplicito per anteprima.
- Controllo SMS interamente locale, con conteggio GSM/esteso/Unicode; CSV protetti dai prefissi di formula. Limitati i campi dei log e degli snapshot, ripuliti i vecchi snapshot e i modelli URL non più usati, rimossi dump di anteprime/SQL dalla console.
- Aggiunte Guida utente Markdown/PDF con tutte le funzionalità e relative istruzioni, senza risultati di collaudo, e documentazione dedicata alla sicurezza. Sostituita la vecchia guida per il collaudo.

# 1.1.10 — 21 ottobre 2026

- Il pulsante accanto a Send Test ora si chiama **Tracking Test**.
- La ricerca della cartella usa le etichette native nei frame sotto fraLeftNav, senza imporre un valore a strCurSect o un nome al frame dell’albero.
- Menu, caricamenti e modifiche del DOM attivano subito i controlli; resta un polling di riserva a 100 ms. L’elenco dei test già aperto viene riconosciuto dal titolo o dall’intestazione/breadcrumb del contenuto, evitando un clic e un caricamento aggiuntivi.
- Le fasi che avanzano ricevono ciascuna fino a 20 secondi, entro un limite totale di 60 secondi. Dopo un errore, il controllo prosegue per due minuti in sola osservazione: se l’elenco si apre, anche manualmente, l’avviso e il pulsante diagnostica spariscono. Nessuna ulteriore navigazione o clic automatico dopo l’errore.
- Gli avvisi hanno il pulsante **Chiudi** e scompaiono comunque dopo 30 secondi. Le prove con i moduli nativi e server simulati coprono anche elenco ripristinato, breadcrumb legacy, frame rinominato, contenuto aggiornato sul posto e apertura tardiva. Nessun nuovo permesso.

# 1.1.9 — 21 ottobre 2026

- Tracking test avvia Email Studio tramite Subscribers, l’ingresso usato dal collegamento DE funzionante, conservando l’intento Tracking nel marcatore dedicato e selezionando il menu dopo l’avvio.
- Gestito il menu nativo inizializzato ma ancora privo di curNavItem: se esistono il frame legacy e la voce Tracking nei metadati nativi, viene riattivato una sola volta il normale listener di selezione. Non vengono costruiti modelli di menu fittizi né usata la rotta che rimuove la vista.
- Gli errori offrono Scarica diagnostica tracking: rapporto locale con flag di inizializzazione, presenza dei frame e sezioni native note, senza URL di sessione, credenziali o record. Nessun invio automatico.
- Riprodotto il timeout 1.1.8 su un menu non selezionato e verificato il recupero con i moduli nativi e server simulati. L’effettiva inizializzazione nel tenant dell’utente resta da verificare. Nessun nuovo permesso.

# 1.1.8 — 21 ottobre 2026

- Corretto il passaggio a Tracking: usa lo stato del menu nativo e non richiama più la rotta generale con trigger, che in switchPage può rimuovere la vista corrente. Riconosce il menu da curNavItem anche quando sectionId è nullo, uno stato valido della UI nativa.
- La selezione di Test Send Emails attende il caricamento del contenuto in fraContent prima di dichiarare aperta la destinazione. Gestite anche le etichette span con gestori di clic assegnati dal codice nativo.
- Aggiunti messaggi distinti per inizializzazione, menu Tracking, cartella mancante ed elenco non caricato.
- Riprodotta la pagina bianca della versione precedente usando il router nativo. Verificata la correzione con Backbone 0.9.10 e i moduli navView/uiView/legacyView forniti per l’analisi, su pagine simulate. Collaudo autenticato ancora necessario; nessun nuovo permesso.

# 1.1.7 — 21 ottobre 2026

- Corretto l’errore postMessage “target origin … members … does not match … mc” nelle aperture di DE e Tracking test. La shell non invia più richieste all’origine dedotta da iframe.src durante il caricamento o il passaggio SSO.
- Il documento C12 caricato annuncia un MessageChannel dedicato; la shell verifica origine reale, stack e finestra mittente prima di utilizzarlo. Supportati C12 su members e mc dello stesso stack, senza destinazioni wildcard. I canali vengono chiusi al completamento o all’annullamento.
- Riprodotto l’errore originale nel browser e verificati caricamento ritardato, reindirizzamento members → mc, passaggio da SSO, UI moderna/legacy, stack diversi e cancellazione. Prove su pagine simulate; verifica nella sessione Salesforce ancora necessaria. Nessun nuovo permesso.

# 1.1.6 — 21 ottobre 2026

- Aggiunta nelle impostazioni dell’estensione una scelta persistente per nascondere completamente entrambe le icone di Preview and Test e riattivarle dalla barra del browser. Preferenza generale del profilo, indipendente dal MID; tester e storico non vengono eliminati.
- Aggiunto Tracking test accanto a Send Test. Apre lo stack corrente e seleziona la cartella nativa Test Send Emails tramite fraLeftNav/fraTree. Attesa limitata e messaggio se la cartella non è disponibile; nessun invio automatico o ID di cartella fisso.
- Preparato il collegamento Apri Data Extension sull’entry del Journey: lettura della versione e della definizione evento, GUID esplicito della DE, aggancio a identificatori nativi dell’entry e rifiuto di risposte obsolete/ambigue. Il posizionamento nell’interfaccia dell’utente richiede ancora verifica dell’HTML dell’entry.
- Nessun nuovo permesso. Prove con pagine e risposte API simulate; verifica autenticata dei nuovi collegamenti ancora necessaria.

# 1.1.5 — 21 ottobre 2026

- Sostituita la barra flottante MID/Tester BU con un’icona Impostazioni SFMC accanto a Test History, solo in Preview and Test. Menu con due opzioni, chiusura con clic esterno o Escape e uso da tastiera. Nelle Data Extension non compaiono i controlli; uscendo da Preview and Test si chiudono menu, rubrica e storico aperti.
- Rubrica tester con campi Cognome/Nome/Email, aggiunta e rimozione di righe, validazione delle email e conferma del numero di contatti salvati. Nessun limite fisso al numero di tester; verificati dieci contatti, recupero dopo il ricaricamento e separazione tra BU. I tester già salvati restano compatibili.
- Nessun nuovo permesso o invio automatico di email. Il collegamento Email Studio resta invariato.

# 1.1.4 — 21 ottobre 2026

- Corretto il caso in cui la shell Email Studio scarta il percorso della DE e apre il solo modulo Subscribers. Il GUID viene acquisito all’avvio della pagina e inviato al frame C12 dello stesso stack quando il router è pronto; conferma del percorso, attesa limitata e annullamento quando si cambia modulo.
- Aggiunti suggerimenti per Imposta MID e Tester BU. La rubrica spiega il suo uso in Content Builder e chiede prima di impostare il MID se manca il contesto necessario per salvarla.
- Rubrica tester persistente nel browser: chiarito il salvataggio per stack/MID. Dopo un ricaricamento il pulsante ricorda il MID manuale come suggerimento da riconfermare, senza riusare automaticamente la BU di un altro cliente.
- Nessun nuovo permesso richiesto; il collegamento non richiede il MID manuale. La barra resta rimossa dal Journey Builder e dai suoi frame. Prove locali con frame di origini diverse e router nativo; collaudo autenticato della correzione ancora necessario.

# 1.1.3 — 21 ottobre 2026

- Contact Builder → Email Studio: apertura automatica tramite la rotta nativa `Subscribers/Data_Extensions/<GUID>/edit`, ricavata dal router Email Studio fornito per l’analisi. Stack rilevato dal contesto, nessun URL o MID da configurare per usare il collegamento.
- Rimossi la richiesta del modello URL e il pulsante Link Email Studio. I vecchi modelli salvati vengono ignorati. Il GUID viene ricalcolato al clic, anche con il pulsante centrale; la navigazione usa la sessione Email Studio corrente senza cambio BU automatico.
- La barra SFMC Fixer resta rimossa dal Journey Builder e dai suoi frame. Collaudo reale dell’apertura sul tenant ancora necessario.

# 1.1.2 — 21 ottobre 2026

- Rimossi barra e menu SFMC Fixer dal Journey Builder e dai documenti incorporati nel Journey, inclusi i frame con hostname differente. Resta disponibile il collegamento alle referenze dei Journey; la barra degli altri moduli resta disponibile quando aperti autonomamente.

# 1.1.1 — 21 ottobre 2026

- Diagnostica Email Studio v2: raccolta delle stringhe di navigazione nei tre bundle nativi già caricati, memoria delle richieste recenti anche dopo il riempimento del buffer del browser, attesa dei frame con analisi in corso e indicazione dei risultati incompleti. Nessuna lettura dei record o delle risposte API, nessun nuovo permesso.
- Aggiunta diagnostica di sola lettura per il collegamento Contact Builder → Email Studio: raccolta esplicita dei percorsi dei frame e delle richieste, parametri filtrati, anteprima ed esportazione JSON senza invio automatico. Nessun nuovo permesso richiesto. L’apertura automatica del dettaglio resta da implementare dopo la verifica del percorso nativo.
- Journey Builder: barra di configurazione raccolta in un menu inizialmente chiuso in alto a destra, anche nei frame delle attività, per lasciare liberi Done/Cancel e zoom. Chiusura con clic esterno o Esc.

# 1.1.0 — 20 ottobre 2026

- Autore della versione Multi BU: Francesco Trepiccioni; aggiunta guida rapida di collaudo per i colleghi, in Markdown e PDF.

- Copia separata della versione 1.0; `stable` originale conservata.
- Individuazione dello stack dal contesto corrente, senza fallback s7.
- Identificazione del MID quando esposto dalla pagina; alternativa manuale per documento.
- Cronologie DE, automation, test send e query salvate separate per stack/MID; memoria temporanea quando il contesto è sconosciuto.
- Destinatari di test configurabili per BU; elenco personale originale escluso dal distribuibile.
- Link Contact Builder → Email Studio con modello configurabile per BU, aggiornamento su navigazione SPA e controllo del GUID al clic. Necessita calibrazione sul tenant.
- Rimozione degli ID operativi fissi di DE e cartelle dai moduli attivi; rilevamento della radice DE per le cartelle virtuali delle anteprime.
- Endpoint di inserimento righe relativi al dominio Contact Builder corrente.
- Snapshot SQL separati per stack/MID, visualizzatore aggiornato, esportazione dello storico e cancellazioni serializzate che preservano nuovi snapshot concorrenti.
- Caricamento del modulo DE anche entrando direttamente sul dettaglio o navigando da altre sezioni Contact Builder.
- Correzioni a ricerca con caratteri speciali ed errori HTTP, cronologia vuota dopo cambio BU, callback jQuery, CSV con virgolette/separatori/a capo, autocomplete, query con Unicode e preview email in iframe sandbox.
- Proxy fetch limitato a letture HTTPS Marketing Cloud; permesso tabs rimosso, risorse accessibili coerenti con i domini di caricamento.
- Suite di regressione locale e script di packaging ripetibile.

Verifica automatica locale completata. Compatibilità reale di moduli, API interne, selettori, permessi, DE condivise e collegamento Email Studio da collaudare su Marketing Cloud.
