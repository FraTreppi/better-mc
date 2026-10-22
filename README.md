# SFMC UI Fixer — Multi BU 1.1.16

**Autore della versione Multi BU: Francesco Trepiccioni.** Derivata da SFMC UI Fixer di Simone Luise.

[Scarica il progetto](https://github.com/FraTreppi/better-mc/raw/refs/heads/main/dist/sfmc-ui-fixer-multi-bu-diagnostica.zip)

La **[Guida utente](GUIDA_UTENTE.md)**, disponibile anche come **[PDF](GUIDA_UTENTE.pdf)**, descrive tutte le funzionalità e come usarle: installazione, configurazione delle BU, rubrica tester, cronologie, Tracking Test, strumenti DE, Automation Studio, Query Studio e Journey Builder.

## Installazione e aggiornamento

Estrai lo ZIP, apri `chrome://extensions`, attiva Modalità sviluppatore e scegli **Carica estensione non pacchettizzata** sulla cartella contenente `manifest.json`. Richiede Chrome 111 o successivo.

Per aggiornare, sostituisci i file nella stessa cartella e premi **Ricarica** sull’estensione. Poi aggiorna le schede Marketing Cloud. Non serve disinstallarla; mantenere la stessa installazione conserva i suoi salvataggi.

## Funzionalità

| Modulo | Strumenti |
| --- | --- |
| Contact Builder | Ricerca avanzata DE, visite recenti, prima/ultima pagina, CLONE, MULTI ROWS, CSV completo della DE con avanzamento e annullamento, analisi SMS locale, collegamento alla stessa DE in Email Studio. |
| Preview and Test | Rubrica locale o DE condivisa tester_content_builder, fino a 1000 tester per BU, suggerimenti destinatari, Test History locale e nuove anteprime, cartelle virtuali delle DE recenti, Tracking Test. |
| Automation Studio | Automation recenti, collegamenti alle attività e alla DE target, copia SQL, vista SQL validato, download JSON, copie locali prima della modifica. |
| Query Studio | Bozze, recupero dell’editor, elenco query, copia campi e campi obbligatori, pannelli comprimibili. |
| Journey Builder | Collegamento ai Journey referenziati e alla DE dell’entry quando identificabile. |
| Pagina dell’estensione | Visibilità delle icone, consultazione ed esportazione delle versioni SQL, eliminazione delle copie locali, diagnostica Email Studio. |

Le due icone Impostazioni SFMC e Test History compaiono solo in Preview and Test e possono essere nascoste completamente. Tracking Test rimane accanto a Send Test. I collegamenti usano la sessione e la BU attive di Salesforce: non cambiano cliente automaticamente.

## Rubrica DE condivisa

Crea in ogni BU **Data Extensions → SFMC_UI_Fixer → tester_content_builder**, con Nome ed External Key `tester_content_builder` e campi `Nome` (Text), `Cognome` (Text), `Email` (EmailAddress, Primary Key). In **Tester BU**, scegli la sorgente DE, attendi la verifica e premi **Salva sorgente**. I record vengono letti con la sessione corrente e non modificati. La [guida](GUIDA_UTENTE.md#rubrica-tester-bu) spiega schema, ricerca e aggiornamento dei contatti.

## Sicurezza e dati

La versione 1.1.16 restringe l’accesso ai dati locali al modulo, al documento e alla BU autorizzati. Per usare la rubrica o salvare copie SQL è richiesta una conferma locale con dominio, MID e stack. Rifiutare non disabilita le altre funzioni.

Il proxy di rete generico è stato rimosso. Il controllo SMS è interamente locale. Le anteprime bloccano script, navigazione e risorse esterne; le immagini HTTPS richiedono un comando e una conferma espliciti. I CSV proteggono dai prefissi che i fogli di calcolo potrebbero interpretare come formule.

Queste misure riducono i rischi individuati e non costituiscono una garanzia assoluta. Le operazioni sui record usano la sessione Salesforce e possono modificare dati reali. Le copie locali e i file scaricati non sono cifrati dall’estensione.

Vedi **[Sicurezza e limiti](SICUREZZA.md)** per le protezioni e i rischi residui. La [documentazione tecnica](DOCUMENTATION.md) e la [cronologia](CHANGELOG.md) sono separate dalla guida utente.
