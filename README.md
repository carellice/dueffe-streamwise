<p align="center">
  <img src="docs/logo.png" alt="StreamWise" width="128" height="128">
</p>

<h1 align="center">StreamWise per Android</h1>

<p align="center">Cosa guardare, dove e quando. App nativa Kotlin + Jetpack Compose della famiglia Dueffe.</p>

---

Questa è la riscrittura nativa Android della precedente PWA StreamWise. L'interfaccia usa Jetpack Compose e Material 3, senza WebView, React o browser incorporati.

## Creare l’APK sul Mac

1. Crea una API Key personale gratuita sul sito TMDB.
2. Inseriscila in `local.properties` con la riga `tmdb.api.key=LA_TUA_CHIAVE`.
3. Fai doppio clic su `build-apk.command` oppure avvialo dal Terminale.
4. Troverai l’APK firmato nella cartella `dist`, già configurato con la chiave. Al termine, lo script crea automaticamente anche una release in questa repository (`carellice/dueffe-streamwise`) e vi allega l’APK.

Senza argomenti lo script incrementa automaticamente la patch, per esempio da `1.0.0` a `1.0.1`. Per scegliere una versione precisa:

```sh
./build-apk.command 1.2.0
```

Ogni build incrementa anche il codice interno richiesto da Android per accettare un aggiornamento. La cartella `signing` e il file `.streamwise-signing.properties` contengono l’identità di firma: conservali e includili nei backup. Se vengono persi, Android non consentirà di installare un aggiornamento sopra la versione già installata.

La pubblicazione richiede GitHub CLI (`gh`) con un’autenticazione valida e accesso in scrittura alla repository. Ogni release usa un tag nel formato `streamwise-v1.2.3`; se il tag esiste già, l’APK allegato viene sostituito. Dopo la pubblicazione, lo script elimina definitivamente le release precedenti il cui tag inizia con `streamwise-v`, insieme ai relativi tag Git, mantenendo solo quella appena creata; le release con altri tag non vengono toccate. Per conservarle imposta `STREAMWISE_DELETE_OLD_RELEASES=0`. Per usare un’altra repository puoi impostare la variabile `GITHUB_RELEASE_REPO` nel formato `proprietario/repository`.

Se avviato da Terminale di macOS, al termine lo script chiude automaticamente la propria finestra. Per mantenerla aperta durante una sessione puoi usare `STREAMWISE_CLOSE_TERMINAL=0 ./build-apk.command`.

## Creare l’APK su Windows

Requisiti (una tantum): JDK 17 o Android Studio, Android SDK in `%LOCALAPPDATA%\Android\Sdk`, GitHub CLI con `gh auth login -h github.com` e Python 3. Con winget: `winget install EclipseAdoptium.Temurin.17.JDK GitHub.cli Python.Python.3.12`.

Copia dal Mac `signing/`, `.streamwise-signing.properties` e `local.properties`, poi fai doppio clic su `build-apk.cmd` (oppure `.\build-apk.ps1` da PowerShell). Lo script fa esattamente ciò che fa `build-apk.command`: incrementa la versione, compila l’APK firmato in `dist`, crea la release `streamwise-vX.Y.Z` su `carellice/dueffe-streamwise` con `latest.json` e rimuove le release StreamWise precedenti. Accetta gli stessi argomenti e variabili (`.\build-apk.ps1 1.2.0`, `STREAMWISE_DELETE_OLD_RELEASES=0`, `GITHUB_RELEASE_REPO`). In caso di errore la finestra resta aperta e `version.properties` viene ripristinato.

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
- Pagina autonoma “Guida TV” nella barra di navigazione: film e serie dei principali canali nazionali del digitale terrestre, calendario, giorno precedente/successivo, filtri per tipo e canale, “In onda ora”, dettagli delle trasmissioni e ricerca della scheda StreamWise. Palinsesti pubblici EPGShare01 con cache di 30 minuti; i giorni consultabili dipendono dalla copertura della fonte e sono indicati nella pagina. Orari in Europe/Rome. Dalla scheda di una trasmissione, “Calendario” crea l’evento nel calendario del telefono con orario e canale.
- Cataloghi Film e Serie, Top 10, generi preferiti, sezione True crime e caricamento di altre proposte.
- Widget ridimensionabile “Prossimi episodi”: mostra le serie da continuare e permette di segnare gli episodi come visti; al termine della serie chiede Mi piace / Non mi piace. Aggiungilo tenendo premuto sulla schermata Home del telefono e scegliendo Widget → StreamWise.
- “Segui” per serie e film: notifica il giorno di uscita di ogni nuovo episodio (anche con più episodi o una stagione intera pubblicati insieme), l’annuncio della data di una nuova stagione, l’uscita italiana di un film (cinema o digitale) e il suo arrivo in streaming in abbonamento. Si attiva dalla scheda del titolo o tenendo premuto su una locandina; i titoli seguiti compaiono in Home in “Uscite che segui” con la prossima data. Il controllo avviene in background ogni 2 ore (senza notifiche tra le 23 e le 8) e all’apertura dell’app; i titoli seguiti sono inclusi nel backup. Quando la data è nota, il prossimo episodio o l’uscita si aggiungono al calendario del telefono come evento di un giorno intero (dalla scheda del titolo o dall’icona calendario in Libreria → Seguiti).
- Ricerca per titolo con anno facoltativo e ricerca per attore/attrice con filmografia. Per impostazione predefinita le filmografie nascondono late show, talk show, reality, telegiornali e apparizioni come sé stessi; si può disattivare da Impostazioni → “Filmografie senza talk show”.
- “Segui” per attori e registi: dalla pagina della filmografia si ricevono notifiche quando a TMDB viene aggiunto un loro nuovo film o serie (recente o in arrivo). Le persone seguite compaiono in Home in “Persone che segui” e sono incluse nel backup.
- “Chiedi all’IA”: consigli personalizzati generati con Cloudflare Workers AI usando l’account di ciascun utente. Account ID e token API si inseriscono in Impostazioni › Intelligenza artificiale, dove una guida passo passo spiega come ottenerli gratis; restano solo sul telefono e non sono inclusi nel backup.
- “Simili secondo l’IA”: in fondo alla scheda di ogni film o serie, un pulsante chiede all’IA film e serie simili per atmosfera, temi e tono, ciascuno con il motivo della scelta; “Altri simili” ne propone di nuovi. Se l’IA non è ancora configurata, compare la stessa guida delle Impostazioni.
- “Ritrova un titolo”: in Home, sotto “Chiedi all’IA”, una procedura guidata aiuta a trovare un film o una serie di cui non si ricorda il nome. Sei domande semplici (film o serie, epoca, genere, paese, trama, altri dettagli), poi l’IA propone fino a 5 candidati con gli indizi che corrispondono; se nessuno è giusto, fa una domanda in più per restringere la ricerca.
- Dettagli, cast, titoli correlati, streaming, noleggio e acquisto disponibili in Italia.
- Filtri per piattaforma e genere.
- Gestione di episodi e stagioni, avanzamento automatico e riapertura delle serie.
- Suggerimento casuale dal catalogo o dalla propria lista in base al tempo disponibile.
- Confronto degli abbonamenti più utili rispetto alla propria libreria.
- Dati personali salvati soltanto sul dispositivo.
