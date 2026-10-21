# SFMC UI Fixer - Guida rapida al test

Versione 1.1.6 | Autore: Francesco Trepiccioni | 21 ottobre 2026

Obiettivo: verificare l'estensione sul nostro Marketing Cloud. Tempo indicativo: 20-30 minuti. Il pacchetto è una versione di sviluppo: i controlli automatici sono passati, il collaudo reale resta da fare.

## 1. Installa e imposta la BU

1. Estrai lo ZIP in una cartella permanente. Non aprirlo direttamente come estensione.
2. In Chrome apri `chrome://extensions`, attiva **Modalità sviluppatore**, premi **Carica estensione non pacchettizzata** e scegli la cartella contenente `manifest.json`.
3. Disabilita eventuali vecchie versioni di SFMC UI Fixer e ricarica Marketing Cloud.
4. Apri Content Builder → Preview and Test. Accanto a **Test History** premi l’icona **Impostazioni SFMC** e verifica **BU/MID e stack** nella prima opzione. Se compare **Imposta MID**, inserisci il MID della BU attualmente selezionata; se richiesto, lo stack (es. `s10`). Il menu deve essere assente nelle Data Extension e negli altri moduli. Dall’icona dell’estensione nel browser disattiva e riattiva **Mostra le icone…**: devono sparire e ricomparire entrambe, senza cancellare tester o storico.

Usa una DE di prova e una casella email controllata. CLONE e MULTI ROWS possono salvare dati reali; il test send invia email. Non utilizzare campagne o dati operativi per queste prove.

## 2. Tre prove prioritarie

**A. Contact Builder**

- Cerca una DE nota con Advanced: deve comparire il risultato corretto. La ricerca mostra fino a 25 risultati.
- Apri le Proprietà, passa a Record e ritorna all'elenco: con MID riconosciuto la DE deve comparire nelle viste recenti. Senza contesto completo lo storico è temporaneo.
- Se la DE di prova ha più pagine, prova prima/ultima pagina. Esporta CSV: deve contenere solo la pagina caricata, con campi leggibili.
- Su una DE di prova modificabile, prova CLONE e MULTI ROWS con chiavi nuove e valori riconoscibili. Controlla i valori prima di confermare e verifica poi i record salvati. Rimuovi soltanto i record creati per la prova.

**B. La stessa DE da Contact Builder a Email Studio**

- Apri una DE in Contact Builder: deve comparire il comando per Email Studio, anche passando tra Proprietà e Record.
- Il comando deve essere **Apri in Email Studio**, già disponibile senza incollare URL o impostare il MID per questa funzione.
- Premi **Apri in Email Studio**: deve aprirsi un'altra scheda/finestra con la stessa DE e nella BU corretta, lasciando aperto Contact Builder.
- Attendi il messaggio di apertura mentre il modulo si inizializza: il dettaglio deve aprirsi anche se l’indirizzo esterno resta sul solo Subscribers. Se compare un avviso di mancata apertura, riporta l’esito come **FAIL**.
- Ripeti con una seconda DE senza ricaricare Contact Builder; confronta nome e GUID. Tornando all'elenco, il comando deve scomparire.
- Ripeti dopo aver selezionato un’altra BU e riaperto Contact Builder. Il link usa la sessione Email Studio corrente e non cambia BU automaticamente. Se apre una pagina errata, segna **FAIL** e riporta i passaggi e lo stack; la rotta è stata ricavata dal router nativo, ma resta da collaudare nel tenant.

- In Preview and Test premi **Tracking test**, accanto a Send Test: deve aprire Email Studio → Tracking → **Test Send Emails**, anche con le due icone nascoste. Non deve inviare una nuova email. Se resta sul solo Tracking o appare un avviso, segna FAIL.

**C. Separazione tra due Business Unit**

- Nella BU A apri Preview and Test → icona Impostazioni SFMC → **Tester BU**. Compila Nome, Cognome ed Email, aggiungi righe con **+ Aggiungi tester** e premi **Salva tester**: verifica la conferma del numero salvato. Prova con dieci indirizzi controllati.
- Passa alla BU B e verifica o correggi il MID nel menu di Preview and Test. Le cronologie e la rubrica della BU A non devono essere riutilizzate nella B.
- Torna alla BU A: con lo stesso modulo/dominio e un contesto riconosciuto, le voci salvate devono riapparire.
- Ricarica la pagina: se il MID era manuale, usa **Conferma MID** e conferma la BU attuale. Riapri Tester BU: i contatti devono ricomparire senza reinserirli. Se cambi BU, correggi il MID; il suggerimento resta separato per scheda e dominio. Senza contesto completo le cronologie sono temporanee e gli snapshot SQL non vengono salvati in modo persistente.

## 3. Altre prove, se i moduli sono disponibili

| Area | Cosa provare | Risultato atteso |
|---|---|---|
| Content Builder | Salva dieci tester, riapri la rubrica e cerca il decimo nel campo type a name...; invia un test solo alla tua casella controllata | Dieci contatti conservati, massimo cinque suggerimenti per ricerca; selezione corretta e email ricevuta. Uscendo da Preview and Test le icone scompaiono |
| Anteprima | Apri Preview da un log con DE e riga disponibili | Anteprima caricata. Usa dati attuali: non è una copia storica dell'email |
| Automation Studio | Apri una Query Activity di prova; usa Copy, Toggle Query e Download Version; entra in Edit e poi annulla | SQL copiato, testo alternativo disponibile se restituito da Salesforce, JSON scaricato e snapshot visibile cliccando l'icona dell'estensione |
| Query Studio | Salva una query con un accento (es. `SELECT 'città' AS esempio`), cambia testo e recuperala dalla Lista query | Bozza ripristinata senza perdere gli accenti; non occorre eseguire SQL. Dopo un cambio BU conserva il testo utile e premi Clear prima di salvare nel nuovo contesto |
| Journey Builder | Su una entry DE riconosciuta premi Apri Data Extension; ripeti con un’altra versione e verifica anche il vecchio link alle referenze Journey | Stessa DE in Contact Builder, nessun comando sulle attività successive. Se il pulsante manca, serve l’HTML dell’entry per verificarne l’aggancio |

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
