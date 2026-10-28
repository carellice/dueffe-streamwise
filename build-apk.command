#!/bin/zsh
set -euo pipefail

PROJECT_DIR="${0:A:h}"
cd "$PROJECT_DIR"

if [[ "${TERM_PROGRAM:-}" == "Apple_Terminal" ]]; then
  printf '\033]0;StreamWise APK build\007'
fi

if [[ -d "/Applications/Android Studio.app/Contents/jbr/Contents/Home" ]]; then
  export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
elif ! command -v java >/dev/null 2>&1; then
  print -u2 "Android Studio non è installato. Installalo e riprova."
  exit 1
fi

if [[ -d "$HOME/Library/Android/sdk" ]]; then
  export ANDROID_HOME="$HOME/Library/Android/sdk"
  export ANDROID_SDK_ROOT="$ANDROID_HOME"
fi

GITHUB_RELEASE_REPO="${GITHUB_RELEASE_REPO:-carellice/android-app-releases}"
if ! command -v gh >/dev/null 2>&1; then
  print -u2 "GitHub CLI non è installato. Installa 'gh' per pubblicare automaticamente l'APK."
  exit 1
fi
if ! gh auth status -h github.com >/dev/null 2>&1; then
  print -u2 "L'autenticazione GitHub non è valida. Esegui: gh auth login -h github.com"
  exit 1
fi
if ! gh repo view "$GITHUB_RELEASE_REPO" >/dev/null 2>&1; then
  print -u2 "Non riesco ad accedere alla repository $GITHUB_RELEASE_REPO."
  exit 1
fi

if [[ -z "${TMDB_API_KEY:-}" && -f local.properties ]]; then
  TMDB_API_KEY="$(sed -n 's/^tmdb\.api\.key=//p' local.properties | tail -1)"
fi
if [[ -z "${TMDB_API_KEY:-}" ]]; then
  print "Inserisci la tua API Key TMDB (verrà salvata solo su questo Mac):"
  read -rs TMDB_API_KEY
  print
  if [[ -z "$TMDB_API_KEY" ]]; then
    print -u2 "La chiave TMDB è necessaria. Inseriscila in local.properties e riprova."
    exit 1
  fi
fi
if [[ -n "${TMDB_API_KEY:-}" ]]; then
  # Aggiorna solo la chiave TMDB: le altre impostazioni locali restano.
  OTHER_LINES="$(grep -v '^tmdb\.api\.key=' local.properties 2>/dev/null || true)"
  { print "tmdb.api.key=$TMDB_API_KEY"; [[ -n "$OTHER_LINES" ]] && print -r -- "$OTHER_LINES"; } > local.properties
fi
export TMDB_API_KEY="${TMDB_API_KEY:-}"

CURRENT_CODE="$(sed -n 's/^VERSION_CODE=//p' version.properties)"
CURRENT_NAME="$(sed -n 's/^VERSION_NAME=//p' version.properties)"
NEXT_CODE=$((CURRENT_CODE + 1))

