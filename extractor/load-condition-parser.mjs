// Carrega o parser de `Elementos_de_Regra` das notas de Condição do plugin
// autosheet — a ÚNICA fonte de verdade da gramática de condição
// (`src/runtime/condicoes/parse-condition-rule.ts`): Escalavel N,
// Derivar Condicao X, Somar Condicao.<alvo> <v>.
//
// Reuso READ-ONLY, igual ao load-rule-parser.mjs: transpila o .ts e importa via
// data: URL. A diferença é que este parser tem UMA dep runtime — `slugify` de
// `../../util/display-names` (autocontido). Transpilamos o display-names à
// parte, viramos data: URL, e reescrevemos o specifier do import no JS do
// parser pra apontar pra ele (imports entre data: URLs resolvem). Os `import
// type` (model, condition-context) somem no transpile (isolatedModules).
//
// Não reimplementamos a gramática (no_invented_strings) nem tocamos na vault.

import { readFile } from "node:fs/promises";
import ts from "typescript";
import { CONDITION_PARSER_TS, DISPLAY_NAMES_TS } from "./paths.mjs";

let cached = null;

function transpile(source, fileName) {
  return ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2020,
      isolatedModules: true,
    },
    fileName,
  }).outputText;
}

function dataUrl(js) {
  return "data:text/javascript;base64," + Buffer.from(js, "utf8").toString("base64");
}

export async function loadConditionParser() {
  if (cached) return cached;

  // 1) display-names.ts (autocontido) → data: URL exportando slugify.
  const displayNamesSrc = await readFile(DISPLAY_NAMES_TS, "utf8");
  if (/^\s*import\s.+from\s+['"]\.\.?\//m.test(displayNamesSrc)) {
    throw new Error(
      `display-names.ts ganhou imports relativos — o reuso standalone precisa ser revisto: ${DISPLAY_NAMES_TS}`,
    );
  }
  const displayNamesUrl = dataUrl(transpile(displayNamesSrc, "display-names.ts"));

  // 2) parse-condition-rule.ts → transpila e aponta o import de display-names
  //    pro data: URL acima. Só esse import é runtime (o resto é `import type`).
  const parserSrc = await readFile(CONDITION_PARSER_TS, "utf8");
  let parserJs = transpile(parserSrc, "parse-condition-rule.ts");
  parserJs = parserJs.replace(
    /(from\s+['"])\.\.\/\.\.\/util\/display-names(['"])/g,
    `$1${displayNamesUrl}$2`,
  );

  // Guard: se sobrou algum import relativo runtime (novo módulo no futuro), o
  // import via data: URL falharia — melhor um erro claro aqui.
  if (/\bfrom\s+['"]\.\.?\//.test(parserJs)) {
    throw new Error(
      `parse-condition-rule.ts tem import relativo runtime não resolvido — loader precisa ser revisto: ${CONDITION_PARSER_TS}`,
    );
  }

  const mod = await import(dataUrl(parserJs));
  cached = { parseConditionRules: mod.parseConditionRules };
  return cached;
}

// Parseia UMA lista crua de `Elementos_de_Regra` de uma nota de Condição,
// alinhando o resultado a cada linha (um elemento por raw, como o parser
// genérico). Cada elemento ganha `condition` = { scaleMax, rules, derived } da
// linha; `raw` idêntico ao genérico. Falha de parse NUNCA lança (o parser trata
// desconhecido como `{ kind: 'unknown' }`).
export async function parseConditionElements(rawLines, id) {
  if (!Array.isArray(rawLines) || rawLines.length === 0) return [];
  const { parseConditionRules } = await loadConditionParser();
  return rawLines.map((raw) => {
    const line = String(raw);
    const { scaleMax, rules, derived } = parseConditionRules(id, [line]);
    return { raw: line, condition: { scaleMax, rules, derived } };
  });
}
