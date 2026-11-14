#!/bin/zsh
# Push the knowledge vault to its private GitHub backup. Safe to run any time.
# Run automatically every hour by ~/Library/LaunchAgents/com.lumen.backup.plist
VAULT="${LUMEN_VAULT:-$HOME/Knowledge}"
LOG="$HOME/Lumen/cache/backup.log"
mkdir -p "$(dirname "$LOG")"
export GIT_SSH_COMMAND="ssh -i $HOME/.ssh/lumen_backup_ed25519 -o IdentitiesOnly=yes -o BatchMode=yes"
cd "$VAULT" || exit 1
# Record anything changed outside the app first, so nothing is left out of the backup.
if [ -n "$(git status --porcelain)" ]; then
  git add -A && git -c user.name=Lumen -c user.email=lumen@localhost commit -q -m "Changes made outside Lumen"
fi
if git push -q origin main >>"$LOG" 2>&1; then
  echo "$(date '+%F %T') backed up $(git rev-parse --short HEAD)" >>"$LOG"
else
  echo "$(date '+%F %T') BACKUP FAILED (see above)" >>"$LOG"
  exit 1
fi
