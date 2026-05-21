# Deploy V-Tech su Railway

## Cosa cambia rispetto al PC locale

- Il programma gira online, quindi non legge piu file da `C:\Users\...`.
- Report V-Tech, tariffe attive e PDF BRT si caricano dal browser con i pulsanti nella pagina `Spedizioni`.
- Excel e XML vengono scaricati dal browser.
- Outlook non puo aprirsi direttamente da Railway: quando generi una mail, il sistema copia negli appunti il contenuto HTML pronto. Apri Outlook, nuova mail, incolla e invia. Viene comunque generato anche un `.eml` scaricabile come backup.
- I dati devono stare in un volume Railway montato su `/data`.

## File pronti per GitHub/Railway

- `Dockerfile`
- `requirements.txt`
- `Procfile`
- `railway.json`
- `.gitignore`

## Variabili ambiente Railway

Imposta queste variabili nel servizio Railway:

```text
VTECH_CLOUD_MODE=1
VTECH_DATA_DIR=/data
VTECH_OUTPUT_DIR=/data/outputs
VTECH_DOWNLOADS_DIR=/data/downloads
VTECH_XML_DIR=/data/downloads
VTECH_ADMIN_PASSWORD=scegli-tu-password-admin
VTECH_BACKUP_PASSWORD=scegli-tu-password-backup
VTECH_BILLING_PASSWORD=scegli-tu-password-fatturazione
```

Railway fornisce automaticamente `PORT`, quindi non serve impostarla.

## Volume Railway

Crea un volume Railway e montalo su:

```text
/data
```

Senza volume il database funziona, ma rischia di sparire a ogni redeploy.

## Primo accesso

Al primo avvio il programma crea:

```text
/data/users.json
/data/accessi_temporanei.txt
```

Se hai impostato le tre variabili `VTECH_*_PASSWORD`, quelle saranno le password iniziali. Se non le imposti, il programma genera password casuali e le scrive in `accessi_temporanei.txt`.

- `youssef`: accesso completo
- `backup`: accesso completo
- `fatturazione`: solo fatturazione

## Flusso operativo online

1. Apri il dominio Railway.
2. Fai login.
3. In `Spedizioni`, carica prima tariffe attive e passiva BRT.
4. Carica il report V-Tech: viene importato e calcolato.
5. In `Fatturazione`, scarichi gli Excel da browser.

## Mail Outlook

In cloud il pulsante mail copia negli appunti il corpo mail gia pronto con tabella.

Per avere invio e rilevamento automatico reale da cloud serve una seconda fase con Microsoft Graph / account Microsoft 365 autorizzato. Nel frattempo, dopo aver inviato manualmente la mail groupage, seleziona le righe in `Groupage pianificato` e usa `Groupage caricato`.
