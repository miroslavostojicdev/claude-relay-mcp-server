#!/bin/bash
export PATH="/opt/homebrew/bin:$PATH"
RELAY_FILE="$HOME/Desktop/claude-relay/instructions.json"
LAST_MODIFIED=""

echo "AVI Relay Watcher running... watching $RELAY_FILE"

while true; do
  CURRENT_MODIFIED=$(stat -f "%m" "$RELAY_FILE" 2>/dev/null)
  if [ "$CURRENT_MODIFIED" != "$LAST_MODIFIED" ] && [ -n "$CURRENT_MODIFIED" ]; then
    LAST_MODIFIED="$CURRENT_MODIFIED"
    # Check if there are pending instructions
    PENDING=$(python3 -c "
import json
data=json.load(open('$RELAY_FILE'))
pending=[i for i in data if i.get('status')=='pending']
print(len(pending))
" 2>/dev/null)
    if [ "$PENDING" -gt "0" ] 2>/dev/null; then
      echo "New instruction detected! Running Claude Code..."
      cd ~ && echo "Check ~/Desktop/claude-relay/instructions.json and execute all pending instructions." | claude --print --dangerously-skip-permissions
    fi
  fi
  sleep 2
done
