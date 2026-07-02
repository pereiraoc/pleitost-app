// Captura o GOLDEN da FICHA DE GRUPO (fence `autosheet-grupo`) — estático +
// estados de tooltip — dirigindo o Obsidian VIVO via CLI (`require` deste
// arquivo), padrão de capture-interactive.cjs. NÃO muta a nota: só lê o DOM
// renderizado e dispara hover (sem efeito de escrita).
//
// Por que aqui e não no plugin: o comando "Capturar goldens" do plugin
// (capture-command.ts) renderiza fences `autosheet-ref` (ficha individual) e a
// registry FIXTURES não conhece o fence `autosheet-grupo`. O plugin fica
// PRISTINE — tooling do design-system vive neste repo.
//
// Artefatos (basename `<slug>__grupo`, formatos ESPELHANDO os serializers do
// plugin pra que ingest-goldens.mjs leia igual aos demais goldens):
//   <out>/<slug>__grupo.dom.html   — porta de src/capture/serialize-dom.ts
//   <out>/<slug>__grupo.css.json   — porta de src/capture/serialize-css.ts
//                                    (CSS_PROPS + captureByClassPrefix
//                                    "dvjs-","cc-","pleitost-","autosheet-")
//   <out>/<slug>__grupo.tree.json  — porta de src/capture/serialize-tree.ts
//   <out>/interactive/<slug>__grupo.interactive.json — tooltips REAIS:
//     inventário de TODOS os triggers [data-tooltip-html] (o payload lossless
//     já vive no atributo, no golden estático) + amostras HOVERADAS de cada
//     tipo (stat-tip / warn-tip / col-hdr / role-token, + variante wealth de
//     largura), com o outerHTML do tooltip flutuante montado, os estilos
//     computados da "moldura" (prova do PARTY_TIP_BASE_STYLES aplicado) e o
//     check payloadEqualsRendered (payload do atributo == innerHTML exibido).
//
// Uso (CLI; a nota do grupo precisa estar aberta e renderizada):
//   obsidian open file="Carlos, Dante, Mera, Pind, Thoren"
//   obsidian eval code='(async()=>{const P="<staging>/capture-grupo.cjs";
//     delete require.cache[require.resolve(P)];
//     return await require(P).captureCurrent(app,{slug:"golden-grupo",outDir:"<staging>/out"});})()'

const fs = require("fs");
const path = require("path");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Porta fiel de src/capture/serialize-dom.ts ──────────────────────────────

const VOLATILE_ATTRS = new Set([
  "id",
  "data-cm-timestamp",
  "data-autosheet-instance",
  "data-autosheet-gen",
  "data-tab-gen",
]);

const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "source", "track", "wbr",
]);

function canonicalStyle(raw) {
  return raw
    .split(";")
    .map((d) => d.trim())
    .filter(Boolean)
    .map((d) => {
      const colon = d.indexOf(":");
      if (colon < 0) return d;
      return `${d.slice(0, colon).trim().toLowerCase()}: ${d.slice(colon + 1).trim()}`;
    })
    .sort()
    .join("; ");
}

const escText = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function serializeNode(node, out) {
  if (node.nodeType === 3) {
    out.push(escText(node.nodeValue || ""));
    return;
  }
  if (node.nodeType !== 1) return;
  const el = node;
  const tag = el.tagName.toLowerCase();
  out.push("<", tag);
  const attrs = [];
  for (const attr of Array.from(el.attributes)) {
    if (VOLATILE_ATTRS.has(attr.name)) continue;
    if (attr.name === "class") {
      const classes = (attr.value || "").split(/\s+/).filter(Boolean).sort();
      if (classes.length === 0) continue;
      attrs.push({ name: "class", value: classes.join(" ") });
    } else if (attr.name === "style") {
      attrs.push({ name: "style", value: canonicalStyle(attr.value) });
    } else {
      attrs.push({ name: attr.name, value: attr.value });
    }
  }
  attrs.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const a of attrs) out.push(" ", a.name, '="', escAttr(a.value), '"');
  if (VOID_TAGS.has(tag)) {
    out.push(" />");
    return;
  }
  out.push(">");
  for (const child of Array.from(el.childNodes)) serializeNode(child, out);
  out.push("</", tag, ">");
}

