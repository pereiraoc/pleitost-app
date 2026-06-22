// L? · tooltips — extrai os TEMPLATES de tooltip (breakdown + source) LOSSLESS
// direto do AST das fontes. NADA é inventado: triggers vêm dos
// `addEventListener("...")` reais; partFields vêm da interface `BreakdownPart`;
// header.fields vêm dos `result.<prop>` lidos no header de `renderBreakdownHtml`;
// components vêm dos `pushPart(...)` reais de modificadores.ts (emoji-path +
// label literal), com cada emoji-path resolvido e confirmado no registry; usedBy
// vem dos call-sites reais de attachBreakdown / attachSourceTooltip. Onde um dado
// falta/é dinâmico-sem-literal, vira null + entrada em `gaps`.
//
// Fontes:
//   src/render/shared/breakdown-tooltip.ts  — renderBreakdownHtml + listeners
//   src/render/shared/source-tooltip.ts     — buildSourceBreakdown + parseSource
//   src/util/breakdown-types.ts             — interfaces BreakdownPart/Result
//   src/util/modificadores.ts (~278-591)    — pushPart + call-sites (componentes)
//   src/shared/emoji-registry.ts            — registry canônico (confirma emoji)

import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

import { parseSourceFile, ts } from "./ast-helpers.mjs";

// ── AST utils internos (lógica específica deste extrator) ───────────────────

/** Visita recursivamente todos os nós de um SourceFile (pré-ordem). */
function walk(node, visit) {
  visit(node);
  node.forEachChild((c) => walk(c, visit));
}

/** Acha a declaração de função (`function NAME(...) {}`) por nome. */
function findFunction(sourceFile, name) {
  let found = null;
  for (const stmt of sourceFile.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name && stmt.name.text === name) {
      found = stmt;
      break;
    }
    // `export function NAME` também é FunctionDeclaration com modifiers — coberto acima.
  }
  return found;
}

/** Resolve um member-access encadeado `A.b.c` → array de segmentos ["A","b","c"].
 *  Retorna null se a base não for um Identifier puro (ex: chamada, índice). */
function memberAccessPath(node) {
  const segs = [];
  let cur = node;
  while (ts.isPropertyAccessExpression(cur)) {
    segs.unshift(cur.name.text);
    cur = cur.expression;
  }
  if (!ts.isIdentifier(cur)) return null;
  segs.unshift(cur.text);
  return segs;
}

/** String literal verbatim, ou null. */
function literalString(node) {
  return node && ts.isStringLiteralLike(node) ? node.text : null;
}

// ── trigger: eventos passados a `el.addEventListener("...")` ────────────────

/** Colhe, em ordem de fonte, os nomes de evento literais de TODA chamada
 *  `<algo>.addEventListener("event", ...)` no arquivo. Dedup preservando a
 *  ordem da primeira ocorrência (o trigger é o conjunto de eventos wireados). */
function extractAddEventListenerEvents(sourceFile) {
  const seen = new Set();
  const events = [];
  walk(sourceFile, (node) => {
    if (!ts.isCallExpression(node)) return;
    const callee = node.expression;
    if (!ts.isPropertyAccessExpression(callee)) return;
    if (callee.name.text !== "addEventListener") return;
    const ev = literalString(node.arguments[0]);
    if (ev && !seen.has(ev)) {
      seen.add(ev);
      events.push(ev);
    }
  });
  return events;
}

// ── interface fields ────────────────────────────────────────────────────────

/** Nomes dos membros (property signatures) de uma `interface NAME` — ordem de
 *  fonte. Lança se a interface não existir (gap silencioso é proibido). */
function interfaceMemberNames(sourceFile, name) {
  for (const stmt of sourceFile.statements) {
    if (ts.isInterfaceDeclaration(stmt) && stmt.name.text === name) {
      return stmt.members
        .filter((m) => ts.isPropertySignature(m) && m.name)
        .map((m) => m.name.text);
    }
  }
  throw new Error(`interface "${name}" não encontrada em ${sourceFile.fileName}`);
}

// ── header.fields: campos de result que ALIMENTAM o cabeçalho HTML ──────────

/** Coleta os nomes de Identifier referenciados dentro de um nó (qualquer
 *  profundidade). */
function identifiersIn(node) {
  const names = new Set();
  walk(node, (n) => {
    if (ts.isIdentifier(n)) names.add(n.text);
  });
  return names;
}

