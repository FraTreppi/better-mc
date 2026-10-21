# SFMC UI Fixer - Guida rapida al test

Versione 1.1.3 | Autore: Francesco Trepiccioni | 21 ottobre 2026

Obiettivo: verificare l'estensione sul nostro Marketing Cloud. Tempo indicativo: 20-30 minuti. Il pacchetto è una versione di sviluppo: i controlli automatici sono passati, il collaudo reale resta da fare.

## 1. Installa e imposta la BU

1. Estrai lo ZIP in una cartella permanente. Non aprirlo direttamente come estensione.
2. In Chrome apri `chrome://extensions`, attiva **Modalità sviluppatore**, premi **Carica estensione non pacchettizzata** e scegli la cartella contenente `manifest.json`.
3. Disabilita eventuali vecchie versioni di SFMC UI Fixer e ricarica Marketing Cloud.
4. Apri Contact Builder dal menu Salesforce. Nella barra in basso a destra verifica **BU/MID e stack**. Se compare **Imposta MID**, inserisci il MID della BU attualmente selezionata; se richiesto, lo stack (es. `s10`). Ripeti la verifica nei diversi moduli e dopo ogni cambio BU.

Usa una DE di prova e una casella email controllata. CLONE e MULTI ROWS possono salvare dati reali; il test send invia email. Non utilizzare campagne o dati operativi per queste prove.

## 2. Tre prove prioritarie

**A. Contact Builder**

- Cerca una DE nota con Advanced: deve comparire il risultato corretto. La ricerca mostra fino a 25 risultati.
- Apri le Proprietà, passa a Record e ritorna all'elenco: la DE deve comparire nelle viste recenti.
- Se la DE di prova ha più pagine, prova prima/ultima pagina. Esporta CSV: deve contenere solo la pagina caricata, con campi leggibili.
- Su una DE di prova modificabile, prova CLONE e MULTI ROWS con chiavi nuove e valori riconoscibili. Controlla i valori prima di confermare e verifica poi i record salvati. Rimuovi soltanto i record creati per la prova.

**B. La stessa DE da Contact Builder a Email Studio**

- Apri una DE in Contact Builder: deve comparire il comando per Email Studio, anche passando tra Proprietà e Record.
- Il comando deve essere **Apri in Email Studio**, già disponibile senza incollare URL o impostare il MID per questa funzione.
- Premi **Apri in Email Studio**: deve aprirsi un'altra scheda/finestra con la stessa DE e nella BU corretta, lasciando aperto Contact Builder.
- Ripeti con una seconda DE senza ricaricare Contact Builder; confronta nome e GUID. Tornando all'elenco, il comando deve scomparire.
- Ripeti dopo aver selezionato un’altra BU e riaperto Contact Builder. Il link usa la sessione Email Studio corrente e non cambia BU automaticamente. Se apre una pagina errata, segna **FAIL** e riporta i passaggi e lo stack; la rotta è stata ricavata dal router nativo, ma resta da collaudare nel tenant.

**C. Separazione tra due Business Unit**

- Nella BU A visita una DE e, se utile, configura un tuo indirizzo da **Tester BU**.
- Passa alla BU B e controlla il MID nella barra. Le cronologie e la rubrica della BU A non devono essere riutilizzate nella B.
- Torna alla BU A: con lo stesso modulo/dominio e un contesto riconosciuto, le voci salvate devono riapparire.
- Se il MID è stato inserito manualmente, aggiornalo dopo il cambio BU; può essere necessario reinserirlo nei vari moduli. Senza contesto completo le cronologie sono temporanee e gli snapshot SQL non vengono salvati in modo persistente.

## 3. Altre prove, se i moduli sono disponibili

| Area | Cosa provare | Risultato atteso |
|---|---|---|
| Content Builder | Configura un tuo destinatario in Tester BU, cerca il nome e invia un test alla casella controllata | Suggerimento corretto, email ricevuta e tentativo nel log. Nessun contatto del team originale deve essere già presente |
| Anteprima | Apri Preview da un log con DE e riga disponibili | Anteprima caricata. Usa dati attuali: non è una copia storica dell'email |
| Automation Studio | Apri una Query Activity di prova; usa Copy, Toggle Query e Download Version; entra in Edit e poi annulla | SQL copiato, testo alternativo disponibile se restituito da Salesforce, JSON scaricato e snapshot visibile cliccando l'icona dell'estensione |
| Query Studio | Salva una query con un accento (es. `SELECT 'città' AS esempio`), cambia testo e recuperala dalla Lista query | Bozza ripristinata senza perdere gli accenti; non occorre eseguire SQL. Dopo un cambio BU conserva il testo utile e premi Clear prima di salvare nel nuovo contesto |
| Journey Builder | Su un elemento con riferimento a un Journey, prova il collegamento in un'altra scheda | Apre il Journey e la versione referenziati, quando l'elemento è riconosciuto dall'estensione |

## 4. Restituisci un esito semplice

Per ciascuna prova indica **PASS / FAIL / NON TESTABILE**. Il log dei test send registra un tentativo: controlla anche l'effettiva ricezione dell'email.

Copia questo schema per i problemi:

```text
Chrome e versione estensione:
BU/MID e stack:
Prova e modulo:
Passaggi per riprodurre:
Risultato atteso:
Risultato effettivo:
Esito: PASS / FAIL / NON TESTABILE
```

Se utile, allega uno screenshot senza dati dei contatti. Se l'estensione non parte, controlla il pulsante Errori nella sua scheda in `chrome://extensions` e riporta il messaggio senza token o credenziali. Per disattivarla basta spegnerla in quella pagina e ricaricare Marketing Cloud.
