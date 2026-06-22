import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { EMOJI } from "../../src/shared/emoji-registry";
import { PALETTE } from "../../src/render/shared/palette-registry";
// @ts-expect-error — módulo .mjs sem tipos (gerador de dev)
import { extractComponents } from "../extract-components.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

const inv = extractComponents({ pluginRoot: ROOT });

/** path existe na registry? "ns.Key" → membro; "ns.*" (dinâmico) → namespace. */
function pathExists(reg: Record<string, unknown>, path: string): boolean {
  const [ns, key] = path.split(".");
  const table = reg[ns] as Record<string, unknown> | undefined;
  if (!table || typeof table !== "object") return false;
  if (key === "*") return true; // "ns.*" = namespace inteiro (acesso dinâmico)
  return Object.prototype.hasOwnProperty.call(table, key);
}

const allComponents = { ...inv.groups, ...inv.widgets } as Record<
  string,
  {
    file: string;
    role: string | null;
    props: { name: string; type: string | null; jsdoc: string | null }[];
    iconSources: { inline: string[]; supercharged: boolean };
    tokensUsed: { emojis: string[]; colors: string[] };
  }
>;

describe("extract-components (inventário via AST + registries)", () => {
  it("groups inclui perfilCard com file e role não-vazios", () => {
    const perfil = inv.groups.perfilCard;
    expect(perfil).toBeTruthy();
    expect(perfil.file).toBe("src/render/groups/perfil-card.ts");
    expect(existsSync(resolve(ROOT, perfil.file))).toBe(true);
    expect(typeof perfil.role).toBe("string");
    expect((perfil.role as string).length).toBeGreaterThan(0);
  });

  it("props vêm da interface <Nome>Props em ordem-fonte", () => {
    const perfil = inv.groups.perfilCard;
    const names = perfil.props.map((p) => p.name);
    // Ordem-fonte: a interface declara `model` primeiro, depois `readonly`.
    expect(names[0]).toBe("model");
    expect(names[1]).toBe("readonly");
    expect(names).toContain("renderMd");
    // jsdoc bloco capturado verbatim (onMetaChange tem /** ... */).
    const onMeta = perfil.props.find((p) => p.name === "onMetaChange");
    expect(onMeta?.jsdoc && onMeta.jsdoc.length > 0).toBe(true);
  });

  it("captura jsdoc trailing `// ...` quando não há bloco (dropdownLink.links)", () => {
    const dl = inv.widgets.dropdownLink;
    expect(dl).toBeTruthy();
    const links = dl.props.find((p) => p.name === "links");
    expect(links?.type).toBe("string[]");
    expect(links?.jsdoc).toContain("[[X]]");
  });

  it("seleção de componentes é derivada de <Nome>Props — exclui não-componentes", () => {
    // value-exports SEM `type XProps` no barrel não entram.
    expect((inv.widgets as Record<string, unknown>).EMOJI).toBeUndefined();
    expect((inv.widgets as Record<string, unknown>).emoji).toBeUndefined();
    expect((inv.widgets as Record<string, unknown>).palette).toBeUndefined();
    expect((inv.widgets as Record<string, unknown>).labelOfWikilink).toBeUndefined();
    expect((inv.widgets as Record<string, unknown>).currentViewport).toBeUndefined();
    // ...mas componentes reais entram.
    expect(inv.widgets.diamondTier).toBeTruthy();
    expect(inv.widgets.errorDisplay).toBeTruthy();
  });

  it("algum componente tem tokensUsed.emojis não-vazio, e todos validam na registry", () => {
    const withEmojis = Object.values(allComponents).filter((c) => c.tokensUsed.emojis.length > 0);
    expect(withEmojis.length).toBeGreaterThan(0);
    // diamondTier usa só PALETTE; errorDisplay usa EMOJI.ui.Erro.
    expect(inv.widgets.errorDisplay.tokensUsed.emojis).toContain("ui.Erro");
    expect(inv.widgets.diamondTier.tokensUsed.colors).toContain("tier.Bronze");
    // TODO path coletado tem de existir na registry real (lossless).
    for (const c of Object.values(allComponents)) {
      for (const p of c.tokensUsed.emojis) {
        expect(pathExists(EMOJI as Record<string, unknown>, p), `emoji ${p}`).toBe(true);
      }
      for (const p of c.tokensUsed.colors) {
        expect(pathExists(PALETTE as Record<string, unknown>, p), `palette ${p}`).toBe(true);
      }
    }
  });

  it("iconSources.inline espelha tokensUsed.emojis", () => {
    for (const c of Object.values(allComponents)) {
      expect(c.iconSources.inline).toEqual(c.tokensUsed.emojis);
      expect(typeof c.iconSources.supercharged).toBe("boolean");
    }
  });

  it("acesso computado (EMOJI.atributo[id]) vira o namespace dinâmico atributo.*, sem fabricar chave", () => {
    // perfil-card usa EMOJI.atributo[id] (índice dinâmico). Capturamos como
    // "atributo.*" (namespace inteiro usado dinamicamente) — o ícone É renderizado,
    // então não pode sumir; mas NUNCA fabricamos uma chave específica do índice.
    const perfilEmojis = inv.groups.perfilCard.tokensUsed.emojis;
    expect(perfilEmojis).toContain("glyph.ChevronDown");
    expect(perfilEmojis).toContain("perfil.Classe");
    expect(perfilEmojis).toContain("atributo.*");
    // nenhuma chave específica fabricada a partir do índice dinâmico (ex.: atributo.FOR).
    expect(perfilEmojis.some((p) => /^atributo\.(?!\*$)/.test(p))).toBe(false);
    // attrToggle renderiza SÓ EMOJI.atributo[a] — antes vinha [] (bug), agora atributo.*.
    expect(inv.widgets.attrToggle.tokensUsed.emojis).toEqual(["atributo.*"]);
  });

  it("algum componente é supercharged OU há gap explicando", () => {
    const anySuper = Object.values(allComponents).some((c) => c.iconSources.supercharged);
    expect(anySuper || inv.gaps.length > 0).toBe(true);
    // perfilCard emite wikilink cru via renderMd → supercharged.
    expect(inv.groups.perfilCard.iconSources.supercharged).toBe(true);
    // diamondTier não emite wikilink → não-supercharged.
    expect(inv.widgets.diamondTier.iconSources.supercharged).toBe(false);
  });

  it("todo componente referencia um arquivo .ts existente", () => {
    for (const [name, c] of Object.entries(allComponents)) {
      expect(c.file.endsWith(".ts"), name).toBe(true);
      expect(existsSync(resolve(ROOT, c.file)), `${name} -> ${c.file}`).toBe(true);
    }
  });

  it("gaps é array de strings (dados faltantes, nunca chutados)", () => {
    expect(Array.isArray(inv.gaps)).toBe(true);
    for (const g of inv.gaps) expect(typeof g).toBe("string");
  });
});