/** Mapa de declarações `const LOCAL = <expr>` no corpo de uma função:
 *  LOCAL → { resultProps:Set, deps:Set }. resultProps = `result.X` lidos na
 *  expr; deps = outros Identifiers referenciados (p/ fecho transitivo). */
function localConstBindings(body, resultParam) {
  const map = new Map();
  for (const stmt of body.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;
      const resultProps = new Set();
      walk(decl.initializer, (n) => {
        if (
          ts.isPropertyAccessExpression(n) &&
          ts.isIdentifier(n.expression) &&
          n.expression.text === resultParam
        ) {
          resultProps.add(n.name.text);
        }
      });
      map.set(decl.name.text, { resultProps, deps: identifiersIn(decl.initializer) });
    }
  }
  return map;
}

/** Em `renderBreakdownHtml(result)`, determina os campos de HEADER: os
 *  `result.<prop>` que efetivamente alimentam a montagem do array `head` (ou o
 *  branch `headerOnly`), via fecho transitivo das `const` locais que o head
 *  depende — MAIS os `result.<prop>` lidos diretamente dentro do array head e
 *  do branch headerOnly. Campos lidos só para configurar o BODY (ex: a local
 *  que governa o `bodyMode` do `.map`) NÃO entram. Derivado 100% do AST: a
 *  fronteira é o grafo de dependências do head, não uma posição de linha nem
 *  uma lista hardcoded. Retorna array em ordem de fonte. */
function extractHeaderFields(sourceFile, fnName, resultParam, headVarName, bodyAnchor) {
  const fn = findFunction(sourceFile, fnName);
  if (!fn || !fn.body) {
    throw new Error(`função "${fnName}" não encontrada em ${sourceFile.fileName}`);
  }
  const bindings = localConstBindings(fn.body, resultParam);

  // Nós "geradores de header": (a) a declaração `const head = ...`; (b) qualquer
  // return ANTES da declaração de head (o early-return do headerOnly). O array
  // head + emojiSpan/headerMod (via fecho) cobrem todos os campos do cabeçalho.
  let headDecl = null;
  let headOffset = Infinity;
  for (const stmt of fn.body.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (ts.isIdentifier(decl.name) && decl.name.text === headVarName && decl.initializer) {
        headDecl = decl.initializer;
        headOffset = decl.getStart(sourceFile);
      }
    }
  }
  if (!headDecl) throw new Error(`variável "${headVarName}" não encontrada em ${fnName}`);

  const headerProps = []; // ordem de fonte
  const addProp = (p) => {
    if (p !== bodyAnchor && !headerProps.includes(p)) headerProps.push(p);
  };

  // Fecho transitivo das dependências do head, em termos de NOMES de locals.
  const closure = new Set();
  const expand = (id) => {
    if (closure.has(id)) return;
    closure.add(id);
    const b = bindings.get(id);
    if (!b) return;
    for (const dep of b.deps) if (bindings.has(dep)) expand(dep);
  };
  // Seeds: locals e result.* usados diretamente no array head.
  for (const id of identifiersIn(headDecl)) if (bindings.has(id)) expand(id);
  walk(headDecl, (n) => {
    if (
      ts.isPropertyAccessExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === resultParam
    ) {
      addProp(n.name.text);
    }
  });
  // result.* trazidos por cada local do fecho.
  for (const id of closure) {
    const b = bindings.get(id);
    if (b) for (const p of b.resultProps) addProp(p);
  }

  // Early-return do headerOnly: qualquer ReturnStatement antes do head.
  walk(fn.body, (node) => {
    if (ts.isReturnStatement(node) && node.getStart(sourceFile) < headOffset && node.expression) {
      // result.* lidos no nó da condição/expr do early-return — porém o
      // headerOnly em si é um campo de header (governa a forma do cabeçalho).
      // Capturamos os result.* literais que aparecem ao redor do early-return
      // varrendo o IfStatement que o contém.
      let p = node.parent;
      while (p && !ts.isIfStatement(p) && p !== fn.body) p = p.parent;
      if (p && ts.isIfStatement(p)) {
        walk(p.expression, (n) => {
          if (
            ts.isPropertyAccessExpression(n) &&
            ts.isIdentifier(n.expression) &&
            n.expression.text === resultParam
          ) {
            addProp(n.name.text);
          }
        });
      }
    }
  });

  // Mantém ordem de PRIMEIRA aparição na fonte (não a ordem de descoberta).
  return orderBySourceFirstAppearance(fn.body, sourceFile, resultParam, headerProps);
}

