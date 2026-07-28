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
function matchFieldStart(stripped) {
  for (const f of INFO_FIELDS) {
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
function parseInfoCallout(calloutLines) {
  const out = { populacao: null, descricao: null, aparencia: null };
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
    const start = matchFieldStart(line);
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
export function parseLocationBody(body) {
  const out = {
    populacao: null,
    descricao: null,
    aparencia: null,
    locaisInteresse: null,
  };
  if (typeof body !== "string" || body === "") return out;
  const lines = body.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!isCalloutHeader(lines[i])) continue;
    const calloutLines = collectCalloutLines(lines, i);
    if (headerTitleMatches(lines[i], "informações")) {
      const info = parseInfoCallout(calloutLines);
      if (info.populacao != null) out.populacao = info.populacao;
      if (info.descricao != null) out.descricao = info.descricao;
      if (info.aparencia != null) out.aparencia = info.aparencia;
    } else if (headerTitleMatches(lines[i], "distritos e locais de interesse")) {
      out.locaisInteresse = parseLocaisInteresseCallout(calloutLines);
    }
    i += calloutLines.length;
  }
  return out;
}
