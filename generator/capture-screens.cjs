// Captura RICA por TELA da ficha viva (substitui a captura offscreen do plugin
// p/ fins de referência de render). Roda DENTRO do Obsidian via CLI `eval`
// (`require` deste arquivo) — dirige o DOM JÁ renderizado pelo plugin no leaf
// ativo, na LARGURA REAL do pane (não no host offscreen de 2705px).
//
// Por que aqui (e não no comando in-app do plugin): só a ficha viva tem
// largura/geometria reais e permite screenshot de PIXEL REAL (Electron
// capturePage). O plugin fica PRISTINE — toda a lógica de captura vive no
// pleitost-app e dirige o plugin de fora.
//
// NÃO MUTA A NOTA: clicar modo/aba/losango só mexe em localStorage + DOM
// (src/render/modes/interativa/active-tab-storage.ts, right-panel-state.ts).
// Verificamos a limpeza do arquivo no fim (snapshot mtime).
//
// Por TELA emite um bundle em <outDir>/<slug>/:
//   <basename>.png          screenshot real (capturePage + stitch vertical)
//   <basename>.geometry.json árvore com rect{x,y,w,h} + visível POR NÓ (coords)
//   <basename>.html          outerHTML fiel (só tira id/instance/timestamp)
//   <basename>.css.json      getComputedStyle dos nós salientes (inclui losangos)
// + <slug>/manifest.json     inventário de telas + meta (largura, dpr, etc.)
//
// Uso (CLI), uma fixture por vez (a nota precisa estar aberta e ativa):
//   export XDG_RUNTIME_DIR=/run/user/1000/.flatpak/md.obsidian.Obsidian/xdg-run
//   obsidian open file="Carlos Facão de Andradas"
//   obsidian eval code='(async()=>{const P="<staged-abs>/capture-screens.cjs";
//     delete require.cache[require.resolve(P)];
//     return await require(P).captureCurrent(app,{slug:"carlos",
//       outDir:"<granted-abs>/out"});})()'

const fs = require("fs");
const path = require("path");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// `@electron/remote` só resolve no module-path do Obsidian (não no deste arquivo
// staged). O eval que nos chama o resolve e injeta via opts.remote. Guardamos
// em escopo de módulo p/ o captureScreenshot usar.
let REMOTE = null;

// ── Propriedades computadas capturadas por nó saliente (espelha src/capture/
//    serialize-css.ts — mesma lista, p/ comparabilidade com os goldens antigos). ──
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
  "background-color", "background-image", "background-position", "background-repeat", "background-size",
  "color", "font-family", "font-size", "font-weight", "font-style",
  "line-height", "letter-spacing", "text-align", "text-decoration-line", "text-transform", "white-space",
  "overflow-x", "overflow-y",
  "flex-direction", "flex-wrap", "justify-content", "align-items", "align-content", "align-self", "flex-grow", "flex-shrink", "flex-basis",
  "gap", "row-gap", "column-gap",
  "grid-template-columns", "grid-template-rows", "grid-template-areas", "grid-column", "grid-row", "grid-area",
  "box-shadow", "outline-width", "outline-style", "outline-color",
  "cursor", "pointer-events", "transform", "transition",
];

// Prefixos de classe "salientes" (design-relevantes) p/ o css.json. Inclui os
// namespaces do plugin; losangos `data-role` entram por terem o atributo.
const SALIENT_PREFIXES = ["dvjs-", "cc-", "pleitost-", "autosheet-", "as-", "dv-", "interativa-", "gm-"];
const SALIENT_TAGS = new Set(["button", "input", "select", "textarea", "img", "h1", "h2", "h3", "h4", "a", "svg"]);

const VOLATILE_ATTR_RE = /\s(?:id|data-autosheet-instance|data-autosheet-gen|data-tab-gen|data-cm-timestamp)="[^"]*"/g;

/** Container do leaf ATIVO (evita pegar shell de outra nota ainda no DOM). */
function activeRoot() {
  return document.querySelector(".workspace-leaf.mod-active") || document;
}

/** Neutraliza position:sticky/fixed no escopo (ex.: breadcrumb/inline-title da
 *  view) — senão o stitch compõe o header fixo na emenda dos slices. Retorna
 *  uma função de restauração. */
