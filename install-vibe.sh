#!/bin/zsh
# Installs the fork build, preserving the first official-app backup.
set -euo pipefail

REPO="${0:A:h}"
NEW="$REPO/release-vibe/tes trois code.app"
CURRENT="/Applications/tes trois code.app"
PREVIOUS="/Applications/T3 Code (Alpha).app"
BACKUP="$HOME/Applications/T3 Code (Alpha) officiel.app"
LSREGISTER="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"

[ -d "$NEW" ] || { echo "Build introuvable : $NEW"; exit 1; }
[ -f "$REPO/assets/vibe/t3code.json" ] || { echo "Règle Vibe Island introuvable."; exit 1; }

osascript -e 'tell application id "com.t3tools.t3code" to quit' 2>/dev/null || true
attempts=0
while pgrep -xq "T3 Code (Alpha)" || pgrep -xq "tes trois code"; do
  if [ "$attempts" -ge 30 ]; then
    echo "L’app ne s’est pas quittée ; installation annulée."
    exit 1
  fi
  sleep 1
  attempts=$((attempts + 1))
done

mkdir -p "$HOME/Applications"
if [ -d "$PREVIOUS" ]; then
  "$LSREGISTER" -u "$PREVIOUS"
  if [ -e "$BACKUP" ]; then
    rm -rf "$PREVIOUS"
  else
    mv "$PREVIOUS" "$BACKUP"
  fi
fi
rm -rf "$CURRENT"
ditto "$NEW" "$CURRENT"
"$LSREGISTER" -f "$CURRENT"
mkdir -p "$HOME/.vibe-island/integrations"
cp "$REPO/assets/vibe/t3code.json" "$HOME/.vibe-island/integrations/t3code.json"
open "$CURRENT"
echo "tes trois code installée. Version officielle sauvegardée dans : $BACKUP"
echo "Relancez Vibe Island pour charger la règle d’ouverture des conversations."
