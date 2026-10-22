# SFMC UI Fixer — Guida utente

Versione 1.1.16 · Autore: Francesco Trepiccioni

L’estensione aggiunge strumenti alle schermate di Marketing Cloud: collegamenti tra moduli, rubrica dei destinatari di prova, cronologie locali, operazioni sui record delle Data Extension e strumenti SQL. Lavora con la sessione Salesforce già aperta.

## Installazione e aggiornamento

1. Estrai lo ZIP in una cartella permanente. All’interno deve essere presente il file `manifest.json`.
2. Apri `chrome://extensions` in Chrome e attiva **Modalità sviluppatore**.
3. Premi **Carica estensione non pacchettizzata** e seleziona la cartella che contiene `manifest.json`.
4. Se hai una vecchia copia dell’estensione attiva, disabilitala per evitare comandi duplicati.
5. Aggiorna le schede Marketing Cloud già aperte.

Per aggiornare una copia già installata, sostituisci i file nella **stessa cartella**, premi **Ricarica** sulla scheda dell’estensione e aggiorna Marketing Cloud. Evita di disinstallare l’estensione per un normale aggiornamento: la disinstallazione rimuove rubrica e versioni SQL conservate dall’estensione.

Non servono Node, npm, un server o password da inserire nell’estensione. Usa una versione aggiornata di Chrome, almeno 111. Il file ZIP va estratto: non si installa con un doppio clic.

## Business Unit, MID e accesso ai dati locali

Il **MID** è il numero della Business Unit. Lo **stack**, per esempio `s50`, identifica l’ambiente Salesforce. L’estensione usa entrambi per organizzare le copie locali dei dati.

In **Content Builder → Preview and Test**, apri l’icona **Impostazioni SFMC**, accanto a **Test History**. La prima opzione mostra **BU <numero> · <stack>**, oppure **Imposta MID** se il numero non è disponibile.

Se il MID non viene rilevato, scegli **Imposta MID** e inserisci quello della BU selezionata in Salesforce. Al ricaricamento può comparire **Conferma MID <numero>**: verifica il valore prima di confermarlo. Inserire un MID nell’estensione non cambia la BU in Salesforce.

Prima di rendere disponibile la rubrica o di salvare copie SQL, compare una **conferma di accesso ai dati locali**. Controlla dominio, MID e stack e accetta solo se corrispondono al contesto nel quale vuoi lavorare. La conferma vale per quel documento e quella BU; può ricomparire dopo un ricaricamento o passando a un’altra BU. Un’altra pagina non riceve automaticamente l’intero archivio.

Se rifiuti, rubrica e salvataggio SQL restano bloccati in quel documento. Puoi continuare a usare i collegamenti e gli altri strumenti; per riprovare l’accesso locale, ricarica il modulo. Questa conferma non è un accesso a Salesforce e non verifica da sola quale BU sia selezionata nel tenant.

Senza MID e stack riconosciuti, le cronologie del modulo rimangono temporanee. Il salvataggio persistente delle versioni SQL richiede un contesto completo.

## Icone e impostazioni dell’interfaccia

Le icone **Impostazioni SFMC** e **Test History** compaiono soltanto in **Preview and Test**. Il menu Impostazioni SFMC contiene le opzioni del MID e **Tester BU**; puoi chiuderlo cliccando fuori o premendo Escape.

Per nascondere completamente entrambe le icone:

1. Clicca l’icona dell’estensione nella barra di Chrome.
2. Nella pagina **Impostazioni e versioni**, disattiva **Mostra le icone Impostazioni SFMC e Test History in Preview and Test**.
3. Per riattivarle, torna alla stessa pagina e rimetti la spunta.

La scelta riguarda questo profilo browser e non cancella rubrica o cronologie. Il pulsante **Tracking Test** resta disponibile anche con le due icone nascoste.

## Rubrica Tester BU

In **Preview and Test → Impostazioni SFMC → Tester BU**, scegli la **Sorgente dei destinatari**. Ogni BU può usare la rubrica locale del browser oppure una DE condivisa. La scelta è separata per stack e MID e non cambia la BU selezionata in Salesforce.

### Rubrica condivisa con Data Extension

Predisponi questa struttura in **ciascuna BU** dove vuoi usare i tester. Non servono GUID o ID di cartelle uguali tra clienti.

