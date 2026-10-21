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

Il codice aggiunge un collegamento per aprire in una nuova scheda un Journey referenziato da un elemento riconosciuto dell'interfaccia (`.ixn-collection-definition`). Il modulo originale è specifico di s7; nella nuova versione usa lo stack corrente.

Nel sorgente esaminato **non ho trovato l'implementazione di un'apertura delle email da Journey Builder in Email Studio**, anche se la documentazione originale ne elenca una voce. Non la considero una funzione verificata.

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
- Il MID è letto solo da campi espliciti riconosciuti nel contesto nativo o nell'URL. Poiché non tutte le UI lo espongono nello stesso modo, esiste l'inserimento manuale per documento. Non è stato verificato quali campi esponga il vostro tenant.
- Le cache sono prefissate con versione, stack e MID. Esempio concettuale: `SFMCFIX:v2:s42:123456:...`. L'isolamento evita di riusare cronologie di un'altra BU riconosciuta; non è una barriera di sicurezza contro altri script che girano nella stessa pagina.
- Se il contesto non è disponibile, le cronologie sono solo temporanee; niente archivio persistente in una BU "sconosciuta" condivisa. Il versionamento SQL chiede prima di impostare il MID.
- Le preferenze, i tester e il modello Email Studio sono salvati nello storage Chrome per contesto. Il MID manuale non è un cambio BU Salesforce: devi aver selezionato la BU corretta nell'interfaccia.
- Gli endpoint di scrittura delle righe usano l'origine corrente e la DE aperta, con un controllo prima dell'inserimento multiplo.
- I link esistenti verso attività, Journey e Contact Builder usano lo stack corrente. Continuano a dipendere dalla sessione e dalla BU attiva di Salesforce; non effettuano un cambio account automatico.
- La ricerca gestisce caratteri speciali, cancellazione delle richieste superate ed errori HTTP. L'esportazione CSV gestisce virgolette, separatori e ritorni a capo.
- Il proxy fetch esegue soltanto GET HTTPS sui domini Marketing Cloud ammessi. Il permesso `tabs` è stato rimosso: aprire la pagina interna non richiede il permesso di leggere le schede.
- Le anteprime email sono mostrate in un iframe sandbox. L'elenco personale dei tester non viene incluso nel pacchetto.

Questi cambiamenti rendono il codice **configurabile e collaudabile su BU e stack diversi**. Non costituiscono una certificazione di compatibilità con qualsiasi configurazione Salesforce.

## 7. La nuova funzione Contact Builder → Email Studio

Il comando compare dentro il contenitore del dettaglio DE, nelle schede Proprietà o Record. Legge il GUID dalla route Contact Builder `#admin/data-extension/<GUID>/...`. L'osservazione del DOM e il listener `hashchange` lo aggiornano quando Salesforce cambia pagina senza ricaricare il documento. Il GUID è riletto anche al clic, evitando un collegamento rimasto sulla DE precedente.

Il modello di destinazione è per BU e richiede `{id}`, cioè l'ObjectID/GUID; può contenere anche `{stack}` e `{mid}`. Viene aperto tramite un normale link con destinazione `_blank` e `noopener noreferrer`. Chrome decide se mostrare una scheda o una finestra secondo le preferenze e il gesto dell'utente.

**Limite attuale da non saltare:** nei file non era presente un link Email Studio al dettaglio DE e non c'è stata una sessione autenticata su cui verificarne il formato. Per questo il pulsante iniziale apre la configurazione, non una destinazione ipotizzata. Serve un vero link del proprio ambiente che accetti il GUID. Un URL generico del modulo, una route che richieda soltanto External Key o un ID numerico differente non si può sostituire automaticamente con il GUID.

Non è stato verificato se il vostro Email Studio esponga un link diretto stabile con queste caratteristiche. Se non lo espone, la funzione richiederà un adattamento della navigazione nativa dopo aver osservato quel tenant. La configurazione disponibile non dimostra da sola che Salesforce aprirà il dettaglio corretto.

Per DE condivise, sincronizzate o di altri tipi speciali, verifica disponibilità e permessi in Email Studio. La nuova versione non cambia BU né espande l'accesso dell'utente.

