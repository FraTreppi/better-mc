# MC Code Project

Strumento locale di SFMC UI Fixer per lavorare in VS Code o in un altro editor e conservare codice, metadati e documentazione in un repository GitHub **privato**.

## Prova subito, senza Salesforce

Installa Node.js **24.15 o successivo**. Dalla cartella estratta dello strumento esegui:

```sh
node bin/mc-project.mjs demo ../MC-Demo
```

Apri `MC-Demo` nell’editor. Trovi email, template, CloudPage, query e Journey di esempio, con codice separato e documentazione. Non servono credenziali o `npm install` per questa prova. La demo blocca le operazioni di rete verso MC.

Puoi anche scaricare direttamente il [progetto demo](https://github.com/FraTreppi/better-mc/raw/refs/heads/main/dist/sfmc-code-project-demo.zip). I contenuti sono interamente fittizi.

## Crea il tuo progetto

Su Windows estrai tutto lo [ZIP dello strumento](https://github.com/FraTreppi/better-mc/raw/refs/heads/main/dist/sfmc-code-project.zip), chiudi le vecchie finestre di VS Code e fai doppio clic su **CREA-PROGETTO.cmd**. Crea `MC-Progetto` nella cartella della tua utenza e lo apre in VS Code, usando percorsi completi anche se il terminale precedente era in System32. Riconosce Node installato dal pacchetto fnm dell’utenza. Un progetto gia presente viene aperto; una cartella non vuota senza configurazione viene conservata e segnalata.

Da terminale, su tutti i sistemi, puoi invece usare questi comandi dalla cartella dello strumento:

```sh
node bin/mc-project.mjs init ../MC-Progetto
cd ../MC-Progetto
npm ci --ignore-scripts
```

Installa anche Git per lo storico. L’inizializzazione prepara Git, file esclusi, dipendenze fissate, documentazione e attività VS Code. Da **Terminale → Esegui attività** trovi i comandi MC: inventario, backup, documentazione, confronto, preparazione e invio. Il progetto funziona anche da un altro editor con gli stessi comandi da terminale.

### Esportazioni dal browser, senza integrazione API

Nell’estensione aggiornata, **Esporta per Git** scarica il contenuto **salvato in MC** per email/template/blocchi aperti in Content Builder, Query Activity e versione Journey aperta. Nell’elenco CloudPages il pulsante con icona download esporta configurazione della pagina e asset associato del sorgente. Le modifiche non salvate nell’editor non vengono esportate.

Copia il file scaricato nel progetto e importalo:

```sh
npm run mc -- import sfmc-git-export.json
```

`browser/` conserva il JSON nativo e i campi di codice in file separati, compresi blocchi e slot annidati. `sources.json` collega ogni file al campo originario. Le successive esportazioni aggiornano gli stessi percorsi; se hai modificato un sorgente localmente viene rilevato il conflitto. Non vengono sovrascritti automaticamente i file in conflitto.

Gli export browser sono backup leggibili, **separati dai pacchetti distribuibili** di SFMC DevTools. Per il round trip verso Salesforce si parte da `connect` e `pull`, mantenendo i riferimenti nativi necessari al deploy.

## Collegamento Salesforce: da fare più avanti

Serve un **Installed Package**: è la registrazione dell’integrazione dentro Marketing Cloud, non un programma da installare sul PC. Un amministratore può crearlo da **Setup → Apps → Installed Packages**, aggiungendo un componente **API Integration → Server-to-Server**.

L’amministratore deve assegnare lettura delle risorse da gestire e delle relative dipendenze: Content Builder/asset, SQL Query e script, automazioni, Journey/eventi e metadati delle DE. La scrittura serve soltanto per gli invii di modifiche; attivare Journey richiede i permessi dedicati. Le BU da autorizzare dipendono dall’account e dalla configurazione del pacchetto.

Quando il pacchetto è disponibile:

```sh
npm run mc -- connect
```

Il wizard locale di SFMC DevTools richiede le informazioni dell’integrazione e rende disponibili i nomi delle connessioni/BU in `.mcdevrc.json`. **Non incollare Client Secret o token in chat, nei sorgenti o su GitHub.** Il file locale `.mcdev-auth.json` è escluso da Git; le credenziali non vengono inviate all’estensione e non sono cifrate dallo strumento.

## Backup, editor e documentazione

Sostituisci `Connessione/BU` con i nomi presenti nella tua configurazione:

```sh
npm run mc -- pull --bu Connessione/BU
npm run mc -- list --bu Connessione/BU
npm run mc -- docs --bu Connessione/BU
```

Il backup usa **SFMC DevTools 10.1.1**, fissato nel lockfile. I tipi predefiniti sono asset di codice (email, template, blocchi, codice, altri asset testuali e Web Studio/CloudPages), query, Journey, script, automation ed eventi. Le dipendenze vengono risolte dal motore. Non vengono scaricati i record delle DE, gli allegati binari o le immagini come backup completo; i relativi riferimenti rimangono nei metadati. Le query temporanee di Query Studio sono incluse.

```text
MC-Progetto/
  retrieve/Connessione/BU/    sorgenti e metadati da modificare
  browser/                   esportazioni puntuali dal browser
  docs/Connessione/BU/       inventario, dipendenze e flussi Journey
  .vscode/tasks.json         comandi avviabili dall’editor
  sfmc-project.json          tipi di backup e formato del progetto
  sfmc-baselines.json        MID e SHA-256 dell’ultimo backup, da versionare
  .mcdevrc.json              nomi connessioni/BU, senza Client Secret
  .mcdev-auth.json           credenziali locali, escluse da Git
  .sfmcgit-state/            baseline, confronti e backup prima degli invii
```

Modifica i file in `retrieve`, mantenendo la struttura generata dal motore. Il confronto a tre versioni distingue le tue modifiche da quelle fatte in MC dopo il backup. Un conflitto interrompe il pull senza sostituire i file di lavoro e salva il confronto in `.sfmcgit-state/conflicts`. L’archivio mantiene le definizioni/versioni restituite dal motore: lo storico Git comincia dal primo backup e non ricostruisce modifiche antecedenti mai salvate.

Versiona anche `sfmc-baselines.json`: conserva il MID e le impronte dell’ultimo backup e consente il confronto sul PC di un collega che clona il repository senza lo stato locale. Ogni collega installa le dipendenze con `npm ci --ignore-scripts` e configura le proprie credenziali con `connect`, mantenendo gli stessi nomi connessione/BU. Il riutilizzo di un alias per un MID diverso viene rifiutato. I file di testo usano LF anche su Windows, evitando differenze dovute ai soli fine riga.

La documentazione include un inventario, schede per ogni risorsa, file associati e riferimenti dichiarati. I Journey hanno anche un diagramma Mermaid del flusso. Riferimenti calcolati dinamicamente in AMPscript/SSJS richiedono una verifica del codice.

## Rivedi e invia una modifica

Seleziona un solo elemento usando il percorso mostrato da `list`:

```sh
npm run mc -- plan --bu Connessione/BU --file query/esempio.query-meta.json
npm run mc -- diff
```

Il piano non scrive in MC. Rilegge la versione remota, controlla che corrisponda alla baseline e prepara `docs/INVIO.md`, indicando BU, MID, file, Customer Key e ID del piano. Dopo aver verificato il confronto:

```sh
npm run mc -- apply --plan ID-DEL-PIANO
```

L’invio ricontrolla file, MID e versione remota; il piano scade dopo un’ora. Salva una copia locale della versione precedente, invia soltanto l’elemento selezionato e verifica i campi/file modificati con una rilettura. Un errore o una risposta incerta non autorizza a ripetere lo stesso piano: verifica MC e usa `pull`. Salesforce non offre qui una transazione che blocchi gli altri editor tra lettura e salvataggio.

| Tipo | Azione disponibile |
| --- | --- |
| Email/template/blocchi | Salvataggio del contenuto; Preview and Test in MC prima dell’uso. I blocchi richiamati a runtime possono influire sui contenuti che li usano. |
| CloudPages | Backup e aggiornamento del contenuto di pagine già esistenti. Creazione e **Publish** rimangono nell’interfaccia Salesforce. |
| Query/script | Salvataggio della definizione, senza esecuzione. |
| Journey | Invio di una versione **Draft**; validazione e attivazione con comando separato. |
| Automation | Backup e documentazione; pianificazione, avvio e aggiornamento del workflow rimangono in MC. Le query/script collegati si aggiornano separatamente. |

Per attivare un Journey dopo averne salvato e verificato la versione:

```sh
npm run mc -- publish-journey --plan ID-DEL-PIANO --confirm MID/CUSTOMER-KEY/VERSIONE
```

Questo comando può avviare un Journey reale. Verifica esattamente l’ultima versione Draft salvata, esegue la validazione e richiede la pubblicazione tramite il motore Salesforce. Non fa parte di `apply`, di un commit o di un push Git. L’esito sul tenant dipende dai permessi e dalla validazione Salesforce.

## Storico GitHub

Crea un repository GitHub **privato** dedicato ai contenuti aziendali. Da VS Code usa Source Control per vedere il diff, creare branch, commit e Pull Request. Non usare il repository pubblico dell’estensione per i contenuti MC.

Per creare un commit locale dallo strumento:

```sh
npm run mc -- checkpoint --message "Aggiornamento template e query"
```

Il comando controlla che i file privati non risultino nell’indice Git e aggiunge le cartelle del progetto. La pubblicazione del commit avviene da VS Code oppure con `git push`, usando il tuo accesso GitHub. Le credenziali contenute direttamente nel codice non possono essere riconosciute tutte automaticamente: esamina sempre il diff prima di pubblicarlo.

## Limiti di questa consegna

Progetto, import, conflitti, piani e attività dell’editor sono verificabili offline. Le operazioni Salesforce usano il motore SFMC DevTools installato, ma non sono state eseguite su una BU reale in questo ambiente: manca il collegamento Server-to-Server. Disponibilità e formato delle API interne dipendono dal tenant. Un backup non include destinatari/record e non è un disaster recovery completo del tenant.

Le operazioni gestiscono al massimo 256 MB e 100.000 file per albero, con singoli file fino a 32 MB. Se il progetto supera questi limiti, separa le BU o riduci esplicitamente i tipi in `sfmc-project.json`. Non creare symlink dentro ai sorgenti o allo stato locale.

## Motore e licenza di terze parti

L’integrazione Salesforce usa [Accenture SFMC DevTools](https://github.com/Accenture/sfmc-devtools), pacchetto npm `mcdev` **10.1.1**, distribuito con licenza MIT. È installato soltanto nel progetto locale, non nell’estensione browser. Il suo codice e le sue dipendenze non sono inclusi nello ZIP dell’estensione; `npm ci --ignore-scripts` li installa dal lockfile.
