// Carrega o parser de DSL de rule elements do plugin autosheet — a ÚNICA fonte
// de verdade da gramática (`src/extract/rule-parser.ts`, parser puro, zero imports).
//
// Reuso READ-ONLY: transpila o .ts com o `typescript` (já é devDep) e importa o
// JS resultante via data: URL. Não reimplementamos a gramática (no_invented_strings)
// nem tocamos no repo da vault.

import { readFile } from "node:fs/promises";
import ts from "typescript";
import { RULE_PARSER_TS } from "./paths.mjs";

let cached = null;

export async function loadRuleParser() {
  if (cached) return cached;
  const source = await readFile(RULE_PARSER_TS, "utf8");

  // Guard: o reuso assume parser autocontido. Se ganhar imports relativos no
  // futuro, o import via data: URL falha — melhor falhar claro aqui.
  if (/^\s*import\s.+from\s+['"]\.\.?\//m.test(source)) {
    throw new Error(
      `rule-parser.ts ganhou imports relativos — loader standalone precisa ser revisto: ${RULE_PARSER_TS}`
    );
  }

  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2020,
      isolatedModules: true,
    },
    fileName: "rule-parser.ts",
  }).outputText;

  const mod = await import(
    "data:text/javascript;base64," + Buffer.from(js, "utf8").toString("base64")
  );

  cached = {
    parseRuleLineMulti: mod.parseRuleLineMulti,
    parseRuleLine: mod.parseRuleLine,
    parseRuleBlock: mod.parseRuleBlock,
  };
  return cached;
}

// Aplica o parser a uma lista de linhas cruas de `Elementos_de_Regra`,
// devolvendo um registro `{ raw, parsed[] }` por linha (parsed pode ter >1 regra
// quando a linha expande — ex.: `Restringir Atributos.Principal FOR, AGI`).
export async function parseRuleElements(rawLines, sourceNote) {
  if (!Array.isArray(rawLines) || rawLines.length === 0) return [];
  const { parseRuleLineMulti } = await loadRuleParser();
  return rawLines.map((raw, i) => {
    const line = String(raw);
    let parsed = [];
    let parseError = null;
    try {
      parsed = parseRuleLineMulti(line, sourceNote, i) || [];
    } catch (err) {
      parseError = String(err && err.message ? err.message : err);
    }
    const rec = { raw: line, parsed };
    if (parseError) rec.parseError = parseError;
    return rec;
  });
}