1. Nella radice locale **Data Extensions**, crea la cartella **SFMC_UI_Fixer**. Non usare Shared Data Extensions o una cartella annidata con lo stesso nome.
2. Dentro la cartella crea una DE standard con **Nome** ed **External Key** entrambi uguali a **tester_content_builder**. La DE può essere non sendable: serve da rubrica dei destinatari di prova.
3. Crea questi campi, rispettando esattamente maiuscole e minuscole:

| Campo | Configurazione |
| --- | --- |
| Nome | Text, lunghezza consigliata 100, Nullable. Sono accettati anche campi più lunghi, fino a 4000 caratteri. |
| Cognome | Text, lunghezza consigliata 100, Nullable. Sono accettati anche campi più lunghi, fino a 4000 caratteri. |
| Email | EmailAddress, lunghezza 254, Primary Key, obbligatorio. |

4. Aggiungi i contatti dai **Records** della DE oppure importali. Nel pacchetto trovi **esempi/tester_content_builder.csv** con una riga dimostrativa: sostituiscila con i tuoi contatti reali prima dell’importazione.
5. In **Tester BU**, scegli **Data Extension condivisa: tester_content_builder**. L’estensione verifica nome, External Key, percorso e campi e indica quanti tester ha letto.
6. Premi **Salva sorgente**. La scelta resta in questo profilo Chrome per quella BU; ogni collega la imposta nel proprio browser.

Nel campo **type a name...** dei destinatari di prova, digita almeno **tre caratteri** di nome, cognome o email. Compaiono fino a cinque suggerimenti alla volta, con nome e indirizzo. Un clic inserisce l’email nei destinatari nativi di Salesforce. I campi Nome e Cognome servono alla ricerca: non sostituiscono la DE e la riga usate da Salesforce per la personalizzazione della preview.

Per aggiungere, modificare o rimuovere tester condivisi, modifica i record in Salesforce. I colleghi con i permessi necessari sulla stessa DE vedono gli aggiornamenti alla successiva lettura. I contatti vengono conservati **solo in memoria per cinque minuti**; riapri **Tester BU → Verifica e carica DE** per rileggerli subito. L’estensione non crea la cartella o la DE e non scrive né cancella i suoi record.

La rubrica ammette fino a **1000 righe**. I record con email mancanti, non valide o campi ambigui vengono esclusi: il pannello indica quanti e per quale motivo, senza riportarne i valori. Se tutte le righe risultano non utilizzabili, correggi il problema e premi **Verifica e carica DE** prima di salvare la sorgente. La lettura gestisce anche i nomi restituiti dall’API in minuscolo o con maiuscole diverse; mantieni nello schema della DE i nomi Nome, Cognome ed Email indicati sopra.

Gli indirizzi duplicati compaiono una volta sola. Una DE vuota è valida. Se DE, percorso o schema non corrispondono, i permessi mancano o la lettura supera il limite, compare un messaggio e non viene usata una lista parziale né la rubrica locale in sostituzione. La ricerca usa la sessione della BU attiva; confermare un MID non cambia cliente. Un cambio contesto svuota i suggerimenti e interrompe le letture in corso.

### Rubrica locale del browser

Seleziona **Rubrica locale di questo browser** per mantenere i tester nell’archivio dell’estensione. Puoi salvare una decina di contatti o molti di più, fino a **1000 per BU**, nei limiti dello spazio disponibile.

1. Compila una riga con **Cognome**, **Nome** ed **Email**. Nome e cognome sono facoltativi; l’email deve essere valida.
2. Premi **+ Aggiungi tester** per aggiungere altre persone.
3. Premi **Salva tester** e attendi il messaggio che indica quanti contatti sono stati salvati.

Per modificare un contatto, correggi la riga e salva. Per eliminarlo, premi **×** sulla riga e poi salva. **Annulla** ed Escape chiudono senza salvare. Un cambio BU chiude l’editor. I tester salvati ricompaiono usando lo stesso profilo, stack e MID e autorizzando l’accesso locale.

Passare alla sorgente DE **conserva la rubrica locale già salvata**: puoi riattivarla scegliendo la relativa sorgente e premendo Salva tester. Le due rubriche non vengono unite automaticamente.

Salvare una rubrica, scegliere la sorgente o selezionare un tester **non invia email**. Per inviare rimane necessario il comando nativo **Send Test**.