/** Reordena `props` pela ordem em que `result.<prop>` aparece pela 1ª vez na
 *  fonte (varre o corpo da função). Determinístico e fiel à leitura humana. */
function orderBySourceFirstAppearance(body, sourceFile, resultParam, props) {
  const firstOffset = new Map();
  walk(body, (n) => {
    if (
      ts.isPropertyAccessExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === resultParam
    ) {
      const p = n.name.text;
      const off = n.getStart(sourceFile);
      if (!firstOffset.has(p) || off < firstOffset.get(p)) firstOffset.set(p, off);
    }
  });
  return [...props].sort((a, b) => (firstOffset.get(a) ?? 0) - (firstOffset.get(b) ?? 0));
}

// ── pushPart components: emoji-path + label literal ─────────────────────────

/** Mapa nome-da-função → segmentos do member-access retornado (se o corpo é só
 *  `return EMOJI.x.y;`). Permite resolver indireções triviais tipo
 *  `atributoEmoji()` → ["EMOJI","tooltip","Atributo"]. */
function returnedMemberAccessByFunction(sourceFile) {
  const map = new Map();
  for (const stmt of sourceFile.statements) {
    if (!ts.isFunctionDeclaration(stmt) || !stmt.name || !stmt.body) continue;
    const stmts = stmt.body.statements;
    if (stmts.length !== 1 || !ts.isReturnStatement(stmts[0]) || !stmts[0].expression) continue;
    const segs = memberAccessPath(stmts[0].expression);
    if (segs) map.set(stmt.name.text, segs);
  }
  return map;
}

/** Resolve o 1º argumento `emoji` de um pushPart para segmentos de member-access
 *  `["EMOJI",ns,key]`. Aceita acesso direto (`EMOJI.tooltip.Base`) ou função
 *  local de indireção que só retorna um member-access (`atributoEmoji(x)`).
 *  Retorna null quando o emoji não é resolúvel a um path literal de registry
 *  (ex: string vazia "", expressão dinâmica). */
function resolveEmojiArg(arg, returnedByFn) {
  if (!arg) return null;
  const direct = memberAccessPath(arg);
  if (direct && direct[0] === "EMOJI") return direct;
  if (ts.isCallExpression(arg) && ts.isIdentifier(arg.expression)) {
    const segs = returnedByFn.get(arg.expression.text);
    if (segs && segs[0] === "EMOJI") return segs;
  }
  return null;
}

/** Extrai os componentes via `pushPart(parts, EMOJI.<ns>.<key>, label, ...)`.
 *  emojiPath = "<ns>.<key>" (sem o prefixo "EMOJI"); label = string literal do
 *  3º arg, ou null se dinâmico (ex: PROF_LABEL[input.prof]) — nesse caso há um
 *  `?? "fallback"` capturado em labelFallback quando presente. Dedup por
 *  emojiPath+label. Mantém ordem de 1ª ocorrência. Retorna { components, gaps }. */
function extractPushPartComponents(sourceFile) {
  const returnedByFn = returnedMemberAccessByFunction(sourceFile);
  const out = [];
  const key = (c) => `${c.emojiPath} ${c.label} ${c.labelFallback}`;
  const seen = new Set();
  const gaps = [];
  walk(sourceFile, (node) => {
    if (!ts.isCallExpression(node)) return;
    if (!ts.isIdentifier(node.expression) || node.expression.text !== "pushPart") return;
    const [, emojiArg, labelArg] = node.arguments;
    const segs = resolveEmojiArg(emojiArg, returnedByFn);
    if (!segs) {
      gaps.push(`pushPart com emoji não-literal (linha ${posLine(sourceFile, node)})`);
      return;
    }
    const emojiPath = segs.slice(1).join("."); // drop "EMOJI"
    let label = literalString(labelArg);
    let labelFallback = null;
    // `input.attrLabel ?? "Atributo"` / `X ?? "Y"` → label dinâmico c/ fallback.
    if (label === null && labelArg && ts.isBinaryExpression(labelArg) &&
        labelArg.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
      labelFallback = literalString(labelArg.right);
    }
    const comp = { emojiPath, label, labelFallback };
    const k = key(comp);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(comp);
    }
  });
  return { components: out, gaps };
}

