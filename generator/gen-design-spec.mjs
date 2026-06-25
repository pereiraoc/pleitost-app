#!/usr/bin/env node
// Gerador re-executável do design-system das fichas do Pleitost.
//
// Lê a FONTE DE VERDADE do plugin Obsidian `pleitost-autosheet` (registries,
// model, mounts, docs) + os goldens (render real) e escreve um bundle JSON
// estruturado e LOSSLESS — pra alimentar claude design / Figma / o futuro app.
// Determinístico (chaves ordenadas, sem timestamp), re-executável a qualquer hora.
//
// Este motor VIVE no pleitost-app (fonte/referência da documentação de design),
// mas LÊ o código do plugin por caminho — então a vault precisa existir no disco.
//
// Uso:  npm run gen        (na raiz do pleitost-app)
// Config:
//   PLEITOST_PLUGIN_ROOT  → raiz do plugin (default: caminho da vault deste setup)
//   GEN_DESIGN_SPEC_OUT   → pasta de saída  (default: <repo>/design-system)

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { collectDesignSystem } from "./collect.mjs";
import { stableStringify } from "./build.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

// Fonte do plugin (lida por caminho). Override via env; default = setup atual.
const PLUGIN_ROOT = process.env.PLEITOST_PLUGIN_ROOT
  ? resolve(process.env.PLEITOST_PLUGIN_ROOT)
  : "/data/vaults/pleitost/.obsidian/plugins/pleitost-autosheet";
const VAULT_ROOT = resolve(PLUGIN_ROOT, "..", "..", ".."); // .../pleitost (vault)

const GOLDENS_DIR = resolve(REPO_ROOT, "reference", "goldens");
const DEFAULT_OUT = resolve(REPO_ROOT, "design-system");
const OUT_DIR = process.env.GEN_DESIGN_SPEC_OUT ? resolve(process.env.GEN_DESIGN_SPEC_OUT) : DEFAULT_OUT;

function gitCommit() {
  try {
    return execSync("git rev-parse HEAD", { cwd: PLUGIN_ROOT }).toString().trim();
  } catch {
    return "unknown";
  }
}

function count(obj) {
  return obj ? Object.keys(obj).length : 0;
}

