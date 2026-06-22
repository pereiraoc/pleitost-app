import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { EMOJI } from "../../src/shared/emoji-registry";
// @ts-expect-error — módulo .mjs sem tipos (gerador de dev)
import { parseSupercharged } from "../parse-supercharged.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const CSS_PATH = resolve(ROOT, "../../snippets/supercharged-links-gen.css");
const REGISTRY_PATH = resolve(ROOT, "src/shared/emoji-registry.ts");

const sc = parseSupercharged({
  cssPath: CSS_PATH,
  emojiRegistryPath: REGISTRY_PATH,
});

type Entry = {
  attr: string;
  value: string;
  uid: string;
  icon: string | null;
  color: null;
  emojiRegistryPath?: string;
};
const entries: Entry[] = sc.entries;

/** uids declarados no :root do CSS — espinha dorsal: 1 regra por uid. */
function rootUids(): string[] {
  const css = readFileSync(CSS_PATH, "utf8");
  return [...css.matchAll(/--([0-9a-f]{4}-[0-9a-f]{4})-before\s*:/g)].map(
    (m) => m[1],
  );
}

/** Resolve "ns.Key" no objeto EMOJI importado em runtime. */
function emojiAt(path: string): string | undefined {
  const [ns, key] = path.split(".");
  const table = (EMOJI as Record<string, Record<string, string>>)[ns];
  return table?.[key];
}

describe("parse-supercharged (ícones injetados em [[wikilinks]])", () => {
  it("entries não-vazio", () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it("cada entry tem attr/value/icon (shape do contrato)", () => {
    for (const e of entries) {
      expect(typeof e.attr).toBe("string");
      expect(e.attr.length).toBeGreaterThan(0);
      expect(typeof e.value).toBe("string");
      expect(e.value.length).toBeGreaterThan(0);
      // icon é string não-vazia OU null (null só com gap explicando)
      expect(e.icon === null || (typeof e.icon === "string" && e.icon.length > 0)).toBe(true);
      expect(/^[0-9a-f]{4}-[0-9a-f]{4}$/.test(e.uid)).toBe(true);
      expect(e.color).toBeNull(); // CSS gerado não tem cor
    }
  });

  it("uma entry por uid declarado no :root do CSS (sem perder/inventar regra)", () => {
    const declared = rootUids();
    const got = entries.map((e) => e.uid);
    expect(new Set(got).size).toBe(got.length); // sem uid duplicado
    expect(new Set(got)).toEqual(new Set(declared));
  });

  it("attr só assume os data-link-* REAIS do CSS (nada inventado)", () => {
    const css = readFileSync(CSS_PATH, "utf8");
    const real = new Set(
      [...css.matchAll(/data-link-([a-zA-Zçãíéêáâàõôóúû-]+)[*$^~|]?=/g)].map(
        (m) => m[1],
      ),
    );
    for (const e of entries) expect(real.has(e.attr)).toBe(true);
    // e os attrs esperados do domínio estão presentes
    const attrs = new Set(entries.map((e) => e.attr));
    for (const a of ["categoria", "subcategoria", "grupo", "custo", "path"]) {
      expect(attrs.has(a)).toBe(true);
    }
  });

  it("value é capturado verbatim, SEM o operador (*= / $=)", () => {
    // custo usa *= ; path usa $= e *= — o value não pode conter '*'/'$'
    for (const e of entries) {
      expect(e.value.includes("*")).toBe(false);
      expect(e.value.startsWith("=")).toBe(false);
    }
    // operadores existem de fato no CSS (senão o teste acima seria vácuo)
    const css = readFileSync(CSS_PATH, "utf8");
    expect(css.includes('data-link-custo*=')).toBe(true);
    expect(css.includes("data-link-path$=")).toBe(true);
    // e a entry de custo "1A" existe com value exato
    const c = entries.find((e) => e.attr === "custo" && e.value === "1A");
    expect(c).toBeTruthy();
  });

  it("byAttr indexa por attr→value→{uid} consistente com entries", () => {
    for (const e of entries) {
      const cell = sc.byAttr[e.attr]?.[e.value];
      expect(cell).toBeTruthy();
      expect(cell.uid).toBe(e.uid);
      expect(cell.icon).toBe(e.icon);
      expect(cell.color).toBeNull();
      expect(cell.emojiRegistryPath).toBe(e.emojiRegistryPath);
    }
    // grupo é um attr conhecido com cac-marcial
    expect(sc.byAttr.grupo?.["cac-marcial"]?.uid).toBe("0f83-6d47");
  });

  it("ao menos alguns uids cruzam com o emoji-registry", () => {
    const crossed = entries.filter((e) => e.emojiRegistryPath);
    expect(crossed.length).toBeGreaterThan(0);
    // uidToRegistryPath é coerente com as entries cruzadas
    for (const e of crossed) {
      expect(sc.uidToRegistryPath[e.uid]).toBe(e.emojiRegistryPath);
    }
  });

  it("emojiRegistryPath aponta uma chave REAL do EMUJI registry runtime", () => {
    for (const e of entries) {
      if (!e.emojiRegistryPath) continue;
      expect(emojiAt(e.emojiRegistryPath)).toBeTruthy();
    }
    // âncora concreta: cac-marcial → grupoArma.CaCMarcial (= ⚔️ no registry)
    const cac = entries.find(
      (e) => e.attr === "grupo" && e.value === "cac-marcial",
    );
    expect(cac?.emojiRegistryPath).toBe("grupoArma.CaCMarcial");
    expect(emojiAt("grupoArma.CaCMarcial")).toBe(EMOJI.grupoArma.CaCMarcial);
    // path Intuição.md → categoria.Intuicao
    const intu = entries.find(
      (e) => e.attr === "path" && e.value === "Intuição.md",
    );
    expect(intu?.emojiRegistryPath).toBe("categoria.Intuicao");
  });

  it("uids sem cross são reportados em gaps (não silenciados)", () => {
    const uncrossed = entries.filter((e) => !e.emojiRegistryPath);
    if (uncrossed.length > 0) {
      const joined = sc.gaps.join("\n");
      expect(joined).toContain("sem cross no emoji-registry");
      // cada uid não-cruzado aparece citado em algum gap
      for (const e of uncrossed) expect(joined).toContain(e.uid);
    }
  });

  it("ausência de cor está documentada em gaps (color não é chute)", () => {
    expect(sc.gaps.some((g: string) => g.includes("color"))).toBe(true);
  });

  it("saída é JSON-serializável e determinística", () => {
    const a = JSON.stringify(parseSupercharged({ cssPath: CSS_PATH, emojiRegistryPath: REGISTRY_PATH }));
    const b = JSON.stringify(parseSupercharged({ cssPath: CSS_PATH, emojiRegistryPath: REGISTRY_PATH }));
    expect(a).toBe(b);
  });
});
