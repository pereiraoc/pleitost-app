// Extrai inline dataview fields (`key:: value`) do corpo markdown.
//
// Duas formas, ambas presentes na vault:
//   1. Linha inteira:   `up:: [[Regras]]`  (inclusive dentro de blocos `%% ... %%`,
//      onde o Dataview ainda os lê — é o padrão usado pra navegação e stats de item).
//   2. Inline colchetado: `texto [dano:: 1d6] mais`  ou  `(tipo:: corte)`.
//
// Mantém a chave EXATA como escrita (não normaliza). Valor com a chave repetida
// vira array. Ordem de inserção preservada (reflete ordem do documento).

const LINE_RE = /^[ \t>]*([\p{L}\p{N}][\p{L}\p{N} _\-/]*?)::[ \t]?(.*)$/u;
const BRACKET_RE = /[[(]([\p{L}\p{N}][\p{L}\p{N} _\-/]*?)::[ \t]?([^\])]*)[\])]/gu;

function add(fields, key, value) {
  const v = value.trim();
  if (key in fields) {
    if (Array.isArray(fields[key])) fields[key].push(v);
    else fields[key] = [fields[key], v];
  } else {
    fields[key] = v;
  }
}

export function parseInlineFields(body) {
  const fields = {};
  const lines = body.split(/\r?\n/);
  for (const line of lines) {
    // Forma 1: linha inteira é um campo (ignora linhas que claramente não são,
    // ex.: contêm `://` de URL antes do `::`).
    const lm = line.match(LINE_RE);
    if (lm && !/:\/\//.test(lm[0].slice(0, lm.index + lm[1].length + 2))) {
      add(fields, lm[1].trim(), lm[2]);
      continue; // linha-campo não costuma ter campo colchetado também
    }
    // Forma 2: campos colchetados embutidos no texto.
    let bm;
    BRACKET_RE.lastIndex = 0;
    while ((bm = BRACKET_RE.exec(line)) !== null) {
      add(fields, bm[1].trim(), bm[2]);
    }
  }
  return fields;
}
