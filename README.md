# StreamWise per Android

Questa è la riscrittura nativa Android della PWA presente in `dueffe-streamwise`. L'interfaccia usa Jetpack Compose e Material 3, senza WebView, React o browser incorporati.

## Creare l’APK sul Mac

1. Crea una API Key personale gratuita sul sito TMDB.
2. Inseriscila in `local.properties` con la riga `tmdb.api.key=LA_TUA_CHIAVE`.
3. Fai doppio clic su `build-apk.command` oppure avvialo dal Terminale.
4. Troverai l’APK firmato nella cartella `dist`, già configurato con la chiave. Al termine, lo script crea automaticamente anche una release in `carellice/android-app-releases` e vi allega l’APK.

Senza argomenti lo script incrementa automaticamente la patch, per esempio da `1.0.0` a `1.0.1`. Per scegliere una versione precisa:

```sh
./build-apk.command 1.2.0
```

Ogni build incrementa anche il codice interno richiesto da Android per accettare un aggiornamento. La cartella `signing` e il file `.streamwise-signing.properties` contengono l’identità di firma: conservali e includili nei backup. Se vengono persi, Android non consentirà di installare un aggiornamento sopra la versione già installata.

La pubblicazione richiede GitHub CLI (`gh`) con un’autenticazione valida e accesso in scrittura alla repository. Ogni release usa un tag nel formato `streamwise-v1.2.3`; se il tag esiste già, l’APK allegato viene sostituito. Dopo la pubblicazione, lo script elimina definitivamente le release precedenti il cui tag inizia con `streamwise-v`, insieme ai relativi tag Git, mantenendo solo quella appena creata; le release delle altre app nella stessa repository non vengono toccate. Per conservarle imposta `STREAMWISE_DELETE_OLD_RELEASES=0`. Per usare un’altra repository puoi impostare la variabile `GITHUB_RELEASE_REPO` nel formato `proprietario/repository`.

Se avviato da Terminale di macOS, al termine lo script chiude automaticamente la propria finestra. Per mantenerla aperta durante una sessione puoi usare `STREAMWISE_CLOSE_TERMINAL=0 ./build-apk.command`.

## Installare sul telefono

Puoi trasferire l’APK dalla cartella `dist` al telefono e aprirlo. Android potrebbe chiederti di consentire l’installazione da quella sorgente. Per aggiornare l’app, crea una nuova versione e apri il nuovo APK: libreria e progressi rimangono salvati.

Con il debug USB attivo puoi anche usare il comando mostrato dallo script al termine della build.

## Avviare sul simulatore Pixel

Fai doppio clic su `avvia-simulatore.command`. Lo script avvia automaticamente il simulatore `Pixel_10_Pro` se necessario, attende il caricamento di Android, compila l'app, la installa e la apre.

Per usare in futuro un simulatore con un nome diverso:

```sh
STREAMWISE_AVD="Nome_del_simulatore" ./avvia-simulatore.command
```

## Funzioni incluse

- Interfaccia Material 3 scura e cinematografica, animazioni Compose e navigazione ottimizzata per l'uso con una mano.

- Home con “Da continuare”, “La mia lista”, “Già visti” e titoli nascosti.
- Pagina autonoma “Guida TV” nella barra di navigazione: film e serie dei principali canali nazionali del digitale terrestre, calendario, giorno precedente/successivo, filtri per tipo e canale, “In onda ora”, dettagli delle trasmissioni e ricerca della scheda StreamWise. Palinsesti pubblici EPGShare01 con cache di 30 minuti; i giorni consultabili dipendono dalla copertura della fonte e sono indicati nella pagina. Orari in Europe/Rome.
- Cataloghi Film e Serie, Top 10, generi preferiti, sezione True crime e caricamento di altre proposte.
- Widget ridimensionabile “Prossimi episodi”: mostra le serie da continuare e permette di segnare gli episodi come visti; al termine della serie chiede Mi piace / Non mi piace. Aggiungilo tenendo premuto sulla schermata Home del telefono e scegliendo Widget → StreamWise.
- Ricerca per titolo con anno facoltativo e ricerca per attore/attrice con filmografia.
- Dettagli, cast, titoli correlati, streaming, noleggio e acquisto disponibili in Italia.
- Filtri per piattaforma e genere.
- Gestione di episodi e stagioni, avanzamento automatico e riapertura delle serie.
- Suggerimento casuale dal catalogo o dalla propria lista in base al tempo disponibile.
- Confronto degli abbonamenti più utili rispetto alla propria libreria.
- Dati personali salvati soltanto sul dispositivo.
