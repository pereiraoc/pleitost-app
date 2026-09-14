#!/usr/bin/env bash
# DEPLOY COM TRAVA (colisão real entre duas sessões, 2026-09-13).
#
# Duas sessões deployando ao mesmo tempo se destroem: o `vite build` LIMPA
# app/dist logo no começo, e o `gen-thumbs` da outra morre com ENOENT lendo
# `vault-data-cyberpunk/assets.json` — que sumiu debaixo dele. Aconteceu, e o
# deploy da outra sessão foi pro lixo no meio do caminho.
#
# A trava pega o PIPELINE INTEIRO, não só o `deploy-pages.sh`: quem apaga o
# dist é o primeiro passo, então travar só o push final não impediria nada.
# Falha rápido em vez de esperar — quem chegou depois quase sempre quer saber
# que já tem um rodando, não ficar bloqueado sem explicação.
set -euo pipefail
cd "$(dirname "$0")/.."

LOCK="${TMPDIR:-/tmp}/pleitost-app-deploy.lock"
# `>>` e não `>`: abrir pra truncar apagaria o PID do dono antes mesmo de saber
# se a trava é nossa.
exec 9>>"$LOCK"
if ! flock -n 9; then
  dono="$(tail -1 "$LOCK" 2>/dev/null || true)"
  echo "[deploy] JÁ TEM UM DEPLOY RODANDO${dono:+ (PID $dono)} — não vou limpar app/dist por baixo dele." >&2
  echo "[deploy] espera ele terminar e roda de novo." >&2
  exit 1
fi
printf '%s\n' "$$" >"$LOCK"
echo "[deploy] trava adquirida (PID $$) · $LOCK"

VITE_BASE=/pleitost-app/ npm run build
npm run gen-thumbs
bash scripts/deploy-pages.sh
