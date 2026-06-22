import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { EMOJI } from "../../src/shared/emoji-registry";
// @ts-expect-error — módulo .mjs sem tipos (gerador de dev)
import { extractModes } from "../extract-modes.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

const spec = extractModes({ pluginRoot: ROOT });

// Helper: nomes de funções `mountX(...)` chamadas no texto do composer, na
// ordem em que aparecem na fonte. Invariante REAL — não snapshot.
function mountCallOrderInSource(file: string): string[] {
  const text = readFileSync(resolve(ROOT, file), "utf8");
  const re = /\b(mount[A-Z]\w*)\s*\(/g;
  const seen: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    // a 1ª ocorrência de cada mounter de seção; a definição `function build`
    // não casa (não é `mountX(`) e o próprio `mountResumo`/`mountLeitura` só
    // aparece na ASSINATURA (também não seguido de `(` de chamada de seção).
    seen.push(m[1]);
  }
  // dedup preservando ordem (handle chamado 1x; nenhum mounter repete)
  return seen.filter((v, i) => seen.indexOf(v) === i);
}

describe("extract-modes — estrutura derivada da AST (sem invenção)", () => {
  it("não produz gaps contra os arquivos reais do repo", () => {
    expect(spec.gaps).toEqual([]);
  });

  describe("resumo", () => {
    it("mounter é mountResumo", () => {
      expect(spec.resumo.mounter).toBe("mountResumo");
    });

    it("seções em ordem de fonte (header primeiro, inclui periciasBlock)", () => {
      const names = spec.resumo.sections.map((s: { name: string }) => s.name);
      expect(names[0]).toBe("header");
      expect(names).toContain("periciasBlock");
      // header vem ANTES de periciasBlock
      expect(names.indexOf("header")).toBeLessThan(names.indexOf("periciasBlock"));
    });

    it("ordem dos mountFn casa com a sequência de chamadas no fonte", () => {
      const fromSpec = spec.resumo.sections.map((s: { mountFn: string }) => s.mountFn);
      const fromSource = mountCallOrderInSource("src/render/modes/resumo/mount-resumo.ts")
        // o próprio mountResumo aparece só na assinatura `export function mountResumo(` — filtra
        .filter((n) => n !== "mountResumo");
      expect(fromSpec).toEqual(fromSource);
    });

    it("name deriva de mountFn (mountPericiasBlock → periciasBlock)", () => {
      for (const s of spec.resumo.sections as Array<{ name: string; mountFn: string }>) {
        const expected = s.mountFn.slice(5)[0].toLowerCase() + s.mountFn.slice(6);
        expect(s.name).toBe(expected);
        expect(s.mountFn.startsWith("mount")).toBe(true);
      }
    });

    it("hideWhenEmpty é boolean concreto (nunca null) em toda seção", () => {
      for (const s of spec.resumo.sections as Array<{ hideWhenEmpty: unknown }>) {
        expect(typeof s.hideWhenEmpty).toBe("boolean");
      }
    });

    it("header sempre renderiza (false); periciasBlock esconde quando vazio (true)", () => {
      const byName = Object.fromEntries(
        spec.resumo.sections.map((s: { name: string; hideWhenEmpty: boolean }) => [s.name, s.hideWhenEmpty]),
      );
      expect(byName.header).toBe(false);
      expect(byName.periciasBlock).toBe(true);
    });
  });

  describe("leitura", () => {
    it("mounter é mountLeitura", () => {
      expect(spec.leitura.mounter).toBe("mountLeitura");
    });

    it("ordem dos mountFn casa com a sequência de chamadas no fonte", () => {
      const fromSpec = spec.leitura.sections.map((s: { mountFn: string }) => s.mountFn);
      const fromSource = mountCallOrderInSource("src/render/modes/leitura/mount-leitura.ts").filter(
        (n) => n !== "mountLeitura",
      );
      expect(fromSpec).toEqual(fromSource);
    });

    it("toda seção tem blocoLabel verbatim (// Bloco N:) e hideWhenEmpty boolean", () => {
      for (const s of spec.leitura.sections as Array<{ blocoLabel: unknown; hideWhenEmpty: unknown }>) {
        expect(s.blocoLabel).toMatch(/^Bloco \d+$/);
        expect(typeof s.hideWhenEmpty).toBe("boolean");
      }
    });

    it("há 11 blocos distintos (Bloco 1..11) — agrupando as seções", () => {
      const labels = spec.leitura.sections.map((s: { blocoLabel: string }) => s.blocoLabel);
      const distinct = [...new Set(labels)];
      expect(distinct.length).toBe(11);
      // 1ª seção é Bloco 1; última é Bloco 11
      expect(labels[0]).toBe("Bloco 1");
      expect(labels[labels.length - 1]).toBe("Bloco 11");
    });

    it("Bloco 5 agrupa recursosEmRow + magiasBlock (container compartilhado)", () => {
      const bloco5 = spec.leitura.sections
        .filter((s: { blocoLabel: string }) => s.blocoLabel === "Bloco 5")
        .map((s: { name: string }) => s.name);
      expect(bloco5).toContain("recursosEmRow");
      expect(bloco5).toContain("magiasBlock");
    });
  });

  describe("editavel.families", () => {
    it("Heroi tem 6 abas em ordem canônica (Perfil..Anotações)", () => {
      const heroi = spec.editavel.families.Heroi.tabs as Array<{ tabId: string; name: string }>;
      expect(heroi.map((t) => t.tabId)).toEqual([
        "perfil",
        "proficiencias",
        "habilidades",
        "magias",
        "inventario",
        "anotacoes",
      ]);
      expect(heroi[0].name).toBe("Perfil");
      expect(heroi[heroi.length - 1].name).toBe("Anotações");
    });

    it("emojiPath de cada aba Heroi aponta pra registry tabHeroi e resolve no EMOJI", () => {
      for (const t of spec.editavel.families.Heroi.tabs as Array<{ emojiPath: string }>) {
        expect(t.emojiPath.startsWith("tabHeroi.")).toBe(true);
        // o path deve existir de fato no registry EMOJI (fonte de verdade)
        const leaf = t.emojiPath.split(".").reduce<unknown>((acc, k) => {
          return acc && typeof acc === "object" ? (acc as Record<string, unknown>)[k] : undefined;
        }, EMOJI as unknown);
        expect(typeof leaf).toBe("string");
      }
      const perfil = (spec.editavel.families.Heroi.tabs as Array<{ tabId: string; emojiPath: string }>).find(
        (t) => t.tabId === "perfil",
      );
      expect(perfil?.emojiPath).toBe("tabHeroi.Perfil");
    });

    it("file de cada aba Heroi existe no disco e fica em tabs/heroi/", () => {
      for (const t of spec.editavel.families.Heroi.tabs as Array<{ tabId: string; file: string }>) {
        expect(t.file).toMatch(/^src\/render\/tabs\/heroi\/tab-.+\.ts$/);
        expect(existsSync(resolve(ROOT, t.file))).toBe(true);
      }
    });

    it("Monstro e CompanheiroAnimal têm 1 aba cada → tab-completa.ts da família", () => {
      const monstro = spec.editavel.families.Monstro.tabs as Array<{ tabId: string; file: string; emojiPath: string }>;
      const ca = spec.editavel.families.CompanheiroAnimal.tabs as Array<{
        tabId: string;
        file: string;
        emojiPath: string;
      }>;
      expect(monstro).toHaveLength(1);
      expect(ca).toHaveLength(1);
      expect(monstro[0].file).toBe("src/render/tabs/monstro/tab-completa.ts");
      expect(ca[0].file).toBe("src/render/tabs/ca/tab-completa.ts");
      expect(existsSync(resolve(ROOT, monstro[0].file))).toBe(true);
      expect(existsSync(resolve(ROOT, ca[0].file))).toBe(true);
      // emojiPath vem da subcategoria (fonte: EMOJI.subcategoria.*)
      expect(monstro[0].emojiPath).toBe("subcategoria.Monstro");
      expect(ca[0].emojiPath).toBe("subcategoria.CompanheiroAnimal");
    });

    it("só existem as 3 famílias esperadas", () => {
      expect(Object.keys(spec.editavel.families).sort()).toEqual(["CompanheiroAnimal", "Heroi", "Monstro"]);
    });
  });
});
