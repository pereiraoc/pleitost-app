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

  // ── tooltips (L1: mecanismo lossless de tooltip-bind.ts) ───────────
  const tooltips = extractGrupoTooltips(modeDir, PALETTE, gaps);

  const notes =
    `Emojis/cores de tokensUsed vêm 100% das registries (EMOJI/PALETTE) resolvidos via AST. ` +
    `iconSources.inline são emojis HARDCODED em string-literais de ${INLINE_LITERAL_FILE} ` +
    `(arquivo no allowlist do lint-no-literals): tokens literais OBSERVADOS, NÃO do registry. ` +
    `Inclui também a cor literal #ca8a04 (label "Linha Grupo"/"Grupo"), idem fora do registry.`;

  return {
    block: "autosheet-grupo",
    structure: { sections },
    tooltips,
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

// ── Tooltips da ficha de grupo (tooltip-bind.ts + grupo-tooltips-port.ts) ──
//
// L1 lossless do MECANISMO: ids/z-index/larguras/estilos/seletores/eventos vêm
// do AST de tooltip-bind.ts; templates são os exports reais de
// grupo-tooltips-port.ts. O CONTEÚDO real exibido vive nos goldens
// (data-tooltip-html no estático; amostras hoveradas no interativo — ver
// goldens.interactive.golden-grupo.tooltipFidelity).

/** Consts top-level string/number do arquivo, por nome. */
function topLevelLiteralConsts(sourceFile) {
  const out = {};
  for (const stmt of sourceFile.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;
      if (ts.isStringLiteral(decl.initializer) || ts.isNoSubstitutionTemplateLiteral(decl.initializer)) {
        out[decl.name.text] = decl.initializer.text;
      } else if (ts.isNumericLiteral(decl.initializer)) {
        out[decl.name.text] = Number(decl.initializer.text);
      }
    }
  }
  return out;
}

/** Acha o initializer (ObjectLiteral) de uma const top-level por nome. */
function topLevelInitializer(sourceFile, name) {
  for (const stmt of sourceFile.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (ts.isIdentifier(decl.name) && decl.name.text === name) {
        // `as const` embrulha em AsExpression — desce pro literal real.
        let init = decl.initializer;
        while (init && ts.isAsExpression(init)) init = init.expression;
        return init ?? null;
      }
    }
  }
  return null;
}

/** Texto de um PropertyAccess encadeado (PALETTE.shadow.Tooltip → path array). */
function propertyAccessPath(node) {
  const parts = [];
  let cur = node;
  while (ts.isPropertyAccessExpression(cur)) {
    parts.unshift(cur.name.text);
    cur = cur.expression;
  }
  if (ts.isIdentifier(cur)) parts.unshift(cur.text);
  return parts;
}

function walkNode(node, visit) {
  visit(node);
  node.forEachChild((c) => walkNode(c, visit));
}

