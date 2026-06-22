// L? · inventário de componentes — varre os barrels `groups` e `shared`,
// resolve cada arquivo de componente e extrai metadados LOSSLESS direto da AST
// e do texto-fonte (fonte de verdade): role (comentário de topo verbatim),
// props da interface `<Nome>Props`, tokens de emoji/cor usados (validados contra
// as registries reais EMOJI/PALETTE) e o flag `supercharged` (emite wikilink cru
// pra decoração externa). NADA é inventado: dado faltante vira null + gap.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  evalExportedConst,
  parseSourceFile,
  propertyNameToString,
  ts,
} from "./ast-helpers.mjs";

// Marcadores de "supercharged": componente emite wikilink CRU pra que uma
// extensão externa (supercharged-links, MarkdownRenderer do Obsidian, etc.)
// decore o link. Lista verbatim do contrato.
const SUPERCHARGED_MARKERS = [
  "renderMd",
  "MarkdownRenderer",
  "makeLink",
  "wikilinkRenderer",
  "data-link-",
];

/** value-export `x` → nome esperado da interface de props `XProps`. */
function propsNameFor(valueName) {
  return `${valueName.charAt(0).toUpperCase()}${valueName.slice(1)}Props`;
}

/**
 * Parseia um barrel `export { a, type AProps } from "./arquivo"`.
 * Retorna, por re-export, os value-exports e os type-exports + o specifier.
 */
function parseBarrel(barrelPath) {
  const sf = parseSourceFile(barrelPath);
  const reexports = [];
  for (const stmt of sf.statements) {
    if (
      !ts.isExportDeclaration(stmt) ||
      !stmt.moduleSpecifier ||
      !ts.isStringLiteralLike(stmt.moduleSpecifier) ||
      !stmt.exportClause ||
      !ts.isNamedExports(stmt.exportClause)
    ) {
      continue;
    }
    const values = [];
    const types = [];
    for (const el of stmt.exportClause.elements) {
      // `el.isTypeOnly` cobre o `type` por-specifier (`export { type X }`).
      if (el.isTypeOnly) types.push(el.name.text);
      else values.push(el.name.text);
    }
    reexports.push({ specifier: stmt.moduleSpecifier.text, values, types });
  }
  return reexports;
}

/**
 * Resolve o specifier relativo do barrel pra um caminho .ts absoluto.
 * (Os barrels só re-exportam de irmãos `./arquivo`.)
 */
function resolveSpecifier(barrelPath, specifier) {
  const base = resolve(dirname(barrelPath), specifier);
  return base.endsWith(".ts") ? base : `${base}.ts`;
}

/**
 * Role = bloco de comentários de linha (`//`) contíguo no TOPO do arquivo,
 * verbatim, limpo do `//`. Para no primeiro statement ou na primeira linha
 * que não é comentário de linha. Linhas `//` vazias viram separador de espaço.
 * Retorna null se não houver comentário de topo.
 */
function extractRole(sourceFile, fullText) {
  // O TS anexa TODO o bloco de comentários do topo como leading-trivia da
  // posição 0 (= leading trivia do primeiro statement). Pegamos só as linhas
  // de comentário-de-linha (`//`) contíguas; bloco `/* */` no topo é raro aqui
  // e não conta como "role" do contrato.
  void sourceFile;
  const ranges = ts.getLeadingCommentRanges(fullText, 0) || [];
  const lines = [];
  for (const r of ranges) {
    if (r.kind !== ts.SyntaxKind.SingleLineCommentTrivia) continue;
    const raw = fullText.slice(r.pos, r.end).replace(/^\/\/\s?/, "");
    lines.push(raw.trim());
  }
  if (lines.length === 0) return null;
  const role = lines.join(" ").replace(/\s+/g, " ").trim();
  return role.length > 0 ? role : null;
}

/**
 * jsdoc de um membro de interface: preferimos o bloco `/** ... *\/` (m.jsDoc);
 * senão caímos no comentário trailing `// ...` na mesma linha do membro
 * (estilo usado em dropdown-link/wikilink-renderer). null se nenhum.
 */
function memberJsdoc(member, fullText) {
  const blocks = member.jsDoc;
  if (blocks && blocks.length > 0) {
    const parts = [];
    for (const b of blocks) {
      if (typeof b.comment === "string") parts.push(b.comment);
      else if (Array.isArray(b.comment)) {
        for (const c of b.comment) if (typeof c.text === "string") parts.push(c.text);
      }
    }
    const joined = parts.join(" ").replace(/\s+/g, " ").trim();
    if (joined.length > 0) return joined;
  }
  const trailing = ts.getTrailingCommentRanges(fullText, member.end) || [];
  for (const r of trailing) {
    if (r.kind === ts.SyntaxKind.SingleLineCommentTrivia) {
      const txt = fullText.slice(r.pos, r.end).replace(/^\/\/\s?/, "").trim();
      if (txt.length > 0) return txt;
    }
  }
  return null;
}