if [[ $# -gt 0 ]]; then
  NEXT_NAME="$1"
  if [[ ! "$NEXT_NAME" =~ '^[0-9]+\.[0-9]+\.[0-9]+$' ]]; then
    print -u2 "Versione non valida. Usa il formato 1.2.3"
    exit 1
  fi
else
  IFS=. read -r MAJOR MINOR PATCH <<< "$CURRENT_NAME"
  NEXT_NAME="$MAJOR.$MINOR.$((PATCH + 1))"
fi

BACKUP_FILE="$(mktemp)"
cp version.properties "$BACKUP_FILE"
trap 'cp "$BACKUP_FILE" version.properties; rm -f "$BACKUP_FILE"' ERR INT TERM
print "VERSION_CODE=$NEXT_CODE\nVERSION_NAME=$NEXT_NAME" > version.properties

if [[ ! -f .streamwise-signing.properties ]]; then
  mkdir -p signing
  SIGNING_PASSWORD="$(openssl rand -hex 18)"
  "$JAVA_HOME/bin/keytool" -genkeypair -v \
    -keystore signing/streamwise-release.jks \
    -storepass "$SIGNING_PASSWORD" \
    -keypass "$SIGNING_PASSWORD" \
    -alias streamwise \
    -keyalg RSA -keysize 3072 -validity 10000 \
    -dname "CN=StreamWise, OU=Mobile, O=Dueffe, L=Rome, C=IT"
  print "storeFile=signing/streamwise-release.jks\nstorePassword=$SIGNING_PASSWORD\nkeyAlias=streamwise\nkeyPassword=$SIGNING_PASSWORD" > .streamwise-signing.properties
  print "Creata la firma permanente in StreamWiseAndroid/signing. Conservala: serve per tutti gli aggiornamenti futuri."
fi

print "Creo StreamWise $NEXT_NAME ($NEXT_CODE)…"
./gradlew --no-daemon clean assembleRelease "-PupdateRepository=$GITHUB_RELEASE_REPO"

mkdir -p dist
APK_PATH="$PROJECT_DIR/dist/StreamWise-$NEXT_NAME.apk"
cp app/build/outputs/apk/release/app-release.apk "$APK_PATH"

RELEASE_TAG="streamwise-v$NEXT_NAME"
RELEASE_TITLE="StreamWise $NEXT_NAME"
RELEASE_NOTES="APK Android firmato di StreamWise. Versione $NEXT_NAME, codice aggiornamento $NEXT_CODE."

python3 write-update-metadata.py "$APK_PATH" "$NEXT_CODE" "$NEXT_NAME" it.dueffe.streamwise
print "Pubblico l'APK su GitHub…"
if gh release view "$RELEASE_TAG" --repo "$GITHUB_RELEASE_REPO" >/dev/null 2>&1; then
  gh release upload "$RELEASE_TAG" "$APK_PATH" "$PROJECT_DIR/dist/latest.json" --repo "$GITHUB_RELEASE_REPO" --clobber
else
  gh release create "$RELEASE_TAG" "$APK_PATH" "$PROJECT_DIR/dist/latest.json" \
    --repo "$GITHUB_RELEASE_REPO" \
    --title "$RELEASE_TITLE" \
    --notes "$RELEASE_NOTES"
fi

if [[ "${STREAMWISE_DELETE_OLD_RELEASES:-1}" == "1" ]]; then
  print "Rimuovo le release StreamWise precedenti…"
  # Solo i tag streamwise-v*: le release delle altre app nella stessa repository non vanno toccate.
  STREAMWISE_RELEASE_TAGS="$(gh release list \
    --repo "$GITHUB_RELEASE_REPO" \
    --limit 1000 \
    --json tagName \
    --jq '.[] | select(.tagName // "" | startswith("streamwise-v")) | .tagName' || true)"
  while IFS= read -r OLD_RELEASE_TAG; do
    [[ -z "$OLD_RELEASE_TAG" || "$OLD_RELEASE_TAG" == "$RELEASE_TAG" ]] && continue
    gh release delete "$OLD_RELEASE_TAG" \
      --repo "$GITHUB_RELEASE_REPO" \
      --yes \
      --cleanup-tag \
      || print -u2 "Non sono riuscito a rimuovere la release $OLD_RELEASE_TAG."
  done <<< "$STREAMWISE_RELEASE_TAGS"
else
  print "Conservo le release StreamWise precedenti (STREAMWISE_DELETE_OLD_RELEASES=0)."
fi

rm -f "$BACKUP_FILE"
trap - ERR INT TERM

print
print "APK pronto: $APK_PATH"
print "Versione: $NEXT_NAME · codice aggiornamento: $NEXT_CODE"
print "Release: https://github.com/$GITHUB_RELEASE_REPO/releases/tag/$RELEASE_TAG"
print "Per installarlo via USB: $ANDROID_HOME/platform-tools/adb install -r \"$APK_PATH\""

if [[ "${STREAMWISE_CLOSE_TERMINAL:-1}" == "1" && "${TERM_PROGRAM:-}" == "Apple_Terminal" ]]; then
  osascript -e 'tell application "Terminal" to close (every window whose name contains "StreamWise APK build")' >/dev/null 2>&1 || true
fi

exit 0
