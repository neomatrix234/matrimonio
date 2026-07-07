# Fotomosaico online - progetto da caricare su GitHub

Carica su GitHub il CONTENUTO di questa cartella `CARICA_SU_GITHUB`.

GitHub deve avere in radice:
- app/
- package.json
- next.config.mjs
- tsconfig.json
- .env.local.example
- VARIABILI_VERCEL_DA_INSERIRE.txt

Poi collega il repository a Vercel.

## Variabili Vercel

Inserisci le variabili presenti in:
VARIABILI_VERCEL_DA_INSERIRE.txt

## Pagine

- `/` pagina iniziale
- `/upload` caricamento invitati
- `/admin` admin online: scegli 600/800/1000/1200/1500 e carichi foto finale
- `/screen` schermo mosaico online da proiettare

## Importante

La foto finale si carica da:
`/admin`

Non viene mostrata durante la costruzione. Appare solo quando il mosaico è completo.


## Upload multiplo

La pagina `/upload` permette di selezionare anche più foto insieme. Le foto vengono ridotte e caricate una alla volta in automatico.


## Aggiornamento UI caricamento

La pagina `/upload` ora è a pieno schermo, senza scroll verticale, con titolo centrato "Partecipa al mosaico", spinner durante il caricamento e sfondo modificabile da `/admin`.

Da `/admin` puoi caricare:
- foto finale del mosaico;
- immagine di sfondo della pagina caricamento invitati.


## Aggiornamento gestione immagini speciali

- Le foto degli invitati sono le uniche ridotte e hanno prefisso `foto_mosaico_`.
- La foto finale da riprodurre viene salvata con nome fisso `__TARGET_MOSAICO.jpg` e resta in dimensione originale.
- Lo sfondo home/caricamento viene salvato con nome fisso `__UPLOAD_BACKGROUND.jpg` e resta in dimensione originale.
- Il reset mosaico cancella solo le foto degli invitati.
- Da `/admin` puoi vedere cosa è caricato, dimensione dei file speciali e cancellare separatamente foto finale e sfondo.
- Lo sfondo viene usato sia in `/` sia in `/upload`.


## Schermo finale pulito

Su `/screen`, quando parte il replay finale e la pagina è a schermo intero, vengono nascosti contatori e pulsanti. Restano solo il mosaico/foto finale e la frase di ringraziamento.


## Aggiornamento UI admin e caricamento invitati

- Lo spinner è ora anche nella pagina Admin.
- I messaggi di conferma Admin appaiono al centro pagina, senza dover scorrere.
- La pagina `/upload` parte direttamente da "Partecipa al mosaico".
- Rimosso il titolo "Fotomosaico degli sposi" dalla pagina di caricamento.
- Il pulsante file degli invitati ora si chiama "Carica foto".
- Dopo l'invio, l'invitato vede subito quante foto sono state caricate e quante ne mancano.
- Il box della pagina caricamento è semi trasparente e lascia vedere lo sfondo.
- Non serve modificare Google Apps Script rispetto alla versione precedente `ADMIN_COMPLETO_ORIGINALI`.


## Aggiornamento Admin/password/upload test

Questa versione richiede aggiornamento di `GOOGLE_APPS_SCRIPT/Code.gs`.

Novità:
- `/upload` invitati permette una sola foto per volta.
- `/test-upload` è riservata Admin e permette upload multiplo per prove grandi.
- `/admin` richiede password, default `admin123`.
- Da `/admin` puoi cambiare password.
- Da `/admin` puoi regolare trasparenza del box home/upload.
- Da `/admin` vedi anteprima dello sfondo e della foto finale già caricati.
- Menu hamburger con link Admin, upload, test e schermo.


## Aggiornamento finale UI

Questa versione richiede aggiornamento di `GOOGLE_APPS_SCRIPT/Code.gs`.

Novità:
- La home `/` mostra subito il box per caricare la foto, senza pagina intermedia.
- `/upload` e `/` sono equivalenti per l’invitato.
- Upload invitato: una sola foto per volta.
- Il box è quasi trasparente di default.
- Da Admin regoli in tempo reale trasparenza box e oscuramento dello sfondo, senza popup di conferma.
- La password default non viene più mostrata nella pagina login Admin.
- Su `/screen`, anche in schermo intero, ci sono pulsanti per uscire da schermo intero, interrompere e ripartire.


## Aggiornamento sicurezza Admin e schermo

- L'accesso Admin viene dimenticato quando cambi pagina o chiudi/ricarichi la pagina.
- Se un utente tocca il telefono/PC dopo che sei uscito da Admin, dovrà reinserire la password.
- In `/screen`, fuori dallo schermo intero, i pulsanti sono tutti in basso insieme e non si sovrappongono.
- In schermo intero non si vede nessun indicatore, menu o pulsante.
- Fuori dallo schermo intero si vede il menu hamburger per muoversi tra le sezioni.


