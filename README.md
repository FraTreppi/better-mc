# SFMC UI Fixer — Multi BU 1.1.0

**Autore della versione Multi BU: Francesco Trepiccioni.**

[Scarica il pacchetto aggiornato](https://github.com/FraTreppi/better-mc/raw/refs/heads/main/dist/sfmc-ui-fixer-multi-bu-diagnostica.zip). Include il menu richiudibile nel Journey Builder e la diagnostica dei percorsi di Email Studio. L’apertura automatica della stessa DE senza configurazione resta da completare dopo la verifica del rapporto raccolto nel tenant.

Per il collaudo da parte di un collega: [guida rapida](GUIDA_TEST_COLLEGA.md), disponibile anche in PDF nella stessa cartella.

Estensione Chrome Manifest V3 derivata dalla versione originale di Simone Luise, conservata nella cartella `stable`. Questa versione elimina i riferimenti operativi fissi allo stack s7 e aggiunge configurazione per Business Unit e il comando Contact Builder → Email Studio.

**Stato:** pacchetto locale di sviluppo. Test automatici eseguiti su simulazioni; collaudo in una sessione Marketing Cloud ancora da eseguire. Non è pubblicata sul Chrome Web Store. Il link alla DE in Email Studio richiede un modello di URL verificato nel proprio ambiente.

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

In basso a destra, nei moduli supportati, compare una barra SFMC Fixer.

In **Journey Builder**, anche nei frame delle attività, i comandi sono invece raccolti nel menu **SFMC Fixer** in alto a destra, inizialmente chiuso: la zona di Done/Cancel e dello zoom rimane libera. Clicca sul menu per aprirlo; clicca fuori o premi Esc per richiuderlo.

- **BU … · s…**: controlla che MID e stack corrispondano alla BU selezionata in Marketing Cloud.
- **Imposta MID**: quando la pagina non espone un identificativo riconoscibile, inserisci il MID della BU corrente. Se manca anche lo stack, viene richiesto separatamente, ad esempio `s10`.
- **Tester BU**: inserisci i tuoi destinatari, una riga per persona, nel formato `Cognome;Nome;email`. Il file con i contatti personali del team originale è escluso dal pacchetto. La rubrica iniziale è vuota: gli eventuali destinatari configurati restano nello storage locale del browser e non entrano nello ZIP.
- **Link Email Studio**: configura il modello descritto sotto.

L'impostazione manuale del contesto vale solo per il documento aperto: può dover essere ripetuta nei diversi moduli o dopo un ricaricamento. Le preferenze sono invece salvate per stack e MID. Non viene dedotto il MID dall'Enterprise ID né dal proprietario di una DE condivisa.

Senza MID e stack riconosciuti le cronologie restano temporanee in memoria e il versionamento SQL persistente resta sospeso. Le funzioni di interfaccia continuano a essere disponibili. Le cronologie della vecchia versione non vengono attribuite automaticamente a una BU.

Se cambi BU senza ricaricare, controlla sempre la barra: un MID inserito manualmente non può aggiornarsi da solo. In Query Studio il testo dell'editor viene conservato, ma dopo un cambio di contesto occorre copiarlo se necessario e premere Clear prima di salvare nella nuova BU.

## Aprire la stessa DE in Email Studio

1. In Contact Builder apri una DE, nella scheda Proprietà oppure Record.
2. Alla prima configurazione compare **Configura apertura in Email Studio ↗**.
3. In Email Studio trova un link che identifichi una DE tramite il suo **ObjectID/GUID**. Il semplice link al modulo Email Studio o all'elenco delle DE non basta. Se la barra principale non cambia aprendo una DE, potrebbe essere necessario ottenere l'URL del frame o il link nativo del dettaglio.
4. Incolla quel link nella configurazione. Un unico GUID nell'URL viene sostituito con `{id}`. Se ci sono più GUID, sostituisci manualmente solo quello della DE con `{id}`.
5. È possibile usare anche `{stack}` e `{mid}` nei punti previsti dal link reale. Il fatto che un URL contenga il parametro MID non implica che Salesforce effettui un cambio BU: questo comportamento va verificato nel proprio ambiente.
6. Il comando diventa **Apri in Email Studio ↗**. Apre una nuova scheda/finestra secondo le impostazioni di Chrome, mantenendo aperto Contact Builder.

Il GUID viene letto dalla DE attualmente aperta e ricalcolato anche al clic. Il pulsante segue la navigazione senza ricaricamento e scompare tornando all'elenco. Supporta mouse, tastiera e il normale comportamento dei link di Chrome.

Sono accettati solo URL HTTPS dei domini Marketing Cloud previsti. Non incollare URL con token o credenziali. Modelli basati soltanto su nome, External Key o un ID numerico diverso dal GUID richiedono un adattamento e non sono supportati da questa versione.

**Non viene proposto un percorso Email Studio predefinito inventato:** l'URL effettivo non era presente nei sorgenti e non è stato possibile verificarlo in una sessione autenticata. Configurazione e prova sul tenant sono necessarie prima di considerare questa funzione operativa.

Se l’indirizzo resta su `#app/Email/C12/Default.aspx?entityType=none&entityID=0` anche aprendo una DE, quel link non identifica il dettaglio. Per raccogliere i percorsi interni: apri la DE in Email Studio, clicca l’icona dell’estensione, scegli **Diagnostica Email Studio**, seleziona la scheda e premi **Raccogli diagnostica**. Controlla l’anteprima e usa **Scarica rapporto** per condividerlo con chi sviluppa il collegamento. Dopo un aggiornamento dell’estensione occorre ricaricare anche la pagina Email Studio prima della raccolta. Il rapporto non contiene i record o le risposte API e non viene inviato automaticamente; può contenere stack e identificativi tecnici. La diagnostica non implementa ancora la navigazione automatica tra le DE.

## Cosa include

- Contact Builder: ricerca DE, viste recenti, prima/ultima pagina, clonazione riga, inserimento multiplo, CSV della pagina caricata, strumenti SMS e nuovo link Email Studio.
- Content Builder: completamento destinatari per BU, log locali dei tentativi di test per 60 giorni, rigenerazione anteprima e cartelle virtuali delle DE recenti quando la radice è riconosciuta.
- Automation Studio: cronologia, collegamenti alle attività e DE target, copia SQL e visualizzazione SQL validato, esportazione JSON e snapshot all'ingresso in modifica.
- Query Studio: bozze, recupero dell'ultima query, copia colonne, pannelli comprimibili.
- Journey Builder: apertura delle referenze ai Journey in un'altra scheda.
- Clic sull'icona dell'estensione: consultazione, ricerca per MID/stack, download ed eliminazione delle versioni SQL locali; esportazione dello storico.

Dettagli, funzioni solo previste nell'originale, limiti e collaudo: [DOCUMENTATION.md](DOCUMENTATION.md).
