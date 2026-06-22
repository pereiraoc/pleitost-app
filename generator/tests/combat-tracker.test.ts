import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { EMOJI } from "../../src/shared/emoji-registry";
import { PALETTE } from "../../src/render/shared/palette-registry";
// @ts-expect-error — módulo .mjs sem tipos (gerador de dev)
import { extractCombatTracker } from "../extract-combat-tracker.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

const spec = extractCombatTracker({ pluginRoot: ROOT });

const ALL_EMOJI_VALUES = new Set<string>(
  Object.values(EMOJI as Record<string, Record<string, string>>).flatMap((g) => Object.values(g)),
);
const ALL_PALETTE_VALUES = new Set<string>(
  Object.values(PALETTE as Record<string, Record<string, string>>).flatMap((g) => Object.values(g)),
);

describe("extract-combat-tracker (combat-tracker)", () => {
  it("block é combat-tracker", () => {
    expect(spec.block).toBe("combat-tracker");
  });

  it("extração roda sem gaps", () => {
    expect(spec.gaps).toEqual([]);
  });

  // ── structure.sections ───────────────────────────────────────────
  it("structure.sections é não-vazio e cada seção aponta um arquivo .ts do modo", () => {
    expect(Array.isArray(spec.structure.sections)).toBe(true);
    expect(spec.structure.sections.length).toBeGreaterThan(0);
    for (const sec of spec.structure.sections) {
      expect(typeof sec.name).toBe("string");
      expect(sec.name.length).toBeGreaterThan(0);
      expect(sec.file).toMatch(/^src\/render\/modes\/combat-tracker\/.+\.ts$/);
    }
  });

  it("contém as seções de tabela 'Combate' e 'Aguardando' (títulos reais de renderTableSection)", () => {
    const names = spec.structure.sections.map((s: { name: string }) => s.name);
    expect(names).toContain("Combate");
    expect(names).toContain("Aguardando");
    const mount = readFileSync(resolve(ROOT, "src/render/modes/combat-tracker/mount-tracker.ts"), "utf8");
    // Os títulos são argumentos literais de renderTableSection no render().
    expect(mount).toMatch(/renderTableSection\(\s*root\s*,\s*"Combate"/);
    expect(mount).toMatch(/renderTableSection\(\s*root\s*,\s*"Aguardando"/);
    // E "Combate" vem antes de "Aguardando" (ordem de render).
    expect(names.indexOf("Combate")).toBeLessThan(names.indexOf("Aguardando"));
  });

  it("inclui o card 'Adicionar combatentes' como primeira seção (sectiontitle real)", () => {
    expect(spec.structure.sections[0].name).toBe("Adicionar combatentes");
    const card = readFileSync(
      resolve(ROOT, "src/render/modes/combat-tracker/components/add-combatants-card.ts"),
      "utf8",
    );
    expect(card).toMatch(/gm-enc-sectiontitle"[^}]*text:\s*"Adicionar combatentes"/);
  });

  // ── tokensUsed ────────────────────────────────────────────────────
  it("tokensUsed.emojis: não-vazio e TODO emoji existe na registry EMOJI (sem invenção)", () => {
    expect(spec.tokensUsed.emojis.length).toBeGreaterThan(0);
    for (const e of spec.tokensUsed.emojis) {
      expect(ALL_EMOJI_VALUES.has(e), `emoji ${JSON.stringify(e)} deve vir da registry`).toBe(true);
    }
    expect(new Set(spec.tokensUsed.emojis).size).toBe(spec.tokensUsed.emojis.length);
  });

  it("tokensUsed.emojis batem com os paths de registry resolvidos (_refs.emojiPaths)", () => {
    expect(spec._refs.emojiPaths.length).toBeGreaterThan(0);
    for (const path of spec._refs.emojiPaths) {
      const [g, k] = path.split(".");
      const value = (EMOJI as Record<string, Record<string, string>>)[g]?.[k];
      expect(value, `path ${path} deve existir na registry`).toBeTruthy();
      expect(spec.tokensUsed.emojis).toContain(value);
    }
  });

  it("inclui emojis específicos do tracker (combatTracker.*) resolvidos do registry", () => {
    // Iniciar/Parar/Próximo etc. são consumidos pelo action-bar via EMOJI.combatTracker.
    expect(spec.tokensUsed.emojis).toContain(EMOJI.combatTracker.Iniciar);
    expect(spec.tokensUsed.emojis).toContain(EMOJI.combatTracker.Parar);
    expect(spec.tokensUsed.emojis).toContain(EMOJI.combatTracker.Morto);
  });

  it("tokensUsed.colors: vazio (o tracker usa classes CSS, sem cor literal) — ou só valores PALETTE", () => {
    // Coerência: se houver qualquer cor, tem de vir da PALETTE (nunca inventada).
    for (const c of spec.tokensUsed.colors) {
      expect(ALL_PALETTE_VALUES.has(c), `cor ${JSON.stringify(c)} deve vir da PALETTE`).toBe(true);
    }
    // De fato o modo não embute cores literais nos arquivos.
    expect(spec.tokensUsed.colors).toEqual([]);
  });

  // ── iconSources ───────────────────────────────────────────────────
  it("iconSources.supercharged é true (deps.decorateLink decora os <a>)", () => {
    expect(spec.iconSources.supercharged).toBe(true);
    const card = readFileSync(
      resolve(ROOT, "src/render/modes/combat-tracker/components/add-combatants-card.ts"),
      "utf8",
    );
    expect(card).toMatch(/decorateLink/);
  });

  it("iconSources.inline é vazio (tracker é 100% registry; chars crus só em comentários)", () => {
    expect(spec.iconSources.inline).toEqual([]);
  });

  // ── descriptionRef ────────────────────────────────────────────────
  it("descriptionRef é o H1 verbatim do doc de arquitetura", () => {
    expect(spec.descriptionRef).toBe("Combat tracker (combat-marker / combat-tracker)");
    const doc = readFileSync(resolve(ROOT, "docs/architecture/combat-tracker.md"), "utf8");
    expect(doc.split(/\r?\n/)[0]).toBe(`# ${spec.descriptionRef}`);
  });
});