## Aggiornamento mobile e navigazione pubblica

- Nelle pagine pubbliche `/` e `/upload` non compare più il menu hamburger: l’utente vede solo il caricamento foto.
- L’area Admin si apre solo digitando `/admin`.
- Dentro `/admin` ci sono i link di navigazione ordinati e contenuti nella pagina.
- La pagina Admin è più sicura su cellulare: testi, pulsanti e anteprime restano dentro lo schermo senza uscire orizzontalmente.
- Lo schermo `/screen` non mostra hamburger; in fullscreen resta completamente pulito.
- Se serve Admin da cellulare, si entra direttamente da `/admin` con password.


## Aggiornamento comportamento finale

- Dopo il ringraziamento dell’utente, dopo 5 secondi la pagina torna automaticamente allo stato iniziale per caricare un’altra foto.
- Nel login Admin, premendo Invio sulla tastiera parte l’accesso come se si cliccasse il pulsante.
- Nell’upload multiplo test, puoi interrompere con ESC oppure con il pulsante Interrompi.
- Se carichi più foto dell’obiettivo impostato, le foto vengono salvate comunque; il mosaico usa solo quelle necessarie in base a 600/800/1000/1200/1500.
- Il mosaico ora applica una tinta colore alle tessere, così l’immagine finale si legge meglio.
- Durante e dopo la costruzione puoi cliccare una tessera per vedere la foto originale e la versione modificata per il mosaico, senza interrompere il caricamento.
- Il messaggio “Accesso effettuato” in Admin sparisce da solo dopo circa 1,5 secondi.


## Upload ancora più semplice e mosaico automatico

- Nella pagina iniziale l’invitato vede solo `Carica foto`.
- Dopo aver scelto la foto, compare `Invia foto`.
- Non ci sono altre scelte o impostazioni per l’utente.
- Dopo il ringraziamento, dopo 5 secondi torna automaticamente allo stato iniziale.
- Il mosaico usa automaticamente un adattamento colore più forte: selezione per colore, filtro luminosità/contrasto e tinta intensa della cella. Non devi regolare nulla.


## Fix build Vercel

Corretto errore TypeScript in `/app/screen/page.tsx`: variabile `selectedTile` dichiarata correttamente.


## Fix build Vercel 2

Corretto secondo errore TypeScript in `/app/screen/page.tsx`: nel popup tessera ora usa `selectedTile.color` invece di `t.color`.


## Splash screen matrimonio

- Aggiunto splash screen animato di 5 secondi prima della pagina di caricamento.
- Usa la seconda immagine generata: `public/splash-wedding.png`.
- Testi iniziali:
  - Ester & Elia
  - Oggi sposi
  - 22/08/2026
- Da `/admin` puoi modificare le tre righe dello splash.


## Sfondo smartphone e splash

- Lo splash screen è forzato all’apertura per 5 secondi prima del box di caricamento.
- Il box “Carica foto” ha trasparenza quasi minima di default.
- Da Admin puoi impostare come lo sfondo home/upload si presenta su smartphone:
  - Contieni
  - Riempi
  - Manuale
  - posizione X/Y
  - scala manuale
- Da Admin vedi un’anteprima verticale tipo smartphone.


## Nuovo splash con pulsante

- Lo splash usa direttamente l'immagine completa allegata.
- L'animazione ricostruisce l'immagine a livelli da pagina bianca luminosa fino al colore reale.
- Al termine compare il pulsante 3D lampeggiante `Oggi sposi`.
- Solo premendo `Oggi sposi` si apre il box di caricamento con fade-in.
- Il box `Carica foto` resta quasi trasparente di default.


## Correzione splash/pulsante/box

- Alla fine dell’animazione l’immagine viene ricreata intera e identica.
- Il click è posizionato esattamente sulla scritta originale `Oggi sposi`.
- Non viene aggiunta una scritta più grande sopra l’immagine.
- Il box caricamento entra lentamente dal centro con fade-in.
- Il box è quasi trasparente, così si vedono ancora le scritte e l’immagine sotto.
- Pulsanti e testi del box sono in stile oro/avorio.


## Rifinitura finale splash

- Ora parte prima il bianco luminoso.
- Poi compaiono poco alla volta le parti scomposte.
- Alla fine c’è un flash bianco lento e poi resta l’immagine completa.
- Il pulsante `Oggi sposi` è stato abbassato leggermente e reso un po’ più alto, così la scritta resta tutta dentro.


## Raffinazione finale splash completa

