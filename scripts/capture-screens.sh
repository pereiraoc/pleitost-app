#!/usr/bin/env bash
# Orquestra a captura RICA por tela (generator/capture-screens.cjs) dirigindo o
# Obsidian VIVO via CLI, uma fixture por vez (cada nota precisa estar ativa).
#
# Por que "staging" em $HOME: o Obsidian roda em flatpak e o sandbox de
# filesystem só enxerga `home` e `/data/vaults` — NÃO `/data/projects`. Então o
# renderer não consegue `require` o capturer nem escrever artefatos direto no
# repo. Solução: copiamos o capturer pra ~/.pleitost-capture (home, visível ao
# sandbox), capturamos lá, e sincronizamos os bundles de volta pro repo.
#
# Uso:
#   scripts/capture-screens.sh                 # todas as fixtures
#   scripts/capture-screens.sh carlos          # só uma (por slug)
#
# Requer: Obsidian aberto; binário CLI em ~/.local/bin/obsidian; o
# XDG_RUNTIME_DIR do flatpak (ver reference/obsidian-cli na memória).
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAGING="$HOME/.pleitost-capture"
OUT="$STAGING/out"
OBS="$HOME/.local/bin/obsidian"
# Forçado (não `:-`): o shell pai costuma ter XDG_RUNTIME_DIR=/run/user/UID sem o
# sufixo flatpak, e aí o CLI não acha o socket do Obsidian.
export XDG_RUNTIME_DIR="/run/user/$(id -u)/.flatpak/md.obsidian.Obsidian/xdg-run"

# Fixtures: slug  →  nome p/ `obsidian open file=` (basename estilo wikilink).
# Espelha src/capture/fixtures.ts do plugin + Carlos (personagem real c/ imagem).
declare -A FIXTURES=(
  [carlos]="Carlos Facão de Andradas"
  [golden-bardo]="GOLDEN Bardo"
  [golden-goblin]="GOLDEN Goblin"
  [golden-canino]="GOLDEN Canino"
  [golden-frankenstein]="GOLDEN Frankenstein"
)
ORDER=(carlos golden-bardo golden-goblin golden-canino golden-frankenstein)

FILTER="${1:-}"

mkdir -p "$STAGING" "$OUT"
cp "$REPO/generator/capture-screens.cjs" "$STAGING/capture-screens.cjs"

run_one() {
  local slug="$1" name="$2"
  echo "──────────── $slug ($name) ────────────"
  "$OBS" open file="$name" >/dev/null 2>&1 || { echo "  ⚠ open falhou"; return 1; }
  sleep 3
  local code
  code=$(cat <<JS
(async()=>{const P="$STAGING/capture-screens.cjs";delete require.cache[require.resolve(P)];const remote=require("@electron/remote");return await require(P).captureCurrent(app,{slug:"$slug",outDir:"$OUT",remote})})()
JS
)
  "$OBS" eval code="$code" 2>&1 | tail -6
}

for slug in "${ORDER[@]}"; do
  [[ -n "$FILTER" && "$slug" != "$FILTER" ]] && continue
  run_one "$slug" "${FIXTURES[$slug]}" || echo "  ⚠ $slug falhou"
done

# Sincroniza bundles → repo (PNG + geometry/css/html + manifest por slug).
DEST="$REPO/reference/goldens/screens"
mkdir -p "$DEST"
if [[ -n "$FILTER" ]]; then
  rsync -a --delete "$OUT/$FILTER/" "$DEST/$FILTER/"
else
  rsync -a --delete "$OUT/" "$DEST/"
fi
echo "✓ sincronizado → $DEST"
ls -1 "$DEST"
