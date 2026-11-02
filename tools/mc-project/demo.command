#!/bin/sh
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Installa Node.js 24 prima di avviare la demo."
  exit 1
fi
node bin/mc-project.mjs demo ../MC-Demo
