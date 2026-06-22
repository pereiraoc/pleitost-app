// L? · modes/seções — deriva a ESTRUTURA dos modos read-only (Resumo, Leitura) e
// das abas Editável (Heroi/Monstro/CompanheiroAnimal) direto da AST dos composers
// de mount, em ORDEM DE FONTE. Nada é inventado:
//   - a ordem das seções vem da sequência de CallExpressions `mountX(...)` no
//     corpo do `build()` do composer (mount-resumo.ts / mount-leitura.ts);
//   - `hideWhenEmpty` é detectado abrindo o arquivo da `mountX` e olhando se há
//     uma guard-clause de vazio (top-level `if (...) return;`). Sem guard →
//     false; corpo não encontrado / forma inesperada → null + gaps;
//   - `blocoLabel` (Leitura) vem dos comentários `// Bloco N:` verbatim do fonte;
//   - as abas Editável vêm dos arrays HEROI_TABS/MONSTRO_TABS/CA_TABS do
//     mount-shell-demo (id/label/icon), com `emojiPath` lido do member-access
//     `EMOJI.tabHeroi.X` e `file` resolvido via o switch render*Tab → import.
//
// Importa SÓ helpers compartilhados; a lógica de AST específica deste extrator
// (walker de mounts, detecção de guard, resolução de imports) mora aqui.

import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

/** Caminho relativo POSIX (forward-slash) — determinístico entre plataformas. */
function relPosix(from, to) {
  return relative(from, to).split(/[\\/]/).join("/");
}

import { parseSourceFile, propertyNameToString, ts } from "./ast-helpers.mjs";

// ── AST helpers locais ──────────────────────────────────────────────────────

/** Nome do callee de uma CallExpression: `mountX` ou `obj.mountX` → "mountX". */
function calleeName(expr) {
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) return expr.name.text;
  return null;
}

/** Acha a FunctionDeclaration de nome `name` em qualquer profundidade do nó. */
function findFunctionDeclaration(root, name) {
  let found = null;
  function visit(node) {
    if (found) return;
    if (ts.isFunctionDeclaration(node) && node.name && node.name.text === name) {
      found = node;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(root);
  return found;
}

/**
 * Coleta, EM ORDEM DE FONTE, os nomes de funções `mount*` chamadas dentro do
 * corpo de `fnNode` (recursivo — pega calls aninhadas em `h(...)` etc).
 */
function collectMountCalls(fnNode, sourceFile) {
  const calls = [];
  function visit(node) {
    if (ts.isCallExpression(node)) {
      const nm = calleeName(node.expression);
      if (nm && nm.startsWith("mount")) {
        calls.push({ name: nm, pos: node.getStart(sourceFile) });
      }
    }
    ts.forEachChild(node, visit);
  }
  if (fnNode && fnNode.body) visit(fnNode.body);
  calls.sort((a, b) => a.pos - b.pos);
  return calls;
}

/**
 * Mapa `localName → caminho absoluto resolvido` dos imports relativos de um
 * SourceFile. Resolve `.ts` ou `/index.ts`. Imports não-relativos são ignorados.
 */
function buildImportMap(sourceFile, filePath) {
  const dir = dirname(filePath);
  const map = {};
  for (const stmt of sourceFile.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;
    if (!ts.isStringLiteralLike(stmt.moduleSpecifier)) continue;
    const spec = stmt.moduleSpecifier.text;
    if (!spec.startsWith(".")) continue;
    const clause = stmt.importClause;
    if (!clause) continue;
    const names = [];
    if (clause.name) names.push(clause.name.text);
    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const el of clause.namedBindings.elements) names.push(el.name.text);
    }
    const base = resolve(dir, spec);
    let file = null;
    for (const cand of [`${base}.ts`, `${base}/index.ts`, `${base}.tsx`]) {
      if (existsSync(cand)) {
        file = cand;
        break;
      }
    }
    for (const n of names) map[n] = file;
  }
  return map;
}

/** `mountPericiasBlock` → `periciasBlock` (strip "mount", lowercase 1ª letra). */
function mountFnToName(mountFn) {
  const rest = mountFn.slice("mount".length);
  if (rest.length === 0) return rest;
  return rest[0].toLowerCase() + rest.slice(1);
}