## Test History e anteprime email

**Test History** apre lo storico locale dei tentativi di invio effettuati dal browser. Ogni voce può mostrare data, nome e ID dell’email, origine dei dati, prefisso dell’oggetto e destinatari. Passa sulla voce per espanderne i dettagli.

Lo storico registra il tentativo prima della risposta di Salesforce: una voce non certifica che l’email sia stata inviata o consegnata. Le voci più vecchie di **60 giorni** vengono scartate quando lo storico viene elaborato. Non è uno storico condiviso con i colleghi.

Se il tentativo usava una DE con una riga selezionata, il comando **Preview** genera una nuova anteprima usando quell’email e quella riga. Usa i contenuti e i dati disponibili adesso: non riproduce una fotografia immutabile dell’invio originale. Se la riga non esiste più, l’anteprima può non essere disponibile.

L’anteprima disattiva script, moduli e collegamenti dell’email. Le immagini esterne sono bloccate inizialmente. **Carica immagini esterne** permette di abilitarle per quella sola anteprima, dopo una conferma: i server delle immagini possono registrare la richiesta. Generando una nuova anteprima, la scelta riparte dalle immagini bloccate.

Nel selettore delle DE per la preview possono comparire due cartelle virtuali:

- **DEM - Recently used**: DE usate nei tentativi di prova dell’email corrente.
- **Recently used**: DE utilizzate nei tentativi più recenti.

Compaiono quando l’estensione riconosce la radice del selettore. Sono scorciatoie dell’interfaccia e non creano cartelle reali in Salesforce.

## Tracking Test

In **Preview and Test**, accanto al pulsante nativo **Send Test**, trovi **Tracking Test**.

1. Premi **Tracking Test**.
2. Si apre una nuova scheda con **Email Studio → Tracking → Test Send Emails**.
3. Consulta gli invii nella schermata nativa di Salesforce.

Il comando apre l’elenco generale degli invii di prova: non esegue un nuovo invio e non filtra automaticamente una singola email. Usa lo stack e la sessione correnti, senza cambiare BU.

Durante il caricamento può comparire brevemente Subscribers prima di Tracking. L’avviso di apertura si rimuove quando l’elenco è pronto. In caso di attesa prolungata puoi usare **Chiudi**; un avviso di errore scompare comunque dopo 30 secondi. **Scarica diagnostica tracking** salva un rapporto tecnico da condividere quando serve assistenza.

## Contact Builder: trovare e riaprire le DE

Nell’elenco **Data Extensions**, il pulsante **Advanced** apre la ricerca avanzata per nome.

1. Digita almeno tre caratteri.
2. Scegli **Contains**, **Start with**, **End with** oppure **Equal**.
3. Apri una DE cliccando sul nome, oppure premi l’icona della cartella per raggiungerne la posizione.

I risultati mostrano nome e percorso e comprendono al massimo la prima pagina di **25 DE**. Se non trovi la voce desiderata, rendi la ricerca più precisa. La ricerca riguarda il contesto accessibile nella BU corrente.

Il pannello **Last DE views** raccoglie le ultime DE visitate, fino a nove. Il nome riapre il dettaglio; l’icona della cartella apre la posizione, quando disponibile. **Clear** svuota solo questo elenco locale.

## Apri in Email Studio

1. In Contact Builder apri il dettaglio di una DE, nella scheda Proprietà oppure Record.
2. Premi **Apri in Email Studio ↗**.
3. Si apre il dettaglio della stessa DE in Email Studio, in una nuova scheda.

Il comando legge l’identificativo della DE e lo stack automaticamente. Non devi configurare un URL per cliente o inserire il MID per questo collegamento. Tornando all’elenco delle DE, il pulsante scompare.

Il collegamento usa la sessione Email Studio già attiva. Dopo un cambio cliente o BU, seleziona il contesto corretto in Salesforce e riapri Contact Builder. L’accessibilità di DE condivise o sincronizzate dipende da Salesforce e dai permessi dell’utente.

## Contact Builder: lavorare con i record

Nella vista **Records** trovi strumenti per navigare e preparare nuove righe.

### Prima e ultima pagina

Le frecce doppie aggiunte al paginatore permettono di raggiungere la prima o l’ultima pagina disponibile. Il numero di righe per pagina resta quello scelto nell’interfaccia nativa.