/**
 * Props da interface `<propsName>` no arquivo. Cada campo: { name, type, jsdoc }.
 * Ordem = ordem-fonte dos membros (a ordem da interface importa). Se a interface
 * não existir, retorna { props: [], found: false } pro caller registrar gap.
 */
function extractProps(sourceFile, fullText, propsName) {
  let iface = null;
  for (const stmt of sourceFile.statements) {
    if (ts.isInterfaceDeclaration(stmt) && stmt.name.text === propsName) {
      iface = stmt;
      break;
    }
  }
  if (!iface) return { props: [], found: false };
  const props = [];
  for (const member of iface.members) {
    if (!ts.isPropertySignature(member) || !member.name) continue;
    const name = propertyNameToString(member.name);
    const type = member.type ? member.type.getText(sourceFile).replace(/\s+/g, " ").trim() : null;
    props.push({ name, type, jsdoc: memberJsdoc(member, fullText) });
  }
  return { props, found: true };
}

/**
 * Coleta paths de token usados no arquivo, em três formas:
 *   1. member-access encadeado: `EMOJI.ns.Key` / `PALETTE.ns.Key`
 *      → path "ns.Key".
 *   2. element-access (índice): `EMOJI.ns[expr]` / `PALETTE.ns[expr]`
 *      → se `expr` for string-literal, path "ns.Key"; se for DINÂMICO
 *        (variável/computado, ex.: `EMOJI.atributo[id]`), path "ns.*" —
 *        sinaliza "namespace inteiro usado dinamicamente". NÃO é invenção:
 *        o componente realmente renderiza algum membro daquele namespace; o
 *        membro exato depende do dado em runtime. Ignorar isso descartaria
 *        ícones de fato renderizados (ex.: attrToggle renderiza só EMOJI.atributo[a]).
 *   3. call-form: `emoji("ns.Key")` / `palette("ns.Key")` → path "ns.Key".
 * Retorna { emoji:Set<string>, palette:Set<string> } (paths crus, ainda
 * não-validados).
 */
