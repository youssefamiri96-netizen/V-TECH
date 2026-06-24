# V-Tech Trasporti

Programma locale per importare il report Excel V-Tech, calcolare tariffe attive/passive disponibili e dividere le spedizioni operative.

## Avvio

Se Python non trova `openpyxl` o `pypdf`, apri prima `installa_dipendenze.bat`.

Per la nuova dashboard moderna, apri:

- `avvia_vtech_web.bat`

La dashboard si apre nel browser su `http://127.0.0.1:8765` e resta completamente locale: nessun cloud, nessun dato caricato online. Usa lo stesso database locale e lo stesso motore di calcolo della versione desktop.

Quando la dashboard web e aperta controlla ogni 15 secondi la cartella Download. Se trova un nuovo file con nome contenente `Outbound Report (PROD)`, lo importa automaticamente e aggiorna le tabelle.

Se la dashboard web era gia aperta, chiudi la finestra `avvia_vtech_web.bat` e riaprila: il batch chiude automaticamente eventuali vecchi server locali sulla porta 8765 prima di avviare quello nuovo.

Per aprire la vecchia interfaccia desktop Tkinter:

1. Apri `avvia_vtech.bat`.
2. Seleziona il report Excel V-Tech.
3. Seleziona il file Excel delle tariffe attive.
4. Seleziona il PDF passiva BRT, se disponibile.
5. Premi `Importa e calcola`.

Quando il programma e aperto controlla automaticamente la cartella Download ogni 15 secondi. Se trova un nuovo file Excel con nome contenente `Outbound Report (PROD)`, importa il piu recente e aggiorna il database locale senza duplicare shipment gia presenti.

Le righe del report senza valore `Shipment` non vengono importate.

## Cosa crea

- `outputs/vtech_spedizioni_estratte.csv`: dettaglio righe articolo.
- `outputs/vtech_spedizioni_riepilogo.csv`: una riga per shipment.
- `data/vtech_trasporti.db`: database locale SQLite per storico spedizioni.

## Navigazione

La schermata usa una sidebar laterale sinistra con tre pagine operative:

- `Spedizioni`: spedizioni nuove o non ancora lavorate, divise tra groupage BRT LTL e dirette/altri vettori.
- `FTL pianificato`: spedizioni gia pianificate che non sono groupage BRT LTL, quindi KN LTL/FTL o altri vettori. Da qui puoi generare la mail Outlook sulle righe selezionate e poi spostarle in confermate.
- `Groupage pianificato`: spedizioni BRT LTL gia pianificate.
- `Groupage caricato`: spedizioni groupage per cui la mail Outlook e stata rilevata nella posta inviata. Puoi filtrare per data spedizione oppure cercare per shipment, ordine, cliente o provincia.
- `FTL CONFERMATI`: spedizioni FTL/LTL confermate dal vettore, pronte per essere contrassegnate come consegnate e generare XML.
- `Spedizioni consegnate`: spedizioni segnate come consegnate, con possibilita di riportarle indietro.
- `Fatturazione`: andamento mese per mese di fatturato attivo, costi passivi e GP.

Le pagine operative hanno scroll verticale: se una pagina contiene piu tabelle, puoi scorrere in basso senza perdere la separazione tra le tipologie di spedizione. Le tabelle sono a tutta larghezza e senza riquadri pesanti attorno, cosi resta piu spazio utile per leggere righe e colonne.

In fondo alla sidebar trovi anche il riquadro `Spedizioni eliminate`: mostra quante righe sono state cancellate definitivamente e quindi escluse dai prossimi import dello stesso report. Cliccando sul riquadro apri l'elenco delle eliminate; da li puoi selezionare una o piu righe e premere `Ripristina da pianificare` per riportarle tra le spedizioni operative.

Nella pagina `Spedizioni` resta visibile solo il percorso del report V-Tech attualmente usato, cosi puoi controllare subito quanto e aggiornato. Nelle altre pagine questo blocco viene nascosto per lasciare piu spazio ai dati. I percorsi delle tariffe attive e della passiva BRT restano salvati localmente ma sono nascosti dalla dashboard.

Nella pagina `Fatturazione` puoi filtrare per mese e vedere KPI, grafico storico e dettaglio clienti del mese. I valori si aggiornano con i dati presenti nello storico locale: attivo, passivo e GP vengono ricalcolati dai costi disponibili sulle spedizioni. La sezione mostra anche la composizione percentuale del passivo tra trasporto effettivo, extra e voci non classificate, piu il dettaglio degli extra per categoria.