function posLine(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

// ── registry lookup (confirma emoji-path → valor real, não inventa) ─────────

/** Navega o object-literal exportado `EMOJI` no registry e resolve "ns.key" →
 *  string do emoji (decodificada). Retorna null se o path não existir. */
function lookupEmoji(registrySf, dottedPath) {
  let init = null;
  for (const stmt of registrySf.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (ts.isIdentifier(decl.name) && decl.name.text === "EMOJI" && decl.initializer) {
        init = decl.initializer;
      }
    }
  }
  if (!init) return null;
  // unwrap `as const`
  while (ts.isAsExpression(init) || ts.isParenthesizedExpression(init)) init = init.expression;
  let cur = init;
  for (const seg of dottedPath.split(".")) {
    if (!ts.isObjectLiteralExpression(cur)) return null;
    const prop = cur.properties.find(
      (p) => ts.isPropertyAssignment(p) && p.name && propName(p.name) === seg,
    );
    if (!prop) return null;
    cur = prop.initializer;
  }
  return ts.isStringLiteralLike(cur) ? cur.text : null;
}

function propName(name) {
  if (ts.isIdentifier(name)) return name.text;
  if (ts.isStringLiteralLike(name)) return name.text;
  if (ts.isNumericLiteral(name)) return name.text;
  return null;
}

// ── usedBy: call-sites de uma função export por nome de identificador ────────

/** Lista (relativa ao pluginRoot) os arquivos .ts sob src/ que CHAMAM `fnName`
 *  (CallExpression com callee Identifier === fnName), excluindo a própria
 *  definição em `defFileRel`. Ordenado. Derivado do AST de cada arquivo. */
function findCallSites(pluginRoot, srcDir, fnName, defFileRel) {
  const hits = [];
  for (const abs of walkTsFiles(srcDir)) {
    const rel = relative(pluginRoot, abs).split("\\").join("/");
    if (rel === defFileRel) continue;
    const sf = safeParse(abs);
    if (!sf) continue;
    let calls = false;
    walk(sf, (node) => {
      if (calls) return;
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === fnName
      ) {
        calls = true;
      }
    });
    if (calls) hits.push(rel);
  }
  hits.sort();
  return hits;
}

function safeParse(abs) {
  try {
    return parseSourceFile(abs);
  } catch {
    return null;
  }
}

/** Walk recursivo de arquivos .ts (ignora .d.ts e node_modules). */
function* walkTsFiles(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    if (ent.name === "node_modules") continue;
    const abs = join(dir, ent.name);
    if (ent.isDirectory()) {
      yield* walkTsFiles(abs);
    } else if (ent.isFile() && ent.name.endsWith(".ts") && !ent.name.endsWith(".d.ts")) {
      yield abs;
    }
  }
}

// ── source-tooltip specifics ────────────────────────────────────────────────

/** Lê o separador verbatim do template literal `${p.type} · ${p.origin}` em
 *  buildSourceBreakdown (a "lineFormat" Tipo · Origem). Procura um
 *  TemplateExpression que tenha ao menos um span e devolve o texto literal
 *  (trimado das chaves). Retorna null se não achar — vira gap. */
function extractSourceSeparator(sourceFile) {
  let sep = null;
  walk(sourceFile, (node) => {
    if (sep !== null) return;
    if (!ts.isTemplateExpression(node)) return;
    // head + spans: head é "" e o literal "  ·  " mora no span anterior ao último.
    // Concatena head + cada literal pra inspecionar o texto interpolado.
    const literals = [node.head.text, ...node.templateSpans.map((s) => s.literal.text)];
    const joined = literals.join("");
    if (joined.includes("·")) {
      // O separador real é o literal que contém "·".
      const lit = literals.find((l) => l.includes("·"));
      sep = lit;
    }
  });
  return sep;
}

/** Extrai os "tipos de source" suportados, verbatim, do comentário de cabeçalho
 *  do source-tooltip.ts (linhas "//   - "Regra"  → ...") + dos prefixos/branches
 *  literais de `parseSource`. Não inventa: só strings que existem no arquivo. */