function neutralizeSticky(scope) {
  const changed = [];
  for (const el of scope.querySelectorAll("*")) {
    const p = getComputedStyle(el).position;
    if (p === "sticky" || p === "fixed") {
      changed.push([el, el.style.position]);
      el.style.position = "static";
    }
  }
  return () => { for (const [el, v] of changed) el.style.position = v; };
}

/** slug filename-safe a partir de um valor REAL do render (não inventa label):
 *  minúsculas + sem acento + só [a-z0-9-]. */
function slugify(s) {
  return String(s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "x";
}

/** Garante o bloco renderizado: força reading view + rola pro fim (o bloco só
 *  monta lazy ao entrar no viewport). Espelha capture-interactive.cjs. */
async function ensureRendered(app) {
  const leaf = app.workspace.activeLeaf;
  if (leaf && leaf.getViewState) {
    const st = leaf.getViewState();
    st.state = Object.assign({}, st.state, { mode: "preview", source: false });
    await leaf.setViewState(st);
    await sleep(900);
  }
  for (let i = 0; i < 14; i++) {
    const v = activeRoot().querySelector(".markdown-preview-view, .markdown-reading-view");
    if (v) v.scrollTop = v.scrollHeight;
    if (activeRoot().querySelector(".as-sheet")) break;
    await sleep(600);
  }
  // volta ao topo p/ a captura começar previsível
  const v = activeRoot().querySelector(".markdown-preview-view, .markdown-reading-view");
  if (v) v.scrollTop = 0;
  await sleep(200);
  return !!activeRoot().querySelector(".as-sheet");
}

/** A ficha VISÍVEL: dentro do preview/reading view do leaf ativo e com caixa
 *  real (>0). O leaf mantém uma 2ª cópia no source-view (0×0) — ignorá-la. */
function sheetEl() {
  const cands = [
    ...activeRoot().querySelectorAll(
      ".markdown-preview-view .as-sheet, .markdown-reading-view .as-sheet",
    ),
  ];
  let best = null, bestH = 0;
  for (const s of cands) {
    const r = s.getBoundingClientRect();
    if (r.width > 0 && r.height > bestH) { best = s; bestH = r.height; }
  }
  return best || activeRoot().querySelector(".as-sheet");
}
function scrollContainer() {
  const s = sheetEl();
  return (
    (s && (s.closest(".markdown-preview-view") || s.closest(".markdown-reading-view"))) ||
    activeRoot().querySelector(".markdown-preview-view, .markdown-reading-view")
  );
}

// ── Screenshot real: capturePage do pane + stitch vertical (a ficha é mais alta
//    que a viewport). Sem sticky no DOM (verificado) → stitch limpo. ──
async function captureScreenshot(target, outPath) {
  const remote = REMOTE || require("@electron/remote");
  const win = remote.getCurrentWindow();
  const sc = scrollContainer();
  if (!sc) throw new Error("sem scroll container");

  // garante layout: rola a ficha pra dentro da view e espera caixa real (o
  // bloco monta lazy / pode colapsar fora do viewport).
  target.scrollIntoView({ block: "start" });
  for (let i = 0; i < 12 && target.getBoundingClientRect().height < 2; i++) await sleep(200);

  // mede o alvo inteiro (largura real do pane; altura total do layout)
  let tr = target.getBoundingClientRect();
  const cssW = Math.round(tr.width);
  const cssH = Math.round(target.scrollHeight || tr.height);
  const left = Math.max(0, Math.floor(tr.left));

  // neutraliza sticky/fixed (caso haja) durante a captura
  const restoreSticky = neutralizeSticky(activeRoot());

  // alinha topo do alvo ao topo do scroll container
  const scR0 = sc.getBoundingClientRect();
  const baseScroll = sc.scrollTop + (tr.top - scR0.top);

  // Banda útil por slice: pula INSET px do topo do container — é onde o chrome
  // da view (breadcrumb flutuante ~18px) sangra sobre o conteúdo. Passamos
  // contíguo no espaço de CONTEÚDO, então o inset não perde nada.
  const INSET = 30;
  const bandTopVp = Math.round(scR0.top) + INSET;
  const bandH = Math.max(60, Math.floor(scR0.bottom) - bandTopVp);

  // DPR REAL medido do próprio framebuffer: capturePage() SEM rect pega a JANELA
  // INTEIRA de forma confiável (1:1). O sub-rect capturePage(rect) desalinha sob
  // fractional scaling do Wayland (dpr ~1.31): capturava deslocado ~left*(dpr-1)
  // px, deixando faixa vazia à esquerda e cortando o conteúdo à direita. Por isso
  // pegamos a janela toda e RECORTAMOS a banda no canvas, com mapeamento DIP→
  // físico exato (left/top/cssW/h × realDpr) — imune ao bug seja qual for o dpr.
  const probe = await win.webContents.capturePage();
  const realDpr = probe.getSize().width / window.innerWidth || 1;

  const slices = []; // {dataUrl, contentY, srcTop, h}
  let contentY = 0;
  let guard = 0;
  while (contentY < cssH - 1 && guard++ < 120) {
    sc.scrollTop = Math.max(0, baseScroll + contentY - INSET);
    await sleep(110);
    const r = target.getBoundingClientRect();
    // offset de conteúdo (desde o topo do alvo) atualmente em bandTopVp
    let offsetAtBand = bandTopVp - r.top;
    let capTopVp = bandTopVp;
    if (offsetAtBand < contentY) {
      // scroll clampou (1º slice perto do topo): captura do ponto real, sem inset
      capTopVp = r.top + contentY;
      offsetAtBand = contentY;
    }
    const h = Math.min(bandH, Math.ceil(cssH - offsetAtBand));
    if (h <= 0) break;
    // janela inteira; o recorte da banda [left, capTopVp, cssW, h] vem no composite
    const img = await win.webContents.capturePage();
    slices.push({ dataUrl: img.toDataURL(), contentY: offsetAtBand, srcTop: capTopVp, h });
    contentY = offsetAtBand + h;
  }
  restoreSticky();

  const scale = realDpr;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(cssW * scale);
  canvas.height = Math.round(cssH * scale);
  const ctx = canvas.getContext("2d");
  for (const s of slices) {
    const im = new Image();
    await new Promise((res, rej) => { im.onload = res; im.onerror = rej; im.src = s.dataUrl; });
    // recorte físico da banda dentro da janela cheia → topo-esquerda do alvo em (0,*)
    const sx = Math.round(left * scale);
    const sy = Math.round(s.srcTop * scale);
    const sw = Math.min(Math.round(cssW * scale), im.width - sx);
    const sh = Math.min(Math.round(s.h * scale), im.height - sy);
    ctx.drawImage(im, sx, sy, sw, sh, 0, Math.round(s.contentY * scale), sw, sh);
  }
  const png = Buffer.from(canvas.toDataURL("image/png").split(",")[1], "base64");
  fs.writeFileSync(outPath, png);
  // restaura scroll
  sc.scrollTop = 0;
  return { w: canvas.width, h: canvas.height, cssW, cssH, scale: Number(scale.toFixed(3)), slices: slices.length, dpr: Number(realDpr.toFixed(3)) };
}

// ── Geometria: árvore com rect{x,y,w,h} relativo à RAIZ + visível, POR NÓ. ──
function isVisible(el, st) {
  if (st.display === "none" || st.visibility === "hidden") return false;
  if (parseFloat(st.opacity || "1") === 0) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

function serializeGeometry(root) {
  const rootRect = root.getBoundingClientRect();
  const walk = (el) => {
    const st = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const attrs = {};
    for (const a of el.attributes) {
      if (a.name.startsWith("data-") && a.name !== "data-autosheet-instance" && a.name !== "data-autosheet-gen") attrs[a.name] = a.value;
      if (a.name === "href" || a.name === "src" || a.name === "type" || a.name === "aria-label") attrs[a.name] = a.value;
    }
    let directText = "";
    const children = [];
    for (const n of el.childNodes) {
      if (n.nodeType === 1) children.push(walk(n));
      else if (n.nodeType === 3) directText += n.nodeValue || "";
    }
    directText = directText.replace(/\s+/g, " ").trim();
    return {
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute("data-role") || null,
      classes: [...el.classList],
      attrs,
      text: directText || null,
      rect: {
        x: Math.round((r.left - rootRect.left) * 100) / 100,
        y: Math.round((r.top - rootRect.top) * 100) / 100,
        w: Math.round(r.width * 100) / 100,
        h: Math.round(r.height * 100) / 100,
      },
      visible: isVisible(el, st),
      children,
    };
  };
  return {
    root: { w: Math.round(rootRect.width), h: Math.round(rootRect.height) },
    viewport: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio },
    tree: walk(root),
  };
}

// ── CSS computado dos nós salientes (path estrutural estilo serialize-css.ts). ──
function computePath(root, el) {
  if (el === root) return ":root";
  const parts = [];
  let cur = el;
  while (cur && cur !== root) {
    const parent = cur.parentElement;
    if (!parent) break;
    const tag = cur.tagName;
    const sibs = Array.from(parent.children).filter((c) => c.tagName === tag);
    const idx = sibs.indexOf(cur);
    const lower = tag.toLowerCase();
    const role = cur.getAttribute("data-role");
    parts.unshift(role ? `${lower}[@role=${role}]` : sibs.length > 1 ? `${lower}[${idx}]` : lower);
    cur = parent;
  }
  return parts.join(" > ");
}
function isSalient(el) {
  if (el.hasAttribute("data-role")) return true;
  if (SALIENT_TAGS.has(el.tagName.toLowerCase())) return true;
  const cls = el.getAttribute("class") || "";
  if (!cls) return false;
  return cls.split(/\s+/).some((c) => SALIENT_PREFIXES.some((p) => c.startsWith(p)));
}
function serializeCss(root) {
  const out = {};
  const q = [root];
  while (q.length) {
    const el = q.shift();
    if (isSalient(el)) {
      const st = getComputedStyle(el);
      const e = {};
      for (const p of CSS_PROPS) {
        const v = st.getPropertyValue(p);
        if (v != null && v !== "") e[p] = v.trim();
      }
      out[computePath(root, el)] = e;
    }
    for (const c of el.children) q.push(c);
  }
  return out;
}

function faithfulHtml(el) {
  return el.outerHTML.replace(VOLATILE_ATTR_RE, "");
}

/** Captura o bundle completo de UMA tela (sheet no estado atual). */
async function captureScreen(outDir, slug, basename, meta) {
  const root = sheetEl();
  if (!root) throw new Error("sem .as-sheet p/ " + basename);
  const dir = path.join(outDir, slug);
  fs.mkdirSync(dir, { recursive: true });
  const shot = await captureScreenshot(root, path.join(dir, `${basename}.png`));
  fs.writeFileSync(path.join(dir, `${basename}.geometry.json`), JSON.stringify(serializeGeometry(root), null, 2));
  fs.writeFileSync(path.join(dir, `${basename}.css.json`), JSON.stringify(serializeCss(root), null, 2));
  fs.writeFileSync(path.join(dir, `${basename}.html`), faithfulHtml(root));
  return { basename, ...meta, screenshot: shot };
}

// ── Drivers de tela ─────────────────────────────────────────────────────────
/** Botões de modo da ficha VISÍVEL (dedup por modo; fallback fora do .as-sheet). */
function modeButtons() {
  const s = sheetEl();
  const within = s ? [...s.querySelectorAll(".as-mode-btn")].filter((b) => b.dataset && b.dataset.mode) : [];
  if (within.length) return within;
  const all = [...activeRoot().querySelectorAll(".as-mode-btn")].filter((b) => b.dataset && b.dataset.mode);
  const seen = new Set();
  return all.filter((b) => (seen.has(b.dataset.mode) ? false : (seen.add(b.dataset.mode), true)));
}
async function clickMode(btn) {
  if (!btn.classList.contains("is-selected")) {
    btn.click();
    await sleep(1800);
  }
}
/** Botões de aba da ficha VISÍVEL. */
function tabButtons() {
  const s = sheetEl();
  return s ? [...s.querySelectorAll(".as-tab-btn")] : [];
}
/** id da aba ATIVA a partir da classe as-tab-<id> do conteúdo VISÍVEL (verdade
 *  do render; ignora a classe genérica as-tab-content). */
function activeTabId() {
  const s = sheetEl();
  if (!s) return null;
  const contents = [...s.querySelectorAll(".as-tab-content")];
  const vis = contents.find((c) => c.getBoundingClientRect().height > 0) || contents[0];
  if (!vis) return null;
  for (const x of vis.classList) {
    const m = /^as-tab-(.+)$/.exec(x);
    if (m && m[1] !== "content") return m[1];
  }
  return null;
}

/** Captura uma fixture (nota ativa) por todas as telas. */
async function captureCurrent(app, opts) {
  const slug = opts && opts.slug;
  const outDir = opts && opts.outDir;
  if (!slug || !outDir) return { error: "missing slug/outDir" };
  REMOTE = (opts && opts.remote) || null;
  if (!REMOTE) { try { REMOTE = require("@electron/remote"); } catch (e) { return { error: "sem @electron/remote (injete via opts.remote)" }; } }

  const activeFile = app.workspace.getActiveFile && app.workspace.getActiveFile();
  const fileBefore = activeFile ? await app.vault.read(activeFile) : null;

  const ok = await ensureRendered(app);
  if (!ok) return { error: "sem .as-sheet (a nota está aberta e tem bloco autosheet?)" };

  const screens = [];
  const modeList = modeButtons().map((b) => b.dataset.mode);

  for (let mi = 0; mi < modeList.length; mi++) {
    const btn = modeButtons()[mi]; // re-query (re-render invalida refs)
    if (!btn) continue;
    const mode = btn.dataset.mode;
    const mslug = slugify(mode);
    await clickMode(btn);
    await sleep(500);
    if (!sheetEl()) continue;

    // tela base do modo
    screens.push(await captureScreen(outDir, slug, `${mslug}__base`, { mode, screen: "base" }));

    // abas (só Editável/Interativa têm barra de abas funcional). Dedup pelo id
    // REAL da aba ativa (as-tab-<id>): sem id (Resumo/Leitura) ou repetido → não
    // é tela nova, não captura.
    const tabCount = tabButtons().length;
    if (tabCount > 1) {
      const seenTabs = new Set();
      for (let i = 0; i < tabCount; i++) {
        const tb = tabButtons()[i]; // re-query (re-render invalida refs)
        if (!tb) continue;
        const label = (tb.textContent || "").trim();
        tb.click();
        await sleep(900);
        const id = activeTabId();
        if (!id || seenTabs.has(id)) continue;
        seenTabs.add(id);
        screens.push(await captureScreen(outDir, slug, `${mslug}__tab-${slugify(id)}`, { mode, screen: `tab:${id}`, label }));
      }
    }

    // painéis pós-clique dos losangos (só Interativa) — dedup por assinatura
    if (mode === "Interativa") {
      const shell = sheetEl().querySelector(".interativa-shell") || sheetEl();
      const roles = [...new Set([...shell.querySelectorAll("[data-role]")].map((e) => e.dataset.role))];
      let prevSig = "";
      for (const role of roles) {
        const el = shell.querySelector(`[data-role="${role}"]`);
        if (!el) continue;
        el.click();
        await sleep(450);
        // assinatura = texto dos painéis visíveis (detecta transição real)
        const panels = [...sheetEl().querySelectorAll(".dv-panel, .dv-vida-panel-slot")]
          .filter((p) => (p.textContent || "").trim().length > 0);
        const sig = panels.map((p) => (p.textContent || "").trim().slice(0, 40)).join("|");
        if (sig && sig !== prevSig) {
          prevSig = sig;
          screens.push(await captureScreen(outDir, slug, `${mslug}__panel-${slugify(role)}`, { mode, screen: `panel:${role}` }));
        }
      }
    }
  }

  // ── verifica que a nota NÃO sujou ──
  let dirtied = false;
  if (activeFile && fileBefore != null) {
    const fileAfter = await app.vault.read(activeFile);
    dirtied = fileAfter !== fileBefore;
  }

  const manifest = {
    slug,
    file: activeFile ? activeFile.path : null,
    capturedModes: modeList,
    screens: screens.map((s) => ({
      basename: s.basename, mode: s.mode, screen: s.screen, label: s.label || null,
      png: `${s.basename}.png`, w: s.screenshot.w, h: s.screenshot.h,
      cssW: s.screenshot.cssW, cssH: s.screenshot.cssH, scale: s.screenshot.scale, slices: s.screenshot.slices,
    })),
    noteDirtied: dirtied,
  };
  fs.mkdirSync(path.join(outDir, slug), { recursive: true });
  fs.writeFileSync(path.join(outDir, slug, "manifest.json"), JSON.stringify(manifest, null, 2));

  return { slug, screensCount: screens.length, modes: modeList, noteDirtied: dirtied, out: path.join(outDir, slug) };
}

module.exports = { captureCurrent };
