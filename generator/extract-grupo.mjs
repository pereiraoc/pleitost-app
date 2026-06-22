// L-grupo · Ficha de grupo (block "autosheet-grupo").
//
// Lê a estrutura, tokens e fontes de ícone do modo grupo DIRETO da fonte —
// nada é inventado. Princípios:
//  - structure.sections: derivado das chamadas `appendSection(..., "<label>")`
//    no coordenador render-party-sheet.ts, EM ORDEM DE FONTE (a ordem em que
//    o usuário vê as seções). Cada seção carrega o arquivo que a constrói.
//  - tokensUsed.emojis: cada referência `EMOJI.<grupo>.<chave>` nos arquivos do
//    modo é RESOLVIDA contra a registry real (palette/emoji-registry via AST).
//    Toda chave não-encontrada vai pra `gaps` (nunca um chute).
//  - tokensUsed.colors: idem para `PALETTE.<grupo>.<chave>`.
//  - iconSources.inline: emojis HARDCODED em string-literais (não via registry).
//    grupo-tooltips-port.ts está no allowlist do lint e embute emojis literais
//    nos templates de tooltip — capturamos como tokens literais OBSERVADOS,
//    marcando em `notes` que NÃO vêm do registry (não forçamos pro registry).
//  - iconSources.supercharged: member-link.ts emite atributos Supercharged
//    Links (data-link-categoria/subcategoria/grupo) — detectado na fonte.
//  - descriptionRef: heading H1 verbatim do doc de arquitetura do modo.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

import { parseSourceFile, evalExportedConst, ts } from "./ast-helpers.mjs";

const MODE_DIR = "src/render/modes/grupo";
const EMOJI_REGISTRY = "src/shared/emoji-registry.ts";
const PALETTE_REGISTRY = "src/render/shared/palette-registry.ts";
const DOC = "docs/architecture/grupo.md";

// Arquivo allowlistado do lint que embute emojis literais nos templates de
// tooltip (declarado no próprio cabeçalho de grupo-tooltips-port.ts).
const INLINE_LITERAL_FILE = "grupo-tooltips-port.ts";

/**
 * @param {{ pluginRoot: string }} args
 * @returns {object} spec do bloco autosheet-grupo (JSON-serializável)
 */
export function extractGrupo({ pluginRoot }) {
  const modeDir = join(pluginRoot, MODE_DIR);
  const files = readdirSync(modeDir)
    .filter((f) => f.endsWith(".ts"))
    .sort();
  const gaps = [];

  // ── Registries (fonte de verdade) ─────────────────────────────────
  const EMOJI = evalExportedConst(join(pluginRoot, EMOJI_REGISTRY), "EMOJI");
  const PALETTE = evalExportedConst(join(pluginRoot, PALETTE_REGISTRY), "PALETTE");

  // ── structure.sections (ordem de fonte) ────────────────────────────
  const sections = extractGrupoSections(
    join(modeDir, "render-party-sheet.ts"),
    `${MODE_DIR}/render-party-sheet.ts`,
  );
  if (!sections.length) gaps.push("structure.sections: nenhuma seção encontrada em render-party-sheet.ts");

  // ── tokensUsed (referências de registry resolvidas) ────────────────
  const emojiRefs = new Set();
  const colorRefs = new Set();
  const inlineLiterals = new Set();
  const literalColors = new Set();
  let inlineFromFile = null;
  let supercharged = false;

  for (const f of files) {
    const abs = join(modeDir, f);
    const text = readFileSync(abs, "utf8");
    for (const ref of collectRegistryRefs(text, "EMOJI")) emojiRefs.add(ref);
    for (const ref of collectRegistryRefs(text, "PALETTE")) colorRefs.add(ref);
    // Supercharged Links: atributos data-link-* emitidos inline (member-link).
    if (/data-link-(categoria|subcategoria|grupo)/.test(text)) supercharged = true;
    // Emojis + cores literais inline — só do arquivo allowlistado (fonte declarada).
    if (f === INLINE_LITERAL_FILE) {
      inlineFromFile = `${MODE_DIR}/${f}`;
      for (const lit of collectStringLiteralEmojis(abs)) inlineLiterals.add(lit);
      for (const c of collectStringLiteralColors(abs)) literalColors.add(c);
    }
  }

  const emojis = resolveRefs(emojiRefs, EMOJI, "emojis", gaps);
  const colorsResolved = resolveRefs(colorRefs, PALETTE, "colors", gaps);
  // União: cores do registry (resolvidas) + cores literais OBSERVADAS no
  // arquivo allowlistado (ex.: #ca8a04). Toda cor vem da fonte — nada inventado.
  const colorValues = new Set(colorsResolved.map((c) => c.value));
  for (const c of literalColors) colorValues.add(c);

  // ── descriptionRef ─────────────────────────────────────────────────
  const descriptionRef = readDocHeading(join(pluginRoot, DOC));
  if (descriptionRef == null) gaps.push(`descriptionRef: H1 não encontrado em ${DOC}`);

  const notes =
    `Emojis/cores de tokensUsed vêm 100% das registries (EMOJI/PALETTE) resolvidos via AST. ` +
    `iconSources.inline são emojis HARDCODED em string-literais de ${INLINE_LITERAL_FILE} ` +
    `(arquivo no allowlist do lint-no-literals): tokens literais OBSERVADOS, NÃO do registry. ` +
    `Inclui também a cor literal #ca8a04 (label "Linha Grupo"/"Grupo"), idem fora do registry.`;

  return {
    block: "autosheet-grupo",
    structure: { sections },
    tokensUsed: {
      emojis: emojis.map((e) => e.value),
      colors: [...colorValues].sort(),
    },
    iconSources: {
      inline: [...inlineLiterals].sort(),
      supercharged,
    },
    descriptionRef,
    // Anexos auditáveis (não invalidam o contrato; ajudam consumidores/teste).
    _refs: {
      emojiPaths: emojis.map((e) => e.path).sort(),
      colorPaths: colorsResolved.map((c) => c.path).sort(),
      literalColors: [...literalColors].sort(),
      inlineFromFile,
    },
    notes,
    gaps,
  };
}

