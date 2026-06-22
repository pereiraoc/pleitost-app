// Orquestração PURA (sem git/write): chama todos os extratores com os caminhos
// reais, agrega gaps, e monta o bundle. Recebe pluginRoot + vaultRoot pra ser
// chamável tanto pelo CLI quanto pelos testes (sem IO de escrita).

import { join } from "node:path";

import { evalExportedConst } from "./ast-helpers.mjs";
import { assembleDesignSystem } from "./build.mjs";
import { extractTokens } from "./extract-tokens.mjs";
import { extractDataModel } from "./extract-data-model.mjs";
import { extractModes } from "./extract-modes.mjs";
import { extractComponents } from "./extract-components.mjs";
import { extractInterativa } from "./extract-interativa.mjs";
import { extractTooltips } from "./extract-tooltips.mjs";
import { parseSupercharged } from "./parse-supercharged.mjs";
import { foldDocs } from "./fold-docs.mjs";
import { extractGrupo } from "./extract-grupo.mjs";
import { extractCombatTracker } from "./extract-combat-tracker.mjs";
import { ingestGoldens } from "./ingest-goldens.mjs";

export function collectDesignSystem({ pluginRoot, vaultRoot, goldensDir, sourceCommit = "unknown" }) {
  const SRC = (p) => join(pluginRoot, "src", p);
  const DOC_DIR = join(vaultRoot, "Recursos e Mídia", "Documentação Adicional", "Autosheet Plugin");

  const emojiRegistryPath = SRC("shared/emoji-registry.ts");
  const paletteRegistryPath = SRC("render/shared/palette-registry.ts");

  // L1 — contrato estático do código.
  const tokens = extractTokens({ emojiRegistryPath, paletteRegistryPath });
  const dataModel = extractDataModel({
    modelPath: SRC("types/model.ts"),
    familyPath: SRC("types/family.ts"),
    interativaStatePath: SRC("types/interativa-state.ts"),
    dataModelDocPath: join(pluginRoot, "docs", "architecture", "data-model.md"),
  });
  const modes = extractModes({ pluginRoot });
  const components = extractComponents({ pluginRoot });
  const interativa = extractInterativa({ pluginRoot });
  const tooltips = extractTooltips({ pluginRoot });
  const grupo = extractGrupo({ pluginRoot });
  const combatTracker = extractCombatTracker({ pluginRoot });

  // L3 — ícones supercharged (externos), cruzados por uid com o registry.
  const supercharged = parseSupercharged({
    cssPath: join(vaultRoot, ".obsidian", "snippets", "supercharged-links-gen.css"),
    emojiRegistryPath,
  });

  // Docs narrativos verbatim + tipografia (que entra em tokens).
  const folded = foldDocs({
    docPaths: [
      { key: "modes", path: join(pluginRoot, "docs", "architecture", "modes.md") },
      { key: "pipeline", path: join(pluginRoot, "docs", "architecture", "pipeline.md") },
      { key: "painel-detalhes", path: join(pluginRoot, "docs", "architecture", "painel-detalhes.md") },
      { key: "modos-doc", path: join(DOC_DIR, "Modos.md") },
      { key: "frontmatter", path: join(DOC_DIR, "Frontmatter.md") },
      { key: "elementos-regra", path: join(DOC_DIR, "Elementos de Regra.md") },
      { key: "efeitos-interativos", path: join(DOC_DIR, "Efeitos Interativos.md") },
      { key: "ficha-grupo", path: join(DOC_DIR, "Ficha de Grupo.md") },
      { key: "combat-tracker", path: join(DOC_DIR, "Combat Tracker.md") },
      { key: "como-funciona", path: join(DOC_DIR, "Como Funciona.md") },
    ],
  });
  if (folded.typography) tokens.typography = folded.typography;

  // L2 — golden de render real (DOM serializado das fixtures).
  const fixtures = evalExportedConst(SRC("capture/fixtures.ts"), "FIXTURES");
  const goldens = ingestGoldens({
    capturesDir: goldensDir ?? join(pluginRoot, "tests", "visual-capture", "captures"),
    fixtures,
  });

  // Agrega gaps de cada extrator num único $gaps (transparência — sem buracos
  // silenciosos). Remove o `gaps` de dentro de cada seção pra não duplicar.
  const gaps = {};
  const take = (key, node) => {
    if (node && Array.isArray(node.gaps)) {
      if (node.gaps.length) gaps[key] = node.gaps;
      delete node.gaps;
    }
  };
  take("dataModel", dataModel);
  take("modes", modes);
  take("components", components);
  take("interativa", interativa);
  take("tooltips", tooltips);
  take("supercharged", supercharged);
  take("docs", folded);
  take("grupo", grupo);
  take("combatTracker", combatTracker);
  take("goldens", goldens);

  return assembleDesignSystem({
    sourceCommit,
    tokens,
    dataModel,
    modes,
    interativa,
    components,
    tooltips,
    grupo,
    combatTracker,
    icons: { supercharged },
    docs: folded.docs,
    goldens,
    gaps,
  });
}
