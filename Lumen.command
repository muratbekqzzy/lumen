#!/bin/zsh
# Double-click to open Lumen. Keeps running while this window is open.
cd "$(dirname "$0")"
if ! curl -s -o /dev/null http://127.0.0.1:4321/api/history; then
  .venv/bin/python -m lumen.server &
  for i in {1..30}; do curl -s -o /dev/null http://127.0.0.1:4321/api/history && break; sleep 0.3; done
fi
open http://127.0.0.1:4321
wait