### Campi ridimensionabili

Alcuni campi di modifica possono essere allargati trascinando il bordo del contenitore. Questo modifica lo spazio visibile del campo, non il contenuto salvato nella DE.

### CLONE

1. Apri il modulo nativo per aggiungere un record.
2. Premi **CLONE** nella Toolbox.
3. Clicca una riga visibile da usare come origine.
4. Controlla tutti i valori copiati, modifica le chiavi necessarie e salva tramite il comando nativo.

La copia usa il testo mostrato nelle celle: verifica date, valori formattati e caratteri speciali. CLONE prepara un record; non duplica la struttura della DE. Il salvataggio scrive dati reali e può fallire se una chiave esiste già.

### MULTI ROWS

1. Apri il modulo per aggiungere un record e premi **MULTI ROWS**.
2. Compila la tabella; usa **+** per aggiungere righe e **−** per rimuovere quelle aggiunte.
3. Quando ci sono più righe, la riga in fondo consente di riportare valori comuni nelle colonne. Controlla comunque le singole righe.
4. Premi **SAVE** e conferma per inserire i record nella DE aperta.

I campi chiave e quelli obbligatori vengono evidenziati. La validazione controlla i campi previsti dal modulo; Salesforce applica anche i propri vincoli. **CANCEL** esce dalla modalità. Se nel frattempo è cambiata DE o BU, riapri il modulo prima di salvare.

### CSV

Il pulsante **CSV** scarica **tutti i record salvati nella DE corrente**, anche se sono distribuiti su molte pagine. Per esempio, una DE con **100.000 record** viene letta dalla prima all’ultima pagina e produce un unico file con tutti i 100.000 record e l’intestazione dei campi.

1. Apri **Records** della DE che vuoi scaricare.
2. Premi **CSV**. La pagina selezionata, la quantità di righe visibili e i filtri della griglia non limitano il contenuto del file.
3. Segui l’avanzamento sotto la barra dei comandi, per esempio **Letti 34.600 / 100.000 record**. Il pulsante CSV resta disabilitato mentre il lavoro è in corso.
4. Attendi il messaggio **Download CSV avviato** e il file nella cartella dei download del browser. Puoi interrompere prima con **Annulla CSV**.

La lettura usa la sessione e i permessi della BU attiva e non modifica i record. Il file viene preparato per blocchi, senza tenere tutti i record JSON in un’unica lista. Una DE vuota produce un CSV con la sola intestazione. Il nome del file contiene l’identificativo della DE, il totale dei record e la data tecnica del download.

Se cambi DE o BU o esci da Records durante il lavoro, l’esportazione viene annullata. Puoi invece spostarti tra le pagine della stessa griglia: il download continua a leggere l’intera DE. Errori, pagine incomplete e variazioni rilevate nei dati interrompono il lavoro con un messaggio; il file viene scaricato soltanto dopo il completamento delle letture e dei controlli finali. Dopo aver risolto l’errore puoi premere nuovamente CSV per ripartire da zero.

Per un risultato coerente, esegui il download quando importazioni, query e aggiornamenti della DE sono fermi. La lettura avviene in più richieste e non blocca la DE: le verifiche rilevano variazioni del totale, dello schema e chiavi primarie ripetute, ma non garantiscono una fotografia immutabile dei dati. Tempo e dimensione del download dipendono anche dalla connessione e dal contenuto dei campi.

Il file usa **UTF-8** e il separatore **|**. Accenti, virgolette, separatori contenuti nei valori e ritorni a capo vengono conservati nel formato CSV. I valori che potrebbero essere interpretati come formule da un foglio di calcolo ricevono un apostrofo iniziale; anche un numero negativo può quindi essere importato come testo. In Excel importa gli identificativi lunghi o con zeri iniziali come **Testo**. Il CSV contiene dati della DE e resta nella cartella dei download scelta dal browser.

### Analisi SMS e URL media

Nel campo SMS riconosciuto dall’interfaccia, il testo con caratteri non GSM viene evidenziato. Passando sulla cella compare **CHECK GSM CHARACTER**: il comando mostra localmente caratteri, codifica e segmenti stimati, senza inviare il testo a siti esterni.