function serializeDom(root) {
  const out = [];
  serializeNode(root, out);
  return out.join("");
}

// ── Porta fiel de src/capture/serialize-css.ts ──────────────────────────────

const CSS_PROPS = [
  "display", "visibility", "opacity", "box-sizing", "position",
  "top", "right", "bottom", "left", "z-index",
  "width", "height", "min-width", "min-height", "max-width", "max-height",
  "padding-top", "padding-right", "padding-bottom", "padding-left",
  "margin-top", "margin-right", "margin-bottom", "margin-left",
  "border-top-width", "border-right-width", "border-bottom-width", "border-left-width",
  "border-top-style", "border-right-style", "border-bottom-style", "border-left-style",
  "border-top-color", "border-right-color", "border-bottom-color", "border-left-color",
  "border-top-left-radius", "border-top-right-radius",
  "border-bottom-right-radius", "border-bottom-left-radius",
  "background-color", "background-image", "background-position",
  "background-repeat", "background-size",
  "color", "font-size", "font-weight", "font-style", "line-height",
  "letter-spacing", "text-align", "text-decoration-line", "text-transform",
  "white-space", "overflow-x", "overflow-y",
  "flex-direction", "flex-wrap", "justify-content", "align-items",
  "align-content", "align-self", "gap", "row-gap", "column-gap",
  "grid-template-columns", "grid-template-rows", "grid-template-areas",
  "grid-column", "grid-row", "grid-area",
  "box-shadow", "outline-width", "outline-style", "outline-color",
  "cursor", "pointer-events", "transform", "transition",
];

const CAPTURE_CLASS_PREFIXES = ["dvjs-", "cc-", "pleitost-", "autosheet-"];

function shouldCapture(el) {
  const classes = el.getAttribute("class") || "";
  if (!classes) return false;
  return classes.split(/\s+/).some((c) => CAPTURE_CLASS_PREFIXES.some((p) => c.startsWith(p)));
}

function computePath(root, el) {
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
    const role = cur.getAttribute("data-vc-role");
    const seg = role ? `${lower}[@role=${role}]` : siblings.length > 1 ? `${lower}[${idx}]` : lower;
    parts.unshift(seg);
    cur = parent;
  }
  return parts.join(" > ");
}

function serializeCss(root) {
  const out = {};
  const win = root.ownerDocument.defaultView;
  const queue = [root];
  while (queue.length > 0) {
    const el = queue.shift();
    if (shouldCapture(el)) {
      const style = win.getComputedStyle(el);
      const entry = {};
      for (const p of CSS_PROPS) {
        const v = style.getPropertyValue(p);
        if (v != null && v !== "") entry[p] = v.trim();
      }
      out[computePath(root, el)] = entry;
    }
    for (const child of Array.from(el.children)) queue.push(child);
  }
  return out;
}

// ── Porta fiel de src/capture/serialize-tree.ts ─────────────────────────────

function nodeToSemantic(el) {
  const classes = Array.from(el.classList).sort();
  const attrs = {};
  for (const attr of Array.from(el.attributes)) {
    if (attr.name.startsWith("data-") && attr.name !== "data-vc-role") attrs[attr.name] = attr.value;
    if (attr.name === "href" || attr.name === "src" || attr.name === "type" || attr.name === "name") {
      attrs[attr.name] = attr.value;
    }
  }
  const children = [];
  let directText = "";
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === 1) children.push(nodeToSemantic(child));
    else if (child.nodeType === 3) directText += child.nodeValue || "";
  }
  let text = directText.replace(/\s+/g, " ").trim();
  if (!text) text = null;
  return {
    tag: el.tagName.toLowerCase(),
    role: el.getAttribute("data-vc-role"),
    classes,
    attrs,
    text,
    children,
  };
}

// ── Tooltips (interativo) ────────────────────────────────────────────────────

/** Canonicaliza HTML de tooltip pra comparação/hash (padrão capture-interactive). */
function canon(html) {
  return html
    .replace(/\s(?:data-autosheet-instance|data-cm-timestamp|id)="[^"]*"/g, "")
    .replace(/>\s+</g, "><")
    .trim();
}

