// L-combat-tracker · Combat Tracker (block "combat-tracker").
//
// Lê estrutura, tokens e fontes de ícone do modo combat-tracker DIRETO da
// fonte. Princípios (iguais aos demais extratores):
//  - structure.sections: derivado da sequência de render do `render()` em
//    mount-tracker.ts, EM ORDEM DE FONTE — o card "Adicionar combatentes"
//    (renderAddCombatantsCard) e as duas seções de tabela (renderTableSection
//    com título "Combate" / "Aguardando"). Cada nome é um STRING-LITERAL real
//    da fonte (sectiontitle do componente ou o argumento de título); nada
//    inventado. O flash de status não é seção nomeada → fora.
//  - tokensUsed.emojis: cada `EMOJI.<grupo>.<chave>` referenciado nos arquivos
//    do modo, RESOLVIDO contra a registry real (emoji-registry via AST). Chave
//    ausente → gaps.
//  - tokensUsed.colors: idem para `PALETTE.<grupo>.<chave>`. O combat-tracker
//    NÃO embute cores literais (usa classes CSS) — esperado vazio.
//  - iconSources.inline: vazio. Os emojis do tracker vêm 100% do registry; os
//    chars crus que aparecem na fonte estão só em COMENTÁRIOS (excluídos por
//    construção pelo walk de string-literais).
//  - iconSources.supercharged: `deps.decorateLink` decora <a> pro Supercharged
//    Links (tracker-types.ts) e é chamado em add-combatants-card/combat-row.
//  - descriptionRef: heading H1 verbatim do doc de arquitetura do modo.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

import { parseSourceFile, evalExportedConst, ts } from "./ast-helpers.mjs";

const MODE_DIR = "src/render/modes/combat-tracker";
const EMOJI_REGISTRY = "src/shared/emoji-registry.ts";
const PALETTE_REGISTRY = "src/render/shared/palette-registry.ts";
const DOC = "docs/architecture/combat-tracker.md";

/**
 * @param {{ pluginRoot: string }} args
 * @returns {object} spec do bloco combat-tracker (JSON-serializável)
 */
export function extractCombatTracker({ pluginRoot }) {
  const modeDir = join(pluginRoot, MODE_DIR);
  // Inclui o subdir components/ (table-section, action-bar, combat-row, etc.).
  const files = listTsFiles(modeDir);
  const gaps = [];

  // ── Registries (fonte de verdade) ─────────────────────────────────
  const EMOJI = evalExportedConst(join(pluginRoot, EMOJI_REGISTRY), "EMOJI");
  const PALETTE = evalExportedConst(join(pluginRoot, PALETTE_REGISTRY), "PALETTE");

  // ── structure.sections (ordem de fonte) ────────────────────────────
  const sections = extractTrackerSections(pluginRoot, modeDir, gaps);
  if (!sections.length) gaps.push("structure.sections: nenhuma seção encontrada em mount-tracker.ts");

  // ── tokensUsed (referências de registry resolvidas) ────────────────
  const emojiRefs = new Set();
  const colorRefs = new Set();
  const inlineLiterals = new Set();
  let supercharged = false;

  for (const rel of files) {
    const abs = join(pluginRoot, rel);
    const text = readFileSync(abs, "utf8");
    for (const ref of collectRegistryRefs(text, "EMOJI")) emojiRefs.add(ref);
    for (const ref of collectRegistryRefs(text, "PALETTE")) colorRefs.add(ref);
    // Supercharged Links: o tracker decora <a> via deps.decorateLink.
    if (/\bdecorateLink\b/.test(text)) supercharged = true;
    // Emojis literais inline (string-literais reais, comentários excluídos).
    // Esperado vazio — registramos se houver, pra nunca esconder um literal.
    for (const lit of collectStringLiteralEmojis(abs)) inlineLiterals.add(lit);
  }

  const emojis = resolveRefs(emojiRefs, EMOJI, "emojis", gaps);
  const colors = resolveRefs(colorRefs, PALETTE, "colors", gaps);

  // ── descriptionRef ─────────────────────────────────────────────────
  const descriptionRef = readDocHeading(join(pluginRoot, DOC));
  if (descriptionRef == null) gaps.push(`descriptionRef: H1 não encontrado em ${DOC}`);

  const notes =
    `tokensUsed.emojis vêm 100% do registry EMOJI (resolvidos via AST); ` +
    `tokensUsed.colors via PALETTE — o tracker não embute cores literais (usa classes CSS). ` +
    `iconSources.inline é derivado de string-literais reais (comentários excluídos); ` +
    `esperado vazio pois todo ícone passa pelo registry.`;

  return {
    block: "combat-tracker",
    structure: { sections },
    tokensUsed: {
      emojis: emojis.map((e) => e.value),
      colors: colors.map((c) => c.value),
    },
    iconSources: {
      inline: [...inlineLiterals].sort(),
      supercharged,
    },
    descriptionRef,
    // Anexos auditáveis (não invalidam o contrato).
    _refs: {
      emojiPaths: emojis.map((e) => e.path).sort(),
      colorPaths: colors.map((c) => c.path).sort(),
    },
    notes,
    gaps,
  };
}

