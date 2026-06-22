// Helpers de extração via TypeScript Compiler API.
//
// Avalia object-literals PUROS (strings/números/booleans/objetos/arrays) direto
// da AST — sem executar código e sem bundler. É a forma mais lossless de ler as
// registries (EMOJI/PALETTE/CUSTO_EXTRA): a AST decodifica os escapes `\u{...}`
// para o caractere real, então não há diferença entre o que extraímos e o que o
// código importa em runtime. Qualquer nó NÃO-literal lança erro — nunca perdemos
// um valor computado em silêncio (princípio "no invented strings / no silent gap").

import { readFileSync } from "node:fs";
import ts from "typescript";

/** Lê e parseia um arquivo .ts em um SourceFile (com parentNodes p/ comentários). */
export function parseSourceFile(filePath) {
  const text = readFileSync(filePath, "utf8");
  return ts.createSourceFile(
    filePath,
    text,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  );
}

/** Acha `export const NAME = <init>` (ou `const NAME`) e retorna o nó do initializer. */
export function getExportedConstInitializer(sourceFile, name) {
  for (const stmt of sourceFile.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (ts.isIdentifier(decl.name) && decl.name.text === name && decl.initializer) {
        return decl.initializer;
      }
    }
  }
  return null;
}

/** Remove `as const`, `satisfies T`, `!` e parênteses, expondo o literal interno. */
function unwrap(node) {
  for (;;) {
    if (
      ts.isAsExpression(node) ||
      ts.isParenthesizedExpression(node) ||
      ts.isNonNullExpression(node)
    ) {
      node = node.expression;
      continue;
    }
    if (typeof ts.isSatisfiesExpression === "function" && ts.isSatisfiesExpression(node)) {
      node = node.expression;
      continue;
    }
    break;
  }
  return node;
}

/** Nome de propriedade (Identifier | string literal | numeric literal) → string. */
export function propertyNameToString(name) {
  if (ts.isIdentifier(name)) return name.text;
  if (ts.isStringLiteralLike(name)) return name.text;
  if (ts.isNumericLiteral(name)) return name.text;
  throw new Error(`nome de propriedade não-literal não suportado (kind ${name.kind})`);
}

/**
 * Avalia um literal → valor JS (lossless). Lança em qualquer coisa não-literal,
 * pra nunca perder silenciosamente um valor computado/refenciado.
 */
export function evalLiteral(node) {
  node = unwrap(node);
  if (ts.isStringLiteralLike(node)) return node.text; // decodifica \u{...} → char real
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isPrefixUnaryExpression(node)) {
    const operand = evalLiteral(node.operand);
    if (typeof operand === "number") {
      if (node.operator === ts.SyntaxKind.MinusToken) return -operand;
      if (node.operator === ts.SyntaxKind.PlusToken) return operand;
    }
    throw new Error("operador unário não-suportado em literal");
  }
  if (ts.isObjectLiteralExpression(node)) {
    const obj = {};
    for (const prop of node.properties) {
      if (ts.isPropertyAssignment(prop)) {
        obj[propertyNameToString(prop.name)] = evalLiteral(prop.initializer);
      } else if (ts.isShorthandPropertyAssignment(prop)) {
        throw new Error(`shorthand property não suportada: ${prop.name.text}`);
      } else if (ts.isSpreadAssignment(prop)) {
        throw new Error("spread não suportado em literal");
      } else {
        throw new Error(`propriedade não suportada (kind ${prop.kind})`);
      }
    }
    return obj;
  }
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.map((el) => evalLiteral(el));
  }
  throw new Error(
    `nó não-literal (kind ${node.kind} = ${ts.SyntaxKind[node.kind]}) — não posso avaliar lossless`,
  );
}

/** Conveniência: lê `export const NAME` de um arquivo e avalia o literal. */
export function evalExportedConst(filePath, name) {
  const sf = parseSourceFile(filePath);
  const init = getExportedConstInitializer(sf, name);
  if (!init) throw new Error(`const exportada "${name}" não encontrada em ${filePath}`);
  return evalLiteral(init);
}

export { ts };