function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return "h" + (h >>> 0).toString(16);
}

// Triggers + singletons: espelha tooltip-bind.ts do plugin (fonte de verdade).
const TRIGGER_KINDS = [
  { kind: "stat-tip", selector: ".pleitost-party-stat-tip[data-tooltip-html]", tipId: "pleitost-party-stat-tooltip" },
  { kind: "warn-tip", selector: ".pleitost-party-warn-tip[data-tooltip-html]", tipId: "pleitost-party-stat-tooltip" },
  { kind: "col-hdr", selector: ".pleitost-party-col-hdr[data-tooltip-html]", tipId: "pleitost-party-stat-tooltip" },
  { kind: "role-token", selector: ".pleitost-role-token[data-tooltip-html]", tipId: "pleitost-class-role-tooltip" },
];

// Variante de largura do stat tip na wealth section (tooltip-bind.ts:71-77).
const WEALTH_SCOPE = "table.pleitost-party__wealth-table, .pleitost-party__wealth-hero";

// Estilos da "moldura" que provam PARTY_TIP_BASE_STYLES aplicado + as larguras
// por contexto (setWidth). Subconjunto de CSS_PROPS + min/max-width.
const TIP_FRAME_PROPS = [
  "padding-top", "padding-right", "padding-bottom", "padding-left",
  "border-top-left-radius", "border-top-width", "border-top-style", "border-top-color",
  "background-color", "background-image", "color", "white-space", "text-align",
  "font-size", "line-height", "box-shadow", "opacity", "transform", "transition",
  "z-index", "position", "min-width", "max-width",
];

function mouse(el, type, x, y) {
  el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y }));
}

async function hoverAndCapture(doc, trigger, tipId) {
  const rect = trigger.getBoundingClientRect();
  const x = Math.round(rect.left + rect.width / 2);
  const y = Math.round(rect.top + rect.height / 2);
  mouse(trigger, "mouseover", x, y);
  mouse(trigger, "mousemove", x, y);
  await sleep(250); // transition: opacity 0.12s (PARTY_TIP_BASE_STYLES)
  const tip = doc.getElementById(tipId);
  const visible = !!tip && tip.style.display !== "none" && (tip.textContent || "").trim().length > 0;
  let captured = null;
  if (visible) {
    const cs = doc.defaultView.getComputedStyle(tip);
    const frame = {};
    for (const p of TIP_FRAME_PROPS) {
      const v = cs.getPropertyValue(p);
      if (v != null && v !== "") frame[p] = v.trim();
    }
    captured = {
      outerHtml: canon(tip.outerHTML),
      innerHtml: canon(tip.innerHTML),
      frame,
    };
  }
  mouse(trigger, "mouseout", x, y);
  await sleep(120);
  return captured;
}

/** Rótulo de identificação do trigger: célula/linha em que ele vive. */
function triggerLabel(el) {
  const cellText = (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60);
  const row = el.closest("tr");
  const rowHead = row ? (row.querySelector("th, td") || {}).textContent : null;
  const rowLabel = rowHead ? rowHead.replace(/\s+/g, " ").trim().slice(0, 40) : null;
  return { cellText, rowLabel };
}

// ── Entry ────────────────────────────────────────────────────────────────────

function activeRoot() {
  return document.querySelector(".workspace-leaf.mod-active") || document;
}

function partyRoot() {
  return activeRoot().querySelector(".pleitost-party");
}

async function waitForParty(maxMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const root = partyRoot();
    if (root && (root.textContent || "").trim().length > 0) return root;
    await sleep(400);
  }
  return null;
}

async function waitForQuiet(el, quietMs = 400, maxMs = 6000) {
  let last = el.innerHTML;
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    await sleep(quietMs);
    const now = el.innerHTML;
    if (now === last) return;
    last = now;
  }
}