function collectTokenPaths(sourceFile) {
  const emojiPaths = new Set();
  const palettePaths = new Set();

  const add = (rootText, path) => {
    if (rootText === "EMOJI") emojiPaths.add(path);
    else if (rootText === "PALETTE") palettePaths.add(path);
  };

  const recordMemberAccess = (node) => {
    // node: PropertyAccessExpression cujo `.expression` é PropertyAccessExpression
    // cujo `.expression` é Identifier EMOJI|PALETTE.
    // Ex.: EMOJI.glyph.ChevronDown → outer.name=ChevronDown, inner.name=glyph.
    if (!ts.isPropertyAccessExpression(node)) return;
    const inner = node.expression;
    if (!ts.isPropertyAccessExpression(inner)) return;
    const root = inner.expression;
    if (!ts.isIdentifier(root)) return;
    add(root.text, `${inner.name.text}.${node.name.text}`);
  };

  const recordElementAccess = (node) => {
    // node: ElementAccessExpression cujo `.expression` é `EMOJI.ns` / `PALETTE.ns`.
    // Ex.: EMOJI.atributo[id] → ns=atributo, índice dinâmico → "atributo.*".
    if (!ts.isElementAccessExpression(node)) return;
    const obj = node.expression;
    if (!ts.isPropertyAccessExpression(obj)) return;
    const root = obj.expression;
    if (!ts.isIdentifier(root)) return;
    const ns = obj.name.text;
    const arg = node.argumentExpression;
    if (arg && ts.isStringLiteralLike(arg)) add(root.text, `${ns}.${arg.text}`);
    else add(root.text, `${ns}.*`); // índice dinâmico → namespace inteiro
  };

  const recordCall = (node) => {
    if (!ts.isCallExpression(node)) return;
    const callee = node.expression;
    if (!ts.isIdentifier(callee)) return;
    if (callee.text !== "emoji" && callee.text !== "palette") return;
    const arg = node.arguments[0];
    if (!arg || !ts.isStringLiteralLike(arg)) return;
    if (callee.text === "emoji") emojiPaths.add(arg.text);
    else palettePaths.add(arg.text);
  };

  const visit = (node) => {
    recordMemberAccess(node);
    recordElementAccess(node);
    recordCall(node);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return { emoji: emojiPaths, palette: palettePaths };
}

/**
 * Verifica se um path existe na registry avaliada (objeto aninhado).
 * "ns.Key" → o membro existe; "ns.*" (acesso dinâmico) → o namespace existe.
 */
function pathExists(registry, path) {
  const dot = path.indexOf(".");
  if (dot < 0) return false;
  const ns = path.slice(0, dot);
  const key = path.slice(dot + 1);
  const table = registry[ns];
  if (!table || typeof table !== "object") return false;
  if (key === "*") return true; // "ns.*" = namespace inteiro usado dinamicamente
  return Object.prototype.hasOwnProperty.call(table, key);
}

/** true se o texto do arquivo contém algum marcador de supercharged. */
function isSupercharged(fullText) {
  return SUPERCHARGED_MARKERS.some((m) => fullText.includes(m));
}

/**
 * @param {{ pluginRoot: string }} args
 * @returns {{ groups: object, widgets: object, gaps: string[] }}
 */
export function extractComponents({ pluginRoot }) {
  const groupsBarrel = resolve(pluginRoot, "src/render/groups/index.ts");
  const sharedBarrel = resolve(pluginRoot, "src/render/shared/index.ts");
  const emojiRegistryPath = resolve(pluginRoot, "src/shared/emoji-registry.ts");
  const paletteRegistryPath = resolve(pluginRoot, "src/render/shared/palette-registry.ts");

  // Registries reais (lossless via AST) pra VALIDAR cada path coletado.
  const EMOJI = evalExportedConst(emojiRegistryPath, "EMOJI");
  const PALETTE = evalExportedConst(paletteRegistryPath, "PALETTE");

  const gaps = [];

  /** Processa um barrel → mapa { nome: descriptor }. */
  const processBarrel = (barrelPath, bucketLabel) => {
    const out = {};
    const reexports = parseBarrel(barrelPath);
    const relFile = (abs) => abs.slice(pluginRoot.length + 1);

    for (const re of reexports) {
      const filePath = resolveSpecifier(barrelPath, re.specifier);
      // Lê o arquivo do componente UMA vez (texto + AST).
      let fullText;
      let sourceFile;
      let fileExists = true;
      try {
        fullText = readFileSync(filePath, "utf8");
        sourceFile = parseSourceFile(filePath);
      } catch {
        fileExists = false;
      }

      for (const valueName of re.values) {
        const propsName = propsNameFor(valueName);
        // Um value-export é "componente" SE o barrel também re-exporta o type
        // `<Nome>Props`. Regra 100% derivada da fonte — sem lista inventada.
        if (!re.types.includes(propsName)) continue;

        const fileRel = relFile(filePath);

        if (!fileExists) {
          gaps.push(`${bucketLabel}.${valueName}: arquivo não encontrado (${fileRel})`);
          out[valueName] = {
            file: fileRel,
            role: null,
            props: [],
            iconSources: { inline: [], supercharged: false },
            tokensUsed: { emojis: [], colors: [] },
          };
          continue;
        }

        const role = extractRole(sourceFile, fullText);
        if (role === null) {
          gaps.push(`${bucketLabel}.${valueName}: sem comentário de role no topo de ${fileRel}`);
        }

        const { props, found } = extractProps(sourceFile, fullText, propsName);
        if (!found) {
          gaps.push(`${bucketLabel}.${valueName}: interface ${propsName} não encontrada em ${fileRel}`);
        }
        for (const p of props) {
          if (p.type === null) {
            gaps.push(`${bucketLabel}.${valueName}: prop "${p.name}" sem anotação de tipo em ${fileRel}`);
          }
        }

        // Tokens: coleta + validação contra registries reais.
        const raw = collectTokenPaths(sourceFile);
        const emojis = [];
        for (const path of raw.emoji) {
          if (pathExists(EMOJI, path)) emojis.push(path);
          else gaps.push(`${bucketLabel}.${valueName}: emoji path inexistente "${path}" (${fileRel})`);
        }
        const colors = [];
        for (const path of raw.palette) {
          if (pathExists(PALETTE, path)) colors.push(path);
          else gaps.push(`${bucketLabel}.${valueName}: palette path inexistente "${path}" (${fileRel})`);
        }
        emojis.sort();
        colors.sort();

        const supercharged = isSupercharged(fullText);

        out[valueName] = {
          file: fileRel,
          role,
          props,
          // inline = ícones emoji que o componente renderiza inline (paths da
          // registry); supercharged = emite wikilink cru pra decoração externa.
          iconSources: { inline: [...emojis], supercharged },
          tokensUsed: { emojis, colors },
        };
      }
    }
    return out;
  };

  const groups = processBarrel(groupsBarrel, "groups");
  const widgets = processBarrel(sharedBarrel, "widgets");

  return { groups, widgets, gaps };
}