La stima considera GSM-7, caratteri estesi e Unicode. Personalizzazioni e regole del servizio di invio possono cambiare il risultato effettivo.

Per il campo `mediaURL`, quando presente, viene evidenziato un formato URL sospetto. Il controllo riguarda la forma del testo: non verifica che l’indirizzo esista o che il contenuto sia sicuro.

## Automation Studio

### Automation recenti e collegamenti

**Last Viewed Automations** mostra fino a dieci automation visitate. Clicca il nome per riaprirne una; **Clear** cancella solo la lista locale.

Nel menu delle attività del canvas può comparire **View**, che apre il dettaglio dell’attività in una nuova scheda quando Salesforce ne fornisce l’identificativo. Il collegamento della DE target apre il dettaglio in Contact Builder.

### Strumenti Query Activity

Nel riepilogo di una Query Activity trovi:

- **Download Version**: scarica un JSON con SQL e metadati dell’attività visualizzata.
- **Copy**: copia il SQL attualmente mostrato nell’editor del riepilogo.
- **Toggle Query**: alterna il SQL scritto e quello validato/generato, quando disponibile nella risposta di Salesforce.

L’estensione non esegue la query tramite questi pulsanti e non ripristina automaticamente il JSON nel tenant.

### Copie locali prima della modifica

Quando premi uno dei comandi di modifica riconosciuti della Query Activity, l’estensione può conservare una copia della configurazione visualizzata prima della modifica. Sono necessari MID e stack riconosciuti e l’autorizzazione ai dati locali della BU.

Le copie sono organizzate per attività e data di modifica. Non rappresentano tutte le modifiche fatte da colleghi, API o percorsi dell’interfaccia non osservati.

## Impostazioni e versioni SQL

Clicca l’icona dell’estensione nella barra di Chrome per aprire **Impostazioni e versioni**.

- Cerca per nome attività, MID o stack.
- Espandi un gruppo per vedere le versioni disponibili.
- Premi **SQL** per leggere la query di una versione.
- Premi **↓ JSON** per scaricare una singola versione.
- Usa il comando di esportazione dello storico per scaricare tutte le copie locali, anche di altre BU presenti nel profilo.
- I cestini eliminano una versione o un gruppo; il comando di cancellazione generale riguarda le versioni dell’intero archivio locale, non soltanto quelle visibili dopo una ricerca.

L’eliminazione richiede conferma e non modifica le Query Activity in Salesforce. Le voci indicate come **Storico originale · BU non attribuita** appartengono al vecchio archivio e non vengono assegnate automaticamente a una BU.

I JSON possono contenere SQL, nomi delle DE e configurazioni interne: scegli consapevolmente con chi condividerli.

## Query Studio

### Salvare e riprendere una bozza

1. Scrivi il SQL nell’editor.
2. Premi **Save new Query** per creare una nuova copia locale.
3. Apri **Lista query** per consultare quelle salvate.
4. Passa su una voce per vedere l’anteprima. **EDIT** permette di modificarne nome o SQL; **SAVE** conserva le modifiche locali.
5. **SHOW EDITOR** carica il SQL della voce nell’editor principale, senza eseguirlo.

**Update** aggiorna la bozza selezionata. **Clear** svuota l’editor e scollega la bozza corrente; non cancella tutte le query salvate. **REMOVE** elimina la singola copia locale dalla lista.

Le copie speciali sono:

- **LAST**: ultima query salvata.
- **LAST RUN**: SQL presente al momento del tentativo di esecuzione; non certifica l’esito della query.
- **SAVE ON CLOSE**: testo conservato quando il browser riesce a gestire la chiusura della pagina.

Se l’editor è vuoto, l’estensione tenta di recuperare il testo salvato alla chiusura. Una chiusura forzata o un arresto del browser può impedire questo salvataggio.

### Pannelli e campi

**HIDE** comprime l’Object Explorer; il pulsante di riapertura lo rende nuovamente visibile. La **×** di una scheda DE rimuove la scheda dall’Explorer.

Nelle schede delle DE:

- **SQL** copia l’elenco dei campi, utile per preparare una SELECT.
- **Required** copia l’elenco dei campi obbligatori: non è necessariamente l’elenco delle chiavi primarie.

Non vengono generate automaticamente clausole FROM o JOIN.

