#!/bin/zsh
# Replaces the installed T3 Code with the fork build, keeping the official app as a backup.
set -euo pipefail

NEW="$HOME/Work/perso/t3code/release-vibe/T3 Code (Alpha).app"
CURRENT="/Applications/T3 Code (Alpha).app"
BACKUP="$HOME/Applications/T3 Code (Alpha) officiel.app"

[ -d "$NEW" ] || { echo "Build introuvable : $NEW"; exit 1; }

osascript -e 'tell application id "com.t3tools.t3code" to quit' 2>/dev/null || true
while pgrep -xq "T3 Code (Alpha)"; do sleep 1; done

mkdir -p "$HOME/Applications"
if [ -d "$CURRENT" ]; then
  rm -rf "$BACKUP"
  mv "$CURRENT" "$BACKUP"
fi
ditto "$NEW" "$CURRENT"
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$CURRENT"
open "$CURRENT"
echo "Installé. Version officielle sauvegardée dans : $BACKUP"
