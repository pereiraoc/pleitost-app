// Captura de ESTADOS INTERATIVOS da ficha (camada L2 do design-system):
// tooltips (breakdown/source) e painéis pós-clique dos losangos do modo
// Interativa. Roda DENTRO do Obsidian via CLI eval (`require` deste arquivo) —
// dirige o DOM JÁ renderizado pelo plugin (não usa MarkdownRenderer; serializa
// via outerHTML). NÃO muta a ficha: só clica em losangos (seleção de painel =
// localStorage) e dispara hover (sem efeito de escrita). Verificado: a nota não
// suja no git após rodar.
//
// Uso (CLI), uma fixture por vez (a nota precisa estar aberta):
//   obsidian open file="GOLDEN Bardo"
//   obsidian eval code='(async()=>{const P="<abs>/scripts/capture-interactive.cjs";
//     delete require.cache[require.resolve(P)];
//     return await require(P).captureCurrent(app,{slug:"golden-bardo"});})()'

const fs = require("fs");
const path = require("path");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Canonicaliza HTML: remove atributos voláteis e colapsa whitespace entre tags. */
function canon(html) {
  return html
    .replace(/\s(?:data-autosheet-instance|data-cm-timestamp|id)="[^"]*"/g, "")
    .replace(/>\s+</g, "><")
    .trim();
}

/** Hash djb2 (estável) pra deduplicar HTMLs idênticos entre roles. Hex (0-9a-f):
 *  sem a letra "v", então nunca produz o substring "v3" que o lint-no-v3 proíbe. */
function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return "h" + (h >>> 0).toString(16);
}

/** Container do leaf ativo (evita pegar o shell de outra nota ainda no DOM). */
function activeRoot() {
  return document.querySelector(".workspace-leaf.mod-active") || document;
}

function shellRoot() {
  return activeRoot().querySelector(".interativa-shell");
}

async function switchToInterativa() {
  const btn = [...activeRoot().querySelectorAll("button.as-mode-btn")].find((b) => b.dataset.mode === "Interativa");
  if (btn && !btn.classList.contains("is-selected")) {
    btn.click();
    await sleep(2200);
  }
  return !!shellRoot();
}

/** Containers de painel não-vazios do shell (right-panel + sidebar da Vida). */
function panelContainers() {
  const shell = shellRoot();
  if (!shell) return [];
  return [...shell.querySelectorAll(".dv-panel, .dv-vida-panel-slot")].filter(
    (el) => (el.textContent || "").trim().length > 0,
  );
}

/** Hover em cada `.has-breakdown` → captura o DOM da tooltip flutuante. */
async function captureTooltips() {
  const byRole = {};
  const htmlByHash = {};
  const shell = shellRoot();
  if (!shell) return { byRole, htmlByHash, count: 0 };
  const triggers = [...shell.querySelectorAll(".has-breakdown")];
  for (let i = 0; i < triggers.length; i++) {
    const el = triggers[i];
    const owner = el.closest("[data-role]");
    const role = el.dataset.role || (owner && owner.dataset.role) || `idx-${i}`;
    if (byRole[role]) continue; // 1 tooltip por role (representativo)
    try {
      el.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true, clientX: 150, clientY: 150 }));
      el.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 150, clientY: 150 }));
      await sleep(220);
      const tip = document.querySelector(".dv-breakdown-tip.floating") || document.querySelector(".dv-breakdown-tip");
      if (tip) {
        const clone = tip.cloneNode(true);
        clone.removeAttribute("style"); // posição flutuante (left/top/opacity) é volátil → fora
        const h = canon(clone.outerHTML);
        const hh = hash(h);
        htmlByHash[hh] = h;
        byRole[role] = hh;
      }
      el.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
      await sleep(60);
    } catch (e) {
      /* tolera elemento que não abre tooltip */
    }
  }
  return { byRole, htmlByHash, count: Object.keys(byRole).length };
}

/** Clica cada losango → captura o(s) painel(is) que a seleção revela. Registra
 *  só transições reais (set de painéis mudou) → filtra losangos não-clicáveis. */
async function capturePanels() {
  const byRole = {};
  const htmlByHash = {};
  const shell = shellRoot();
  if (!shell) return { byRole, htmlByHash, count: 0 };
  const roles = [...new Set([...shell.querySelectorAll("[data-role]")].map((e) => e.dataset.role))];
  let prevSig = "";
  for (const role of roles) {
    const el = shell.querySelector(`[data-role="${role}"]`);
    if (!el) continue;
    try {
      el.click();
      await sleep(300);
      const hashes = [];
      for (const c of panelContainers()) {
        const h = canon(c.outerHTML);
        if (h.length < 12) continue;
        const hh = hash(h);
        htmlByHash[hh] = h;
        if (!hashes.includes(hh)) hashes.push(hh);
      }
      const sig = hashes.join(",");
      if (sig && sig !== prevSig) {
        byRole[role] = hashes;
        prevSig = sig;
      }
    } catch (e) {
      /* tolera role não-clicável */
    }
  }
  return { byRole, htmlByHash, count: Object.keys(byRole).length };
}

/** Garante que o bloco autosheet renderizou: força reading view (o bloco NÃO
 *  vira sheet em live-preview/source) e rola até o fim (o reading view só monta
 *  o bloco lazy quando ele entra em viewport). */
async function ensureRendered(app) {
  const leaf = app.workspace.activeLeaf;
  if (leaf && leaf.getViewState) {
    const st = leaf.getViewState();
    st.state = Object.assign({}, st.state, { mode: "preview", source: false });
    await leaf.setViewState(st);
    await sleep(900);
  }
  for (let i = 0; i < 12; i++) {
    const v = activeRoot().querySelector(".markdown-preview-view, .markdown-reading-view");
    if (v) v.scrollTop = v.scrollHeight;
    if (activeRoot().querySelector("button.as-mode-btn")) return true;
    await sleep(600);
  }
  return !!activeRoot().querySelector("button.as-mode-btn");
}

/** Captura os estados interativos da ficha ATUALMENTE aberta (uma fixture). */
async function captureCurrent(app, opts) {
  const slug = opts && opts.slug;
  if (!slug) return { error: "missing slug" };
  await ensureRendered(app);
  const ok = await switchToInterativa();
  if (!ok) return { error: "no .interativa-shell after switch (a nota está aberta e tem bloco autosheet?)" };

  const tooltips = await captureTooltips();
  const panels = await capturePanels();

  const out = {
    slug,
    mode: "interativa",
    tooltips: { byRole: tooltips.byRole, html: tooltips.htmlByHash },
    panels: { byRole: panels.byRole, html: panels.htmlByHash },
  };

  const base = app.vault.adapter.basePath;
  const dir =
    (opts && opts.outDir) ||
    path.join(base, ".obsidian/plugins/pleitost-autosheet/tests/visual-capture/captures/interactive");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${slug}__interativa.interactive.json`);
  fs.writeFileSync(file, JSON.stringify(out, null, 2));

  return {
    slug,
    file,
    tooltips: tooltips.count,
    tipHtmls: Object.keys(tooltips.htmlByHash).length,
    panels: panels.count,
    panelHtmls: Object.keys(panels.htmlByHash).length,
  };
}

module.exports = { captureCurrent };
