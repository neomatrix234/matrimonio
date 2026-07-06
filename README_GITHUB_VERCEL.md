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
