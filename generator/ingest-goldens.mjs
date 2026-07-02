// L2 · ingest goldens — prova "o que de fato é exibido" lendo os artefatos de
// captura visual reais (tests/visual-capture/captures/*.dom.html + *.css.json).
// Diferente dos extratores L1 (que leem registries/AST), este NÃO inventa nada:
// tudo vem do DOM serializado e do CSS computado capturados pelo legado.
//
// FONTE DE VERDADE / DESCOBERTAS (citadas, verificadas no repo):
//
// 1. "role" semântico = atributo `data-role` emitido pelo PLUGIN nos diamantes
//    interativos (ex.: data-role="attr-FOR", "res-defesa", "magic-anima").
//    O briefing fala em `data-vc-role` — essa é a convenção GENÉRICA do infra de
//    captura (src/capture/serialize-tree.ts lê `data-vc-role`; serialize-css.ts
//    gera `[@role=…]` só quando ele existe). Nenhum golden em disco tem
//    `data-vc-role` (0 ocorrências em todos os 36 artefatos; serialize-tree.role
//    é sempre null). Usar `data-role` é seguir a fonte de verdade real do render,
//    não inventar. Registramos isso em `gaps`. (capture-command.ts:23,136-137)
//
// 2. `data-role` só aparece no modo Interativa (bardo/frankenstein: 20,
//    canino/goblin: 16). Editável/Leitura/Resumo têm rolesCount 0 — verdade do
//    render, não falha.
//
// 3. css.json é indexado por PATH ESTRUTURAL (ex.: "div > div[1] > span"), gerado
//    por captureByClassPrefix("dvjs-","cc-","pleitost-","autosheet-"). Os
//    elementos com `data-role` NÃO carregam esses prefixos de classe, então NUNCA
//    aparecem no css.json (verificado: 0/20 paths de role batem com chaves do
//    css.json). O cruzamento "hiddenRoles via css.json" pedido pelo briefing é
//    portanto estruturalmente vazio; ainda assim o implementamos (procuramos o
//    path do elemento role no css.json) e complementamos com a verdade do render
//    (inline style do próprio elemento / ancestrais).
//
// 4. `visibility:hidden` no css.json é RUÍDO de captura: a captura roda num host
//    offscreen com host.style.visibility="hidden" (capture-command.ts:115), então
//    TODA entrada do css.json herda visibility:hidden (8/8, 16/16, 3/3, 1/1).
//    Tratá-lo como "oculto" marcaria tudo — falso. Para "oculto" consideramos
//    `display:none` (do css.json ou inline) e `visibility:hidden` APENAS quando
//    declarado no inline style do próprio elemento role (não herdado do host).
//
// Saída BOUNDED: emojis são deduplicados (Set), nunca DOM cru.

import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

/** Espelha modeToSlug de src/capture/fixtures.ts (fonte de verdade dos slugs). */
const MODE_TO_SLUG = {
  Editável: "editavel",
  Leitura: "leitura",
  Interativa: "interativa",
  Resumo: "resumo",
  // Ficha de grupo (fence autosheet-grupo) — fixture app-side, capturada por
  // generator/capture-grupo.cjs (o plugin não conhece esse "modo").
  Grupo: "grupo",
};

/** Triggers de tooltip da ficha de grupo — espelha tooltip-bind.ts do plugin
 *  (STAT_TIP_SELECTOR desmembrado por classe + ROLE_TOKEN_SELECTOR). O payload
 *  LOSSLESS de cada tooltip vive no atributo `data-tooltip-html` do golden
 *  estático — este inventário prova cobertura, não re-inventa conteúdo. */
const GRUPO_TOOLTIP_TRIGGERS = {
  "stat-tip": ".pleitost-party-stat-tip[data-tooltip-html]",
  "warn-tip": ".pleitost-party-warn-tip[data-tooltip-html]",
  "col-hdr": ".pleitost-party-col-hdr[data-tooltip-html]",
  "role-token": ".pleitost-role-token[data-tooltip-html]",
};

function modeToSlug(mode) {
  return MODE_TO_SLUG[mode] ?? mode;
}

/**
 * Casa caracteres emoji em texto renderizado:
 *  - pictográfico base (\p{Extended_Pictographic}) com VS16 opcional (U+FE0F),
 *    seguido de zero+ junções ZWJ (U+200D) de mais pictográficos (ex.: 👁️‍🗨️);
 *  - OU keycap: [#*0-9] + VS16 + U+20E3 (ex.: 2️⃣, custos do registry).
 * Glifos tipográficos (▲ ▼ ● ★ → −) NÃO são Extended_Pictographic e portanto
 * não são contados — coerente com "caracteres emoji" do briefing e com a
 * distinção emoji vs. glyph do próprio EMOJI registry (grupo `glyph`).
 */
