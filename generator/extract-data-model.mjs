// L1 · dataModel — lê o modelo interno (InternalSheetModel + auxiliares) direto
// da TS Compiler API sobre src/types/{model,family,interativa-state}.ts. Tudo é
// texto EXATO da AST (member.type.getText) ou doc verbatim — nada é inventado.
// Enums string-literal viram arrays em ORDEM DE FONTE; mapas (interfaces/aliases)
// têm ordem livre (o orquestrador ordena chaves depois). Onde docs/architecture/
// data-model.md existe, a tabela de blocos é extraída verbatim pra `blocks`;
// senão `blocks` é omitido e a ausência vai pra `gaps`.

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { evalExportedConst, parseSourceFile, ts } from "./ast-helpers.mjs";

/** JSDoc verbatim de um nó (interface/alias/member) — string exata da fonte,
 *  incluindo `/** … *​/`. null quando não há bloco JSDoc (trailing `//` NÃO é
 *  JSDoc e é deliberadamente ignorado: não inventamos doc onde não existe). */
function jsdocVerbatim(node, sf) {
  const docs = ts.getJSDocCommentsAndTags(node);
  if (!docs || docs.length === 0) return null;
  const blocks = docs.filter(
    (d) => d.kind === ts.SyntaxKind.JSDoc || d.kind === ts.SyntaxKind.JSDocComment,
  );
  const chosen = blocks.length > 0 ? blocks : docs;
  const text = chosen.map((d) => d.getText(sf)).join("\n");
  return text.length > 0 ? text : null;
}

/** Membros de uma união de string-literais → array (ordem de fonte). Retorna
 *  null se o nó não é união puramente de string-literais (não chutamos). */
function stringLiteralUnionMembers(typeNode, sf) {
  void sf;
  if (!ts.isUnionTypeNode(typeNode)) return null;
  const out = [];
  for (const t of typeNode.types) {
    if (ts.isLiteralTypeNode(t) && ts.isStringLiteralLike(t.literal)) {
      out.push(t.literal.text);
    } else {
      return null; // união contém algo que não é string-literal → não é "enum"
    }
  }
  return out;
}

/** Comentário de linha `//` trailing na mesma linha do nó (ex.: um campo cujo
 *  type é `string` mas o `// 'A' | 'B'` ao lado documenta os valores válidos).
 *  É a ÚNICA doc de alguns campos (OficioState.nome, MovimentoState.nome) —
 *  preservamos em `lineDoc`, separado do jsdoc formal. null se não houver. */
function trailingLineComment(node, sf) {
  const ranges = ts.getTrailingCommentRanges(sf.text, node.end) || [];
  for (const r of ranges) {
    if (r.kind === ts.SyntaxKind.SingleLineCommentTrivia) {
      const txt = sf.text.slice(r.pos, r.end).replace(/^\/\/\s?/, "").trim();
      if (txt.length > 0) return txt;
    }
  }
  return null;
}

/** Coleta todas as interface declarations de um SourceFile (exportadas ou não —
 *  InterativaState não é exportada mas é membro do root e parte do modelo). */
function collectInterfaces(sf, into) {
  for (const stmt of sf.statements) {
    if (!ts.isInterfaceDeclaration(stmt)) continue;
    const fields = [];
    for (const member of stmt.members) {
      if (!ts.isPropertySignature(member)) continue; // ignora index sigs/métodos
      const field = {
        name: propertySigName(member, sf),
        type: member.type ? member.type.getText(sf) : null,
        optional: !!member.questionToken,
        jsdoc: jsdocVerbatim(member, sf),
      };
      const lineDoc = trailingLineComment(member, sf);
      if (lineDoc) field.lineDoc = lineDoc;
      fields.push(field);
    }
    into[stmt.name.text] = { jsdoc: jsdocVerbatim(stmt, sf), fields };
  }
}

/** Nome de um PropertySignature como texto exato da fonte (cobre identifiers,
 *  string-literal keys e computed names sem perder o original). */
function propertySigName(member, sf) {
  return member.name.getText(sf);
}

/** Coleta type-alias declarations → { text, jsdoc }. `skip` exclui nomes já
 *  representados em `enums` (evita duplicar as 4 uniões nomeadas). */
function collectTypeAliases(sf, into, skip) {
  for (const stmt of sf.statements) {
    if (!ts.isTypeAliasDeclaration(stmt)) continue;
    if (skip.has(stmt.name.text)) continue;
    into[stmt.name.text] = {
      text: stmt.type.getText(sf),
      jsdoc: jsdocVerbatim(stmt, sf),
    };
  }
}

/** Acha um type-alias por nome em um SourceFile (ou null). */
function findTypeAlias(sf, name) {
  for (const stmt of sf.statements) {
    if (ts.isTypeAliasDeclaration(stmt) && stmt.name.text === name) return stmt;
  }
  return null;
}

