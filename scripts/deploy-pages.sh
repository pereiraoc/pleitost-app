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
# TRAVA DO DATASET (report 2026-09-12: "tudo reskinado pra fantasia" + banner
# "dataset do mundo ainda não publicado"): `npm run extract` APAGA a pasta
# antes de reescrever — um build feito nessa janela sai sem o dataset e o
# deploy publicava o site sem o mundo, calado. Aqui ele para.
for D in vault-data vault-data-cyberpunk; do
  IDX="$DIST/$D/index.json"
  [ -s "$IDX" ] || { echo "erro: $IDX faltando — rode o extract e o build de novo (o extract apaga a pasta antes de reescrever)"; exit 1; }
  N=$(node -e "const fs=require('fs');const m=JSON.parse(fs.readFileSync('$IDX','utf8'));process.stdout.write(String((m.docs||[]).length))")
  [ "$N" -gt 0 ] || { echo "erro: $D publicaria com 0 docs"; exit 1; }
  echo "dataset ok: $D ($N docs)"
done

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
