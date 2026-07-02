// L2+ · ingest screens — funde a captura RICA por tela (reference/goldens/
// screens/, gerada por capture-screens.cjs) no design-system. NÃO embute os
// bundles inteiros (geometry ~152MB + css ~300MB): distila um inventário
// COMPACTO por tela (screenshot + dims + nós de LANDMARK com rect) e REFERENCIA
// os artefatos no disco pra deep-dive. Tolera ausência (vira gap — a captura é
// manual/CLI, fora do `npm run gen`).
//
// "Landmark" = nó de layout saliente (região/card/painel/losango/header/aba).
// Critério vem da VERDADE do render (data-role do plugin OU classe-componente
// real), nunca de label inventado.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const LANDMARK_CLASS_RE =
  /^(as-shell-header|as-sheet-name|as-mode-switcher|as-tab-bar|as-tab-content|as-shell|interativa-shell|dv-panel|dv-vida|pleitost-party__(accent|body|header|section|wealth-table|wealth-hero)$|.*-card$|.*-cluster$|.*-panel$|.*-box$|.*-diamond.*|.*-section$)/;
const LANDMARK_TAGS = new Set(["h1", "h2", "header", "nav", "table"]);
const LANDMARK_CAP = 140; // teto por tela (evita explodir o bundle)

function isLandmark(node) {
  if (node.role) return true;
  if (LANDMARK_TAGS.has(node.tag)) return true;
  return (node.classes || []).some((c) => LANDMARK_CLASS_RE.test(c));
}

/** Nome estável: @role (verdade do plugin) → classe-componente → tag. */
function landmarkName(node) {
  if (node.role) return "@" + node.role;
  const cls = (node.classes || []).find((c) => LANDMARK_CLASS_RE.test(c));
  return cls || node.tag;
}

function collectLandmarks(tree) {
  const out = [];
  const walk = (n) => {
    if (out.length >= LANDMARK_CAP) return;
    if (isLandmark(n)) {
      const r = n.rect || {};
      const lm = {
        name: landmarkName(n),
        tag: n.tag,
        role: n.role || null,
        rect: [Math.round(r.x ?? 0), Math.round(r.y ?? 0), Math.round(r.w ?? 0), Math.round(r.h ?? 0)],
        visible: n.visible !== false,
      };
      if (n.text) lm.text = n.text.slice(0, 48);
      out.push(lm);
    }
    for (const c of n.children || []) walk(c);
  };
  walk(tree);
  return out;
}

/** Caminho relativo a partir de `reference/` (pra referência portável no bundle). */
function relFrom(p, anchor = "reference/") {
  const i = p.replace(/\\/g, "/").indexOf(anchor);
  return i >= 0 ? p.replace(/\\/g, "/").slice(i) : p;
}

/**
 * @param {{ screensDir: string }} args  — .../reference/goldens/screens
 * @returns inventário compacto por fixture/tela + gaps.
 */
export function ingestScreens({ screensDir }) {
  const out = {
    note: "Captura rica por tela da ficha VIVA (largura real do pane). Cada tela referencia png/html/geometry/css em reference/goldens/screens/<slug>/ (gitignored, regenerável via scripts/capture-screens.sh). landmarks.rect = [x,y,w,h] relativo à raiz da ficha.",
    screensDir: relFrom(screensDir),
    fixtures: {},
    totals: { fixtures: 0, screens: 0 },
  };
  const gaps = [];

  if (!existsSync(screensDir)) {
    gaps.push("captura rica por tela ausente (" + relFrom(screensDir) + ") — rode scripts/capture-screens.sh");
    out.gaps = gaps;
    return out;
  }

  const slugs = readdirSync(screensDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  for (const slug of slugs) {
    const dir = join(screensDir, slug);
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
    } catch (err) {
      gaps.push("manifest ausente/inválido p/ " + slug + " (" + describeErr(err) + ")");
      continue;
    }

    let viewport = null;
    const screens = [];
    for (const s of manifest.screens || []) {
      let root = { w: s.cssW ?? null, h: s.cssH ?? null };
      let landmarks = [];
      try {
        const g = JSON.parse(readFileSync(join(dir, s.basename + ".geometry.json"), "utf8"));
        root = g.root || root;
        if (!viewport && g.viewport) viewport = g.viewport;
        landmarks = collectLandmarks(g.tree);
      } catch (err) {
        gaps.push("geometry ausente p/ " + slug + "/" + s.basename + " (" + describeErr(err) + ")");
      }
      screens.push({
        id: s.basename,
        mode: s.mode,
        screen: s.screen,
        label: s.label || null,
        png: slug + "/" + s.basename + ".png",
        html: slug + "/" + s.basename + ".html",
        geometry: slug + "/" + s.basename + ".geometry.json",
        css: slug + "/" + s.basename + ".css.json",
        root,
        landmarks,
      });
    }

    out.fixtures[slug] = {
      file: manifest.file || null,
      modes: manifest.capturedModes || [],
      viewport,
      noteDirtied: !!manifest.noteDirtied,
      screens,
    };
    out.totals.fixtures++;
    out.totals.screens += screens.length;
  }

  if (gaps.length) out.gaps = gaps;
  return out;
}

function describeErr(err) {
  if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") return "ENOENT";
  return err instanceof Error ? err.message : String(err);
}