function extractSourceParsedTypes(sourceFile, rawText) {
  const types = [];
  const seen = new Set();
  const add = (raw, note) => {
    if (!raw) return;
    if (seen.has(raw)) return;
    seen.add(raw);
    types.push({ raw, note });
  };
  // 1) Branch literais do parseSource: `raw.startsWith("Slot.")`.
  walk(sourceFile, (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "startsWith"
    ) {
      const lit = literalString(node.arguments[0]);
      if (lit) add(lit, "startsWith branch (parseSource)");
    }
  });
  // 2) Exemplos verbatim documentados no comentário de cabeçalho:
  //    //   - "Regra"  → tipo único   (etc). Captura o que está entre aspas
  //    após "//   - ". Verbatim do arquivo — não inventado.
  for (const line of rawText.split(/\r?\n/)) {
    const m = line.match(/^\s*\/\/\s*-\s*"([^"]+)"\s*(?:\/[^→-]*)?(?:→|-)?\s*(.*)$/);
    if (m) {
      const raw = m[1];
      const note = (m[2] || "").trim() || null;
      add(raw, note ? `doc: ${note}` : "doc");
    }
  }
  return types;
}

// ── orquestração ────────────────────────────────────────────────────────────

/**
 * @param {{ pluginRoot: string }} args
 * @returns {{ breakdown: object, source: object, gaps: string[] }}
 */
export function extractTooltips({ pluginRoot }) {
  const gaps = [];
  const srcDir = join(pluginRoot, "src");

  const breakdownFileRel = "src/render/shared/breakdown-tooltip.ts";
  const sourceFileRel = "src/render/shared/source-tooltip.ts";
  const typesFileRel = "src/util/breakdown-types.ts";
  const modsFileRel = "src/util/modificadores.ts";
  const registryFileRel = "src/shared/emoji-registry.ts";

  const breakdownSf = parseSourceFile(join(pluginRoot, breakdownFileRel));
  const sourceSf = parseSourceFile(join(pluginRoot, sourceFileRel));
  const typesSf = parseSourceFile(join(pluginRoot, typesFileRel));
  const modsSf = parseSourceFile(join(pluginRoot, modsFileRel));
  const registrySf = parseSourceFile(join(pluginRoot, registryFileRel));
  const sourceRaw = readFileSync(join(pluginRoot, sourceFileRel), "utf8");

  // ── breakdown ──────────────────────────────────────────────────────────
  const breakdownTrigger = extractAddEventListenerEvents(breakdownSf);
  if (breakdownTrigger.length === 0) gaps.push("breakdown.trigger: nenhum addEventListener literal encontrado");

  const partFields = interfaceMemberNames(typesSf, "BreakdownPart");

  // header.fields: campos de result que alimentam a montagem do array `head`
  // (fecho de dependências) em renderBreakdownHtml. Campos que só configuram o
  // body (ex: bodyMode, consumido apenas dentro do result.parts.map) ficam de fora.
  const headerFields = extractHeaderFields(
    breakdownSf,
    "renderBreakdownHtml",
    "result",
    "head",
    "parts",
  );
  if (headerFields.length === 0) gaps.push("breakdown.header.fields: nenhum result.<prop> de header encontrado");

  // components: pushPart reais de modificadores.ts, emoji-path confirmado no registry.
  const { components: rawComponents, gaps: compGaps } = extractPushPartComponents(modsSf);
  gaps.push(...compGaps);
  const components = rawComponents.map((c) => {
    const emoji = lookupEmoji(registrySf, c.emojiPath);
    if (emoji === null) {
      gaps.push(`component emojiPath "${c.emojiPath}" não resolve no registry (${registryFileRel})`);
    }
    // label do componente: literal direto, ou fallback do `?? "X"`, ou null (dinâmico).
    const label = c.label ?? c.labelFallback;
    if (label === null) {
      gaps.push(`component (emojiPath ${c.emojiPath}) tem label dinâmico sem fallback literal`);
    }
    return {
      emojiPath: c.emojiPath,
      label,
      emoji,
      labelDynamic: c.label === null,
    };
  });
  if (components.length === 0) gaps.push("breakdown.components: nenhum pushPart resolúvel");

  const breakdownUsedBy = findCallSites(pluginRoot, srcDir, "attachBreakdown", breakdownFileRel);

  // ── source ─────────────────────────────────────────────────────────────
  // trigger do source: reusa attachBreakdown (mesmos listeners) — verbatim do
  // breakdown, pois source-tooltip não wirea listeners próprios. Confirma que
  // source-tooltip realmente chama attachBreakdown (senão é gap, não chute).
  let sourceReusesBreakdown = false;
  walk(sourceSf, (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "attachBreakdown"
    ) {
      sourceReusesBreakdown = true;
    }
  });
  const sourceTrigger = sourceReusesBreakdown ? breakdownTrigger : null;
  if (!sourceReusesBreakdown) gaps.push("source.trigger: source-tooltip não chama attachBreakdown (não pude reusar trigger)");

  // header do source: title literal ("Fonte"/"Fontes") + headerEmoji path.
  const sourceHeader = extractSourceHeader(sourceSf);
  if (sourceHeader.titles.length === 0) gaps.push("source.header: títulos literais não encontrados em buildSourceBreakdown");
  if (sourceHeader.emojiPath) {
    sourceHeader.emoji = lookupEmoji(registrySf, sourceHeader.emojiPath);
    if (sourceHeader.emoji === null) {
      gaps.push(`source.header emojiPath "${sourceHeader.emojiPath}" não resolve no registry`);
    }
  } else {
    sourceHeader.emoji = null;
    gaps.push("source.header: headerEmoji não é um EMOJI.<ns>.<key> literal");
  }

  // lineFormat: separador verbatim + montagem "Tipo · Origem".
  const sep = extractSourceSeparator(sourceSf);
  // Monta a string lineFormat com os tokens semânticos + o separador verbatim.
  // "Tipo"/"Origem" descrevem os campos type/origin do ParsedSource (verbatim
  // dos nomes na interface) — não rótulos inventados.
  let lineFormat = null;
  if (sep !== null) {
    lineFormat = `Tipo${sep}Origem`;
  } else {
    gaps.push("source.lineFormat: separador '·' não encontrado no template de buildSourceBreakdown");
  }

  const parsedTypes = extractSourceParsedTypes(sourceSf, sourceRaw);
  if (parsedTypes.length === 0) gaps.push("source.parsedTypes: nenhum tipo literal/doc encontrado");

  const sourceUsedBy = findCallSites(pluginRoot, srcDir, "attachSourceTooltip", sourceFileRel);

  return {
    breakdown: {
      trigger: breakdownTrigger,
      header: { fields: headerFields },
      partFields,
      components,
      usedBy: breakdownUsedBy,
    },
    source: {
      trigger: sourceTrigger,
      header: { titles: sourceHeader.titles, emojiPath: sourceHeader.emojiPath, emoji: sourceHeader.emoji },
      lineFormat,
      separator: sep,
      parsedTypes,
      usedBy: sourceUsedBy,
    },
    gaps,
  };
}