async function captureCurrent(app, opts) {
  const slug = opts && opts.slug;
  const outDir = opts && opts.outDir;
  if (!slug || !outDir) return { error: "missing slug/outDir" };

  const activeFile = app.workspace.getActiveFile && app.workspace.getActiveFile();
  const fileBefore = activeFile ? await app.vault.read(activeFile) : null;

  const root = await waitForParty();
  if (!root) return { error: "sem .pleitost-party (a nota do grupo está aberta em preview e tem fence autosheet-grupo?)" };
  await waitForQuiet(root);

  const doc = root.ownerDocument;
  const basename = `${slug}__grupo`;
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(path.join(outDir, "interactive"), { recursive: true });

  // ── Estático (formatos do plugin) ──
  fs.writeFileSync(path.join(outDir, `${basename}.dom.html`), serializeDom(root));
  fs.writeFileSync(path.join(outDir, `${basename}.css.json`), JSON.stringify(serializeCss(root), null, 2));
  fs.writeFileSync(path.join(outDir, `${basename}.tree.json`), JSON.stringify(nodeToSemantic(root), null, 2));

  // ── Tooltips ──
  // Inventário completo (payload lossless já está no atributo, dentro do golden
  // estático): contagem por tipo + payloads únicos.
  const inventory = {};
  const uniquePayloads = new Set();
  for (const { kind, selector } of TRIGGER_KINDS) {
    const els = [...root.querySelectorAll(selector)];
    for (const el of els) uniquePayloads.add(canon(el.getAttribute("data-tooltip-html") || ""));
    inventory[kind] = { selector, count: els.length };
  }

  // Amostras hoveradas: 2 por tipo + variante wealth do stat-tip (largura
  // 220/min(92vw,400px) vs default 200/300 — tooltip-bind.ts applyStatTipWidth).
  const samples = [];
  const htmlByHash = {};
  async function sampleOne(kind, tipId, trigger, context) {
    const payload = canon(trigger.getAttribute("data-tooltip-html") || "");
    const cap = await hoverAndCapture(doc, trigger, tipId);
    const entry = {
      kind,
      context,
      tipId,
      trigger: triggerLabel(trigger),
      rendered: !!cap,
      payloadEqualsRendered: cap ? cap.innerHtml === payload : null,
      payloadHash: hash(payload),
      renderedHash: cap ? hash(cap.outerHtml) : null,
      frame: cap ? cap.frame : null,
    };
    htmlByHash[entry.payloadHash] = payload;
    if (cap) htmlByHash[entry.renderedHash] = cap.outerHtml;
    samples.push(entry);
  }

  for (const { kind, selector, tipId } of TRIGGER_KINDS) {
    const els = [...root.querySelectorAll(selector)];
    const nonWealth = els.filter((e) => !e.closest(WEALTH_SCOPE));
    for (const el of nonWealth.slice(0, 2)) await sampleOne(kind, tipId, el, "default");
    if (kind === "stat-tip") {
      const wealth = els.filter((e) => e.closest(WEALTH_SCOPE));
      for (const el of wealth.slice(0, 2)) await sampleOne(kind, tipId, el, "wealth");
    }
  }

  const interactive = {
    slug,
    mode: "grupo",
    tooltips: {
      inventory,
      uniquePayloadsTotal: uniquePayloads.size,
      samples,
      html: htmlByHash,
    },
    panels: {}, // ficha de grupo é read-only, sem painéis pós-clique
  };
  fs.writeFileSync(
    path.join(outDir, "interactive", `${basename}.interactive.json`),
    JSON.stringify(interactive, null, 2),
  );

  // ── Verifica que a nota NÃO sujou ──
  let dirtied = false;
  if (activeFile && fileBefore != null) {
    dirtied = (await app.vault.read(activeFile)) !== fileBefore;
  }

  return {
    slug,
    file: activeFile ? activeFile.path : null,
    domBytes: fs.statSync(path.join(outDir, `${basename}.dom.html`)).size,
    cssEntries: Object.keys(JSON.parse(fs.readFileSync(path.join(outDir, `${basename}.css.json`), "utf8"))).length,
    tooltipInventory: Object.fromEntries(Object.entries(inventory).map(([k, v]) => [k, v.count])),
    uniquePayloads: uniquePayloads.size,
    samplesCaptured: samples.filter((s) => s.rendered).length,
    samplesTotal: samples.length,
    noteDirtied: dirtied,
  };
}

module.exports = { captureCurrent };
