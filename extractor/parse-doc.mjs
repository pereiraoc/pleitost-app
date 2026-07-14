// Um arquivo .md da vault → um registro lossless (Opção A).
//
// `body` + `frontmatter` reconstroem o documento; `inlineFields`, `ruleElements`,
// `links`, `images`, `headings` são índices DERIVADOS por cima (nunca substituem
// a fonte). A DSL de `Elementos_de_Regra` é estruturada via parser do plugin, mas
// NÃO avaliada — montar/calcular a ficha fica pra depois.

import { parseFrontmatter } from "./parse-frontmatter.mjs";
import { parseInlineFields } from "./parse-inline-fields.mjs";
import { parseLinks } from "./parse-links.mjs";
import { parseRuleElements } from "./load-rule-parser.mjs";
import { parseConditionElements } from "./load-condition-parser.mjs";

const HEADING_RE = /^(#{1,6})[ \t]+(.+?)[ \t]*#*$/;

// Notas de Condição (`categoria: Regra`, `subcategoria: Condição`) guardam as
// `Elementos_de_Regra` num subsistema PRÓPRIO do plugin (Escalavel/Derivar/
// Somar Condicao.X), que o parser genérico não cobre. Detectar pela subcategoria
// (sinal de dado, não caminho) pra parsear com o parser certo.
const CONDICAO_SUBCATEGORIA = "Condição";

function collectFmStrings(value, keyPath, out) {
  if (typeof value === "string") {
    out.push({ keyPath, value });
  } else if (Array.isArray(value)) {
    for (const v of value) collectFmStrings(v, keyPath, out);
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      collectFmStrings(v, keyPath ? `${keyPath}.${k}` : k, out);
    }
  }
}

function dedupeLinks(links) {
  const seen = new Set();
  const out = [];
  for (const l of links) {
    const key = `${l.kind}|${l.target}|${l.alias || ""}|${l.subpath || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(l);
  }
  return out;
}

function collectHeadings(body) {
  const headings = [];
  for (const line of body.split(/\r?\n/)) {
    const m = line.match(HEADING_RE);
    if (m) headings.push({ level: m[1].length, text: m[2].trim() });
  }
  return headings;
}

export async function parseDoc({ raw, relPath }) {
  const path = relPath;
  const id = relPath.replace(/\.md$/i, "");
  const basename = id.split("/").pop();

  const fm = parseFrontmatter(raw);
  const frontmatter = fm.frontmatter || {};
  const body = fm.body;

  const type = frontmatter.categoria ?? null;
  const subtype = frontmatter.subcategoria ?? null;
  const grupo = frontmatter.grupo ?? null;

  const inlineFields = parseInlineFields(body);

  // Itens de lista VAZIOS no FM (`Elementos_de_Regra:\n- `) viram null no YAML —
  // não são regra nenhuma; ignorados na fonte pra não virarem "erro" no F7.
  const rawRules = (Array.isArray(frontmatter.Elementos_de_Regra)
    ? frontmatter.Elementos_de_Regra
    : []
  ).filter((r) => r != null && String(r).trim() !== "");
  const ruleElements = await parseRuleElements(rawRules, basename);

  // Condição: parseia as MESMAS linhas pelo subsistema de condição do plugin e
  // funde `condition` em cada elemento (alinhado por índice). O parser genérico
  // devolve `parsed: []` pra esses verbos — o `condition` é que os cobre.
  if (subtype === CONDICAO_SUBCATEGORIA && rawRules.length > 0) {
    const condEls = await parseConditionElements(rawRules, basename);
    for (let i = 0; i < ruleElements.length; i++) {
      if (condEls[i]) ruleElements[i].condition = condEls[i].condition;
    }
  }

  // Links: corpo + valores de frontmatter (FM tem wikilinks em Imagem, disponivel, etc).
  const fmStrings = [];
  collectFmStrings(frontmatter, "", fmStrings);
  const bodyLinks = parseLinks(body);
  const fmLinks = fmStrings.flatMap((s) => parseLinks(s.value));
  const links = dedupeLinks([...bodyLinks, ...fmLinks]);

  // Imagens: campos de FM que apontam imagem + embeds/links de imagem no corpo.
  const images = [];
  const imgSeen = new Set();
  const pushImg = (target, from) => {
    if (!target || imgSeen.has(target + "|" + from)) return;
    imgSeen.add(target + "|" + from);
    images.push({ target, from });
  };
  for (const s of fmStrings) {
    for (const l of parseLinks(s.value)) {
      if (l.isImage) pushImg(l.target, `frontmatter:${s.keyPath}`);
    }
  }
  for (const l of bodyLinks) {
    if (l.isImage) pushImg(l.target, "body");
  }

  const headings = collectHeadings(body);

  const record = {
    id,
    path,
    basename,
    type,
    subtype,
    grupo,
    frontmatter,
    inlineFields,
    ruleElements,
    links,
    images,
    headings,
    body,
  };
  if (fm.frontmatterError) {
    record.frontmatterError = fm.frontmatterError;
    record.frontmatterRaw = fm.frontmatterRaw;
  }
  return record;
}
