#!/bin/bash
export PATH="/opt/homebrew/bin:$PATH"

# Resolve project root (where this script lives)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/relay.config.json"

# Read dataDir from relay.config.json, default to ./data
if [ -f "$CONFIG_FILE" ]; then
  RAW_DIR=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE')).get('dataDir', './data'))" 2>/dev/null)
else
  RAW_DIR="./data"
fi

# Resolve relative paths against project root
case "$RAW_DIR" in
  /*) DATA_DIR="$RAW_DIR" ;;
  *)  DATA_DIR="$SCRIPT_DIR/$RAW_DIR" ;;
esac

RELAY_FILE="$DATA_DIR/instructions.json"

echo "AVI Relay Watcher running... watching $RELAY_FILE"

while true; do
  CURRENT_MODIFIED=$(stat -f "%m" "$RELAY_FILE" 2>/dev/null)
  if [ "$CURRENT_MODIFIED" != "$LAST_MODIFIED" ] && [ -n "$CURRENT_MODIFIED" ]; then
    LAST_MODIFIED="$CURRENT_MODIFIED"
    PENDING=$(python3 -c "
import json
data=json.load(open('$RELAY_FILE'))
pending=[i for i in data if i.get('status')=='pending']
print(len(pending))
" 2>/dev/null)
    if [ "$PENDING" -gt "0" ] 2>/dev/null; then
      echo "New instruction detected! Running Claude Code..."
      cd ~ && echo "Check $RELAY_FILE and execute all pending instructions." | claude --print --dangerously-skip-permissions
    fi
  fi
  sleep 2
done
