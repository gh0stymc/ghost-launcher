#!/bin/bash
# Prueba completa en Linux: Java, Fabric, mods integrados (con Ghost Client) y arranque del juego.
# Uso (dentro de Linux): bash scripts/linux-test.sh <versión> [<versión>...]
cd "$(dirname "$0")/.."
for v in "$@"; do
  timeout 900 npx electron --no-sandbox scripts/test-builtins.js /root/bt "$v" > "/root/bt-$v.log" 2>&1
  echo "== $v"
  grep -E '^\[test\]' "/root/bt-$v.log" | cut -c1-300
  grep -h 'Ghost Client Initialized' /root/bt/instances/*/logs/latest.log 2>/dev/null | tail -1 | cut -c1-120
done