- Prima compare la luce bianca.
- Poi compaiono i pezzi dell’immagine.
- Poi arriva il flash finale.
- Solo dopo il flash compare l’immagine completa intera.
- I segni delle giunzioni sfumano grazie a un overlay finale pulito.
- Il pulsante `Oggi sposi` è più alto dentro e un po’ più in basso.
- Il box è quasi trasparente e l’immagine sotto fa un leggero effetto gonfia/sgonfia.


## Splash corretto

- Prima compare la luce bianca.
- Poi compaiono solo i ritagli uno a uno, senza immagine intera sotto.
- Dopo l’ultimo ritaglio arriva il flash bianco a tutto schermo.
- Solo dopo il flash appare in fade-in l’immagine completa.
- I segni delle giunzioni sfumano via sotto l’immagine finale.
- Il pulsante Oggi sposi compare di nuovo ed è più alto per contenere bene la scritta.


## Respiro sfondo più fluido

- Corretto l’effetto gonfia/sgonfia sotto il box.
- Ora il movimento è più piccolo, uniforme e continuo.
- Niente scatti: il respiro va in andata e ritorno in modo morbido.


## Respiro con più fotogrammi

- Il gonfia/sgonfia usa più passaggi intermedi.
- La crescita e il ritorno sono più uniformi.
- Il movimento è più piccolo e continuo, senza salto tra due stati fermi.


## Motore fotomosaico migliorato

- Migliorata la costruzione del mosaico nella pagina `/screen`.
- Ogni foto viene analizzata per colore medio, luminosità e saturazione.
- La foto viene assegnata alla cella più adatta della foto finale con distanza colore pesata.
- Ogni tessera viene realmente rielaborata con Canvas:
  - ritaglio quadrato centrato;
  - adattamento alla luminosità della cella finale;
  - colorazione verso il colore target;
  - conservazione di luci/ombre della foto originale;
  - micro-contrasto;
  - velo soft-light finale.
- Nel popup tessera si vede la foto originale e la versione realmente modificata per il mosaico.
- Non richiede Python o librerie esterne: funziona direttamente su Vercel/browser.


## Tessere mosaico aumentate

- Aggiunti obiettivi più alti:
  - 2000 tessere
  - 2500 tessere
  - 3000 tessere
- Con più tessere il fotomosaico è meno “a pixel grandi” e la foto finale si legge meglio.
- Griglie usate:
  - 600 = 30×20
  - 800 = 40×20
  - 1000 = 40×25
  - 1200 = 40×30
  - 1500 = 50×30
  - 2000 = 50×40
  - 2500 = 50×50
  - 3000 = 60×50
- Per l’evento reale è consigliato usare 2000 o 3000 se ci sono abbastanza foto.


## Splash uguale su smartphone e PC

- Su PC lo splash viene mostrato in formato verticale 9:16, centrato come uno smartphone.
- Le animazioni dei ritagli usano lo stesso rettangolo verticale anche su desktop.
- Il pulsante `Oggi sposi` segue la stessa posizione della versione smartphone.
- Quando si apre il box, lo sfondo resta nello stesso formato verticale anche su PC.


## Wall mosaic LAB migliorato

- La pagina `/screen` usa ora un motore stile photomosaic più adatto al wall mosaic.
- Non usa Python esterno, così resta compatibile con GitHub/Vercel.
- Migliorie principali:
  - conversione RGB → LAB;
  - distanza colore percettiva;
  - luminosità e saturazione nella scelta della tessera;
  - priorità alle celle più importanti della foto finale;
  - ripetizione controllata delle foto se ci sono meno foto delle tessere;
  - rielaborazione reale di ogni tessera con Canvas;
  - trasferimento colore mantenendo luci/ombre della foto originale.
- È una soluzione web equivalente nello scopo ai progetti Python/OpenCV, ma senza server dedicato.


## Fix LAB fast start

- Corretto il problema del mosaico fermo a 0%.
- Il motore LAB non aspetta più di analizzare tutte le foto prima di disegnare.
- Ora ogni foto viene analizzata e inserita subito nel mosaico.
- Se le tessere sono più delle foto, le foto vengono riutilizzate in modo controllato fino al completamento.
- Ridotto il rischio di blocco con 2000/3000 tessere.


## Aggressive recolor + replay fast + splash PC fix

- Ricolorazione delle tessere molto più aggressiva:
  - target color dominante;
  - conservazione ridotta della foto originale;
  - blend multiply/screen più forte;
  - migliore lettura dell’immagine finale anche con 600/1500/3000 tessere.
- Testo finale aggiornato:
  - “Grazie per aver contribuito a questo ricordo.”
- Replay finale rapido:
  - non ricalcola lentamente il mosaico;
  - riusa le tessere già generate;
  - caricamento a blocchi rapidi.
- Splash su PC corretto:
  - una sola area verticale 9:16 centrata;
  - niente doppia schermata a sinistra + centro.
