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
