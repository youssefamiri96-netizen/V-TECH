# V-Tech Trasporti Cloud

Questa e la nuova versione separata dal gestionale locale.

La cartella vecchia puo continuare a lavorare sul PC. Questa cartella invece e pronta per GitHub + Railway.

## Cosa cambia

- I dati gia processati sono duplicati in `seed/`.
- Al primo avvio online, se lo storage Railway e vuoto, il gestionale copia automaticamente `seed/` dentro lo storage runtime.
- In cloud non legge la cartella Download del PC: report V-Tech, tariffe attive e passiva BRT si caricano dal browser.
- Il login e interno al gestionale, non nelle variabili Railway.
- L'admin puo creare profili dalla pagina `Admin`.
- La navigazione e divisa per processo: `Dashboard`, `Pianificazione`, `Groupage`, `FTL`, `Fatturazione`.
- La `Wave` viene letta per ricavare data partenza, vettore e tipo operativo quando possibile.
- L'ordine resta l'identita stabile; la shipment puo aggiornarsi quando BO rigenera le wave.

## Ruoli

- `admin`: accesso completo e gestione utenti.
- `backup`: accesso operativo completo, pensato per il collega che ti sostituisce.
- `operator`: accesso operativo completo senza gestione utenti.
- `billing`: accesso solo alla pagina Fatturazione.

## Primo accesso

Le credenziali iniziali duplicate dal gestionale attuale sono in:

`seed/accessi_temporanei.txt`

Dopo il primo login, entra nella pagina `Admin` e cambia/crea gli utenti definitivi.

## Railway

1. Crea un repository GitHub privato, per esempio `vtech-trasporti-cloud`.
2. Carica su GitHub il contenuto di questa cartella, inclusa la cartella `seed/`.
3. Su Railway crea un nuovo progetto da GitHub.
4. Railway usera il `Dockerfile`.
5. Aggiungi un Volume Railway montato su `/data`.
6. Apri il dominio generato da Railway.

Importante: senza Volume montato su `/data`, i dati possono resettarsi quando Railway ricrea il container.

## File da caricare su GitHub

Carica tutto tranne:

- `data/`
- `outputs/`
- `__pycache__/`
- eventuali `.cloud_test_data/`

Questi sono gia esclusi dal `.gitignore`. I dati iniziali necessari sono in `seed/`.

## Operativita in cloud

- Report BO: carica il file con `Carica report`.
- Tariffe attive: carica il file con `Carica tariffe attive`.
- Passiva BRT: carica il PDF con `Carica passiva BRT`.
- XML consegna FTL: viene generato dal server e scaricato dal browser.
- Fatturazione: gli export Excel si scaricano dal browser.
