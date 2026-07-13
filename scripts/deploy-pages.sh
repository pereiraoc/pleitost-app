#!/usr/bin/env bash
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
[ -f "$DIST/index.html" ] || { echo "erro: $DIST não tem build (rode npm run build)"; exit 1; }

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
