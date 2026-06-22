// fold-docs — dobra a documentação em prosa VERBATIM, indexada por headingPath.
//
// Não há registry pra prosa: a fonte de verdade é o próprio markdown dos docs
// (arquitetura interna + Documentação Adicional na vault). Este extrator NÃO
// parafraseia nem inventa rótulos — recorta o texto bruto entre headings e o
// devolve byte-a-byte (princípio "no invented strings / no silent gap"). A
// única exceção estruturada é `typography`, lida verbatim da seção de tipografia
// do modes.md; se ausente vira null + gap, nunca um chute hardcoded.
//
// Code fences (``` ... ```) são respeitados: linhas iniciadas por `#` DENTRO de
// um bloco de código são comentários (ex. `# Sem Moral em Monstro` num YAML de
// exemplo), não headings markdown — tratá-las como heading cortaria o corpo
// verbatim no meio. O estado de fence é rastreado por toggle.

import { existsSync, readFileSync } from "node:fs";

/** Divide o texto em linhas preservando o conteúdo exato de cada uma. */
function splitLines(text) {
  return text.split(/\r?\n/);
}

/** Uma linha de cerca de código? (``` opcionalmente seguida de info-string). */
function isFenceLine(line) {
  return /^\s*```/.test(line);
}

/** Heading markdown ATX → {level, text} (apenas fora de code fence). */
function matchHeading(line) {
  const m = /^(#{1,6})[ \t]+(.*)$/.exec(line);
  if (!m) return null;
  return { level: m[1].length, text: m[2].trim() };
}

/**
 * Recorta um doc em entries headingPath → corpo VERBATIM.
 *
 * - headingPath = textos dos headings ancestrais + atual, juntos por " > ".
 * - corpo = linhas BRUTAS entre o heading atual e o PRÓXIMO heading de nível
 *   numérico <= ao atual (mesma profundidade ou mais raso). Logo o corpo de um
 *   H2 engloba seus H3+ filhos verbatim, e cada filho também vira entry própria.
 * - Texto antes do primeiro heading (preâmbulo) é ignorado: sem heading não há
 *   chave, e inventar uma ("preamble", "_root") violaria o princípio.
 */
function foldOneDoc(text) {
  const lines = splitLines(text);

  // 1ª passada: localizar headings reais (fora de fences) e o caminho de cada um.
  const headings = []; // { lineIndex, level, path }
  const stack = []; // ancestrais vivos: { level, text }
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isFenceLine(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const h = matchHeading(line);
    if (!h) continue;
    while (stack.length && stack[stack.length - 1].level >= h.level) stack.pop();
    stack.push({ level: h.level, text: h.text });
    headings.push({
      lineIndex: i,
      level: h.level,
      path: stack.map((s) => s.text).join(" > "),
    });
  }

  // 2ª passada: corpo de cada heading = até o próximo heading de nível <= dele.
  const entries = {};
  for (let h = 0; h < headings.length; h++) {
    const cur = headings[h];
    let endLine = lines.length; // até o EOF por padrão
    for (let j = h + 1; j < headings.length; j++) {
      if (headings[j].level <= cur.level) {
        endLine = headings[j].lineIndex;
        break;
      }
    }
    // corpo = linhas (cur.lineIndex, endLine) — exclui a própria linha do heading.
    const body = lines.slice(cur.lineIndex + 1, endLine).join("\n");
    entries[cur.path] = body;
  }
  return entries;
}

/**
 * Extrai os tiers de tipografia da seção "Hierarquia tipográfica de títulos"
 * do modes.md, VERBATIM. Cada tier é declarado como bullet no formato:
 *   - **Tier H** (13px / weight 500 / caps muted): primeiro nível de container
 *
 * Devolve { tiers, $source } com tiers em ORDEM de fonte. Nada é inventado:
 * name/size/role saem do texto literal; weight é o inteiro escrito após
 * "weight". Se a seção/bullets não existirem, retorna null (e o caller marca
 * gap) — jamais um fallback hardcoded.
 */
function extractTypography(modesEntries) {
  if (!modesEntries) return null;

  // Acha a entry cujo último segmento do path é a seção de tipografia.
  let sectionPath = null;
  let sectionBody = null;
  for (const [path, body] of Object.entries(modesEntries)) {
    const last = path.split(" > ").pop();
    if (/tipogr[áa]fica/i.test(last)) {
      sectionPath = path;
      sectionBody = body;
      break;
    }
  }
  if (sectionBody == null) return null;

  const tiers = [];
  // bullet: "- **<name>** (<attrs>): <role>"
  const bulletRe = /^\s*[-*]\s+\*\*(.+?)\*\*\s*\(([^)]*)\)\s*:\s*(.*)$/;
  for (const rawLine of splitLines(sectionBody)) {
    const m = bulletRe.exec(rawLine);
    if (!m) continue;
    const name = m[1].trim();
    const attrs = m[2]; // ex.: "13px / weight 500 / caps muted"
    const role = m[3].trim();

    // size = primeiro token de tamanho (NNpx / NNrem / NNem), verbatim.
    const sizeMatch = /(\d+(?:\.\d+)?\s*(?:px|rem|em))/i.exec(attrs);
    const size = sizeMatch ? sizeMatch[1].replace(/\s+/g, "") : null;

    // weight = inteiro escrito após a palavra "weight".
    const weightMatch = /weight\s+(\d+)/i.exec(attrs);
    const weight = weightMatch ? Number(weightMatch[1]) : null;

    // style = demais descritores do parêntese (ex.: "caps muted"), verbatim —
    // segmentos separados por "/" que não são size nem weight.
    const styleSegs = attrs
      .split("/")
      .map((s) => s.trim())
      .filter((s) => s && !/\d+(?:\.\d+)?\s*(?:px|rem|em)/i.test(s) && !/^weight\s+\d+/i.test(s));
    const style = styleSegs.length ? styleSegs.join(" / ") : null;

    tiers.push({ name, size, weight, style, role });
  }
  if (tiers.length === 0) return null;

  return { tiers, $source: `docs:modes.md#${sectionPath}` };
}

/**
 * @param {{ docPaths: Array<{ key: string, path: string }> }} args
 *   docPaths: lista de docs a dobrar (o extrator NÃO conhece a lista — recebe-a).
 * @returns {{ docs: Record<string, Record<string,string>>, typography: object|null, gaps: string[] }}
 *   docs: por key, mapa headingPath → corpo VERBATIM.
 *   typography: tiers de tipografia (verbatim) ou null.
 *   gaps: docs ausentes / dados não encontrados (nunca chutados).
 */
export function foldDocs({ docPaths }) {
  const docs = {};
  const gaps = [];

  for (const { key, path } of docPaths) {
    if (!existsSync(path)) {
      gaps.push(`doc ausente: ${key} (${path})`);
      continue;
    }
    const text = readFileSync(path, "utf8");
    const entries = foldOneDoc(text);
    if (Object.keys(entries).length === 0) {
      gaps.push(`doc sem headings: ${key} (${path})`);
    }
    docs[key] = entries;
  }

  // typography sai SEMPRE do doc de key "modes" (arquitetura interna).
  const typography = extractTypography(docs.modes ?? null);
  if (typography == null) {
    gaps.push('typography: seção "Hierarquia tipográfica" não encontrada em modes');
  }

  return { docs, typography, gaps };
}
