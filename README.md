# SFMC UI Fixer — Multi BU 1.1.30

**Autore della versione Multi BU: Francesco Trepiccioni.** Derivata da SFMC UI Fixer di Simone Luise.

[Scarica lo ZIP per Chrome e Microsoft Edge](https://github.com/FraTreppi/better-mc/raw/refs/heads/main/dist/sfmc-ui-fixer-multi-bu-diagnostica.zip)

La **[Guida utente](GUIDA_UTENTE.md)**, disponibile anche come **[PDF](GUIDA_UTENTE.pdf)**, descrive tutte le funzionalità e come usarle: installazione, configurazione delle BU, rubrica tester, cronologie, strumenti DE, Automation Studio, Query Studio e Journey Builder.

## Installazione e aggiornamento

Lo stesso ZIP funziona su **Google Chrome e Microsoft Edge basato su Chromium**. Estrailo in una cartella permanente, poi:

- **Edge:** apri `edge://extensions`, attiva **Modalità sviluppatore**, premi **Carica decompressa** e seleziona la cartella contenente `manifest.json`.
- **Chrome:** apri `chrome://extensions`, attiva **Modalità sviluppatore** e scegli **Carica estensione non pacchettizzata** sulla stessa cartella.

Usa un browser aggiornato; il requisito Chromium minimo è 111. Lo ZIP è per l’installazione manuale in modalità sviluppatore: non è una pubblicazione su Microsoft Edge Add-ons o Chrome Web Store.

Per aggiornare, sostituisci i file nella stessa cartella e premi **Ricarica** sull’estensione. Poi aggiorna le schede Marketing Cloud. Non serve disinstallarla; mantenere la stessa installazione conserva i suoi salvataggi.

I salvataggi locali sono separati fra Chrome, Edge e i relativi profili: non vengono trasferiti automaticamente. In Edge verifica la BU rilevata e premi Carica tester dalla DE; la DE condivisa può fornire la stessa rubrica a entrambi i browser.

## Funzionalità

| Modulo | Strumenti |
| --- | --- |
| Contact Builder | Ricerca avanzata DE, visite recenti, prima/ultima pagina, CLONE, MULTI ROWS, CSV completo della DE con avanzamento e annullamento, analisi SMS locale, collegamento alla stessa DE in Email Studio. |
| Content Builder | Ricerca Advanced per nome, Customer Key o ID su tutte le cartelle della BU, filtri per tipo/cartella/date, risultati paginati e apertura dei contenuti. |
| Preview and Test | Caricamento e attivazione con un clic della rubrica DE tester_content_builder, fino a 1000 tester per BU, suggerimenti destinatari, cartella virtuale DE recenti con svuotamento. |
| Automation Studio | Apertura automatica della Query Activity appena copiata dal dettaglio dopo il completamento della procedura nativa; refresh automatico del Run Log ogni 5 secondi con pulsante ON/OFF, automation recenti, collegamenti alle attività e alla DE target, copia SQL, vista SQL validato, download JSON, copie locali prima della modifica. |
| Query Studio | Bozze, recupero dell’editor, elenco query, copia campi e campi obbligatori, pannelli comprimibili. |
| Journey Builder | Collegamento ai Journey referenziati e alla DE dell’entry quando identificabile. |
| Pagina dell’estensione | Visibilità delle icone, consultazione ed esportazione delle versioni SQL, eliminazione delle copie locali, diagnostica Email Studio. |

L’icona Impostazioni SFMC compare solo in Preview and Test e può essere nascosta dalla pagina dell’estensione. I collegamenti usano la sessione e la BU attive di Salesforce: non cambiano cliente automaticamente.

## Rubrica DE condivisa

Crea in ogni BU la DE **tester_content_builder** dentro **SFMC_UI_Fixer**, anche in sottocartelle di Data Extensions, con Nome ed External Key `tester_content_builder` e campi `Nome` (Text), `Cognome` (Text), `Email` (EmailAddress, Primary Key). In **Preview and Test → Impostazioni SFMC**, premi **Carica tester dalla DE**: ricerca, verifica, lettura e attivazione avvengono in un’unica operazione, con esito e collegamento alla DE nel menu. **Aggiorna tester dalla DE** rilegge subito i contatti. I record vengono letti con la sessione corrente e non modificati. La [guida](GUIDA_UTENTE.md#rubrica-tester-bu) spiega schema, ricerca e aggiornamento dei contatti.

## Sicurezza e dati

La versione 1.1.30 restringe l’accesso ai dati locali al modulo, al documento e alla BU autorizzati. Per usare la rubrica o salvare copie SQL è richiesta una conferma locale con dominio, MID e stack. La scelta viene ricordata per dominio, modulo e BU durante la sessione del browser, fino a 12 ore: rientrare nello stesso modulo o aprire una nuova scheda non ripete la domanda. Dalla pagina dell’estensione puoi ripristinare le conferme senza cancellare i dati. Rifiutare non disabilita le altre funzioni.

Il proxy di rete generico è stato rimosso. Il controllo SMS è interamente locale. I CSV proteggono dai prefissi che i fogli di calcolo potrebbero interpretare come formule.

Queste misure riducono i rischi individuati e non costituiscono una garanzia assoluta. Le operazioni sui record usano la sessione Salesforce e possono modificare dati reali. Le copie locali e i file scaricati non sono cifrati dall’estensione.

Vedi **[Sicurezza e limiti](SICUREZZA.md)** per le protezioni e i rischi residui. La [documentazione tecnica](DOCUMENTATION.md) e la [cronologia](CHANGELOG.md) sono separate dalla guida utente.

La 1.1.29 rimuove Tracking Test, Test History e le anteprime dallo storico. Rubrica tester, caricamento automatico dalla DE e DE recenti restano disponibili. Nessun nuovo tentativo di invio viene registrato; i log precedenti sono conservati.

La 1.1.30 apre la nuova Query Activity dopo una copia nativa completata, nella stessa scheda. Annullamento, errore o cambio pagina/BU impediscono la navigazione automatica. Nessuna richiesta di copia o di esecuzione viene aggiunta.