/** Extrai a tabela "Bloco | Para que serve" do data-model.md (verbatim).
 *  Array em ordem de fonte: { name, desc } por linha. null se não achar. */
function extractBlocksTable(mdPath) {
  if (!existsSync(mdPath)) return null;
  const lines = readFileSync(mdPath, "utf8").split(/\r?\n/);
  // localiza a linha de cabeçalho da tabela de blocos
  const headerIdx = lines.findIndex((l) => /^\|\s*Bloco\s*\|/.test(l));
  if (headerIdx === -1) return null;
  const sepIdx = headerIdx + 1;
  if (!/^\|[-\s|]+\|?$/.test(lines[sepIdx]?.trim() ?? "")) return null;
  const rows = [];
  for (let k = sepIdx + 1; k < lines.length; k++) {
    const line = lines[k];
    if (!/^\|/.test(line.trim())) break; // fim da tabela
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 2) continue;
    rows.push({ name: cells[0], desc: cells[1] });
  }
  return rows.length > 0 ? rows : null;
}

/**
 * @param {{ modelPath: string, familyPath: string, interativaStatePath: string,
 *           dataModelDocPath?: string }} paths
 */
export function extractDataModel({ modelPath, familyPath, interativaStatePath, dataModelDocPath }) {
  const gaps = [];

  const modelSf = parseSourceFile(modelPath);
  const familySf = parseSourceFile(familyPath);
  const interativaSf = parseSourceFile(interativaStatePath);

  // ── enums (uniões string-literal nomeadas) ──────────────────────────────
  // AtributoId/PericiaId/Proficiencia vêm de model.ts; SheetFamily de family.ts.
  const atributoAlias = findTypeAlias(modelSf, "AtributoId");
  const periciaAlias = findTypeAlias(modelSf, "PericiaId");
  const profAlias = findTypeAlias(modelSf, "Proficiencia");
  const familyAlias = findTypeAlias(familySf, "SheetFamily");

  const enums = {
    AtributoId: atributoAlias ? stringLiteralUnionMembers(atributoAlias.type, modelSf) : null,
    PericiaId: periciaAlias ? stringLiteralUnionMembers(periciaAlias.type, modelSf) : null,
    Proficiencia: profAlias ? stringLiteralUnionMembers(profAlias.type, modelSf) : null,
    SheetFamily: familyAlias ? stringLiteralUnionMembers(familyAlias.type, familySf) : null,
  };

  // Cross-check com os const arrays runtime ATRIBUTOS/PERICIAS (fonte paralela):
  // se divergirem, é dado incerto → null + gap (nunca silenciar a divergência).
  for (const [name, constName] of [
    ["AtributoId", "ATRIBUTOS"],
    ["PericiaId", "PERICIAS"],
  ]) {
    let runtime;
    try {
      runtime = evalExportedConst(modelPath, constName);
    } catch {
      runtime = null;
    }
    if (runtime && enums[name] && JSON.stringify(runtime) !== JSON.stringify(enums[name])) {
      gaps.push(
        `enums.${name}: união string-literal diverge do const runtime ${constName} — marcado null`,
      );
      enums[name] = null;
    }
  }
  for (const key of Object.keys(enums)) {
    if (enums[key] === null) gaps.push(`enums.${key}: não é uma união string-literal pura`);
  }

  // ── interfaces (de todos os 3 arquivos) ─────────────────────────────────
  const interfaces = {};
  collectInterfaces(modelSf, interfaces);
  collectInterfaces(familySf, interfaces);
  collectInterfaces(interativaSf, interfaces);

  // ── typeAliases (todos os aliases exceto os 4 já em `enums`) ─────────────
  const enumNames = new Set(["AtributoId", "PericiaId", "Proficiencia", "SheetFamily"]);
  const typeAliases = {};
  collectTypeAliases(modelSf, typeAliases, enumNames);
  collectTypeAliases(familySf, typeAliases, enumNames);
  collectTypeAliases(interativaSf, typeAliases, enumNames);

  const result = {
    rootInterface: "InternalSheetModel",
    enums,
    interfaces,
    typeAliases,
  };

  // ── blocks (tabela do doc, se existir) ──────────────────────────────────
  // Default: deriva o caminho do doc a partir de modelPath (src/types/model.ts
  // → ../../docs/architecture/data-model.md) pra honrar "se o doc existir,
  // extraia" mesmo quando o orquestrador não passa dataModelDocPath.
  const mdPath =
    dataModelDocPath ??
    resolve(dirname(modelPath), "..", "..", "docs", "architecture", "data-model.md");
  const blocks = extractBlocksTable(mdPath);
  if (blocks) {
    result.blocks = blocks;
  } else {
    gaps.push(`blocks: tabela de blocos não encontrada em ${mdPath}`);
  }

  if (gaps.length > 0) result.gaps = gaps;
  return result;
}