## 8. Dove finiscono i dati

| Dati | Posizione nella nuova versione | Note |
| --- | --- | --- |
| DE recenti, automation, test send, query salvate | `localStorage` del modulo, separato per stack/MID | Non si sincronizzano automaticamente tra dispositivi o domini diversi |
| Cache quando manca il contesto | Memoria del documento | Si perde al ricaricamento |
| Preferenze, tester, link Email Studio | `chrome.storage.local`, per stack/MID | Condivisi tra i frame dell'estensione per lo stesso contesto |
| Versioni Query Activity | `chrome.storage.local`, per stack/MID | Restano finché eliminate o rimossa l'estensione; esportabili JSON |
| Dati reali DE e asset | Salesforce | Le funzioni di scrittura modificano il tenant con la sessione dell'utente |

Non ho trovato un backend di telemetria dell'estensione. Le richieste operative vanno a Salesforce e alle risorse locali. Il collegamento SMS a **Messente**, quando cliccato, apre invece un servizio esterno mettendo il testo nel parametro URL: quel testo è quindi inviato al sito. Il pacchetto mantiene questa funzione esplicita dell'originale.

Il `localStorage` non equivale a un archivio protetto o a un backup centralizzato. Disinstallazione, pulizia dei dati browser, profili differenti e limiti di quota possono far perdere i salvataggi. I file JSON esportati possono contenere SQL, nomi di DE e configurazioni interne.

## 9. Installazione e distribuzione

Per provarla ora: estrai `dist/sfmc-ui-fixer-multi-bu-1.1.0.zip`, apri `chrome://extensions`, attiva Modalità sviluppatore, scegli Carica estensione non pacchettizzata e seleziona la cartella estratta contenente `manifest.json`. Disabilita l'originale se era già installata, poi ricarica Marketing Cloud.

Per una distribuzione ordinaria con **Aggiungi a Chrome** serve il Chrome Web Store: account sviluppatore, scheda dell'estensione, descrizioni dei dati/permessi, materiali richiesti dallo store e revisione Google. Il pacchetto ZIP è il sorgente da caricare, non un'installazione automatica già pubblicata. In aziende con Chrome gestito l'amministratore può valutare le policy di distribuzione.

Questa distinzione è prevista dalla [documentazione ufficiale Chrome sulla distribuzione](https://developer.chrome.com/docs/extensions/how-to/distribute). L'installazione di sviluppo è descritta nel [tutorial ufficiale](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world).

Non è stata effettuata una pubblicazione né modificata la configurazione di Chrome dell'utente.

## 10. Verifiche eseguite e collaudo ancora necessario

Eseguiti controlli di sintassi sui JavaScript e test Node con VM/DOM e storage simulati: rilevazione di stack differenti, isolamento BU sullo stesso dominio, assenza di cache persistente con MID ignoto, validazione modelli URL, aggiornamento del link tra due DE, uscita dal dettaglio, configurazione mancante/cambio BU, scritture concorrenti di versioni, cancellazioni selettive, rifiuto fetch improprie, riferimenti manifest e assenza dei contatti personali dal distribuibile.

Questi test **non** eseguono le API reali Salesforce né provano che un particolare endpoint Email Studio esista. Lo script di packaging verifica anche integrità ZIP e presenza del manifest alla radice.

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
10. Un URL reale Email Studio configurato: DE A e poi DE B senza ricaricare, confronto GUID, eventuali DE condivise e sessione scaduta.

La compatibilità universale e il collegamento Email Studio non possono essere dichiarati verificati prima di queste prove. L'implementazione preparata offre la base concreta per farle, con il punto di calibrazione visibile all'utente.

## 11. Manutenzione e riproduzione

Non ci sono dipendenze npm richieste per i test. Con Node 18 o successivo:

```sh
node --test tests/extension.test.cjs
```

Con Python 3:

```sh
python3 scripts/package_extension.py
```

Il pacchetto viene ricreato con struttura deterministica e file SHA-256. `tests` e `scripts` sono esterni all'estensione: nel distribuibile entrano solo manifest, guide e asset.
