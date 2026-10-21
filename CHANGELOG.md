# 1.1.2 — 21 ottobre 2026

- Rimossi barra e menu SFMC Fixer dal Journey Builder e dai documenti incorporati nel Journey, inclusi i frame con hostname differente. Resta disponibile il collegamento alle referenze dei Journey; la barra degli altri moduli resta disponibile quando aperti autonomamente.

# 1.1.1 — 21 ottobre 2026

- Diagnostica Email Studio v2: raccolta delle stringhe di navigazione nei tre bundle nativi già caricati, memoria delle richieste recenti anche dopo il riempimento del buffer del browser, attesa dei frame con analisi in corso e indicazione dei risultati incompleti. Nessuna lettura dei record o delle risposte API, nessun nuovo permesso.
- Aggiunta diagnostica di sola lettura per il collegamento Contact Builder → Email Studio: raccolta esplicita dei percorsi dei frame e delle richieste, parametri filtrati, anteprima ed esportazione JSON senza invio automatico. Nessun nuovo permesso richiesto. L’apertura automatica del dettaglio resta da implementare dopo la verifica del percorso nativo.
- Journey Builder: barra di configurazione raccolta in un menu inizialmente chiuso in alto a destra, anche nei frame delle attività, per lasciare liberi Done/Cancel e zoom. Chiusura con clic esterno o Esc.

# 1.1.0 — 20 ottobre 2026

- Autore della versione Multi BU: Francesco Trepiccioni; aggiunta guida rapida di collaudo per i colleghi, in Markdown e PDF.

- Copia separata della versione 1.0; `stable` originale conservata.
- Individuazione dello stack dal contesto corrente, senza fallback s7.
- Identificazione del MID quando esposto dalla pagina; alternativa manuale per documento.
- Cronologie DE, automation, test send e query salvate separate per stack/MID; memoria temporanea quando il contesto è sconosciuto.
- Destinatari di test configurabili per BU; elenco personale originale escluso dal distribuibile.
- Link Contact Builder → Email Studio con modello configurabile per BU, aggiornamento su navigazione SPA e controllo del GUID al clic. Necessita calibrazione sul tenant.
- Rimozione degli ID operativi fissi di DE e cartelle dai moduli attivi; rilevamento della radice DE per le cartelle virtuali delle anteprime.
- Endpoint di inserimento righe relativi al dominio Contact Builder corrente.
- Snapshot SQL separati per stack/MID, visualizzatore aggiornato, esportazione dello storico e cancellazioni serializzate che preservano nuovi snapshot concorrenti.
- Caricamento del modulo DE anche entrando direttamente sul dettaglio o navigando da altre sezioni Contact Builder.
- Correzioni a ricerca con caratteri speciali ed errori HTTP, cronologia vuota dopo cambio BU, callback jQuery, CSV con virgolette/separatori/a capo, autocomplete, query con Unicode e preview email in iframe sandbox.
- Proxy fetch limitato a letture HTTPS Marketing Cloud; permesso tabs rimosso, risorse accessibili coerenti con i domini di caricamento.
- Suite di regressione locale e script di packaging ripetibile.

Verifica automatica locale completata. Compatibilità reale di moduli, API interne, selettori, permessi, DE condivise e collegamento Email Studio da collaudare su Marketing Cloud.
