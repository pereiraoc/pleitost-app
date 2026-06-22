import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// @ts-expect-error — módulo .mjs sem tipos (gerador de dev)
import { collectDesignSystem } from "../collect.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, "../..");
const VAULT_ROOT = resolve(PLUGIN_ROOT, "../../..");

const bundle = collectDesignSystem({
  pluginRoot: PLUGIN_ROOT,
  vaultRoot: VAULT_ROOT,
  sourceCommit: "test",
});

const diamondCount = (bundle.interativa?.clusters ?? []).reduce(
  (n: number, c: any) => n + (c.diamonds?.length ?? 0),
  0,
);

describe("design-system bundle (integração end-to-end)", () => {
  it("tem todas as seções top-level", () => {
    for (const k of [
      "tokens", "dataModel", "modes", "interativa",
      "components", "tooltips", "grupo", "combatTracker", "icons", "docs", "goldens",
    ]) {
      expect(bundle[k], k).toBeTruthy();
    }
  });

  it("tokens: emojis lossless + cor conhecida + tipografia de docs", () => {
    expect(Object.keys(bundle.tokens.emojis).length).toBeGreaterThan(20);
    expect(bundle.tokens.colors.tier.Gold).toBe("#d4af37");
    expect(bundle.tokens.emojiCostExtra.digits["7"]).toBeTruthy();
  });

  it("modes: Resumo e Leitura com seções ordenadas; Editável 3 famílias", () => {
    expect(bundle.modes.resumo.sections.length).toBeGreaterThan(5);
    expect(bundle.modes.leitura.sections.length).toBeGreaterThan(5);
    expect(Object.keys(bundle.modes.editavel.families)).toEqual(
      expect.arrayContaining(["Heroi", "Monstro", "CompanheiroAnimal"]),
    );
    expect(bundle.modes.editavel.families.Heroi.tabs.length).toBe(6);
  });

  it("interativa: 4 clusters, >=25 diamantes, cada clicável abre painel", () => {
    expect(bundle.interativa.clusters.length).toBe(4);
    expect(diamondCount).toBeGreaterThanOrEqual(25);
    for (const c of bundle.interativa.clusters) {
      for (const d of c.diamonds) {
        expect(typeof d.clickable).toBe("boolean");
        if (d.clickable) expect(d.opensPanel, d.label).toBeTruthy();
        expect(d.label).toBeTruthy();
      }
    }
  });

  it("components: inventário com tokensUsed válidos e algum supercharged", () => {
    expect(Object.keys(bundle.components.groups).length).toBeGreaterThan(5);
    const all = { ...bundle.components.groups, ...bundle.components.widgets };
    const anySupercharged = Object.values(all).some((c: any) => c.iconSources?.supercharged);
    expect(anySupercharged).toBe(true);
  });

  it("icons.supercharged: entries cruzados por uid com o registry", () => {
    expect(bundle.icons.supercharged.entries.length).toBeGreaterThan(10);
    const crossed = bundle.icons.supercharged.entries.filter((e: any) => e.emojiRegistryPath);
    expect(crossed.length).toBeGreaterThan(0);
  });

  it("goldens: ao menos uma fixture interativa renderizou emojis reais", () => {
    const bardo = bundle.goldens.fixtures["golden-bardo"]?.interativa;
    expect(bardo?.present).toBe(true);
    expect(bardo?.renderedEmojis.length).toBeGreaterThan(0);
  });

  it("review-fix: modes hideWhenEmpty exclui family-guards; no-op stubs marcados", () => {
    const L = Object.fromEntries(bundle.modes.leitura.sections.map((s: any) => [s.name, s]));
    expect(L.sentidosTable.hideWhenEmpty).toBe(false);
    expect(L.periciasTable.hideWhenEmpty).toBe(false);
    expect(L.oficiosTable.noop).toBe(true);
    expect(L.recursosEmRow.noop).toBe(true);
  });

  it("review-fix: interativa vida diamonds têm file de procedência real", () => {
    const vida = bundle.interativa.clusters.find((c: any) => c.key === "vida");
    expect(vida.diamonds.find((d: any) => d.variant === "vida").file).toMatch(/diamond-vida\.ts$/);
    expect(vida.diamonds.find((d: any) => d.variant === "side-mini").file).toMatch(/mount-interativa\.ts$/);
  });

  it("review-fix (lows): matchOp, typography.style e dataModel.lineDoc capturados", () => {
    expect(bundle.icons.supercharged.byAttr.custo["1A"].matchOp).toBe("*=");
    expect(bundle.icons.supercharged.byAttr.grupo["cac-marcial"].matchOp).toBe("=");
    expect(bundle.tokens.typography.tiers[0].style).toBe("caps muted");
    const oficioNome = bundle.dataModel.interfaces.OficioState.fields.find((f: any) => f.name === "nome");
    expect(oficioNome.lineDoc).toBeTruthy();
  });

  it("goldens.interactive: tooltips reais destiladas + painéis (capturados via CLI)", () => {
    const iv = bundle.goldens.interactive;
    expect(Object.keys(iv).length).toBeGreaterThanOrEqual(1);
    const bardo = iv["golden-bardo"];
    expect(bardo, "golden-bardo interativo").toBeTruthy();
    expect(bardo.tooltips["res-defesa"].length).toBeGreaterThan(1); // head + linhas de breakdown
    expect(bardo.tooltips["res-defesa"][0]).toMatch(/Defesa/);
    expect(bardo.counts.tooltips).toBeGreaterThan(0);
    expect(bardo.artifact).toMatch(/interactive\/golden-bardo__interativa\.interactive\.json$/);
  });

  it("resumo estrutural (counts) — snapshot estável", () => {
    const summary = {
      emojiNamespaces: Object.keys(bundle.tokens.emojis).length,
      colorGroups: Object.keys(bundle.tokens.colors).length,
      interfaces: Object.keys(bundle.dataModel.interfaces).length,
      enums: Object.keys(bundle.dataModel.enums).length,
      resumoSections: bundle.modes.resumo.sections.length,
      leituraSections: bundle.modes.leitura.sections.length,
      heroiTabs: bundle.modes.editavel.families.Heroi.tabs.length,
      interativaClusters: bundle.interativa.clusters.length,
      diamonds: diamondCount,
      groups: Object.keys(bundle.components.groups).length,
      widgets: Object.keys(bundle.components.widgets).length,
      superchargedEntries: bundle.icons.supercharged.entries.length,
      docKeys: Object.keys(bundle.docs).length,
      gapSections: bundle.$gaps ? Object.keys(bundle.$gaps).sort() : [],
    };
    expect(summary).toMatchSnapshot();
  });
});