function renderReadme(bundle) {
  const t = bundle.tokens ?? {};
  const diamonds = (bundle.interativa?.clusters ?? []).reduce((n, c) => n + (c.diamonds?.length ?? 0), 0);
  const gapKeys = bundle.$gaps ? Object.keys(bundle.$gaps) : [];
  return [
    "# Design System das Fichas — Pleitost",
    "",
    "Retrato estruturado e **lossless** do design atual das fichas, gerado a partir do",
    "código-fonte do plugin `pleitost-autosheet`. Feito pra alimentar geração de UI",
    "(claude design), recriação no Figma e o futuro app.",
    "",
    "> **Gerado automaticamente — não editar à mão.** Regenere com `npm run gen` na raiz",
    "> do pleitost-app (lê a fonte do plugin). Determinístico: mesma fonte → mesmo arquivo.",
    "",
    "## Arquivos",
    "- `design-system.json` — o bundle completo (índice abaixo).",
    "- `README.md` — este arquivo (também gerado).",
    "",
    "## Conteúdo do `design-system.json`",
    "",
    "Camada L1 — contrato estático do código:",
    "- `tokens` — emojis (" + count(t.emojis) + " namespaces), cores (" + count(t.colors) + " grupos), emojiCostExtra, tipografia.",
    "- `dataModel` — modelo interno (" + count(bundle.dataModel?.interfaces) + " interfaces, enums, jsdoc verbatim).",
    "- `modes` — Resumo/Leitura (seções ordenadas + hideWhenEmpty/noop) e Editável (abas por família).",
    "- `interativa` — grafo completo: " + (bundle.interativa?.clusters?.length ?? 0) + " clusters, " + diamonds + " diamantes, estados, clique→painel, pills EM, fórmula da Vida, abas v2 ocultas.",
    "- `components` — inventário (" + count(bundle.components?.groups) + " groups, " + count(bundle.components?.widgets) + " widgets): role, props, tokensUsed, iconSources (inline vs supercharged).",
    "- `tooltips` — templates breakdown + source (campos, componentes, gatilhos).",
    "- `grupo` / `combatTracker` — estrutura, tokens e iconSources desses modos.",
    "",
    "Camada L3 — ícones externos:",
    "- `icons.supercharged` — mapa data-link-* → ícone/cor injetado pelo supercharged-links, cruzado por uid com o registry (" + (bundle.icons?.supercharged?.entries?.length ?? 0) + " entries).",
    "",
    "Camada L2 — render real:",
    "- `goldens` — fatos destilados do DOM realmente renderizado das fixtures (emojis renderizados, roles ocultos).",
    "- `goldens.interactive` — estados pós-interação da Interativa: tooltips (texto real destilado, ex.: linhas do breakdown com valores) e painéis pós-clique por losango. DOM cru em `reference/goldens/` (estáticos) e `reference/goldens/interactive/` (interativos, referenciados por `artifact`).",
    "- `screens` — captura RICA por TELA da ficha VIVA (largura real do pane, ~" + (bundle.screens?.totals?.screens ?? 0) + " telas em " + (bundle.screens?.totals?.fixtures ?? 0) + " fixtures: Carlos real c/ retrato + goldens). Cada modo + cada aba da Editável + cada painel de losango da Interativa, com `landmarks` (rect [x,y,w,h] por região/card/painel) + refs pra screenshot/geometry/html/css completos em `reference/goldens/screens/` (gitignored, regenerável via `scripts/capture-screens.sh`).",
    "",
    "Narrativa:",
    "- `docs` — trechos verbatim da documentação, indexados por heading.",
    "",
    "## Transparência",
    "- `$sourceCommit` — commit do plugin (na vault) no momento da geração.",
    gapKeys.length
      ? "- `$gaps` — dados ausentes/incertos por seção (NUNCA chutados): " + gapKeys.join(", ") + "."
      : "- `$gaps` — vazio (nenhum dado faltante nesta geração).",
    "",
    "## Como regenerar",
    "1. (opcional, p/ L2) Com o Obsidian aberto, capture os estados interativos via CLI:",
    "   `obsidian open file=\"GOLDEN <X>\"` + `obsidian eval` com `require(generator/capture-interactive.cjs).captureCurrent(app,{slug,outDir})` apontando outDir pra `reference/goldens/interactive/`. (Goldens estáticos vêm do comando \"Capturar goldens\" do plugin.)",
    "2. `npm run gen` na raiz do pleitost-app.",
    "",
  ].join("\n");
}

function main() {
  if (!existsSync(PLUGIN_ROOT)) {
    console.error("ERRO: PLUGIN_ROOT não existe: " + PLUGIN_ROOT);
    console.error("Defina PLEITOST_PLUGIN_ROOT apontando pra raiz do plugin pleitost-autosheet.");
    process.exit(1);
  }

  const bundle = collectDesignSystem({
    pluginRoot: PLUGIN_ROOT,
    vaultRoot: VAULT_ROOT,
    goldensDir: GOLDENS_DIR,
    sourceCommit: gitCommit(),
  });

  mkdirSync(OUT_DIR, { recursive: true });
  const outFile = join(OUT_DIR, "design-system.json");
  writeFileSync(outFile, stableStringify(bundle), "utf8");
  writeFileSync(join(OUT_DIR, "README.md"), renderReadme(bundle), "utf8");

  const diamonds = (bundle.interativa?.clusters ?? []).reduce((n, c) => n + (c.diamonds?.length ?? 0), 0);
  const gapKeys = bundle.$gaps ? Object.keys(bundle.$gaps) : [];
  console.log("gen-design-spec: escrito " + outFile);
  console.log(
    "  tokens=" + count(bundle.tokens?.emojis) + "ns emoji / " + count(bundle.tokens?.colors) + " grupos cor" +
    " | dataModel=" + count(bundle.dataModel?.interfaces) + " interfaces" +
    " | modes ok" +
    " | interativa=" + (bundle.interativa?.clusters?.length ?? 0) + " clusters/" + diamonds + " diamantes" +
    " | components=" + (count(bundle.components?.groups) + count(bundle.components?.widgets)) +
    " | supercharged=" + (bundle.icons?.supercharged?.entries?.length ?? 0) + " entries" +
    " | docs=" + count(bundle.docs) +
    " | screens=" + (bundle.screens?.totals?.screens ?? 0) + "telas/" + (bundle.screens?.totals?.fixtures ?? 0) + "fix",
  );
  console.log(gapKeys.length ? "  $gaps: " + gapKeys.join(", ") : "  $gaps: (nenhum)");
}

main();