/** Extrai do `buildSourceBreakdown` os títulos literais (ex: "Fonte"/"Fontes")
 *  e o emoji-path do headerEmoji. Sem inventar — só literais do AST. */
function extractSourceHeader(sourceFile) {
  const fn = findFunctionAny(sourceFile, "buildSourceBreakdown");
  const titles = [];
  let emojiPath = null;
  if (!fn || !fn.body) return { titles, emojiPath, emoji: null };
  walk(fn.body, (node) => {
    // título: property `title:` num object-literal → captura ramos do ternário.
    if (ts.isPropertyAssignment(node) && propName(node.name) === "title") {
      collectStringLiterals(node.initializer, titles);
    }
    // headerEmoji: property `headerEmoji:` apontando p/ EMOJI.<ns>.<key>.
    if (ts.isPropertyAssignment(node) && propName(node.name) === "headerEmoji") {
      const segs = memberAccessPath(node.initializer);
      if (segs && segs[0] === "EMOJI") emojiPath = segs.slice(1).join(".");
    }
  });
  return { titles, emojiPath, emoji: null };
}

/** Acha função declarada por nome (qualquer modifier). */
function findFunctionAny(sourceFile, name) {
  for (const stmt of sourceFile.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name && stmt.name.text === name) return stmt;
  }
  return null;
}

/** Colhe todas as string-literais aninhadas numa expressão (ramos de ternário,
 *  binários, etc) — ordem de fonte, dedup. */
function collectStringLiterals(node, out) {
  walk(node, (n) => {
    if (ts.isStringLiteralLike(n)) {
      if (!out.includes(n.text)) out.push(n.text);
    }
  });
}
