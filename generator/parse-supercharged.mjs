// L3 · supercharged — mapeia os ícones que o plugin "supercharged-links"
// injeta via CSS em [[wikilinks]] (ícones que o autosheet NÃO controla mas
// APARECEM nas fichas), cruzados por uid com o EMOJI registry.
//
// Fontes de verdade (nada é inventado):
//   1. supercharged-links-gen.css — scaffold gerado pelo plugin. Define, pra
//      cada uid, UMA regra com seletor `.data-link-icon[data-link-<attr>="<value>" i]`
//      e o `content: var(--<uid>-before)`. As CSS vars `--<uid>-before` vivem
//      num bloco `:root` no topo. NESTE arquivo elas estão vazias (`''`): o
//      plugin obsidian-style-settings move o VALOR real do ícone pro seu
//      data.json (override em runtime). Então o `attr`/`value`/`uid` saem
//      daqui (verdade da regra), mas o `icon` que de fato aparece vem do
//      data.json (resolvido abaixo) com fallback pro literal do CSS.
//   2. obsidian-style-settings/data.json — fonte canônica do ícone INJETADO.
//      Chaveado como `supercharged-links@@<uid>-before` (o prefixo é o `id`
//      do bloco `@settings` do CSS). Path derivado do cssPath (mesma vault).
//   3. emoji-registry.ts — comentários `// uid xxxx-xxxx` ao lado das chaves;
//      dão o cross uid → "namespace.Key".
//
// `color` é SEMPRE null: o CSS gerado não define `--<uid>-color` nem qualquer
// regra de cor (verificado no arquivo real). Ausência registrada em gaps, não
// chutada.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

// ── helpers de parsing puro (regex sobre o texto da fonte) ──────────────────