Sempre in `Fatturazione`, il pulsante `Scarica passivo vettori` crea in `Download` un file Excel del mese selezionato con riepilogo per vettore e un foglio separato per ogni vettore. Ogni foglio contiene il dettaglio spedizioni, prezzo passivo, extra e totale, cosi puoi inviarlo a fine mese ai vettori per controllo fatturazione.

Nella pagina `Groupage caricato` il pulsante `Bancali manuali` permette di correggere i pallet di una o piu spedizioni selezionate. Il valore resta salvato per shipment/ordine e viene usato subito per ricalcolare attivo, passivo e margine; con `Togli manuale` torna al pallet originale del report V-Tech.

Nella pagina `Groupage pianificato` il pulsante `Genera mail Outlook` apre una nuova bozza Outlook per i ritiri. Accanto al pulsante puoi indicare la data Wave da usare, per esempio `18/5/26`, oppure aprire il calendarietto e selezionare il giorno: il programma prende tutte le spedizioni groupage pianificate con `Wave` che contiene quel giorno/mese, quindi anche valori come `18/05/2026-1` o `18/5/26-2`. La bozza include il totale bancali da ritirare e una tabella con le spedizioni trovate, inclusi cliente, indirizzo consegna e volume m3. Dalla tabella email vengono esclusi i campi economici di fatturazione attiva/passiva. La colonna volume viene usata solo nella mail, non nelle tabelle del programma. La bozza contiene un identificativo tecnico nascosto: quando Outlook mostra quella mail nella posta inviata, il controllo automatico la rileva e sposta le spedizioni coinvolte in `Groupage caricato`.

Il controllo della mail groupage inviata cerca sia l'identificativo nascosto sia l'oggetto della bozza, cosi Outlook puo essere riconosciuto anche quando ripulisce il corpo HTML della mail.

Nella pagina `FTL pianificato` selezioni una o piu spedizioni e premi `Genera mail FTL`: Outlook apre una bozza con il testo di richiesta gestione consegna V-Tech e la tabella delle spedizioni selezionate. Quando ricevi conferma, premi `FTL confermato` per spostarle in `FTL CONFERMATI`. Solo da `FTL CONFERMATI` puoi usare `Consegnata / XML` quando il vettore conferma la consegna.

Nella pagina `FTL CONFERMATI` il pulsante `Data scarico` permette di inserire o modificare manualmente il giorno dello scarico prenotato. Il giorno dello scarico la riga viene evidenziata in verde; se la data e passata senza consegna, viene evidenziata in rosso. Quando sai che il mezzo ha scaricato, selezioni la riga e premi `Consegnata / XML`.

Nelle mail automatiche groupage e FTL la colonna `GDO` non viene inclusa: resta visibile nel gestionale, ma non compare nel testo copiato per Outlook.

I filtri sono sulle intestazioni: clicca sulla freccia `v` della colonna e scegli uno dei valori presenti solo in quella colonna. Se ci sono gia altri filtri attivi, il menu mostra i valori coerenti con quei filtri. Il pulsante `Pulisci filtri` rimuove tutti i filtri attivi.

Nella pagina `Spedizioni` puoi spostare le colonne trascinando l'intestazione nella posizione desiderata. L'ordine viene salvato nel browser e resta uguale al refresh o alla riapertura della dashboard.

Puoi selezionare piu righe tenendo premuto `Ctrl` o `Shift`. Il pulsante `Seleziona tutto` seleziona tutte le righe visibili nella pagina aperta.

Il pulsante `Scegli vettore` permette di assegnare manualmente il vettore alle spedizioni selezionate. Se scegli `BRT`, il programma ricalcola subito il passivo Bartolini e il margine; per i vettori senza tariffa passiva caricata, la spedizione resta in attesa tariffa.

Cliccando sulla cella `Extra BRT` di una spedizione viene mostrato il dettaglio degli extra calcolati.

Il pulsante `Pianificato` porta o riporta le spedizioni selezionate nello stato pianificato. Il pulsante `Da pianificare` porta o riporta le spedizioni selezionate tra quelle ancora da pianificare. Entrambi possono essere usati anche da `Spedizioni consegnate`.

Il pulsante `Consegnata / XML` compare solo nella pagina `FTL CONFERMATI`: segna le spedizioni selezionate come consegnate e crea il file `KN_<Shipment>.xml` direttamente nella cartella `Download` di Windows. Dopo il click la dashboard mostra un popup cliccabile: premendolo apre Esplora file gia posizionato sul file XML creato. Nella pagina `Spedizioni consegnate` trovi anche la colonna `XML consegna` e il percorso nel dettaglio riga. L'XML usa il modello `data/kn_delivery_template.xml`, sostituisce il valore `ReleaseGid/Gid/Xid` con lo shipment selezionato e imposta `GLogDate` al giorno dell'azione nel formato `AAAAMMGG180000`. Se il file non viene scritto fisicamente, l'azione restituisce errore e non passa in silenzio.

