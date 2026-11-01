# StreamWise web (PWA) per CasaOS

La stessa StreamWise dell'app Android, come app web da installare sul telefono e da ospitare sul
proprio server di casa (CasaOS, Raspberry Pi, qualsiasi Linux con Docker). Stessi colori, font,
animazioni, schermate e testi dell'app nativa; i dati stanno sul server, un account per persona.

L'app Android in `app/` non è toccata: tutto quello che serve alla versione web vive in questa
cartella `PWA/`.

## Installazione

Dal terminale del server (SSH o terminale di CasaOS):

```bash
curl -fsSL https://raw.githubusercontent.com/carellice/dueffe-streamwise/main/PWA/casaos/installa.sh | sudo bash
```

L'installer chiede, con valori proposti tra parentesi:

- la cartella dei dati (su CasaOS `/DATA/AppData/streamwise`) e la porta (8097);
- il fuso orario (per i promemoria e le uscite);
- la **API Key TMDB** (la stessa di `local.properties`): resta solo sul server, il browser non la vede mai;
- il **codice famiglia**: serve per creare un account, senza nessuno può registrarsi;
- come aprirla dal telefono in HTTPS (vedi sotto);
- se attivare l'aggiornamento automatico notturno.

Costruisce l'immagine Docker sul server stesso (amd64 e arm64), avvia il container, la fa
comparire nella dashboard di CasaOS e alla fine stampa gli indirizzi da aprire e il codice famiglia.
Rilanciando lo stesso comando si aggiorna mantenendo dati e impostazioni, oppure si riconfigura.

### HTTPS dal telefono

Per installarla come app e ricevere le notifiche il telefono deve usare HTTPS.

| Modo | Come funziona |
|---|---|
| **Tailscale** (consigliato) | Certificato vero, funziona anche fuori casa, solo i tuoi dispositivi la raggiungono. Serve Tailscale sul server (anche come app di CasaOS) con MagicDNS e certificati HTTPS attivi nella console Tailscale. L'indirizzo è `https://<server>.<tailnet>.ts.net` (con una porta se 443 è già usata da un'altra app). |
| HTTPS in casa | Il server crea un suo certificato: una volta per telefono si apre `http://<ip>:8097/certificato` e si installa. |
| HTTP dietro proxy | Per chi ha già Nginx Proxy Manager, Caddy o Cloudflare Tunnel che fanno l'HTTPS. |

In HTTP semplice sulla rete di casa funziona comunque come sito, ma senza installazione come app e senza notifiche.

### Installarla sul telefono

- Android (Chrome): menu ⋮ → **Installa app**.
- iPhone (Safari): Condividi → **Aggiungi alla schermata Home** (le notifiche su iPhone arrivano solo all'app installata, iOS 16.4 o successivo).

## Account

Ogni persona crea il proprio account (nome utente e password, più il codice famiglia): libreria,
progressi, titoli e persone seguite, promemoria della Guida TV, generi preferiti, abbonamenti e
credenziali dell'IA sono separati, ognuno in un proprio database. Da Impostazioni → Account si cambia
la password, si esce o si elimina l'account con tutti i suoi dati.

## Passare dall'app Android alla web (e ritorno)

Il backup è lo stesso file JSON (`streamwise-backup`):

1. nell'app Android: Impostazioni → Backup dati → **Esporta JSON**;
2. in StreamWise web: Impostazioni → Backup dati → **Ripristina JSON** (si può anche dall'ultima pagina dell'introduzione).

Vengono trasferiti libreria e progressi, voti, titoli fissati, generi preferiti, abbonamenti, titoli
e persone seguiti. Il file esportato dalla web si importa nello stesso modo nell'app Android.
Le credenziali dell'IA non sono mai nel backup.

## Aggiornamenti

Con l'aggiornamento notturno attivo il server controlla ogni notte (verso le 4) se su GitHub c'è una
versione nuova: la costruisce a parte, fa una copia di tutti i database in `<dati>/backup/`, la avvia
e, se non risponde, torna da sola alla versione precedente. A mano:

```bash
sudo streamwise-aggiorna
```

`sudo streamwise-aggiorna --controlla` dice solo se c'è una versione nuova; `--forza` ricostruisce
anche se la versione è uguale. Log: `journalctl -u streamwise-aggiorna`. Per spegnerlo:
`sudo systemctl disable --now streamwise-aggiorna.timer`.

Sul telefono la versione nuova arriva alla riapertura; in Impostazioni → Aggiornamenti → **Controlla**.

**Pubblicare una versione**: aumentare `version` in `PWA/server/package.json` (e nel suo
`package-lock.json`) nello stesso push delle modifiche. Senza aumento di versione i server non si aggiornano.

## Differenze rispetto all'app Android

| App Android | StreamWise web |
|---|---|
| Dati in SharedPreferences sul telefono | Database SQLite sul server, uno per account; copia sul dispositivo per aprirsi subito e funzionare offline in sola lettura |
| Chiave TMDB dentro l'APK | Chiave solo sul server; il browser passa da `/api/tmdb` |
| Controllo uscite con WorkManager ogni 2 ore (silenzio 23–8) | Lo stesso controllo lo fa il server, anche con il telefono spento; all'apertura dell'app al massimo ogni 30 minuti |
| Notifiche locali (uscite, persone, promemoria Guida TV) | Web Push inviate dal server, stessi testi; i promemoria TV partono all'orario scelto |
| Guida TV scaricata dal telefono | Scaricata e messa in cache dal server (30 minuti), condivisa da tutti gli account |
| Credenziali Cloudflare Workers AI sul telefono | Sul server, legate all'account; non tornano mai al browser |
| Widget "Prossimi episodi" nella schermata Home | **Non disponibile sul web** |
| Aggiornamento dell'APK da GitHub Releases | Aggiornamento automatico del server e del service worker |
| Disponibilità per abbonamento salvata per un giorno | Uguale, salvata sul dispositivo per ogni account |
| Selettore data di sistema | Calendario disegnato nello stesso stile Material 3 |

## Sviluppo

Serve Node 24 (esegue TypeScript direttamente).

```bash
cd PWA/server && npm install && TMDB_API_KEY=... npm run dev   # API su :8080, dati in server/data
cd PWA/web && npm install && npm run dev                        # Vite su :5173, inoltra /api al server
cd PWA/web && npm run build                                     # controllo tipi + build in server/public
```

Struttura:

- `shared/`: modello dati, client TMDB, regole della libreria, uscite seguite e date (porting di `Models.java`, `TmdbApi.java`, `LibraryStore.java`, `ReleaseFollows.java`, `PersonFollows.java`), usati da server e web;
- `server/`: Node senza framework, `node:sqlite`, account, proxy TMDB, Guida TV, IA, controlli in background e Web Push;
- `web/`: React + framer-motion, una schermata per ogni schermata nativa;
- `casaos/`: installer, aggiornamento notturno con rollback, certificati HTTPS locali;
- `PORTING.md`: corrispondenza tra codice nativo e codice web.

Variabili del server: `PORT` (8080), `HTTPS_PORT` (8443), `DATA_DIR` (`/data` nel container),
`TMDB_API_KEY`, `INVITE_CODE`, `HTTPS_HOSTS`, `TZ`.