// ── Seções: derivadas da sequência de render() em mount-tracker.ts ──────
//
// render() chama (nesta ordem):
//   1. renderAddCombatantsCard(...)  — sob `if (!options.compact)`
//   2. renderTableSection(root, "Combate", ...)
//   3. renderTableSection(root, "Aguardando", ...)
// O nome de cada seção é um STRING-LITERAL real: pro card, o sectiontitle do
// componente; pras tabelas, o 2º argumento (título). Capturamos na ordem de
// fonte. (Flash de status não tem nome → não é seção.)
function extractTrackerSections(pluginRoot, modeDir, gaps) {
  const mountRel = `${MODE_DIR}/mount-tracker.ts`;
  const sf = parseSourceFile(join(pluginRoot, "src/render/modes/combat-tracker/mount-tracker.ts"));
  const out = [];

  // Resolve o sectiontitle literal do card "Adicionar combatentes".
  const addCardRel = `${MODE_DIR}/components/add-combatants-card.ts`;
  const addCardTitle = firstSectionTitleLiteral(join(modeDir, "components/add-combatants-card.ts"));

  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const fn = node.expression.text;
      if (fn === "renderAddCombatantsCard") {
        if (addCardTitle != null) {
          out.push({ name: addCardTitle, file: addCardRel });
        } else {
          gaps.push("structure.sections: sectiontitle do card de adicionar não encontrado");
        }
      } else if (fn === "renderTableSection") {
        // 2º argumento (índice 1) = título da seção (string-literal).
        const titleArg = node.arguments[1];
        if (titleArg && ts.isStringLiteralLike(titleArg)) {
          out.push({ name: titleArg.text, file: `${MODE_DIR}/components/table-section.ts` });
        } else {
          gaps.push("structure.sections: título de renderTableSection não é literal");
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  void mountRel;
  return out;
}

// Primeiro `h("div", { cls: "gm-enc-sectiontitle", text: "<X>", ... })` do
// componente — devolve o literal de `text`. Fonte do nome do card.
function firstSectionTitleLiteral(absFile) {
  const sf = parseSourceFile(absFile);
  let result = null;
  const visit = (node) => {
    if (result != null) return;
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "h") {
      const opts = node.arguments[1];
      if (opts && ts.isObjectLiteralExpression(opts)) {
        let cls = null;
        let text = null;
        for (const prop of opts.properties) {
          if (!ts.isPropertyAssignment(prop)) continue;
          const key = prop.name && ts.isIdentifier(prop.name) ? prop.name.text : null;
          if (key === "cls" && ts.isStringLiteralLike(prop.initializer)) cls = prop.initializer.text;
          if (key === "text" && ts.isStringLiteralLike(prop.initializer)) text = prop.initializer.text;
        }
        if (cls === "gm-enc-sectiontitle" && text != null) {
          result = text;
          return;
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return result;
}

// ── helpers compartilhados (mesma semântica do extract-grupo) ──────────

function listTsFiles(modeDir) {
  const out = [];
  const walk = (absDir, relPrefix) => {
    for (const entry of readdirSync(absDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const abs = join(absDir, entry.name);
      const rel = `${relPrefix}/${entry.name}`;
      if (entry.isDirectory()) walk(abs, rel);
      else if (entry.name.endsWith(".ts")) out.push(rel);
    }
  };
  walk(modeDir, MODE_DIR);
  return out;
}

function collectRegistryRefs(text, ident) {
  const re = new RegExp(`\\b${ident}\\.([A-Za-z_$][\\w$]*)\\.([A-Za-z_$][\\w$]*)`, "g");
  const refs = [];
  let m;
  while ((m = re.exec(text)) !== null) refs.push(`${m[1]}.${m[2]}`);
  return refs;
}

function resolveRefs(refSet, registry, kind, gaps) {
  const out = [];
  const seenValues = new Set();
  for (const path of [...refSet].sort()) {
    const [group, key] = path.split(".");
    const value = registry?.[group]?.[key];
    if (value == null) {
      gaps.push(`tokensUsed.${kind}: "${path}" não existe na registry`);
      continue;
    }
    if (seenValues.has(value)) continue;
    seenValues.add(value);
    out.push({ path, value });
  }
  return out;
}

function collectStringLiteralEmojis(absFile) {
  const sf = parseSourceFile(absFile);
  const found = new Set();
  const harvest = (raw) => {
    for (const e of emojiClusters(raw)) found.add(e);
  };
  const visit = (node) => {
    if (ts.isStringLiteralLike(node)) {
      harvest(node.text);
    } else if (ts.isTemplateExpression(node)) {
      harvest(node.head.text);
      for (const span of node.templateSpans) harvest(span.literal.text);
    } else if (ts.isNoSubstitutionTemplateLiteral(node)) {
      harvest(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

const EMOJI_CLUSTER_RE =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}\u{25A0}-\u{25FF}\u{2900}-\u{297F}\u{2696}\u{2764}\u{26A1}\u{2728}\u{2604}\u{2692}\u{2694}\u{2716}](?:\u{FE0F})?(?:\u{20E3})?/gu;

function emojiClusters(s) {
  const out = [];
  let m;
  EMOJI_CLUSTER_RE.lastIndex = 0;
  while ((m = EMOJI_CLUSTER_RE.exec(s)) !== null) out.push(m[0]);
  return out;
}

function readDocHeading(absDoc) {
  if (!existsSync(absDoc)) return null;
  const text = readFileSync(absDoc, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^#\s+(.+?)\s*$/);
    if (m) return m[1];
  }
  return null;
}
