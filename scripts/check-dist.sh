#!/usr/bin/env bash
# GUARDA DO DIST — compartilhada pelos dois deploys (Pages e NAS).
#
# TRAVA DO DATASET (report 2026-09-12: "tudo reskinado pra fantasia" + banner
# "dataset do mundo ainda não publicado"): `npm run extract` APAGA a pasta
# antes de reescrever — um build feito nessa janela sai sem o dataset e o
# deploy publicava o site sem o mundo, calado. Aqui ele para.
#
# Uso: bash scripts/check-dist.sh [dist]   (default: app/dist)
# Sai com 1 e diz o que faltou; 0 = dist pronto pra publicar.
set -euo pipefail
cd "$(dirname "$0")/.."

DIST="${1:-app/dist}"
[ -f "$DIST/index.html" ] || { echo "erro: $DIST não tem build (rode npm run build)"; exit 1; }

for D in vault-data vault-data-cyberpunk; do
  IDX="$DIST/$D/index.json"
  [ -s "$IDX" ] || { echo "erro: $IDX faltando — rode o extract e o build de novo (o extract apaga a pasta antes de reescrever)"; exit 1; }
  N=$(node -e "const fs=require('fs');const m=JSON.parse(fs.readFileSync('$IDX','utf8'));process.stdout.write(String((m.docs||[]).length))")
  [ "$N" -gt 0 ] || { echo "erro: $D publicaria com 0 docs"; exit 1; }
  echo "dataset ok: $D ($N docs)"
done
