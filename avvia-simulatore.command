#!/bin/zsh
set -euo pipefail

PROJECT_DIR="${0:A:h}"
AVD_NAME="${STREAMWISE_AVD:-Pixel_10_Pro}"
SDK_DIR="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
ADB="$SDK_DIR/platform-tools/adb"
EMULATOR="$SDK_DIR/emulator/emulator"

cd "$PROJECT_DIR"

if [[ -d "/Applications/Android Studio.app/Contents/jbr/Contents/Home" ]]; then
  export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
fi
export ANDROID_HOME="$SDK_DIR"
export ANDROID_SDK_ROOT="$SDK_DIR"

if [[ ! -x "$ADB" || ! -x "$EMULATOR" ]]; then
  print -u2 "Non trovo gli strumenti Android in: $SDK_DIR"
  print -u2 "Apri Android Studio almeno una volta e installa Android SDK ed Emulator."
  read "?Premi Invio per chiudere…"
  exit 1
fi

if ! "$EMULATOR" -list-avds | grep -Fxq "$AVD_NAME"; then
  print -u2 "Il simulatore '$AVD_NAME' non esiste."
  print -u2 "Simulatori disponibili:"
  "$EMULATOR" -list-avds
  read "?Premi Invio per chiudere…"
  exit 1
fi

"$ADB" start-server >/dev/null
SERIAL=""
for candidate in $("$ADB" devices | awk '/^emulator-[0-9]+[[:space:]]+device$/ {print $1}'); do
  RUNNING_AVD="$("$ADB" -s "$candidate" emu avd name 2>/dev/null | tr -d '\r' | head -1)"
  if [[ "$RUNNING_AVD" == "$AVD_NAME" ]]; then
    SERIAL="$candidate"
    break
  fi
done

if [[ -z "$SERIAL" ]]; then
  print "Avvio il simulatore $AVD_NAME…"
  open -na "$EMULATOR" --args -avd "$AVD_NAME"

  for attempt in {1..90}; do
    for candidate in $("$ADB" devices | awk '/^emulator-[0-9]+[[:space:]]+device$/ {print $1}'); do
      RUNNING_AVD="$("$ADB" -s "$candidate" emu avd name 2>/dev/null | tr -d '\r' | head -1)"
      if [[ "$RUNNING_AVD" == "$AVD_NAME" ]]; then
        SERIAL="$candidate"
        break 2
      fi
    done
    sleep 1
  done
fi

if [[ -z "$SERIAL" ]]; then
  print -u2 "Il simulatore non si è avviato. Apri Android Studio e controlla il Device Manager."
  read "?Premi Invio per chiudere…"
  exit 1
fi

print "Attendo che Android sia pronto…"
for attempt in {1..120}; do
  BOOTED="$("$ADB" -s "$SERIAL" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')"
  [[ "$BOOTED" == "1" ]] && break
  sleep 1
done

if [[ "${BOOTED:-}" != "1" ]]; then
  print -u2 "Android sta impiegando troppo tempo ad avviarsi."
  read "?Premi Invio per chiudere…"
  exit 1
fi

"$ADB" -s "$SERIAL" shell input keyevent 82 >/dev/null 2>&1 || true

print "Compilo e installo StreamWise…"
./gradlew --no-daemon :app:installDebug

print "Apro StreamWise sul simulatore…"
"$ADB" -s "$SERIAL" shell am force-stop it.dueffe.streamwise.debug
"$ADB" -s "$SERIAL" shell am start -W \
  -n it.dueffe.streamwise.debug/it.dueffe.streamwise.MainActivity >/dev/null

print
print "StreamWise è aperta su $AVD_NAME."
print "Puoi chiudere questa finestra: il simulatore resterà acceso."
sleep 3