const EMOJI_RE =
  /\p{Extended_Pictographic}️?(?:‍\p{Extended_Pictographic}️?)*|[#*0-9]️⃣/gu;

/** Emojis ÚNICOS presentes no textContent (não em atributos/estilos), em ordem de 1ª aparição. */
function renderedEmojisFrom(rootEl) {
  const text = rootEl.textContent ?? "";
  const seen = new Set();
  for (const m of text.matchAll(EMOJI_RE)) {
    seen.add(m[0]);
  }
  return [...seen];
}

/** style inline declara display:none ou visibility:hidden? (whitespace-insensitive) */
function inlineHidden(styleAttr) {
  if (!styleAttr) return false;
  const n = styleAttr.replace(/\s+/g, "").toLowerCase();
  return n.includes("display:none") || n.includes("visibility:hidden");
}

/**
 * Reconstrói o path estrutural de `el` relativo a `root` EXATAMENTE como
 * serialize-css.ts/computePath, pra cruzar com as chaves do css.json. Como
 * nenhum golden tem data-vc-role, o ramo de role nunca dispara (sempre o ramo
 * estrutural lower / lower[idx]).
 */
function computeCssPath(root, el) {
  if (el === root) return ":root";
  const parts = [];
  let cur = el;
  while (cur !== root) {
    const parent = cur.parentElement;
    if (!parent) break;
    const tag = cur.tagName;
    const siblings = Array.from(parent.children).filter((c) => c.tagName === tag);
    const idx = siblings.indexOf(cur);
    const lower = tag.toLowerCase();
    const vcRole = cur.getAttribute("data-vc-role");
    const seg = vcRole
      ? `${lower}[@role=${vcRole}]`
      : siblings.length > 1
        ? `${lower}[${idx}]`
        : lower;
    parts.unshift(seg);
    cur = parent;
  }
  return parts.join(" > ");
}

/**
 * Um elemento role está OCULTO se:
 *  - seu próprio inline style ou de algum ancestral (até a raiz, exclusiva)
 *    tem display:none / visibility:hidden; OU
 *  - há entrada correspondente no css.json (cruzando pelo path estrutural) com
 *    display:none (visibility:hidden do css.json é ruído do host — ignorado).
 */
function roleIsHidden(root, el, css) {
  // Verdade do render: inline style próprio/ancestral, EXCLUINDO a raiz.
  // A raiz é o host offscreen da captura (style="…visibility: hidden…",
  // capture-command.ts:115) — seu visibility:hidden é ruído, não decisão de
  // render, então paramos antes de alcançá-la.
  let cur = el;
  while (cur && cur !== root) {
    if (inlineHidden(cur.getAttribute("style"))) return true;
    cur = cur.parentElement;
  }
  // Cruzamento css.json (display:none apenas; visibility:hidden é ruído).
  const path = computeCssPath(root, el);
  const entry = css ? css[path] : undefined;
  if (entry && entry.display === "none") return true;
  return false;
}

function readDom(domPath) {
  const html = readFileSync(domPath, "utf8");
  const dom = new JSDOM(html);
  // Raiz do conteúdo = primeiro elemento do body (o wrapper serializado pelo
  // capture). textContent/querySelectorAll partem daqui.
  const root = dom.window.document.body.firstElementChild;
  if (!root) throw new Error("dom vazio: sem elemento raiz no body");
  return root;
}

function readCss(cssPath) {
  return JSON.parse(readFileSync(cssPath, "utf8"));
}

/**
 * @param {{ capturesDir: string, fixtures: Array<{slug:string, modes:string[]}> }} args
 * @returns {{
 *   fixtures: Record<string, Record<string, {present:true, rolesCount:number, hiddenRoles:string[], renderedEmojis:string[]} | {present:false}>>,
 *   totalsByMode: Record<string, {fixturesPresent:number, fixturesAbsent:number, rolesTotal:number, uniqueEmojisTotal:number}>,
 *   gaps: string[],
 *   notes: string,
 * }}
 */
export function ingestGoldens({ capturesDir, fixtures }) {
  const out = { fixtures: {}, totalsByMode: {} };
  const gaps = [];

  // Agregadores por modo (chaveado pelo slug do modo).
  const totals = {};
  const ensureTotal = (mode) => {
    if (!totals[mode]) {
      totals[mode] = {
        fixturesPresent: 0,
        fixturesAbsent: 0,
        rolesTotal: 0,
        // contagem agregada de emojis distintos vistos no modo (union entre fixtures)
        _emojiUnion: new Set(),
      };
    }
    return totals[mode];
  };

  let sawAnyVcRole = false;

  for (const fixture of fixtures) {
    const slug = fixture.slug;
    out.fixtures[slug] = {};
    for (const mode of fixture.modes) {
      const modeSlug = modeToSlug(mode);
      const t = ensureTotal(modeSlug);
      const basename = `${slug}__${modeSlug}`;
      const domPath = `${capturesDir}/${basename}.dom.html`;
      const cssPath = `${capturesDir}/${basename}.css.json`;

      let root;
      try {
        root = readDom(domPath);
      } catch (err) {
        out.fixtures[slug][modeSlug] = { present: false };
        t.fixturesAbsent++;
        gaps.push(`captura ausente/inválida: ${basename}.dom.html (${describeErr(err)})`);
        continue;
      }

      // css.json é tolerado ausente: sem ele, o cruzamento estrutural é pulado
      // (a detecção de oculto cai pra inline style).
      let css = null;
      try {
        css = readCss(cssPath);
      } catch (err) {
        gaps.push(`css.json ausente/inválido p/ ${basename} (${describeErr(err)}) — hidden via inline style apenas`);
      }

      const roleEls = Array.from(root.querySelectorAll("[data-role]"));
      const hiddenRoles = [];
      for (const el of roleEls) {
        if (roleIsHidden(root, el, css)) {
          const r = el.getAttribute("data-role");
          if (r != null) hiddenRoles.push(r);
        }
      }
      if (root.querySelector("[data-vc-role]")) sawAnyVcRole = true;

      const renderedEmojis = renderedEmojisFrom(root);

      out.fixtures[slug][modeSlug] = {
        present: true,
        rolesCount: roleEls.length,
        hiddenRoles,
        renderedEmojis,
      };

      // Ficha de grupo: inventário dos triggers de tooltip do golden estático
      // (payload lossless no atributo data-tooltip-html). Contagem por tipo +
      // payloads únicos — o conteúdo em si fica no artefato (não infla o bundle).
      if (mode === "Grupo") {
        const tooltipTriggers = {};
        const uniquePayloads = new Set();
        let total = 0;
        for (const [kind, selector] of Object.entries(GRUPO_TOOLTIP_TRIGGERS)) {
          const els = Array.from(root.querySelectorAll(selector));
          for (const el of els) uniquePayloads.add((el.getAttribute("data-tooltip-html") || "").trim());
          tooltipTriggers[kind] = els.length;
          total += els.length;
        }
        out.fixtures[slug][modeSlug].tooltipTriggers = {
          bySelectorKind: tooltipTriggers,
          total,
          uniquePayloads: uniquePayloads.size,
        };
      }

      t.fixturesPresent++;
      t.rolesTotal += roleEls.length;
      for (const e of renderedEmojis) t._emojiUnion.add(e);
    }
  }

  // Finaliza totais (Set -> contagem; chaves JSON-serializáveis).
  for (const [mode, t] of Object.entries(totals)) {
    out.totalsByMode[mode] = {
      fixturesPresent: t.fixturesPresent,
      fixturesAbsent: t.fixturesAbsent,
      rolesTotal: t.rolesTotal,
      uniqueEmojisTotal: t._emojiUnion.size,
    };
  }

  if (!sawAnyVcRole) {
    gaps.push(
      "nenhum elemento data-vc-role nos goldens — role semântico lido de `data-role` (atributo emitido pelo plugin nos diamantes interativos)",
    );
  }

  // ── L2 interativo: tooltips + painéis pós-clique/hover ──────────────────────
  // Capturados via CLI (scripts/capture-interactive.cjs, roda no Obsidian).
  // Distila o TEXTO das tooltips (o "que aparece") e a contagem de painéis por
  // role; o DOM cru fica no artefato referenciado (não infla o bundle). Tolera
  // ausência (vira gap — o passo de captura é manual/CLI, fora do `gen`).
  out.interactive = {};
  const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
  const distillTip = (html) => {
    const doc = new JSDOM(html).window.document;
    const tip = doc.body.firstElementChild;
    if (!tip) return [];
    const lines = [];
    const head = tip.querySelector(".dv-tooltip-head-row");
    if (head) lines.push(norm(head.textContent));
    for (const ln of tip.querySelectorAll(".dv-breakdown-line")) lines.push(norm(ln.textContent));
    if (lines.length === 0) {
      const t = norm(tip.textContent);
      if (t) lines.push(t);
    }
    return lines.filter(Boolean);
  };
  for (const fixture of fixtures) {
    if (!fixture.modes.includes("Interativa")) continue;
    const slug = fixture.slug;
    const rel = `tests/visual-capture/captures/interactive/${slug}__interativa.interactive.json`;
    const artPath = `${capturesDir}/interactive/${slug}__interativa.interactive.json`;
    let art;
    try {
      art = JSON.parse(readFileSync(artPath, "utf8"));
    } catch (err) {
      gaps.push(
        `captura interativa ausente p/ ${slug} (${describeErr(err)}) — rode scripts/capture-interactive.cjs via Obsidian CLI`,
      );
      continue;
    }
    const tooltips = {};
    for (const [role, h] of Object.entries(art.tooltips?.byRole ?? {})) {
      const html = art.tooltips.html?.[h];
      if (html) tooltips[role] = distillTip(html);
    }
    const panels = {};
    for (const [role, hs] of Object.entries(art.panels?.byRole ?? {})) {
      panels[role] = Array.isArray(hs) ? hs.length : 0;
    }
    out.interactive[slug] = {
      artifact: rel,
      tooltips,
      panels,
      counts: { tooltips: Object.keys(tooltips).length, panels: Object.keys(panels).length },
    };
  }

  // ── L2 interativo da FICHA DE GRUPO ─────────────────────────────────────────
  // Artefato de capture-grupo.cjs: amostras HOVERADAS reais por tipo de trigger
  // (com check payload==rendered — prova de que o data-tooltip-html do golden
  // estático é EXATAMENTE o que o tooltip exibe) + estilos da moldura
  // (PARTY_TIP_BASE_STYLES aplicado + larguras observadas por contexto).
  for (const fixture of fixtures) {
    if (!fixture.modes.includes("Grupo")) continue;
    const slug = fixture.slug;
    const rel = `reference/goldens/interactive/${slug}__grupo.interactive.json`;
    const artPath = `${capturesDir}/interactive/${slug}__grupo.interactive.json`;
    let art;
    try {
      art = JSON.parse(readFileSync(artPath, "utf8"));
    } catch (err) {
      gaps.push(
        `captura interativa da ficha de grupo ausente p/ ${slug} (${describeErr(err)}) — rode scripts/capture-grupo.sh`,
      );
      continue;
    }
    const samples = art.tooltips?.samples ?? [];
    const distilled = {};
    const widthsObserved = {};
    for (const s of samples) {
      const key = `${s.kind}:${s.context}`;
      const html = s.renderedHash ? art.tooltips.html?.[s.renderedHash] : null;
      if (html && !distilled[key]) distilled[key] = distillTip(html);
      if (s.frame && !widthsObserved[key]) {
        widthsObserved[key] = { minWidth: s.frame["min-width"] ?? null, maxWidth: s.frame["max-width"] ?? null };
      }
    }
    out.interactive[slug] = {
      artifact: rel,
      tooltips: distilled,
      tooltipFidelity: {
        samplesTotal: samples.length,
        samplesRendered: samples.filter((s) => s.rendered).length,
        payloadEqualsRenderedAll: samples.length > 0 && samples.every((s) => s.payloadEqualsRendered === true),
        widthsObserved,
        inventory: art.tooltips?.inventory ?? {},
        uniquePayloadsTotal: art.tooltips?.uniquePayloadsTotal ?? null,
      },
      panels: {},
      counts: { tooltips: Object.keys(distilled).length, panels: 0 },
    };
  }

  out.gaps = gaps;
  out.notes =
    "rolesCount conta elementos [data-role] (role real do plugin; data-vc-role inexistente nos goldens). " +
    "hiddenRoles cruza css.json (display:none) + inline style do elemento/ancestrais; visibility:hidden do css.json é ruído do host offscreen (capture-command.ts:115) e é ignorado. " +
    "renderedEmojis: caracteres Extended_Pictographic (com VS16/ZWJ) + keycaps no textContent, únicos.";

  return out;
}

function describeErr(err) {
  if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") return "ENOENT";
  return err instanceof Error ? err.message : String(err);
}
