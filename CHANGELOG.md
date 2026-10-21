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