// ── Seções: parse das chamadas appendSection(body, tip, fill, "<label>") ──
//
// O coordenador chama `appendSection(body, T.tooltip…(), (sec) => {…}, "Label")`
// uma vez por seção, em ordem. O 4º argumento (string literal) é o nome da
// seção exibido. Capturamos na ORDEM EXATA de fonte. Header/avatar/título e a
// mensagem de "grupo vazio" não são `appendSection` — não entram como seções.
function extractGrupoSections(absFile, relFile) {
  const sf = parseSourceFile(absFile);
  const out = [];
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "appendSection"
    ) {
      // último argumento string-literal = label da seção
      const label = node.arguments
        .filter((a) => ts.isStringLiteralLike(a))
        .map((a) => a.text)
        .pop();
      if (label != null) out.push({ name: label, file: relFile });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

// ── Coleta de referências `IDENT.grupo.chave` no texto ─────────────────
// Captura paths como EMOJI.glyph.GoldCoin / PALETTE.partyRoles.Lider.
// (Texto-level: pega refs em qualquer arquivo do modo, inclusive os que
//  re-exportam via PB = PALETTE.partyBountyRank — esses viram refs do alias,
//  resolvidos abaixo só quando batem grupo.chave reais da registry.)
function collectRegistryRefs(text, ident) {
  const re = new RegExp(`\\b${ident}\\.([A-Za-z_$][\\w$]*)\\.([A-Za-z_$][\\w$]*)`, "g");
  const refs = [];
  let m;
  while ((m = re.exec(text)) !== null) refs.push(`${m[1]}.${m[2]}`);
  return refs;
}

// ── Resolve cada path contra a registry; gap se faltar (nunca inventa) ──
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
    if (seenValues.has(value)) continue; // dedup por valor (muitos paths → mesmo char)
    seenValues.add(value);
    out.push({ path, value });
  }
  return out;
}

// ── Emojis literais em STRING-LITERAIS (exclui comentários por construção) ──
// Caminha a AST e extrai grapheme-clusters de emoji só de nós string/template.
// Comentários não são nós de string-literal → ficam de fora automaticamente.
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

// Cores literais (#hex / rgb[a]()) em STRING-LITERAIS (exclui comentários).
// Mesmo walk de collectStringLiteralEmojis — só nós de string/template entram.
function collectStringLiteralColors(absFile) {
  const sf = parseSourceFile(absFile);
  const found = new Set();
  const harvest = (raw) => {
    for (const c of colorLiterals(raw)) found.add(c);
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

const COLOR_LITERAL_RE = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g;

function colorLiterals(s) {
  const out = [];
  let m;
  COLOR_LITERAL_RE.lastIndex = 0;
  while ((m = COLOR_LITERAL_RE.exec(s)) !== null) out.push(m[0]);
  return out;
}

// Grapheme-clusters "emoji-ish": base pictográfica + VS16 opcional + keycap
// opcional. Cobre os ranges usados nos templates da ficha (setas, ●/△, custos).
const EMOJI_CLUSTER_RE =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}\u{25A0}-\u{25FF}\u{2900}-\u{297F}\u{2696}\u{2764}\u{26A1}\u{2728}\u{2604}\u{2692}\u{2694}\u{2716}](?:\u{FE0F})?(?:\u{20E3})?/gu;

function emojiClusters(s) {
  const out = [];
  let m;
  EMOJI_CLUSTER_RE.lastIndex = 0;
  while ((m = EMOJI_CLUSTER_RE.exec(s)) !== null) out.push(m[0]);
  return out;
}

// ── Heading H1 verbatim do doc (sem o "# ") ────────────────────────────
function readDocHeading(absDoc) {
  if (!existsSync(absDoc)) return null;
  const text = readFileSync(absDoc, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^#\s+(.+?)\s*$/);
    if (m) return m[1];
  }
  return null;
}
