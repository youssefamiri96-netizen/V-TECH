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

Nella pagina `OTD` (On Time Delivery) carichi il report OTM `Order Status Code & Reason Code` con `Carica report OTM`: il file e' un log di eventi con piu righe per ordine, che il programma riduce a un solo esito per ordine (se ricarichi un file piu recente, gli ordini gia' presenti vengono aggiornati). La regola e' la stessa della dashboard IOD di Haleon: la partenza e' lo `SHIPPED DATE`, la consegna e' il primo evento `Delivered` (status 17), e i giorni di consegna sono i giorni lavorativi tra le due date, **esclusi sabato, domenica e le festivita' italiane** (Capodanno, Epifania, Pasquetta, 25 aprile, 1 maggio, 2 giugno, Ferragosto, 1 novembre, 8 dicembre, Natale, Santo Stefano; la Pasqua e' calcolata ogni anno). Un ordine e' `OK` se i giorni sono entro il lead time, `NO` se oltre (il ritardo e' la differenza); le **prenotate sono OK in automatico, ma solo quando risultano consegnate**: finche' non c'e' la consegna restano `SENZA ESITO` e non entrano nel conteggio; gli ordini senza consegna sono `SENZA ESITO` (evidenziati se non prenotati e partiti da oltre 10 giorni lavorativi). `% OTD = OK / (OK + NO)`: senza esito, rese, smarrite, giacenze e annullate restano fuori. Il mese e' quello della partenza. Il report V-Tech non ha la colonna `SHIPPED DATE`: la partenza e' l'evento `Departed KN warehouse` (609), o in mancanza la data di inserimento; gli ordini senza nessun evento restano `SENZA ESITO`. Le regole dipendono dal freight code del gestionale (agganciato per numero ordine): le spedizioni **BKL** ("Da prenotare", cioe' quasi tutte) sono prenotate e quindi OK in automatico appena risultano consegnate; le **BKV** ("Gia prenotato da loro") e le **DKV** ("Data tassativa") sono tassative e devono rispettare la data di scarico, cioe' la `Data Consegna Tassativa` se inserita nel gestionale, altrimenti la `Early Delivery Date` del report WMS: consegna entro quella data = OK (anche in anticipo), dopo = NO, con ritardo in giorni lavorativi dalla data. Per le tassative lo stato di prenotazione non conta (a meno che le segni prenotate a mano); se una tassativa non ha nessuna data si usa il lead time. Per le altre (DKL, standard o senza codice) vale il lead time contrattuale. Una spedizione e' considerata prenotata se ha lo stato OTM `Delivery Appointment Scheduled` (2520), se il gestionale ha una data di scarico prenotata per quell'ordine, se il destinatario e' nell'elenco `Destinatari sempre prenotati`, oppure se la segni a mano.

I lead time sono quelli **contrattuali** della rate card (`seed/otd_contract_lead_times.csv`, 109 province, gia' caricati all'avvio): per ogni provincia c'e' un lead time **Groupage** (fino a 8 pallet: 48/72/96 ore, cioe' 2/3/4 giorni lavorativi) e uno **Diretto** (9 pallet o piu': 24/48/72 ore, cioe' 1/2/3 giorni). Il servizio di ogni ordine si legge dal gestionale agganciando il numero ordine (`Groupage - BRT LTL` = groupage, tutto il resto = diretto); se l'ordine non e' nel gestionale, BRT e Macsped sono trattati come groupage e gli altri vettori come diretto. Da `Lead time e prenotate` puoi aggiornare la rate card caricando il nuovo Excel e aggiungere eccezioni manuali (per vettore e provincia, per solo vettore, oppure da Excel/CSV con colonne `Vettore`, `Provincia` facoltativa e `Lead time`), che hanno la precedenza sul contratto. Se per un ordine non c'e' ne' eccezione ne' contratto, si usa il lead time scritto nel file OTM. **L'esito si puo' forzare a mano**: selezioni uno o piu ordini e usi `Forza esito` (OK, NO, RESA, SMARRITA, GIACENZA, ANNULLATA, SENZA ESITO) con una nota facoltativa, `Segna prenotata` / `Togli prenotata`, oppure `Ripristina automatico`. Gli esiti forzati sono marcati con la matita e non vengono mai toccati dai nuovi import. Gli ordini con vettore **KN** sono VAS e sono esclusi del tutto dall'OTD (KPI, tabelle ed export); l'elenco dei vettori esclusi e' `EXCLUDED_CARRIERS` in `vtech_otd.py` e la pagina mostra quanti ordini sono stati esclusi. `Esporta Excel` crea in `Download` un file con riepilogo per mese e vettore, dettaglio ordini, elenco ritardi (NO), **tutti gli ordini senza esito** (ordinati dal piu' vecchio, con i giorni lavorativi dalla partenza) e, a parte, quelli senza esito da oltre 10 giorni, rispettando i filtri di mese e vettore attivi.

Nella pagina `Fatturazione` puoi filtrare per mese e vedere KPI, grafico storico e dettaglio clienti del mese. I valori si aggiornano con i dati presenti nello storico locale: attivo, passivo e GP vengono ricalcolati dai costi disponibili sulle spedizioni. La sezione mostra anche la composizione percentuale del passivo tra trasporto effettivo, extra e voci non classificate, piu il dettaglio degli extra per categoria.

Sempre in `Fatturazione`, il pulsante `Scarica passivo vettori` crea in `Download` un file Excel del mese selezionato con riepilogo per vettore e un foglio separato per ogni vettore. Ogni foglio contiene il dettaglio spedizioni, prezzo passivo, extra e totale, cosi puoi inviarlo a fine mese ai vettori per controllo fatturazione. Per Macsped il file separa sempre `MACSPED Groupage` (spedizioni `Groupage - BRT LTL`, prezzo calcolato dal tariffario Macsped) da `MACSPED FTL` (le dirette, a tariffa spot concordata e inserita a mano con `Costo Passivo Manuale`): sono due righe distinte nel riepilogo e due fogli distinti, cosi i prezzi da tariffario e quelli spot non finiscono mischiati nello stesso totale.

Nella pagina `Groupage caricato` il pulsante `Bancali manuali` permette di correggere i pallet di una o piu spedizioni selezionate. Il valore resta salvato per shipment/ordine e viene usato subito per ricalcolare attivo, passivo e margine; con `Togli manuale` torna al pallet originale del report V-Tech.

Il pulsante `Carica bancali magazzino`, in alto accanto a `Carica report`, importa in automatico gli stessi bancali manuali da un file Excel: quello che il magazzino compila con i pallet realmente caricati per spedizione (colonne `Order` e `Bancali` sulla riga 2, come il file `Monitoraggio prenotazioni carichi`). Per ogni `Order` riconosciuto, il programma trova la spedizione corrispondente tramite quell'ordine e vi applica `Bancali` come pallet manuale, ricalcolando subito attivo/passivo/margine; se il valore e' gia' quello corretto non tocca nulla. Quando uno shipment raggruppa piu' ordini (spedizione consolidata), il pallet manuale viene applicato come somma dei bancali di tutti gli ordini di quello shipment, ma solo se il file ne riporta TUTTI gli ordini: se ne manca anche solo uno, lo shipment non viene toccato e finisce tra gli "incompleti", proprio per non rischiare di sovrascrivere il totale corretto con il pallet di un solo ordine (sballando l'attiva). Alla fine il riepilogo mostra quante spedizioni sono state aggiornate, quante erano gia' corrette, quanti ordini non sono stati trovati tra le spedizioni, quanti ordini risultano ambigui (stesso ordine su piu' spedizioni diverse) e quante spedizioni multi-ordine sono incomplete: questi ultimi tre casi vanno sempre controllati a mano. Le righe del file senza `Order` o senza un valore `Bancali` valido vengono saltate.

Il pulsante `Controlla bancali multi-ordine`, accanto al precedente, crea in `Download` un Excel con tutte le spedizioni multi-ordine che hanno un bancali manuale impostato, confrontando il valore attuale con il totale originale del report (prima di qualunque override manuale): le righe dove il manuale e' piu' basso dell'originale sono evidenziate e marcate "Da controllare", perche' e' il sintomo tipico di un bancali applicato su un solo ordine invece che sommato su tutti gli ordini dello shipment (il bug descritto sopra, corretto per i nuovi import ma non per quelli gia' fatti in passato). Non corregge nulla da solo: serve a restringere il controllo a poche spedizioni sospette invece di ripassarle tutte a mano. Dopo averlo usato, il modo piu' veloce per sistemare le spedizioni segnalate e' ricaricare di nuovo (o una versione aggiornata) il file del magazzino con `Carica bancali magazzino`: se ora riporta tutti gli ordini di quello shipment, il bancali viene ricalcolato correttamente da solo.

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

Ogni riga ha la colonna `Tipo Cliente`: `GDO` (supermercati, catene, anche Prenatal Retail Group) oppure `GROSSISTA` (VTIT-WHOLESALERS, giocherie, GIPI, ecc., quelli che il cliente indica come `NO GDO`). Le righe `GDO` vengono classificate automaticamente come `Cliente GDO = SI` e, se la spedizione passa da BRT, entrano negli extra BRT come consegna supermercati/GDO.

**Grossisti (dal 01/10/2026).** Per le spedizioni con competenza da ottobre 2026 i clienti `GROSSISTA` non sono piu' GDO: niente extra attivo `GDO delivery and time slot booking` +20%, niente extra passivo BRT `Consegna supermercati/GDO` e Macsped `GDO consegna D60`, niente sponda idraulica (attiva e passiva Macsped), salvo i grossisti con `SPONDA` nelle note di anagrafica (es. Ambrosino). Restano tutti gli altri extra gia' calcolati: preavviso telefonico sulle BKL, fixed time slot +20% sulle BKV, ETS, fuel, consegna tassativa Macsped, ecc. I mesi precedenti (fino a settembre 2026) restano calcolati come fatturato, cioe' con i grossisti trattati come GDO: la data di passaggio e' `WHOLESALER_RULE_START` in `tariff_engine.py` e la competenza e' la stessa usata dalla pagina `Fatturazione`. Al primo avvio il file `gdo_customers.csv` gia' presente sul server viene aggiornato con la colonna `Tipo Cliente` (le righe aggiunte a mano restano come GDO) e l'originale e' salvato in `gdo_customers_prima_grossisti.csv`.

**Riconoscimento GDO / grossista (dal 01/10/2026).** Il report V-Tech non ha codice cliente ne' ship-to: ha solo il nome (troncato a 30 caratteri) e l'indirizzo `, CITTA, PROV, CAP, ITA`. Da ottobre il cliente si riconosce in automatico, in quest'ordine: (1) nome uguale a uno dell'anagrafica a meno di virgole, punti, forma societaria (SRL, SPA, SNC, SAS...) e troncamento a 30 caratteri; (2) nome simile (parole in piu' come SOC.COOP., piccoli errori) confermato dallo stesso CAP; (3) solo indirizzo (CAP + via), per le consegne presso un magazzino con un altro nome; (4) catena GDO riconosciuta dal solo nome anche se non e' nel file del cliente (Conad, Pac 2000, Esselunga, Carrefour, Auchan, Lidl, Eurospin, Unieuro, MediaWorld/MediaMarkt, Despar/Aspiag, Iperal, Finiper, Bennet, Selex, Tigros, Leroy Merlin, Coop Alleanza/Lombardia/Liguria/Italia, Nova Coop, Unicoop, Ipercoop, Toys Center, Prenatal, Decathlon, Bricoman, supermercati e ipermercati): l'elenco e' `GDO_CHAIN_WORDS` in `tariff_engine.py`. Sui mesi precedenti resta il riconoscimento di prima (nome o indirizzo esatti).

**File tariffe attive.** Il caricamento di `Carica tariffe attive` accetta sia il file originale Kuehne+Nagel sia il file `SELL RATE` degli accordi (stessi prezzi, intestazioni rinominate: `Small truck max 15 pallet`, `FTL >=16 pallet`, `Groupage max 8 pallets`, `Direct >= 9 pallet`, senza `Zip code 2-digit`): le colonne si riconoscono per nome normalizzato e la riga di intestazione si cerca da sola. Se manca una colonna obbligatoria il file viene rifiutato con un messaggio che elenca le intestazioni trovate e la rate card in uso resta quella di prima. Anche il lettore dei lead time OTD accetta entrambi i file. L'export `Scarica fatturazione attiva` elenca nel foglio `Senza attivo` le spedizioni del mese che non hanno un prezzo (provincia senza tariffa nel contratto, come Fermo, o pallet non validi) e quindi non finiscono in fattura.

**Regole di prezzo dell'attivo dal 01/10/2026.** Il fuel non si applica piu' all'attivo (resta sul passivo; il campo `Fuel attivo %` di Fatturazione e' disattivato dai mesi da ottobre). Oltre 33 pallet non si fattura piu' un solo camion: un FTL per ogni 33 pallet pieni e il resto prezzato in base ai suoi pallet (es. 40 pallet = 1 FTL + 7 pallet, 66 pallet = 2 FTL). I mesi precedenti restano calcolati come fatturato (fuel del mese, un solo FTL). Amazon con codici misti (BKL | BKV) paga un solo +40%, non +80%: questa e' una correzione valida per tutti i mesi e l'export delle note di credito storna la differenza sui mesi gia' fatturati (colonna `Storno Amazon`).

**Riconoscimento clienti: prestazioni e rollback.** Il riconoscimento dei clienti viene ricordato in memoria finche' il file `gdo_customers.csv` non cambia, quindi i ricaricamenti dell'elenco spedizioni non lo rifanno da zero. Il file clienti e il codice vanno tenuti allineati: se si torna a una versione precedente del programma bisogna ripristinare anche il vecchio `gdo_customers.csv` (copia in `gdo_customers_prima_grossisti.csv`), altrimenti i grossisti non vengono piu' trattati come GDO nei mesi gia' fatturati. La DKV si riconosce dal solo `Freight Code` (o dal freight impostato a mano), non dai testi liberi di note e wave.

**Codici freight e relativi extra attivi.** `BKL` = da prenotare (lo scarico va prenotato con il destinatario): extra preavviso telefonico 5 EUR **per consegna** (contratto: 5 EUR/delivery), cioe' 5 EUR per ogni ordine dello shipment (3 ordini = 15 EUR), piu' l'indice ISTAT come gli altri extra (Amazon: +40% fix day). `BKV` = gia' prenotato da loro (slot fisso): fixed time slot +20% (Amazon +40%). `DKL` = standard, nessun extra. `DKV` = data di consegna tassativa: dal 01/10/2026 fixed time slot +20% (Amazon +40%) come la BKV, una volta sola se la spedizione ha anche BKV. Le GDO non pagano nessuno dei due perche' l'extra GDO +20% li comprende.

Il pulsante `Note di credito` in `Fatturazione` crea in `Download` l'Excel del **pareggio dei mesi fino a settembre** in base al file clienti aggiornato (distinzione GDO / grossista). Ogni spedizione con attivo viene ricalcolata con le regole di oggi, usando solo i clienti del file (riconosciuti anche con il nome scritto in modo diverso o troncato dal report; le catene riconosciute dal solo nome non entrano nei mesi passati) e **senza fuel**, e confrontata con quanto era stato fatturato. Tipi di riga: `Preavviso per delivery` (shipment con piu' ordini fatturato con un solo preavviso: la differenza e' da addebitare), `Storno grossista` (extra GDO +20% o sponda addebitati a un grossista), `GDO da addebitare` (GDO del file fatturata come cliente normale: l'extra GDO +20% prende il posto di sponda, preavviso e simili), `Amazon extra doppio` (BKL | BKV fatturata con il +40% due volte) e `DKV non addebitata` (ordine marcato DKV senza l'extra). Restano gli altri extra dovuti ai grossisti: preavviso BKL, fixed time slot BKV, ETS; il camion e' quello dei mesi fatturati. Le righe senza differenza (es. BKV, dove il +20% GDO e' sostituito dal +20% fixed time slot) non compaiono. La nota di credito di ogni mese e' la somma di tutte le righe: se e' negativa, e' un importo da addebitare. Due fogli: una riga per mese (storno grossisti e, solo se ci sono righe di quel tipo, GDO da addebitare, storno Amazon, DKV da addebitare, poi la nota di credito netta) e il dettaglio spedizione per spedizione. Nel report del magazzino la DKV non arriva: esiste nel tool solo per gli ordini marcati a mano con il pulsante DKL / DKV; l'extra DKV (+20%, Amazon +40%) corrisponde al `Fixed time slot` del contratto (confermato) e le percentuali sono in `ActiveExtraSettings.dkv_percent` / `amazon_dkv_percent` in `tariff_engine.py`. Il ricalcolo usa le tariffe attive e l'indice ISTAT attualmente configurati.

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
- 9 pallet e oltre (nessun limite massimo: la tariffa della fascia 9-15 vale anche per spedizioni piu' grandi, finche' non arriva una tariffa dedicata per fasce piu' alte).

Il pulsante `Carica tariffe vettori (CSV)`, accanto agli altri upload, sostituisce `data/carrier_tariffs.csv` con un file nuovo: usalo quando cambia una tariffa Grendi (o si aggiunge un altro vettore a pallet) senza dover aspettare un deploy. Il CSV deve avere le colonne `Carrier, Region, Pallets From, Pallets To, Rate Per Pallet, Currency, Active`; per una fascia senza limite massimo, metti un numero molto alto in `Pallets To` (es. `999999`).

Per il groupage LTL e disponibile anche il vettore `MACSPED`, tariffario in `data/macsped_tariffs.csv`: passiva a quintale (100 kg) per regione e fascia di peso (fino a 100 kg, 100,1/500, 500,1/2.000, oltre 2.000), con minimo tassabile 100 kg. Per le spedizioni con `Tipo Servizio` = `Groupage - BRT LTL` il programma confronta automaticamente BRT e Macsped e sceglie il passivo piu economico, compilando anche `Miglior Vettore`/`Secondo Vettore`. Macsped copre solo le regioni presenti nel tariffario; dove non e presente resta valido solo BRT. Le tariffe dirette di Macsped (FTL) sono a prezzo dedicato e non sono gestite dal programma: se assegni manualmente `MACSPED` a una spedizione diretta, la spedizione resta in attesa tariffa, esattamente come per un vettore senza passiva caricata.

Extra automatici sul passivo Macsped (nessuna spunta richiesta): fuel surcharge (stessa percentuale mensile impostata in `Fatturazione` per il passivo), ETS 5% sulle sole spedizioni Sicilia, consegne Amazon +35,00€/spedizione, consegne supermercati/GDO (quando non Amazon) +15,00€/spedizione. ZTL per Macsped e invece compreso in tariffa, quindi non genera nessun extra (a differenza di BRT).

Altri due extra sono automatici perche' riusano una condizione gia' tracciata altrove nel programma, con il prezzo Macsped al posto di quello BRT:

- `Sponda idraulica` (20,00 €/spedizione): stessa regola della sponda attiva BRT groupage, quindi si applica a tutte le spedizioni groupage tranne Amazon, ed esclusi i clienti GDO a meno che non abbiano `SPONDA` nelle note di `data/gdo_customers.csv` (`Attiva Sponda` = SI);
- `Consegna tassativa` (+50% del nolo, minimo 30,00 €): scatta da sola quando la spedizione e' gia' marcata DKV (`Data Consegna Tassativa` valorizzata, dal flusso "Scegli DKL o DKV" che usi gia' per l'SLA), esclusa se la spedizione e' GDO; resta anche una spunta manuale in `data/brt_extra_flags.csv` per i casi senza DKV.

Gli altri extra Macsped si attivano spuntando `SI` nelle colonne dedicate di `data/brt_extra_flags.csv` (lo stesso file degli extra BRT, con le colonne aggiuntive elencate sotto: viene aggiornato in automatico al prossimo import se mancano):

- `Facchinaggio`: 6,00 €/q.le;
- `Consegna Ai Piani`: 10,00 €/q.le;
- `Localita Disagiata` (stessa colonna di BRT): 5,00 €/q.le;
- `Fuori Misura` (stessa colonna di BRT, merce lunga): +200% del nolo;
- `Mancato Ritiro`: 10,00 €/q.le;
- `Preavviso Telefonico`: 2,00 €/spedizione;
- `Porto Assegnato`: 2,00 €/q.le, minimo 2,00 €;
- `Contrassegno Valore` (stessa colonna di BRT, importo da incassare): 2% con minimo 6,00 € e massimo 100,00 €;
- `Giacenza Dossier` (stessa colonna di BRT): 7,00 € fisso;
- `Riconsegna Giacenza` (stessa colonna di BRT): 70% del nolo;
- `Reso Al Mittente`: 100% del nolo.

Non sono stati implementati, perche' il tariffario Macsped non indica un importo fisso o perche' sono condizioni contrattuali non legate alla singola spedizione: isole minori (al costo), prenotazione su portale (al costo), rivalutazione ISTAT annuale, attese carico/scarico e sosta oltre franchigia (nessun campo con le ore effettive), sosta e custodia giornaliera oltre i 5 giorni di franchigia (nessun campo con i giorni), gestione EPAL (non prevista da Macsped), termini di pagamento e validita tariffa.

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