/**
 * `hideWhenEmpty` de uma seção: abre o arquivo da `mountX`, acha a
 * FunctionDeclaration homônima e procura uma GUARD-CLAUSE DE VAZIO — um
 * `return;` (sem valor) no top-level do corpo, direto ou dentro do then/else
 * de um `if` top-level cuja condição NÃO é de família.
 *
 * Guards de FAMÍLIA/aplicabilidade (`if (family|ctx.family ...) return;`) são
 * EXCLUÍDOS: a seção renderiza pra outras famílias e o return só pula um
 * sub-painel (ex.: sentidos-table pula só "Poderes Mágicos" pra CA; pericias-table
 * pula só "Ofícios" pra não-Heroi) — NÃO é "esconde quando vazio". Uma seção com
 * AMBOS (family + length) ainda conta via o guard de length.
 *
 * Retorno: true (guard de vazio) | false (sempre renderiza) | null (incerto → gap).
 */
function detectHideWhenEmpty(filePath, fnName) {
  if (!filePath || !existsSync(filePath)) return null;
  const sf = parseSourceFile(filePath);
  const decl = findFunctionDeclaration(sf, fnName);
  if (!decl || !decl.body) return null;

  let hasEmptyGuard = false;
  for (const stmt of decl.body.statements) {
    if (ts.isReturnStatement(stmt) && !stmt.expression) hasEmptyGuard = true;
    if (ts.isIfStatement(stmt)) {
      // Pula guards de família/aplicabilidade — não escondem-quando-vazio.
      if (/\bfamily\b|subcategoria/.test(stmt.expression.getText(sf))) continue;
      const branches = [stmt.thenStatement, stmt.elseStatement].filter(Boolean);
      for (const branch of branches) {
        const stmts = ts.isBlock(branch) ? branch.statements : [branch];
        for (const s of stmts) {
          if (ts.isReturnStatement(s) && !s.expression) hasEmptyGuard = true;
        }
      }
    }
  }
  return hasEmptyGuard;
}

/**
 * `noop`: a seção é um STUB que não renderiza nada (corpo sem NENHUMA
 * CallExpression — não cria DOM, não chama h()/mount/append). Ex.: oficios-table
 * e recursos-em-row, mantidos só pra preservar a interface do mount. Sinalizar
 * evita afirmar que a seção renderiza conteúdo. true | false | null (incerto).
 */
function detectNoop(filePath, fnName) {
  if (!filePath || !existsSync(filePath)) return null;
  const sf = parseSourceFile(filePath);
  const decl = findFunctionDeclaration(sf, fnName);
  if (!decl || !decl.body) return null;
  let hasCall = false;
  const visit = (n) => {
    if (hasCall) return;
    if (ts.isCallExpression(n)) { hasCall = true; return; }
    ts.forEachChild(n, visit);
  };
  for (const s of decl.body.statements) { if (hasCall) break; visit(s); }
  return !hasCall;
}

// ── Sub-extratores ──────────────────────────────────────────────────────────

/**
 * Lê um composer de modo (mount-resumo / mount-leitura): walker do `build()`
 * coletando `mountX` em ordem, com nome derivado, arquivo da seção resolvido e
 * `hideWhenEmpty` detectado. Opcionalmente anexa `blocoLabel` (Leitura).
 */
