# SFMC UI Fixer — Multi BU 1.1.8

**Autore della versione Multi BU: Francesco Trepiccioni.**

[Scarica il pacchetto aggiornato](https://github.com/FraTreppi/better-mc/raw/refs/heads/main/dist/sfmc-ui-fixer-multi-bu-diagnostica.zip). Include il collegamento automatico alla stessa DE in Email Studio, senza configurare URL per cliente. La barra SFMC Fixer è disattivata nel Journey Builder e nei suoi frame.

Per il collaudo da parte di un collega: [guida rapida](GUIDA_TEST_COLLEGA.md), disponibile anche in PDF nella stessa cartella.

Estensione Chrome Manifest V3 derivata dalla versione originale di Simone Luise, conservata nella cartella `stable`. Questa versione elimina i riferimenti operativi fissi allo stack s7 e aggiunge configurazione per Business Unit e il comando Contact Builder → Email Studio.

**Stato:** pacchetto di sviluppo, non pubblicato sul Chrome Web Store. Il collegamento Email Studio usa la rotta individuata nel router nativo fornito per l’analisi. Verifiche locali e collaudo reale sul tenant sono distinti: resta da provare l’apertura dalla sessione Marketing Cloud dell’utente.

## Installazione

1. Estrai lo ZIP in una cartella permanente. Il file `manifest.json` deve essere direttamente nella cartella estratta.
2. Apri `chrome://extensions` in Chrome.
3. Abilita **Modalità sviluppatore**.
4. Premi **Carica estensione non pacchettizzata** e seleziona la cartella contenente `manifest.json`.
5. Se usavi la vecchia versione, disabilitala per evitare che entrambe modifichino la stessa pagina.
6. Ricarica le pagine Marketing Cloud già aperte. Apri Contact Builder dal menu Salesforce.

Non servono Node, npm, server, password Salesforce o un Installed Package API per caricare l'estensione. È richiesto Chrome 111 o successivo; il collaudo va effettuato con una versione corrente di Chrome.

Il file ZIP non si installa con un doppio clic. Per il pulsante **Aggiungi a Chrome** serve pubblicazione e approvazione del Chrome Web Store; in ambienti aziendali gestiti esiste anche la distribuzione tramite policy.

Riferimenti ufficiali: [installazione locale](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world), [distribuzione](https://developer.chrome.com/docs/extensions/how-to/distribute).

## Prima configurazione della Business Unit

Solo in **Content Builder → Preview and Test**, accanto all’icona **Test History**, compare l’icona **Impostazioni SFMC**. Cliccandola si aprono le due opzioni MID e Tester BU. Il menu si chiude con Escape o cliccando fuori; nelle Data Extension e negli altri moduli non compare la barra flottante. Anche Test History viene nascosta quando si esce da Preview and Test.

In **Journey Builder**, anche nei frame delle attività, la barra e il menu **SFMC Fixer** non vengono mostrati. Il collegamento aggiunto alle referenze dei Journey resta disponibile.

- **BU … · s…**: controlla che MID e stack corrispondano alla BU selezionata in Marketing Cloud.
- **Imposta MID**: MID significa Member ID ed è il numero della Business Unit corrente. Lo stack, per esempio `s50`, identifica invece l’ambiente Salesforce. L’estensione usa stack e MID per tenere separate cronologie, versioni SQL e preferenze dei diversi clienti/BU. Se la pagina non espone il MID, inseriscilo qui; il pulsante diventa **BU <numero> · <stack>**. Questa impostazione identifica il contesto dell’estensione e non cambia la BU selezionata in Salesforce.
- **Tester BU**: apre una rubrica con le colonne **Cognome**, **Nome**, **Email**. Premi **+ Aggiungi tester** per ogni persona, compila la riga e infine premi **Salva tester**. Il messaggio **10 tester salvati…** conferma il salvataggio. Puoi aggiungere dieci persone e anche di più: l’estensione non impone un limite fisso; valgono le normali quote di spazio del browser. I contatti già salvati vengono caricati automaticamente nella tabella. Per eliminarne uno usa **×** sulla sua riga e salva; **Annulla** o Escape chiudono senza salvare le modifiche. Non servono punti e virgola o testo su più righe.

In Preview and Test, il campo aggiunto **type a name...** suggerisce i contatti digitando almeno tre caratteri di nome, cognome o email. Mostra al massimo cinque suggerimenti alla volta: è un limite ai risultati visibili, non ai tester salvati. Selezionandone uno, l’indirizzo viene aggiunto ai destinatari del test. L’invio resta un’azione esplicita di Salesforce. Salvare la rubrica non invia email e non inserisce record nelle DE.

Per salvare i tester occorre un MID riconosciuto o impostato manualmente. Se il MID non è riconosciuto, impostalo dalla prima opzione del menu prima di aprire la rubrica. I contatti rimangono nel profilo del browser e sono separati per stack/MID; non vengono inseriti nel pacchetto distribuito. Il comando **Apri in Email Studio** funziona senza configurare questi due pulsanti.

Il contesto manuale va riconfermato dopo un ricaricamento: quando possibile il pulsante **Conferma MID <numero>** ricorda l’ultimo valore in quella scheda, senza attivarlo automaticamente. Apri il menu, scegli questa opzione, verifica che sia la BU attuale e conferma: i tester salvati ricompaiono. Se hai cambiato BU, correggi il MID. Il suggerimento dura per la sessione della scheda e può non essere condiviso tra moduli su domini diversi; la rubrica rimane invece salvata in `chrome.storage.local`, nel profilo browser, per stack e MID, anche chiudendo la scheda. Non ricreare la rubrica a ogni ricaricamento. Non viene dedotto il MID dall'Enterprise ID né dal proprietario di una DE condivisa.

Senza MID e stack riconosciuti le cronologie restano temporanee in memoria e il versionamento SQL persistente resta sospeso. Le funzioni di interfaccia continuano a essere disponibili. Le cronologie della vecchia versione non vengono attribuite automaticamente a una BU.

Se cambi BU senza ricaricare, controlla sempre il MID nel menu: un MID inserito manualmente non può aggiornarsi da solo. In Query Studio il testo dell'editor viene conservato, ma dopo un cambio di contesto occorre copiarlo se necessario e premere Clear prima di salvare nella nuova BU.

## Nascondere completamente le due icone

Clicca l’icona dell’estensione nella barra del browser. Nella pagina **Impostazioni e versioni**, disattiva **Mostra le icone Impostazioni SFMC e Test History in Preview and Test**. Scompaiono entrambe, senza lasciare un pulsante sostitutivo. La scelta resta salvata per tutto il profilo browser, anche senza MID. Per riattivarle torna alla stessa pagina e rimetti la spunta. I tester e lo storico restano salvati.

## Tracking delle email di prova

In Preview and Test, accanto al pulsante nativo **Send Test**, compare **Tracking test**. Apre Email Studio → Tracking e seleziona la cartella nativa **Test Send Emails** in una nuova scheda. Il comando resta disponibile anche quando nascondi le due icone e non invia email. Dalla versione 1.1.8 seleziona Tracking con il meccanismo del menu nativo, mantenendo la vista Email Studio aperta: evita di richiamare il percorso che può rimuovere la vista corrente e lasciare una pagina vuota. Attende inoltre il caricamento del contenuto dopo la selezione della cartella. I messaggi distinguono inizializzazione di Email Studio, menu Tracking, ricerca della cartella e caricamento dell’elenco. Usa lo stack e la sessione SFMC correnti; non cambia la BU e non filtra automaticamente un singolo invio o una singola email.

Se la cartella non è disponibile o non si carica, compare un messaggio: puoi aprirla manualmente dal menu Tracking e verificare l’accesso della BU. Il codice non usa un identificativo di cartella fisso per tutti i clienti.

## Aprire la stessa DE in Email Studio

1. Seleziona la BU corretta in Marketing Cloud e apri una DE in Contact Builder, nella scheda Proprietà oppure Record.
2. Premi **Apri in Email Studio ↗**.
3. Si apre una nuova scheda/finestra con il collegamento al dettaglio della stessa DE; Contact Builder resta aperto.

Non devi incollare un URL o inserire manualmente il MID per questo collegamento. Lo stack viene rilevato dal contesto e il GUID viene letto dalla DE aperta, anche al momento del clic. Il pulsante segue la navigazione senza ricaricamento e scompare tornando all’elenco. I vecchi modelli di URL salvati non vengono più utilizzati.

Il percorso nativo è `Subscribers/Data_Extensions/<GUID>/edit`: nel router Email Studio il suffisso `edit` apre la vista Properties. Il link usa la sessione Email Studio corrente; non effettua un cambio BU automatico. Dopo un cambio cliente o BU, riapri Contact Builder nel contesto corretto. Disponibilità delle DE condivise o sincronizzate e permessi vanno verificati nel tenant.

Dalla versione 1.1.4 l’estensione conserva il GUID prima dell’inizializzazione della pagina e lo consegna al frame Email Studio solo quando il router nativo è pronto. Questo gestisce il caso in cui Marketing Cloud riporti l’indirizzo esterno al solo modulo Subscribers. Dalla versione 1.1.7 attende un annuncio dal documento Email Studio realmente caricato e comunica attraverso un canale dedicato: non deduce più l’origine del documento da `iframe.src`. Gestisce sia `members.<stack>` sia `mc.<stack>` dopo il passaggio SSO, evitando l’errore postMessage di origine non corrispondente. La stessa correzione vale per Tracking test. Durante il passaggio compare un breve messaggio di apertura; se il modulo non è disponibile compare un avviso, senza restare in attesa indefinitamente.

La diagnostica resta disponibile dall’icona dell’estensione → **Diagnostica Email Studio** per eventuali problemi. Raccoglie percorsi tecnici e stringhe di navigazione dei bundle nativi, senza leggere record o risposte API e senza invio automatico del rapporto.

## Data Extension dell’entry di un Journey

Per un Journey con una sola entry associata a una DE, il comando **Apri Data Extension ↗** apre la DE in Contact Builder in una nuova scheda. Legge gli identificativi dalla configurazione della versione del Journey e dalla definizione dell’evento. Non cerca per nome e non usa le DE delle attività successive. La vecchia barra generale resta assente dal Journey.

Il pulsante viene inserito soltanto quando il riquadro nativo dell’entry è riconoscibile; l’aggancio alla tua interfaccia va ancora verificato con l’HTML richiesto. Se il riquadro non espone un identificatore riconosciuto, se l’entry non ha una DE o se i dati sono ambigui/non accessibili, non viene mostrato un collegamento ipotetico.

## Cosa include

- Contact Builder: ricerca DE, viste recenti, prima/ultima pagina, clonazione riga, inserimento multiplo, CSV della pagina caricata, strumenti SMS e nuovo link Email Studio.
- Content Builder: completamento destinatari per BU, log locali dei tentativi di test per 60 giorni, rigenerazione anteprima e cartelle virtuali delle DE recenti quando la radice è riconosciuta.
- Automation Studio: cronologia, collegamenti alle attività e DE target, copia SQL e visualizzazione SQL validato, esportazione JSON e snapshot all'ingresso in modifica.
- Query Studio: bozze, recupero dell'ultima query, copia colonne, pannelli comprimibili.
- Journey Builder: apertura delle referenze ai Journey e collegamento alla DE dell’entry quando identificabile.
- Clic sull'icona dell'estensione: consultazione, ricerca per MID/stack, download ed eliminazione delle versioni SQL locali; esportazione dello storico.

Dettagli, funzioni solo previste nell'originale, limiti e collaudo: [DOCUMENTATION.md](DOCUMENTATION.md).
