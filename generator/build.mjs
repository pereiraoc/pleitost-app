// Assembleia PURA do design-system (sem IO) + serialização determinística.
// Separar a montagem do IO deixa o objeto testável por snapshot sem tocar disco.

/**
 * Monta o objeto final do design-system a partir das saídas dos extratores.
 * Campos opcionais permitem crescer incrementalmente. A ordem das chaves não
 * importa: stableStringify ordena tudo.
 */
export function assembleDesignSystem(parts) {
  const {
    sourceCommit = "unknown",
    tokens,
    dataModel,
    modes,
    interativa,
    components,
    tooltips,
    grupo,
    combatTracker,
    icons,
    docs,
    goldens,
    screens,
    gaps,
  } = parts;

  const bundle = {
    $schema: "pleitost-autosheet/design-system@1",
    $generatedBy: "scripts/gen-design-spec.mjs",
    $sourceCommit: sourceCommit,
  };
  if (gaps && Object.keys(gaps).length) bundle.$gaps = gaps;
  if (tokens) bundle.tokens = tokens;
  if (dataModel) bundle.dataModel = dataModel;
  if (modes) bundle.modes = modes;
  if (interativa) bundle.interativa = interativa;
  if (components) bundle.components = components;
  if (tooltips) bundle.tooltips = tooltips;
  if (grupo) bundle.grupo = grupo;
  if (combatTracker) bundle.combatTracker = combatTracker;
  if (icons) bundle.icons = icons;
  if (docs) bundle.docs = docs;
  if (goldens) bundle.goldens = goldens;
  if (screens) bundle.screens = screens;
  return bundle;
}

/**
 * Stringify determinístico: ordena chaves de objeto recursivamente (mapas viram
 * estáveis); arrays preservam ordem (sequências como seções/abas/diamantes são
 * arrays). Garante diffs limpos entre re-execuções idênticas.
 */
export function stableStringify(value, indent = 2) {
  return JSON.stringify(sortKeys(value), null, indent) + "\n";
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = sortKeys(value[key]);
    return out;
  }
  return value;
}
