// CORTE MESTRE×JOGADOR (2026-08-31, aprovado): o dataset público sai SEM os
// segredos — o espelho gm.json guarda a versão completa dos docs afetados e
// o app só o carrega em Modo Mestre. Três mecanismos, todos declarados na
// vault (Contexto Base + convenções de nota), nunca heurística de render:
//
//  1. WHITELIST DE CAMPOS (`Contexto.gm.campos_publicos` do Base): nas
//     categorias listadas, só os campos públicos ficam no FM e nas linhas de
//     callout-template do corpo — o resto é do mestre. Categoria fora da
//     lista = tudo público (Sistema).
//  2. Callout `> [!gm]` — bloco secreto em qualquer nota/ponto do corpo.
//  3. Seção "Contexto Oculto" (convenção legada) e FM `GM: true` (nota
//     inteira do mestre — fora do índice público).
import { parseLocationBody } from "./parse-location-body.mjs";

/** Chaves estruturais que NUNCA saem do FM público (navegação/identidade). */
const ESTRUTURAIS = new Set([
  "categoria",
  "subcategoria",
  "aliases",
  "alias",
  "dg-publish",
  "Completo",
  "GM",
  "markerTag",
]);

// Forma canônica de um label/chave: espaços e underscores equivalem
// ("Locais de Interesse" ≡ "Locais_de_Interesse").
const norm = (label) =>
  label
    .replace(/[*`]/g, "")
    .trim()
    .replace(/[\s_]+/g, "_");

/** Config `gm` da Contexto-Def base ({ camposPublicos: {categoria: Set} }). */
export function gmConfigFromBase(baseContexto) {
  const cfg = { camposPublicos: new Map() };
  const gm = baseContexto?.gm;
  if (gm && typeof gm === "object" && gm.campos_publicos) {
    for (const [cat, campos] of Object.entries(gm.campos_publicos)) {
      if (Array.isArray(campos)) {
        cfg.camposPublicos.set(
          cat,
          new Set(campos.filter((c) => typeof c === "string").map(norm)),
        );
      }
    }
  }
  return cfg;
}

/** Remove blocos `> [!gm]` (até a primeira linha fora do blockquote). */
function stripGmCallouts(lines) {
  const out = [];
  let dentro = false;
  for (const l of lines) {
    if (/^>\s*\[!gm\]/i.test(l.trim())) {
      dentro = true;
      continue;
    }
    if (dentro) {
      if (l.trim().startsWith(">")) continue;
      dentro = false;
    }
    out.push(l);
  }
  return out;
}

/** Remove seções "Contexto Oculto" (heading até o próximo de nível <=). */
function stripOculto(lines) {
  const out = [];
  let nivel = 0; // 0 = fora
  for (const l of lines) {
    const h = /^(#{1,6})\s+(.*?)\s*$/.exec(l);
    if (h) {
      if (nivel && h[1].length <= nivel) nivel = 0;
      if (!nivel && /contexto oculto/i.test(h[2])) {
        nivel = h[1].length;
        continue;
      }
    }
    if (!nivel) out.push(l);
  }
  return out;
}

/** Linha que INICIA um campo de callout-template: `> [emoji]**Label:** …`.
 *  O DOIS-PONTOS dentro do negrito é obrigatório — nome em negrito na prosa
 *  ("**Entrecanais** *(azul)*…") não é campo. Bullets (`>- …`) são
 *  CONTINUAÇÃO do campo corrente; label começa com letra (exclui
 *  `**[[Org]]:**`). */
const CAMPO_RE = /^>\s*(?!-)[^*\n]*?\*\*([\p{L}][^:*\n]*):\*\*/u;

/** Nas categorias configuradas: mantém só as linhas de campo público (e suas
 *  continuações); campos fora da whitelist somem do corpo público. */
function stripCamposDoCorpo(lines, publicos) {
  const out = [];
  let manterCampo = true; // estado do campo corrente dentro do blockquote
  for (const l of lines) {
    const t = l.trim();
    if (!t.startsWith(">")) {
      manterCampo = true;
      out.push(l);
      continue;
    }
    if (/^>\s*\[!/.test(t)) {
      manterCampo = true; // título de callout sempre fica (limpeza depois)
      out.push(l);
      continue;
    }
    const m = CAMPO_RE.exec(t);
    if (m) manterCampo = publicos.has(norm(m[1]));
    if (manterCampo) out.push(l);
  }
  return out;
}

/** Callouts que ficaram só com o título (todos os campos eram do mestre)
 *  somem do corpo público. */
function limparCalloutsVazios(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (/^>\s*\[!/.test(t)) {
      let j = i + 1;
      let temConteudo = false;
      while (j < lines.length && lines[j].trim().startsWith(">")) {
        if (lines[j].trim().replace(/^>+/, "").trim() !== "") temConteudo = true;
        j += 1;
      }
      if (!temConteudo) {
        i = j - 1;
        continue;
      }
    }
    out.push(lines[i]);
  }
  return out;
}

/** Divide um record parseado em versão PÚBLICA + item do espelho gm (null se
 *  o doc não tem nada de mestre). `notaGm` = doc inteiro fora do índice. */
export function gmSplit(record, cfg) {
  const notaGm = record.frontmatter?.GM === true;
  if (notaGm) return { publico: null, gmDoc: record, notaGm: true };

  const publicos = cfg.camposPublicos.get(record.type ?? "");
  let lines = record.body.split("\n");
  lines = stripGmCallouts(lines);
  lines = stripOculto(lines);
  if (publicos) {
    lines = stripCamposDoCorpo(lines, publicos);
    lines = limparCalloutsVazios(lines);
  }
  const bodyPublico = lines.join("\n");

  let fmPublico = record.frontmatter;
  let camposMovidos = 0;
  if (publicos) {
    fmPublico = {};
    for (const [k, v] of Object.entries(record.frontmatter ?? {})) {
      if (ESTRUTURAIS.has(k) || publicos.has(norm(k))) {
        fmPublico[k] = v;
      } else if (v != null && v !== "") {
        camposMovidos += 1;
      }
    }
  }

  const mudou = bodyPublico !== record.body || camposMovidos > 0;
  if (!mudou) return { publico: record, gmDoc: null, notaGm: false };

  const publico = { ...record, frontmatter: fmPublico, body: bodyPublico };
  // Deriva de novo o que nasce do corpo: locationBody e links do público.
  if (record.locationBody !== undefined) {
    publico.locationBody = parseLocationBody(bodyPublico, fmPublico);
  }
  // Links públicos = os que sobrevivem no corpo OU no FM público (Líder etc.).
  const palheiro = bodyPublico + "\n" + JSON.stringify(fmPublico);
  publico.links = (record.links ?? []).filter((l) =>
    palheiro.includes(`[[${l.target}`),
  );
  return { publico, gmDoc: record, notaGm: false };
}
