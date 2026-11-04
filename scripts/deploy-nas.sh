#!/usr/bin/env bash
# DEPLOY NO NAS DE CASA (https://rpg.adrenalindos.com, público; também https://pleitost.nas.local) — irmão do deploy.sh.
#
# O NAS serve o app como arquivos estáticos pelo Caddy, a partir de
# /srv/appdata/pleitost/www. Diferenças pro GitHub Pages:
#   - base `/` (o app vive na raiz do nome pleitost.nas.local, não em /<repo>/);
#   - `--mode nas`: o Vite carrega app/.env.nas por cima do app/.env, e o
#     Supabase passa a ser o DO NAS (https://db.adrenalindos.com), não o cloud;
#   - sem gh-pages: o dist vai por rsync pelo SSH (alias `nas`, sudo sem senha
#     lá) — `.nojekyll` é coisa do Pages e fica de fora.
#
# MESMA TRAVA do deploy.sh (arquivo .deploy.lock no checkout): o `vite build`
# limpa app/dist logo no começo, então Pages e NAS deployando juntos se
# destruiriam do mesmo jeito que duas sessões (2026-09-13 / 2026-10-09).
set -euo pipefail
cd "$(dirname "$0")/.."

LOCK="$(pwd)/.deploy.lock"
exec 9>>"$LOCK"
if ! flock -n 9; then
  dono="$(tail -1 "$LOCK" 2>/dev/null || true)"
  echo "[deploy-nas] JÁ TEM UM DEPLOY RODANDO${dono:+ (PID $dono)} — não vou limpar app/dist por baixo dele." >&2
  echo "[deploy-nas] espera ele terminar e roda de novo." >&2
  exit 1
fi
printf '%s\n' "$$" >"$LOCK"
echo "[deploy-nas] trava adquirida (PID $$) · $LOCK"

NAS_HOST="${PLEITOST_NAS_HOST:-nas}"
NAS_DIR="${PLEITOST_NAS_DIR:-/srv/appdata/pleitost/www}"

# Sem a chave do Supabase do NAS o app sobe "100% local" sem avisar (o client
# vira null). Melhor parar aqui do que publicar um app sem mesa.
if grep -q '__PREENCHIDO' app/.env.nas; then
  echo "[deploy-nas] app/.env.nas ainda tem o placeholder da VITE_SUPABASE_ANON_KEY — preencha com a anon key do Supabase do NAS." >&2
  exit 1
fi

VITE_BASE=/ npm run build -w app -- --mode nas
npm run gen-thumbs
bash scripts/check-dist.sh

# -a preserva mtimes (o Caddy usa pra ETag/Last-Modified); --chmod garante
# leitura pro usuário do Caddy mesmo com umask restrita de quem deploya.
rsync -a --delete --chmod=D755,F644 --exclude='.nojekyll' \
  --rsync-path='sudo rsync' \
  app/dist/ "$NAS_HOST:$NAS_DIR/"
echo "publicado: app/dist → $NAS_HOST:$NAS_DIR (https://rpg.adrenalindos.com)"