function extractModeSections(mounterFile, mounterFn, { withBlocoLabels }, gaps, gapPrefix) {
  const sf = parseSourceFile(mounterFile);
  const importMap = buildImportMap(sf, mounterFile);
  const outer = findFunctionDeclaration(sf, mounterFn);
  if (!outer) {
    gaps.push(`${gapPrefix}: composer "${mounterFn}" não encontrado`);
    return { mounter: mounterFn, sections: [] };
  }
  // As seções são montadas dentro do `build()` aninhado; se não houver, varre o
  // corpo do próprio composer (fallback defensivo).
  const inner = findFunctionDeclaration(outer, "build");
  const walkTarget = inner ?? outer;
  const calls = collectMountCalls(walkTarget, sf);

  // Comentários `// Bloco N:` (verbatim) com posição, pra associar por seção.
  let blocos = [];
  if (withBlocoLabels) {
    const text = readFileSync(mounterFile, "utf8");
    const re = /\/\/\s*(Bloco\s+\d+)\s*:/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      blocos.push({ label: m[1].replace(/\s+/g, " "), pos: m.index });
    }
  }

  const sections = calls.map((call) => {
    const name = mountFnToName(call.name);
    const file = importMap[call.name] ?? null;
    if (file === null) {
      gaps.push(`${gapPrefix}: import de "${call.name}" não resolvido (seção "${name}")`);
    }
    const hideWhenEmpty = detectHideWhenEmpty(file, call.name);
    if (hideWhenEmpty === null) {
      gaps.push(`${gapPrefix}: hideWhenEmpty indeterminado para "${call.name}"`);
    }
    const noop = detectNoop(file, call.name);
    // Shape do contrato: { name, mountFn, hideWhenEmpty } (+ noop p/ stubs, + blocoLabel na Leitura).
    const section = {
      name,
      mountFn: call.name,
      hideWhenEmpty,
    };
    if (noop === true) section.noop = true;
    if (withBlocoLabels) {
      let label = null;
      for (const b of blocos) {
        if (b.pos < call.pos) label = b.label;
        else break;
      }
      if (label === null) {
        gaps.push(`${gapPrefix}: blocoLabel ausente para "${call.name}"`);
      }
      section.blocoLabel = label;
    }
    return section;
  });

  return { mounter: mounterFn, sections };
}

/** `EMOJI.tabHeroi.Perfil` → "tabHeroi.Perfil" (drop do identificador-registry raiz). */
function emojiPathFromAccess(node) {
  const parts = [];
  let cur = node;
  while (ts.isPropertyAccessExpression(cur)) {
    parts.unshift(cur.name.text);
    cur = cur.expression;
  }
  if (ts.isIdentifier(cur)) parts.unshift(cur.text);
  // O 1º segmento é o nome da const-registry (EMOJI); o "path" é o resto.
  if (parts.length > 1) parts.shift();
  return parts.join(".");
}

/** Acha `const NAME = [...]` (array literal) e retorna o ArrayLiteralExpression. */
function findArrayLiteral(sourceFile, name) {
  for (const stmt of sourceFile.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (ts.isIdentifier(decl.name) && decl.name.text === name && decl.initializer) {
        let init = decl.initializer;
        while (
          ts.isAsExpression(init) ||
          ts.isParenthesizedExpression(init) ||
          (typeof ts.isSatisfiesExpression === "function" && ts.isSatisfiesExpression(init))
        ) {
          init = init.expression;
        }
        if (ts.isArrayLiteralExpression(init)) return init;
        return null;
      }
    }
  }
  return null;
}

/**
 * Mapa `tabId → função tab*` lendo um `switch (tab)`/`if (fam===...)` numa
 * render-function do demo: pra cada CaseClause string, a 1ª CallExpression cujo
 * callee identifier começa com `tab` é o renderer daquela aba.
 */
function caseToTabFn(demoSf, fnName) {
  const fn = findFunctionDeclaration(demoSf, fnName);
  const map = {};
  if (!fn) return map;
  function visit(node) {
    if (ts.isCaseClause(node) && ts.isStringLiteralLike(node.expression)) {
      const label = node.expression.text;
      let found = null;
      function inner(x) {
        if (found) return;
        if (ts.isCallExpression(x) && ts.isIdentifier(x.expression) && x.expression.text.startsWith("tab")) {
          found = x.expression.text;
          return;
        }
        ts.forEachChild(x, inner);
      }
      for (const s of node.statements) inner(s);
      map[label] = found;
    }
    ts.forEachChild(node, visit);
  }
  visit(fn);
  return map;
}

/**
 * `família → função tabCompleta*` lendo os branches `if (fam === "Monstro")`
 * de `renderSingleTab` (then = Monstro, else = CompanheiroAnimal). Source-faithful.
 */
