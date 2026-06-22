// L1 · tokens — lê os tokens visuais LOSSLESS direto das registries (fonte de
// verdade). emojis/emojiCostExtra/colors vêm 100% das registries via AST; nada
// é inventado. `typography` (sem registry própria) é preenchida pelo fold-docs
// (verbatim do modes.md) e fundida em tokens no collect.mjs, marcada com $source.
// NÃO há tokens de spacing/radii: não existe registry nem harvest pra eles hoje
// (os valores vivem como literais no styles.css) — ficam de fora até haver fonte.

import { evalExportedConst } from "./ast-helpers.mjs";

/**
 * @param {{ emojiRegistryPath: string, paletteRegistryPath: string }} paths
 * @returns {{ emojis: object, emojiCostExtra: object, colors: object }}
 */
export function extractTokens({ emojiRegistryPath, paletteRegistryPath }) {
  const emojis = evalExportedConst(emojiRegistryPath, "EMOJI");
  const emojiCostExtra = evalExportedConst(emojiRegistryPath, "CUSTO_EXTRA");
  const colors = evalExportedConst(paletteRegistryPath, "PALETTE");
  return { emojis, emojiCostExtra, colors };
}