function extractGrupoTooltips(modeDir, PALETTE, gaps) {
  const bindFile = "tooltip-bind.ts";
  const portFile = "grupo-tooltips-port.ts";
  const sf = parseSourceFile(join(modeDir, bindFile));
  const consts = topLevelLiteralConsts(sf);

  // ── PARTY_TIP_BASE_STYLES: props literais + refs PALETTE resolvidas ──
  const baseStyles = {};
  const baseStyleTokens = {};
  const stylesInit = topLevelInitializer(sf, "PARTY_TIP_BASE_STYLES");
  if (stylesInit && ts.isObjectLiteralExpression(stylesInit)) {
    for (const prop of stylesInit.properties) {
      if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) continue;
      const key = prop.name.text;
      const init = prop.initializer;
      if (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init)) {
        baseStyles[key] = init.text;
      } else if (ts.isPropertyAccessExpression(init)) {
        const path = propertyAccessPath(init);
        baseStyleTokens[key] = path.join(".");
        if (path[0] === "PALETTE") {
          let v = PALETTE;
          for (const seg of path.slice(1)) v = v?.[seg];
          if (typeof v === "string") baseStyles[key] = v;
          else gaps.push(`tooltips: ${path.join(".")} não resolve no registry PALETTE`);
        }
      }
    }
  } else {
    gaps.push(`tooltips: PARTY_TIP_BASE_STYLES não encontrado em ${bindFile}`);
  }

  // ── Configs dos 2 singletons (createFloatingTooltip calls) ──
  const singletons = {};
  walkNode(sf, (node) => {
    if (!ts.isCallExpression(node)) return;
    if (!ts.isIdentifier(node.expression) || node.expression.text !== "createFloatingTooltip") return;
    const arg = node.arguments[0];
    if (!arg || !ts.isObjectLiteralExpression(arg)) return;
    const cfg = {};
    for (const prop of arg.properties) {
      if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) continue;
      const key = prop.name.text;
      const init = prop.initializer;
      if (ts.isStringLiteral(init)) cfg[key] = init.text;
      else if (ts.isNumericLiteral(init)) cfg[key] = Number(init.text);
      else if (init.kind === ts.SyntaxKind.TrueKeyword) cfg[key] = true;
      else if (init.kind === ts.SyntaxKind.FalseKeyword) cfg[key] = false;
      else if (ts.isIdentifier(init)) {
        // Refs a consts do arquivo: ids resolvem pro valor; estilos viram marker.
        cfg[key] = init.text in consts ? consts[init.text] : `@${init.text}`;
      }
    }
    if (cfg.id) singletons[cfg.id] = cfg;
  });
  if (Object.keys(singletons).length !== 2) {
    gaps.push(`tooltips: esperados 2 createFloatingTooltip em ${bindFile}, achados ${Object.keys(singletons).length}`);
  }

  // ── applyStatTipWidth: variante de largura por contexto (wealth) ──
  // setWidth em ordem de fonte: [0] = branch wealth, [1] = default.
  const setWidthCalls = [];
  const wealthScopeSelectors = [];
  walkNode(sf, (node) => {
    if (!ts.isCallExpression(node)) return;
    if (ts.isPropertyAccessExpression(node.expression)) {
      const m = node.expression.name.text;
      if (m === "setWidth" && node.arguments.length === 2 && node.arguments.every(ts.isStringLiteral)) {
        setWidthCalls.push([node.arguments[0].text, node.arguments[1].text]);
      }
      if (m === "closest" && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0])) {
        const sel = node.arguments[0].text;
        if (sel.includes("wealth")) wealthScopeSelectors.push(sel);
      }
    }
  });
  const widths =
    setWidthCalls.length >= 2
      ? {
          wealth: { minWidth: setWidthCalls[0][0], maxWidth: setWidthCalls[0][1], scopeSelectors: wealthScopeSelectors },
          default: { minWidth: setWidthCalls[1][0], maxWidth: setWidthCalls[1][1] },
        }
      : null;
  if (!widths) gaps.push(`tooltips: setWidth wealth/default não encontrados em ${bindFile}`);

  // ── Eventos de cada delegação (addEventListener reais, ordem de fonte) ──
  const eventsByBinder = {};
  for (const stmt of sf.statements) {
    if (!ts.isFunctionDeclaration(stmt) || !stmt.name) continue;
    const fname = stmt.name.text;
    if (fname !== "bindStatTooltipDelegation" && fname !== "bindRoleTooltipDelegationParty") continue;
    const evs = [];
    walkNode(stmt, (node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "addEventListener" &&
        node.arguments[0] &&
        ts.isStringLiteral(node.arguments[0])
      ) {
        const ev = node.arguments[0].text;
        if (!evs.includes(ev)) evs.push(ev);
      }
    });
    eventsByBinder[fname] = evs;
  }

  // ── Templates: exports reais de grupo-tooltips-port.ts ──
  const portSf = parseSourceFile(join(modeDir, portFile));
  // Critério declarado: exports cujo nome contém "tooltip" (case-insensitive)
  // são templates de conteúdo; os demais exports do arquivo são helpers de
  // formatação (esc/fmtPlain/etc), fora desta lista.
  const templates = [];
  for (const stmt of portSf.statements) {
    if (
      ts.isFunctionDeclaration(stmt) &&
      stmt.name &&
      stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) &&
      /tooltip/i.test(stmt.name.text)
    ) {
      templates.push(stmt.name.text);
    }
  }
  if (templates.length === 0) gaps.push(`tooltips: nenhum export function em ${portFile}`);

  return {
    contentAttribute: "data-tooltip-html",
    statTip: {
      id: consts.PARTY_STAT_TIP_ID ?? null,
      selector: consts.STAT_TIP_SELECTOR ?? null,
      config: singletons[consts.PARTY_STAT_TIP_ID] ?? null,
      widths,
      events: eventsByBinder.bindStatTooltipDelegation ?? [],
      behavior: "hover-only (mouseover/mousemove/mouseout), width adaptativa em wealth section",
    },
    roleTip: {
      id: consts.CLASS_ROLE_TIP_ID ?? null,
      selector: consts.ROLE_TOKEN_SELECTOR ?? null,
      config: singletons[consts.CLASS_ROLE_TIP_ID] ?? null,
      events: eventsByBinder.bindRoleTooltipDelegationParty ?? [],
      touchTapThresholdPx: consts.TOUCH_TAP_THRESHOLD_PX ?? null,
      behavior: "hover + touch-toggle (pointerdown/up com threshold de tap)",
    },
    baseStyles: { styles: baseStyles, tokens: baseStyleTokens, sharedBy: "ambos os singletons (inlineStyles)" },
    templates: { file: `${MODE_DIR}/${portFile}`, exports: templates.sort() },
    factory: "src/render/shared/floating-tooltip.ts (createFloatingTooltip — singletons cross-render em document.body)",
    notes:
      "Conteúdo dos tooltips é LOSSLESS no golden estático (atributo data-tooltip-html em cada trigger); " +
      "amostras hoveradas + prova payload==rendered em goldens.interactive.golden-grupo.tooltipFidelity. " +
      "DIVERGÊNCIA CONHECIDA (issue sfynz/pleitost#260): as larguras por contexto (statTip.widths) são a INTENÇÃO da fonte — " +
      "no render vivo o show() reaplica os defaults (ensureFloatingTipEl) e sobrescreve o setWidth, então o observado é " +
      "sempre defaultMinWidth/defaultMaxWidth (ver widthsObserved no golden interativo).",
  };
}