// Bloco `:root { --<uid>-before: '<icon>'; ... }` no topo do CSS.
//   --0f83-6d47-before: '';            (template vazio)
//   --0f83-6d47-before: '⚔️';          (se o usuário tivesse salvo aqui)
// Capturamos o uid e o literal entre aspas (simples ou duplas) VERBATIM.
const ROOT_VAR_RE =
  /--([0-9a-f]{4}-[0-9a-f]{4})-before\s*:\s*(['"])([\s\S]*?)\2\s*;/g;

// Regra de seletor que casa o atributo do wikilink:
//   .data-link-icon[data-link-grupo="cac-marcial"  i]::before
//   .data-link-icon[data-link-custo*="1A"  i]::before
//   .data-link-icon[data-link-path$="Intuição.md" i]::before
// Capturamos: attr (grupo|subcategoria|categoria|custo|path|...), o operador
// opcional (* ou $), e o value entre aspas. O `var(--<uid>-before)` que segue
// no `content` liga a regra ao uid (capturado no grupo final).
const RULE_RE =
  /\.data-link-icon\[data-link-([a-zA-Zçãíéêáâàõôóúû-]+)([*$^~|]?)=(['"])([\s\S]*?)\3\s*i?\s*\]::before\s*,?\s*\{[^}]*?content\s*:\s*var\(--([0-9a-f]{4}-[0-9a-f]{4})-before\)/g;

// Comentário do registry: `Heroi: "...", // uid f2df-5025`
// Casa a CHAVE (identifier ou string entre aspas) na MESMA linha que o `// uid`.
// Usamos um pré-scan linha-a-linha pra também recuperar o namespace (a chave do
// objeto-pai mais próximo, ex `subcategoria:`).

/** Lê o data.json do style-settings (irmão do CSS) → mapa uid → ícone real. */
function readStyleSettingsIcons(cssPath) {
  // .obsidian/snippets/<css>  →  .obsidian/plugins/obsidian-style-settings/data.json
  const obsidianDir = dirname(dirname(cssPath)); // sobe de snippets/ pra .obsidian/
  const dataPath = join(
    obsidianDir,
    "plugins",
    "obsidian-style-settings",
    "data.json",
  );
  let raw;
  try {
    raw = readFileSync(dataPath, "utf8");
  } catch {
    return null; // sem style-settings → cai no literal do CSS
  }
  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!json || typeof json !== "object") return null;
  const out = {};
  for (const [key, val] of Object.entries(json)) {
    // supercharged-links@@<uid>-before
    const m = /@@([0-9a-f]{4}-[0-9a-f]{4})-before$/.exec(key);
    if (m && typeof val === "string") out[m[1]] = val;
  }
  return out;
}

/**
 * Mapa uid → "namespace.Key" lendo os trailing comments `// uid xxxx-xxxx`
 * do emoji-registry. Rastreia a chave do objeto-pai (linha `<ns>: {`) pra
 * compor o namespace. Determinístico (ordem de fonte, mas o mapa é por uid).
 */
function buildUidToRegistryPath(registryText) {
  const lines = registryText.split(/\r?\n/);
  const map = {};
  // pilha de namespaces: empilha em `<ident>: {` e desempilha em linha com `}`.
  const nsStack = [];
  const NS_OPEN_RE = /^\s*([A-Za-z_$][\w$]*)\s*:\s*\{/;
  const NS_CLOSE_RE = /^\s*\},?\s*$/;
  // chave de uma entry: `Foo: "..."` ou `"Foo Bar": "..."`  na mesma linha do uid
  const ENTRY_KEY_RE = /^\s*(?:([A-Za-z_$][\w$]*)|["']([^"']+)["'])\s*:/;
  const UID_RE = /\/\/[^\n]*\buid\s+([0-9a-f]{4}-[0-9a-f]{4})\b/;

  for (const line of lines) {
    const close = NS_CLOSE_RE.test(line);
    const open = NS_OPEN_RE.exec(line);
    if (open) {
      nsStack.push(open[1]);
      continue; // linha de abertura de namespace não carrega uid de entry
    }
    if (close) {
      nsStack.pop();
      continue;
    }
    const uidM = UID_RE.exec(line);
    if (!uidM) continue;
    const keyM = ENTRY_KEY_RE.exec(line);
    if (!keyM) continue; // uid sem chave reconhecível na linha → ignora
    const key = keyM[1] ?? keyM[2];
    const ns = nsStack.length ? nsStack[nsStack.length - 1] : null;
    map[uidM[1]] = ns ? `${ns}.${key}` : key;
  }
  return map;
}

/**
 * @param {{ cssPath: string, emojiRegistryPath: string }} paths
 * @returns {{
 *   entries: Array<{attr:string,value:string,uid:string,icon:string|null,color:null,emojiRegistryPath?:string}>,
 *   byAttr: Record<string, Record<string, {uid:string,icon:string|null,color:null,emojiRegistryPath?:string}>>,
 *   uidToRegistryPath: Record<string,string>,
 *   gaps: string[]
 * }}
 */
export function parseSupercharged({ cssPath, emojiRegistryPath }) {
  const css = readFileSync(cssPath, "utf8");
  const registryText = readFileSync(emojiRegistryPath, "utf8");

  // 1. literais `--<uid>-before` do :root (verdade da fonte CSS — pode ser "").
  const cssIcons = {}; // uid → string literal (verbatim, sem aspas)
  for (const m of css.matchAll(ROOT_VAR_RE)) cssIcons[m[1]] = m[3];

  // 2. ícone REAL injetado (style-settings data.json, irmão do CSS).
  const ssIcons = readStyleSettingsIcons(cssPath); // null se ausente

  // 3. cross uid → namespace.Key
  const uidToRegistryPath = buildUidToRegistryPath(registryText);

  const gaps = [];
  const entries = [];
  const byAttr = {};
  const seenRuleUids = new Set();

  for (const m of css.matchAll(RULE_RE)) {
    const attr = m[1];
    const op = m[2]; // "" | "*" | "$" | "^" | "~" | "|"
    // matchOp preserva a SEMÂNTICA do seletor CSS: "=" exato, "*=" substring,
    // "$=" sufixo, "^=" prefixo, etc. Sem isso, um consumidor não sabe se o
    // value casa exato ou parcial. (value = só o termo entre aspas.)
    const matchOp = op ? `${op}=` : "=";
    const value = m[4];
    const uid = m[5];
    seenRuleUids.add(uid);

    // ícone: prioriza o style-settings (o que DE FATO aparece na ficha);
    // se ausente lá, usa o literal não-vazio do CSS; senão null + gap.
    let icon = null;
    if (ssIcons && typeof ssIcons[uid] === "string" && ssIcons[uid] !== "") {
      icon = ssIcons[uid];
    } else if (typeof cssIcons[uid] === "string" && cssIcons[uid] !== "") {
      icon = cssIcons[uid];
    }
    if (icon === null) {
      gaps.push(
        `icon ausente p/ uid ${uid} (${attr}${op}="${value}"): --${uid}-before vazio no CSS e sem valor em style-settings/data.json`,
      );
    }

    const entry = {
      attr,
      value,
      matchOp,
      uid,
      icon,
      color: null, // CSS gerado não define cor (sem --<uid>-color); ver gap global
    };
    const regPath = uidToRegistryPath[uid];
    if (regPath) entry.emojiRegistryPath = regPath;

    entries.push(entry);

    (byAttr[attr] ??= {})[value] = {
      uid,
      matchOp,
      icon,
      color: null,
      ...(regPath ? { emojiRegistryPath: regPath } : {}),
    };
  }

  // gap global: ausência de cor é uma propriedade real do CSS gerado.
  gaps.push(
    "color sempre null: supercharged-links-gen.css não define --<uid>-color nem regras de cor (só content/before)",
  );

  // gap: uids de regra que não cruzaram com o registry (esperado p/ attrs que
  // o autosheet não modela, ex categoria=Grupo/Organização/Aventura/Combate).
  const uncrossed = [...seenRuleUids].filter((u) => !uidToRegistryPath[u]);
  if (uncrossed.length) {
    gaps.push(
      `${uncrossed.length} uid(s) de regra sem cross no emoji-registry (sem // uid correspondente): ${uncrossed.sort().join(", ")}`,
    );
  }

  return { entries, byAttr, uidToRegistryPath, gaps };
}
