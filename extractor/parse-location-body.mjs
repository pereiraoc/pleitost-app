// Parser dos callouts do body de uma Localização (Atlas/**).
//
// A convenção da vault (herdada do template de Obsidian) grava a prosa da
// ficha DENTRO de callouts do body — o FM tem os campos como placeholders
// vazios (Descrição, Contexto, etc). Este parser extrai a prosa dos dois
// callouts que interessam ao render do compêndio:
//
//   > [!info] Informações da ...
//   > 👥**População:** ...
//   > ℹ️**Descrição:** ...
//   > 👁️**Aparência do Local:** ...
//
//   > [!info] Distritos e Locais de Interesse
//   > **Bairro X** *(cor — orientação)* — descrição.
//   > - **Sub-local:** descrição.
//
// Saída: { populacao, descricao, aparencia, locaisInteresse } — strings
// markdown (sem o prefixo `> ` do callout) ou null quando o campo/callout
// não existe. Aditivo: campos ausentes viram null, não erro.

/** Rótulos que a ficha reconhece (com o emoji obrigatório do template) e
 *  a chave de saída. Ordem = ordem no template, só documenta. */
const INFO_FIELDS = [
  { emoji: "👥", label: "População", key: "populacao" },
  { emoji: "ℹ️", label: "Descrição", key: "descricao" },
  { emoji: "👁️", label: "Aparência do Local", key: "aparencia" },
  // Template POA 1987 (#519): campos extras do callout de informações.
  { emoji: "🛡️", label: "Organizações Influentes", key: "organizacoesInfluentes" },
  { emoji: "📖", label: "Acontecimento Recente", key: "acontecimentoRecente" },
];

/** Campos do callout ABSTRACT ("Contexto do/da ..."): o contexto histórico
 *  da localização (template fantasia usa "Contexto Histórico"; o POA usa
 *  "Contexto"). */
const ABSTRACT_FIELDS = [
  { emoji: "📖", label: "Contexto Histórico", key: "contexto" },
  { emoji: "📖", label: "Contexto", key: "contexto" },
];

/** Retira o prefixo `> `/`>` do callout. Preserva o resto (pode ter `- `,
 *  itálico, wikilinks) — quem renderiza cuida disso. */
function stripCalloutPrefix(line) {
  const m = /^>\s?(.*)$/.exec(line);
  return m ? m[1] : line;
}

/** Detecta o cabeçalho de um novo callout `> [!TYPE] title`. */
function isCalloutHeader(line) {
  return /^>\s*\[!/.test(line);
}

/** Coleta as linhas de um callout começando em `startIdx` (o header) até:
 *   - primeira linha que NÃO começa com `>` (fim do callout), OU
 *   - outro `> [!...]` (novo callout).
 *  Devolve as linhas SEM o header, ainda com o prefixo `> ` (o consumidor
 *  decide quando limpar). */
function collectCalloutLines(lines, startIdx) {
  const out = [];
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!/^>/.test(line)) break;
    if (isCalloutHeader(line)) break;
    out.push(line);
  }
  return out;
}

/** Uma "linha vazia de callout" — só `>` ou `> ` (com opcionais espaços). */
function isBlankCalloutLine(line) {
  return /^>\s*$/.test(line);
}

/** Encontra o campo (emoji + **Label:**) no início de uma linha de callout
 *  (já sem o `> `). Retorna { key, rest } ou null. `rest` é o texto após o
 *  `:` da label. */
function matchFieldStart(stripped, fields = INFO_FIELDS) {
  for (const f of fields) {
    // Emoji pode estar colado ou separado por espaço do **Label:**. O regex
    // aceita zero-width joiners e variação (o 👁️ tem VS-16), então checamos
    // por prefixo textual em vez de regex complexa.
    const prefixA = `${f.emoji}**${f.label}:**`;
    const prefixB = `${f.emoji} **${f.label}:**`;
    if (stripped.startsWith(prefixA)) {
      return { key: f.key, rest: stripped.slice(prefixA.length) };
    }
    if (stripped.startsWith(prefixB)) {
      return { key: f.key, rest: stripped.slice(prefixB.length) };
    }
  }
  return null;
}

/** Extrai campos do callout "Informações" (População/Descrição/Aparência).
 *  Um campo termina quando: linha vazia do callout, próximo campo, ou fim
 *  das linhas. Concatena continuações com \n (raro, mas suportado). */
function parseInfoCallout(calloutLines, fields = INFO_FIELDS) {
  const out = {};
  for (const f of fields) out[f.key] = null;
  let cur = null;
  let buf = [];
  const flush = () => {
    if (cur == null) return;
    const value = buf.join("\n").trim();
    if (value !== "") out[cur] = value;
    cur = null;
    buf = [];
  };
  for (const raw of calloutLines) {
    const line = stripCalloutPrefix(raw);
    if (isBlankCalloutLine(raw)) {
      flush();
      continue;
    }
    const start = matchFieldStart(line, fields);
    if (start) {
      flush();
      cur = start.key;
      buf = [start.rest.trim()];
      continue;
    }
    if (cur != null) buf.push(line);
  }
  flush();
  return out;
}