Dopo un cambio BU, conserva prima il testo che ti serve e premi **Clear** prima di salvare nel nuovo contesto. Quando il MID non è riconosciuto, le copie rimangono temporanee per il documento corrente.

## Journey Builder

Nei riquadri riconosciuti che referenziano un Journey può comparire un’icona di collegamento: apre il Journey e la versione indicati in una nuova scheda.

Sull’entry di un Journey associata a una sola DE, **Apri Data Extension ↗** apre la DE relativa in Contact Builder. Il comando usa gli identificativi della configurazione dell’entry, non cerca una DE con lo stesso nome.

Il pulsante compare solo se l’entry e il suo riquadro sono identificabili. Entry senza DE, più entry ambigue o schermate non riconosciute non producono un collegamento. La barra generale MID/Tester BU non compare nel Journey né nei suoi frame.

## Diagnostica Email Studio

Per raccogliere informazioni su un problema di navigazione:

1. Lascia aperta la scheda Email Studio interessata.
2. Clicca l’icona dell’estensione e apri **Diagnostica Email Studio**.
3. Seleziona la scheda; se manca, aggiorna l’elenco.
4. Premi **Raccogli diagnostica**, controlla il rapporto e scegli il download.

Il file `sfmc-email-studio-diagnostica.json` contiene percorsi e metadati di navigazione; può includere identificativi tecnici come MID e GUID. Non raccoglie i record della DE. Il rapporto non viene inviato automaticamente.

Per il pulsante Tracking Test, l’avviso di errore offre una diagnostica più specifica: `sfmc-tracking-diagnostica.json`. Anche questo file viene creato solo quando premi il download.

## Errori dopo un aggiornamento

Se compare un errore di collegamento, di versione o di registrazione del documento:

1. Controlla che la scheda su **chrome://extensions** mostri la versione **1.1.16**.
2. Dopo aver sostituito tutti i file nella stessa cartella, premi **Ricarica** sulla scheda dell’estensione.
3. Ricarica tutte le schede Marketing Cloud già aperte, oppure chiudile e riaprile. Ricaricare soltanto l’estensione lascia i vecchi script nelle pagine aperte.
4. Nella sezione **Errori** premi **Cancella tutto**: le vecchie segnalazioni possono rimanere elencate anche dopo la correzione.
5. Riapri il modulo e riprova la funzione. Se compare una nuova segnalazione, leggi il codice e il testo completo: indicano collegamento interrotto, versioni diverse, modulo non riconosciuto, identificativo documento assente o archivio non inizializzato.

Non serve disinstallare l’estensione o cancellare i dati locali. Il messaggio di registrazione mostra la versione e il percorso del documento che ha fallito, senza query string, fragment, record o credenziali.

## Dove rimangono i salvataggi

| Dati | Dove si trovano |
| --- | --- |
| Rubrica locale, scelta della sorgente tester e copie SQL delle Query Activity | Archivio locale dell’estensione nel profilo Chrome, organizzato per stack e MID. |
| Rubrica DE condivisa | Record in Salesforce; copia temporanea in memoria nella scheda, per cinque minuti. |
| DE recenti, automation recenti, Test History e bozze Query Studio | Dati locali del sito/modulo nel profilo browser; temporanei se manca un contesto completo. |
| Scelta di mostrare le due icone | Impostazione generale dell’estensione per quel profilo. |
| Record modificati o inseriti nelle DE | Salesforce, dopo il salvataggio reale. |
| CSV, versioni esportate e diagnostica scaricata | File nella posizione scelta per i download. |

I salvataggi locali non si sincronizzano automaticamente con altri browser o colleghi. La rubrica DE è invece condivisa tramite Salesforce con chi può leggere quella DE; i destinatari utilizzati possono comparire anche nel Test History locale. Il rinnovo di una conferma non cancella i dati già presenti. Un profilo nuovo, la disinstallazione, la pulizia dei dati del browser o il raggiungimento delle quote possono renderli indisponibili.

Per rimuovere dati usa **Clear** nelle liste recenti, **REMOVE** nelle bozze, la rimozione delle righe nella rubrica seguita da **Salva tester**, oppure i cestini nell’archivio SQL. La cancellazione dei dati locali di un sito può rimuovere anche preferenze del sito stesso. I dati locali non hanno una cifratura propria dell’estensione: la protezione del computer e del profilo browser resta necessaria.
