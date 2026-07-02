#!/usr/bin/env bash
# Captura o golden da FICHA DE GRUPO (generator/capture-grupo.cjs) dirigindo o
# Obsidian VIVO via CLI. Mesmo staging de capture-screens.sh: o flatpak só
# enxerga `home` e `/data/vaults`, então copiamos o capturer pra
# ~/.pleitost-capture, capturamos lá e sincronizamos de volta pro repo.
#
# Fixture: nota REAL do grupo ativo da mesa (não é cópia congelada — recapturar
# quando a composição/nível do grupo mudar e quiser goldens frescos).
#
# Uso:
#   scripts/capture-grupo.sh
#
# Requer: Obsidian aberto; binário CLI em ~/.local/bin/obsidian.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAGING="$HOME/.pleitost-capture"
OUT="$STAGING/out-grupo"
OBS="$HOME/.local/bin/obsidian"
export XDG_RUNTIME_DIR="/run/user/$(id -u)/.flatpak/md.obsidian.Obsidian/xdg-run"

SLUG="golden-grupo"
NOTE="Carlos, Dante, Mera, Pind, Thoren"

mkdir -p "$STAGING" "$OUT"
cp "$REPO/generator/capture-grupo.cjs" "$STAGING/capture-grupo.cjs"

echo "──────────── $SLUG ($NOTE) ────────────"
"$OBS" open file="$NOTE" >/dev/null 2>&1 || { echo "⚠ open falhou"; exit 1; }
sleep 4
CODE=$(cat <<JS
(async()=>{const P="$STAGING/capture-grupo.cjs";delete require.cache[require.resolve(P)];return await require(P).captureCurrent(app,{slug:"$SLUG",outDir:"$OUT"})})()
JS
)
"$OBS" eval code="$CODE"

# Sincroniza artefatos → repo (estáticos na raiz dos goldens; interativo no
# subdir interactive/ — mesmo layout dos goldens das fichas individuais).
DEST="$REPO/reference/goldens"
mkdir -p "$DEST/interactive"
cp "$OUT/${SLUG}__grupo.dom.html" "$OUT/${SLUG}__grupo.css.json" "$OUT/${SLUG}__grupo.tree.json" "$DEST/"
cp "$OUT/interactive/${SLUG}__grupo.interactive.json" "$DEST/interactive/"
echo "✓ sincronizado → $DEST"
ls -1 "$DEST" | grep grupo