/** Extrai o corpo (todas as linhas, sem prefixo `>`) do callout
 *  `[!info] Distritos e Locais de Interesse`. Retorna null se não existir. */
function parseLocaisInteresseCallout(calloutLines) {
  if (calloutLines.length === 0) return null;
  const stripped = calloutLines.map(stripCalloutPrefix).join("\n").trim();
  return stripped === "" ? null : stripped;
}

/** Testa se o header casa com o título esperado (case-insensitive, ignora
 *  as expressões dataview `= this.subcategoria`). */
function headerTitleMatches(headerLine, needle) {
  const m = /^>\s*\[!\w+\](.*)$/.exec(headerLine);
  if (!m) return false;
  return m[1].toLowerCase().includes(needle);
}

/** Extrai os blocos da Localização a partir do body. Devolve
 *  { populacao, descricao, aparencia, locaisInteresse } — todos podem ser
 *  null. Nunca inventa: se o callout ou o campo não estão lá, é null. */
/** Resolve refs dataview inline `\`= this.Campo\`` pelo valor do FM: campo
 *  vazio some (o template POA referencia FM placeholder — mostrar o snippet
 *  cru era lixo visual); lista vira "a, b, c". Aplica em substrings. */
function resolveDataviewRefs(texto, fm) {
  if (typeof texto !== "string" || !fm) return texto;
  const resolvido = texto.replace(/`=\s*this\.([\wÀ-ÿ_]+)`/g, (_, campo) => {
    const v = fm[campo];
    if (v == null) return "";
    if (Array.isArray(v)) return v.filter((x) => x != null && String(x).trim() !== "").join(", ");
    return String(v).trim();
  });
  const limpo = resolvido.trim();
  return limpo === "" ? null : limpo;
}

/** Bloco \`\`\`leaflet do template POA (#519): imagem do mapa + bounds +
 *  markers `marker: tipo,lat,long,nome,...`. */
function parseLeafletBlock(body) {
  const m = /```leaflet\r?\n([\s\S]*?)```/.exec(body);
  if (!m) return null;
  const out = { image: null, bounds: null, markers: [] };
  for (const raw of m[1].split(/\r?\n/)) {
    const linha = raw.trim();
    const img = /^image:\s*\[\[(.+?)\]\]/.exec(linha);
    if (img) out.image = img[1].trim();
    const b = /^bounds:\s*\[\[\s*([\d.]+)\s*,\s*([\d.]+)\s*\]\s*,\s*\[\s*([\d.]+)\s*,\s*([\d.]+)\s*\]\]/.exec(linha);
    if (b) out.bounds = [[Number(b[1]), Number(b[2])], [Number(b[3]), Number(b[4])]];
    const mk = /^marker:\s*(.+)$/.exec(linha);
    if (mk) {
      const partes = mk[1].split(",");
      const lat = Number(partes[1]);
      const long = Number(partes[2]);
      const nome = (partes[3] ?? "").trim();
      if (Number.isFinite(lat) && Number.isFinite(long) && nome !== "") {
        out.markers.push({ tipo: (partes[0] ?? "").trim(), lat, long, nome });
      }
    }
  }
  return out.image ? out : null;
}

export function parseLocationBody(body, frontmatter = null) {
  const out = {
    populacao: null,
    descricao: null,
    aparencia: null,
    contexto: null,
    organizacoesInfluentes: null,
    acontecimentoRecente: null,
    locaisInteresse: null,
    leaflet: null,
  };
  if (typeof body !== "string" || body === "") return out;
  const lines = body.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!isCalloutHeader(lines[i])) continue;
    const calloutLines = collectCalloutLines(lines, i);
    if (headerTitleMatches(lines[i], "informações")) {
      const info = parseInfoCallout(calloutLines);
      for (const k of ["populacao", "descricao", "aparencia", "organizacoesInfluentes", "acontecimentoRecente"]) {
        if (info[k] != null) out[k] = info[k];
      }
    } else if (headerTitleMatches(lines[i], "contexto")) {
      const abs = parseInfoCallout(calloutLines, ABSTRACT_FIELDS);
      if (abs.contexto != null) out.contexto = abs.contexto;
    } else if (headerTitleMatches(lines[i], "distritos e locais de interesse")) {
      out.locaisInteresse = parseLocaisInteresseCallout(calloutLines);
    }
    i += calloutLines.length;
  }
  // refs dataview `= this.X` → valor do FM (vazio some)
  for (const k of ["populacao", "descricao", "aparencia", "contexto", "organizacoesInfluentes", "acontecimentoRecente"]) {
    if (out[k] != null) out[k] = resolveDataviewRefs(out[k], frontmatter);
  }
  out.leaflet = parseLeafletBlock(body);
  return out;
}
