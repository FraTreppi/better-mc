# SFMC UI Fixer — Multi BU 1.1.3

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

In basso a destra, nei moduli supportati, compare una barra SFMC Fixer.

In **Journey Builder**, anche nei frame delle attività, la barra e il menu **SFMC Fixer** non vengono mostrati. Il collegamento aggiunto alle referenze dei Journey resta disponibile.

- **BU … · s…**: controlla che MID e stack corrispondano alla BU selezionata in Marketing Cloud.
- **Imposta MID**: quando la pagina non espone un identificativo riconoscibile, inserisci il MID della BU corrente. Se manca anche lo stack, viene richiesto separatamente, ad esempio `s10`.
- **Tester BU**: inserisci i tuoi destinatari, una riga per persona, nel formato `Cognome;Nome;email`. Il file con i contatti personali del team originale è escluso dal pacchetto. La rubrica iniziale è vuota: gli eventuali destinatari configurati restano nello storage locale del browser e non entrano nello ZIP.

L'impostazione manuale del contesto vale solo per il documento aperto: può dover essere ripetuta nei diversi moduli o dopo un ricaricamento. Le preferenze sono invece salvate per stack e MID. Non viene dedotto il MID dall'Enterprise ID né dal proprietario di una DE condivisa.

Senza MID e stack riconosciuti le cronologie restano temporanee in memoria e il versionamento SQL persistente resta sospeso. Le funzioni di interfaccia continuano a essere disponibili. Le cronologie della vecchia versione non vengono attribuite automaticamente a una BU.

Se cambi BU senza ricaricare, controlla sempre la barra: un MID inserito manualmente non può aggiornarsi da solo. In Query Studio il testo dell'editor viene conservato, ma dopo un cambio di contesto occorre copiarlo se necessario e premere Clear prima di salvare nella nuova BU.

## Aprire la stessa DE in Email Studio

1. Seleziona la BU corretta in Marketing Cloud e apri una DE in Contact Builder, nella scheda Proprietà oppure Record.
2. Premi **Apri in Email Studio ↗**.
3. Si apre una nuova scheda/finestra con il collegamento al dettaglio della stessa DE; Contact Builder resta aperto.

Non devi incollare un URL o inserire manualmente il MID per questo collegamento. Lo stack viene rilevato dal contesto e il GUID viene letto dalla DE aperta, anche al momento del clic. Il pulsante segue la navigazione senza ricaricamento e scompare tornando all’elenco. I vecchi modelli di URL salvati non vengono più utilizzati.

Il percorso nativo è `Subscribers/Data_Extensions/<GUID>/edit`: nel router Email Studio il suffisso `edit` apre la vista Properties. Il link usa la sessione Email Studio corrente; non effettua un cambio BU automatico. Dopo un cambio cliente o BU, riapri Contact Builder nel contesto corretto. Disponibilità delle DE condivise o sincronizzate e permessi vanno verificati nel tenant.

La diagnostica resta disponibile dall’icona dell’estensione → **Diagnostica Email Studio** per eventuali problemi. Raccoglie percorsi tecnici e stringhe di navigazione dei bundle nativi, senza leggere record o risposte API e senza invio automatico del rapporto.

## Cosa include

- Contact Builder: ricerca DE, viste recenti, prima/ultima pagina, clonazione riga, inserimento multiplo, CSV della pagina caricata, strumenti SMS e nuovo link Email Studio.
- Content Builder: completamento destinatari per BU, log locali dei tentativi di test per 60 giorni, rigenerazione anteprima e cartelle virtuali delle DE recenti quando la radice è riconosciuta.
- Automation Studio: cronologia, collegamenti alle attività e DE target, copia SQL e visualizzazione SQL validato, esportazione JSON e snapshot all'ingresso in modifica.
- Query Studio: bozze, recupero dell'ultima query, copia colonne, pannelli comprimibili.
- Journey Builder: apertura delle referenze ai Journey in un'altra scheda.
- Clic sull'icona dell'estensione: consultazione, ricerca per MID/stack, download ed eliminazione delle versioni SQL locali; esportazione dello storico.

Dettagli, funzioni solo previste nell'originale, limiti e collaudo: [DOCUMENTATION.md](DOCUMENTATION.md).
