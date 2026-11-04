#!/usr/bin/env bash
# DESATIVADO em 03/11/2026: o Pleitost saiu do GitHub Pages. O app oficial e https://rpg.adrenalindos.com (NAS de
# casa, banco em https://db.adrenalindos.com), publicado por `npm run deploy:nas`. A branch gh-pages agora so
# redireciona (e desregistra o PWA antigo); publicar o build aqui de novo traria de volta um app falando com o
# Supabase cloud. Para forcar mesmo assim: PLEITOST_PAGES_FORCE=1.
if [ "${PLEITOST_PAGES_FORCE:-0}" != 1 ]; then
  echo "[deploy-pages] DESATIVADO: o Pleitost mudou para https://rpg.adrenalindos.com -> use: npm run deploy:nas" >&2
  exit 1
fi
# Publica app/dist na branch gh-pages (#207) — plumbing do git, sem o pacote
# gh-pages: ele criava a branch a partir do main quando ela não existia,
# herdando o .gitignore da raiz (que ignora vault-data/) e vazando arquivos do
# main pro site. Aqui o tree nasce SÓ do dist:
#   - `add -f` com index temporário ignora qualquer .gitignore;
#   - commit ÓRFÃO por deploy (sem histórico — 275MB de vault-data por
#     snapshot não acumulam no repo);
#   - push forçado só na refs/heads/gh-pages.
set -euo pipefail
cd "$(dirname "$0")/.."

DIST=app/dist
# Guarda do dist (build presente + trava do dataset) — compartilhada com o
# deploy-nas.sh, mora em scripts/check-dist.sh.
bash scripts/check-dist.sh "$DIST"

# Pages processa o site com Jekyll por padrão; .nojekyll desliga (arquivos _*)
touch "$DIST/.nojekyll"

# -u: só o NOME (arquivo vazio de mktemp não é um index válido pro git)
export GIT_INDEX_FILE="$(mktemp -u)"
trap 'rm -f "$GIT_INDEX_FILE"' EXIT

git --work-tree="$DIST" add -Af .
TREE=$(git write-tree)
COMMIT=$(GIT_AUTHOR_NAME="deploy" GIT_AUTHOR_EMAIL="deploy@pleitost" \
  GIT_COMMITTER_NAME="deploy" GIT_COMMITTER_EMAIL="deploy@pleitost" \
  git commit-tree "$TREE" -m "deploy: app/dist → GitHub Pages")
git push -f origin "$COMMIT:refs/heads/gh-pages"
echo "publicado: $COMMIT → gh-pages"

# Cada deploy é um commit órfão com o app/dist inteiro (vault incluso). O
# anterior sai do branch, mas o reflog do origin/gh-pages o segurava: 268
# deploys acumularam ~5 GB no .git local até 03/10/2026. O remoto já foi
# sobrescrito e o build é regenerável, então solta o histórico local já.
git reflog expire --expire=now --expire-unreachable=now refs/remotes/origin/gh-pages
git prune --expire=now