Il pulsante `Elimina` cancella definitivamente le spedizioni selezionate dal database locale e le mette in una lista interna di eliminate, cosi non rientrano automaticamente se viene ricaricato lo stesso file.

## Controllo SLA contratto

Il programma controlla le tempistiche contrattuali usando `Integration Date`:

- ordini inseriti entro le `12:30`: preparazione magazzino `48h` lavorative;
- ordini inseriti dopo le `12:30`: preparazione magazzino `72h` lavorative;
- spedizioni `Groupage - BRT LTL`: transit time dalla colonna `Groupage up to 8 pallets` del file tariffe attive;
- spedizioni dirette `KN LTL/FTL` o altri vettori: transit time dalla colonna `Direct` del file tariffe attive.

Le ore di preparazione e transit time non contano sabato e domenica: se il conteggio arriva al weekend, si ferma e riparte da lunedi. In tabella trovi `SLA` e `Min. consegna SLA`. Se la `Late Ship Date` e prima della data minima di ship oppure la `Early Delivery Date` e prima della consegna minima da contratto, la spedizione viene marcata come `SLA non rispettato` e la riga diventa arancione. Nel dettaglio riga trovi il calcolo completo con data inserimento, preparazione, transit time e motivo dell'alert.

## Prenotazione scarico

La colonna `Freight Code` genera la colonna `Prenotazione Scarico`:

- `BKL`: da prenotare.
- `BKV`: gia prenotato da loro.
- vuoto: non necessaria.

## Tariffe

Al momento il programma calcola:

- tariffa attiva dal file Excel Kuehne+Nagel;
- passiva BRT dal PDF Bartolini;
- extra BRT del PDF.

Per la passiva BRT il programma usa il peso tassabile: confronta il peso reale con il peso volumetrico `Volume m3 x 250` e usa sempre il valore piu alto. Poi applica l'arrotondamento del PDF Bartolini: fino a 100 kg arrotonda al kg superiore, oltre 100 kg arrotonda ai 100 kg superiori. Sulle fasce a quintale calcola il costo sul peso arrotondato: per esempio `11 m3 x 250 = 2750 kg`, resta `2750 kg`; se invece il tassabile fosse `1658,685 kg`, diventerebbe `1700 kg`, quindi `17 q.li x tariffa`, piu gli extra.

Extra BRT automatici:

- fuel surcharge minimo 2%;
- traghetti per Sicilia e Sardegna;
- zone franche Livigno e Campione d'Italia, quando riconosciute dall'indirizzo.
- consegna per appuntamento quando `Freight Code` contiene `BKL`.
- consegna supermercati/GDO quando il cliente o l'indirizzo e presente in `data/gdo_customers.csv`; sulla passiva BRT viene applicata anche alle consegne Amazon, perche lato Bartolini vengono trattate come GDO.

Extra BRT configurabili manualmente:

- isole minori;
- dirottamento;
- localita disagiata;
- consegna disagiata;
- consegna supermercati/GDO;
- priority;
- servizio 10:30;
- contrassegno;
- ZTL;
- fuori misura;
- consegna per appuntamento;
- POD image;
- ricerca archivio/documenti;
- O.R.M. commissionato;
- recapito contrassegni;
- gestione bancali a rendere;
- giacenza dossier;
- riconsegna giacenza.

Il file per spuntare gli extra manuali e:

- `data/brt_extra_flags.csv`

Per applicare una voce, scrivi `SI` nella colonna corrispondente. Per `Contrassegno Valore` inserisci il valore da incassare. Per `Bancali Rendere` puoi inserire il numero di bancali.

L'anagrafica clienti GDO e:

- `data/gdo_customers.csv`

Le righe presenti vengono classificate automaticamente come `Cliente GDO = SI` e, se la spedizione passa da BRT, entrano negli extra BRT come consegna supermercati/GDO.

Sull'attiva, i clienti GDO ricevono anche l'extra automatico `GDO delivery and time slot booking`: +20% sulla tariffa standard, come indicato nel foglio `Additional extra charges` del file tariffe attive. Se la spedizione e GDO e BKV, resta solo l'extra GDO perche include gia prenotazione, giorno di scarico e orario fisso.

Extra attivi tracciati automaticamente:

