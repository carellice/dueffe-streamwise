# StreamWise web (PWA) per CasaOS

StreamWise nel browser, identica all'app Android: libreria di film e serie, progressi degli
episodi, uscite seguite con notifiche, guida TV del digitale terrestre e consigli con l'IA. Gira sul
tuo server di casa (CasaOS, Raspberry Pi, qualsiasi Linux con Docker) e ogni persona della famiglia
ha il proprio account con dati separati.

## Installazione

Sul server, da SSH o dal terminale di CasaOS:

```sh
curl -fsSL https://raw.githubusercontent.com/carellice/dueffe-streamwise/main/PWA/casaos/installa.sh | sudo bash
```

L'installer chiede la cartella dei dati, la porta (predefinita 8096), il fuso orario, la **chiave
API TMDB** (gratuita, da https://www.themoviedb.org/settings/api: resta solo sul server) e come
aprire StreamWise dal telefono in HTTPS:

1. **Tailscale** (consigliato): HTTPS vero, funziona anche fuori casa. Servono MagicDNS e i
   certificati HTTPS attivi nella console di Tailscale.
2. **HTTPS in casa**: un certificato locale da installare una volta per telefono (pagina
   `/certificato`).
3. **HTTP dietro un reverse proxy** o Cloudflare Tunnel che aggiunge l'HTTPS.

Poi costruisce l'immagine Docker sul server, avvia il container, aggiunge StreamWise alla dashboard
di CasaOS e propone l'aggiornamento automatico notturno.

## Primo avvio

1. Apri l'indirizzo mostrato alla fine dell'installazione e tocca **Creane uno**.
2. Installala come app: Android (Chrome) menu ⋮ → *Installa app*; iPhone (Safari) Condividi →
   *Aggiungi alla schermata Home*.
3. Hai già l'app Android? Esporta il backup da lì (Impostazioni → *Esporta JSON*) e ripristinalo
   qui (Impostazioni → *Ripristina JSON*). Il formato è lo stesso nei due sensi.
4. Impostazioni → *Notifiche*: attivale su ogni telefono che deve ricevere nuove uscite e
   promemoria della guida TV.

Chiunque raggiunga il server può creare un account: tienilo in casa o dietro Tailscale.

## Aggiornamenti

Ogni notte verso le 4 il server controlla `server/package.json` su GitHub: se la versione è più
nuova scarica il codice, costruisce la nuova immagine, salva una copia di tutti i database in
`<dati>/backup/` (ultime 5) e riavvia. Se la nuova versione non parte torna alla precedente.

```sh
sudo streamwise-aggiorna             # aggiorna subito
sudo streamwise-aggiorna --controlla # dice solo se c'è una versione nuova
journalctl -u streamwise-aggiorna    # cosa è successo stanotte
```

**Per pubblicare una nuova versione**: aumenta `version` in `PWA/server/package.json` (e in
`package-lock.json`) nello stesso push delle modifiche. Senza aumento i server non si aggiornano.

## Differenze rispetto all'app Android

| App Android | StreamWise web |
|---|---|
| Dati sul telefono | Dati sul server, uno per account; copia locale per aprirla subito e offline (in sola lettura) |
| Chiave TMDB dentro l'APK | Chiave sul server, il browser passa dal server |
| Controllo uscite ogni 2 ore sul telefono | Controllo ogni ora sul server (silenzioso dalle 23 alle 8), anche a telefono spento |
| Notifiche locali | Web Push: servono HTTPS e, su iPhone, l'app installata (iOS 16.4+) |
| Promemoria guida TV con sveglie esatte | Inviati dal server, puntuali entro 30 secondi |
| Credenziali Cloudflare sul telefono | Sul server, per account; non tornano mai al browser |
| Widget episodi nella schermata Home | Non disponibile sul web |
| Aggiornamento APK | Service worker + aggiornamento notturno del server |
| Vibrazione | Solo Android |

## App Android collegata al server

Nell'app Android, Impostazioni → *Usa il server*: inserisci l'indirizzo e l'account della PWA e
l'app userà gli stessi dati (libreria, uscite seguite, persone, preferenze). Senza connessione
l'app mostra l'ultima copia ma non può salvare modifiche.

## Sviluppo

```sh
cd PWA/server && npm install && TMDB_API_KEY=... npm run dev   # API su :8080, dati in server/data
cd PWA/web && npm install && npm run dev                        # Vite su :5173, inoltra /api al server
cd PWA/web && npm run build                                     # tsc + vite build in server/public
```

`shared/` contiene la logica portata dall'app (modello, TMDB, libreria, uscite, abbonamenti, guida
TV) ed è usata sia dal browser sia dal server. `PORTING.md` elenca ogni schermata e il suo stato.