function singleTabFns(demoSf) {
  const fn = findFunctionDeclaration(demoSf, "renderSingleTab");
  const out = { Monstro: null, CompanheiroAnimal: null };
  if (!fn) return out;
  function firstTabCompleta(node) {
    let found = null;
    function inner(x) {
      if (found) return;
      if (ts.isCallExpression(x) && ts.isIdentifier(x.expression) && x.expression.text.startsWith("tabCompleta")) {
        found = x.expression.text;
        return;
      }
      ts.forEachChild(x, inner);
    }
    inner(node);
    return found;
  }
  function visit(node) {
    if (ts.isIfStatement(node)) {
      const cond = node.expression.getText(demoSf);
      if (/"Monstro"/.test(cond)) {
        out.Monstro = firstTabCompleta(node.thenStatement);
        if (node.elseStatement) out.CompanheiroAnimal = firstTabCompleta(node.elseStatement);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(fn);
  return out;
}

/**
 * Abas Editável por família. Lê os arrays de TabDescriptor (id/label/icon) do
 * mount-shell-demo — fonte canônica da ordem — e resolve o `file` de cada aba:
 *   - Heroi: tabId → `tab*` (switch renderHeroiTab) → import;
 *   - Monstro/CompanheiroAnimal: família → `tabCompleta*` (renderSingleTab) → import.
 */
function extractEditavelFamilies(demoFile, pluginRoot, gaps) {
  const sf = parseSourceFile(demoFile);
  const importMap = buildImportMap(sf, demoFile);
  const heroiCaseFn = caseToTabFn(sf, "renderHeroiTab");
  const single = singleTabFns(sf);

  const FAMILIES = [
    { family: "Heroi", arrayName: "HEROI_TABS", fileForTab: (tabId) => importMap[heroiCaseFn[tabId]] ?? null },
    { family: "Monstro", arrayName: "MONSTRO_TABS", fileForTab: () => importMap[single.Monstro] ?? null },
    { family: "CompanheiroAnimal", arrayName: "CA_TABS", fileForTab: () => importMap[single.CompanheiroAnimal] ?? null },
  ];

  const families = {};
  for (const { family, arrayName, fileForTab } of FAMILIES) {
    const arr = findArrayLiteral(sf, arrayName);
    if (!arr) {
      gaps.push(`editavel.${family}: array "${arrayName}" não encontrado em mount-shell-demo`);
      families[family] = { tabs: [] };
      continue;
    }
    const tabs = arr.elements.map((el) => {
      let name = null;
      let tabId = null;
      let emojiPath = null;
      if (ts.isObjectLiteralExpression(el)) {
        for (const prop of el.properties) {
          if (!ts.isPropertyAssignment(prop)) continue;
          const key = propertyNameToString(prop.name);
          if (key === "id" && ts.isStringLiteralLike(prop.initializer)) tabId = prop.initializer.text;
          else if (key === "label" && ts.isStringLiteralLike(prop.initializer)) name = prop.initializer.text;
          else if (key === "icon") emojiPath = emojiPathFromAccess(prop.initializer);
        }
      }
      const file = tabId !== null ? fileForTab(tabId) : null;
      if (name === null) gaps.push(`editavel.${family}: tab sem label (id=${tabId})`);
      if (tabId === null) gaps.push(`editavel.${family}: tab sem id`);
      if (emojiPath === null || emojiPath === "") gaps.push(`editavel.${family}: emojiPath ausente (id=${tabId})`);
      if (file === null) gaps.push(`editavel.${family}: file não resolvido (id=${tabId})`);
      return {
        name,
        tabId,
        emojiPath: emojiPath || null,
        file: file ? relPosix(pluginRoot, file) : null,
      };
    });
    families[family] = { tabs };
  }
  return families;
}

// ── Entry point ─────────────────────────────────────────────────────────────

/**
 * @param {{ pluginRoot: string }} args
 * @returns {{
 *   resumo: { mounter: string, sections: Array<{name,mountFn,hideWhenEmpty,file}> },
 *   leitura: { mounter: string, sections: Array<{name,mountFn,blocoLabel,hideWhenEmpty,file}> },
 *   editavel: { families: Record<string, { tabs: Array<{name,tabId,emojiPath,file}> }> },
 *   gaps: string[]
 * }}
 */
export function extractModes({ pluginRoot }) {
  const gaps = [];
  const r = (p) => resolve(pluginRoot, p);

  const resumo = extractModeSections(
    r("src/render/modes/resumo/mount-resumo.ts"),
    "mountResumo",
    { withBlocoLabels: false },
    gaps,
    "resumo",
  );

  const leitura = extractModeSections(
    r("src/render/modes/leitura/mount-leitura.ts"),
    "mountLeitura",
    { withBlocoLabels: true },
    gaps,
    "leitura",
  );

  const families = extractEditavelFamilies(r("src/demo/mount-shell-demo.ts"), pluginRoot, gaps);

  return {
    resumo,
    leitura,
    editavel: { families },
    gaps,
  };
}