- sponda idraulica groupage: EUR 10 a spedizione su tutte le spedizioni groupage, escluse GDO e Amazon; eccezione automatica per le GDO che in anagrafica hanno `SPONDA`, come `AMBROSINO GIOCATTOLI-AMBROSINO SAS`;
- fixed time slot BKV: +20% sulla tariffa standard, oppure +40% se cliente Amazon; non viene sommato sulle consegne GDO;
- phone preadvise BKL: EUR 5 a delivery, escluse Amazon e GDO;
- ETS Sicilia/Sardegna: +5% sulla tariffa standard;
- Amazon BKL fix day/time slot: +40% sulla tariffa standard;
- GDO delivery and time slot booking: +20% sulla tariffa standard.

Per l'extra attivo urgente usa il pulsante `Urgente attiva`: applica EUR 15 per pallet fatturato e aggiorna attivo e margine.

Se una spedizione diretta/FTL viene trasformata manualmente in `LTL - Groupage BRT`, la passiva viene calcolata come BRT groupage, ma l'attiva resta calcolata come consegna diretta del cliente: non viene aggiunta la sponda attiva groupage solo perche la stiamo gestendo noi in groupage.

Sempre in `Fatturazione` puoi impostare per ogni mese il fuel attivo e il fuel passivo, con percentuali separate. I valori vengono salvati in `data/fuel_settings.json` e ricalcolano tariffe, margini, grafici ed export del mese.

Nella pagina `Fatturazione` puoi scaricare:

- `Scarica fatturazione attiva`: Excel mensile con riepilogo per cliente e dettaglio spedizioni, base attiva, extra attivi e totale attivo;
- `Scarica passivo vettori`: Excel mensile del passivo diviso per vettore.

L'anagrafica tariffari vettori e in `data/carrier_tariffs.csv`. Per ora contiene Grendi con tariffa passiva a pallet per regione e fascia pallet. Quando selezioni `GRENDI` come vettore, il programma calcola automaticamente la passiva usando provincia di consegna, pallet arrotondati per eccesso e fascia tariffaria:

- 1-8 pallet;
- 9-15 pallet.

L'anagrafica generale clienti e in `data/customer_registry.csv`: contiene codice, ship-to, indirizzo, responsabile scarico, mail, telefono e shipping information. Il programma cerca automaticamente cliente e indirizzo della spedizione in questa anagrafica e aggiunge nelle `Note` il blocco `[CONTATTI MAGAZZINO]` con i contatti utili per prenotazione/scarico, senza duplicarlo ai reimport successivi.

Quando saranno disponibili le passive degli altri vettori, si potranno aggiungere nel motore `tariff_engine.py` e il programma compilera anche secondo e terzo vettore piu convenienti.

## Accesso colleghi

Il gestionale ora ha una pagina di login e ruoli:

- `youssef`: accesso completo;
- `backup`: accesso completo operativo, per chi ti sostituisce;
- `fatturazione`: accesso solo alla pagina `Fatturazione`, con export attivo/passivo e gestione fuel mensile.

Al primo avvio il programma crea automaticamente `data/users.json` con password cifrate e `data/accessi_temporanei.txt` con le password iniziali da consegnare ai colleghi.

Per far accedere un collega dallo stesso ufficio/rete, avvia `avvia_vtech_web.bat`: il server parte su `0.0.0.0` e nella finestra mostra anche l'indirizzo da aprire dagli altri PC, per esempio `http://192.168.x.x:8765`. Non esporre questa porta su internet: se serve accesso da fuori ufficio, usa prima una VPN/Tailscale.

## Deploy online Railway/GitHub

Per pubblicarlo online usa i file `Dockerfile`, `requirements.txt`, `Procfile` e `railway.json`. La guida rapida e in `RAILWAY_DEPLOY.md`.

In cloud i file non vengono presi dal PC locale: si caricano dal browser con i pulsanti `Carica report`, `Carica tariffe attive` e `Carica passiva BRT`. Gli export Excel e XML vengono scaricati dal browser. Imposta `VTECH_ADMIN_PASSWORD`, `VTECH_BACKUP_PASSWORD` e `VTECH_BILLING_PASSWORD` su Railway per scegliere le password iniziali.

Outlook non puo essere aperto direttamente da Railway: quando generi una mail, il programma copia negli appunti il testo HTML gia pronto con tabella. Apri Outlook manualmente, crea una nuova mail e fai `Incolla`. Il programma lascia anche un file `.eml` scaricabile come backup. Visto che in cloud non puo leggere la posta inviata, in `Groupage pianificato` c'e il pulsante `Groupage caricato` per spostare manualmente le righe selezionate.
