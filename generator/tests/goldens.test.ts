import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { EMOJI } from "../../src/shared/emoji-registry";
import { FIXTURES, modeToSlug } from "../../src/capture/fixtures";
// @ts-expect-error — módulo .mjs sem tipos (gerador de dev)
import { ingestGoldens } from "../ingest-goldens.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const CAPTURES_DIR = resolve(ROOT, "tests/visual-capture/captures");

// fixtures reais (fonte de verdade: src/capture/fixtures.ts) → shape {slug, modes}.
const realFixtures = FIXTURES.map((f) => ({ slug: f.slug, modes: f.modes }));

const result = ingestGoldens({ capturesDir: CAPTURES_DIR, fixtures: realFixtures });

// Casa exatamente o EMOJI_RE do extrator — usado só para a invariante "todo
// emoji renderizado é de fato um emoji (não glyph/ASCII)".
const EMOJI_RE = /\p{Extended_Pictographic}️?(?:‍\p{Extended_Pictographic}️?)*|[#*0-9]️⃣/gu;

function isPureEmoji(s: string): boolean {
  const matches = s.match(EMOJI_RE);
  return matches != null && matches.length === 1 && matches[0] === s;
}

describe("ingest-goldens (L2 — render real)", () => {
  it("golden-bardo.interativa: present com emojis renderizados (requisito)", () => {
    const cell = result.fixtures["golden-bardo"]?.interativa;
    expect(cell).toBeDefined();
    expect(cell.present).toBe(true);
    if (cell.present) {
      expect(cell.renderedEmojis.length).toBeGreaterThan(0);
      expect(cell.rolesCount).toBeGreaterThan(0);
      // O emoji do modo Interativa (🎲, do registry) é exibido no mode-switcher.
      expect(cell.renderedEmojis).toContain(EMOJI.modo.Interativa);
      // Os 20 diamantes (atributos/resistências/etc.) são todos EXIBIDOS no
      // modo interativa — nenhum oculto. Guarda contra o ruído visibility:hidden
      // do host offscreen vazar como "oculto" (capture-command.ts:115).
      expect(cell.hiddenRoles).toEqual([]);
    }
  });

  it("artefatos ausentes → present:false, sem lançar (requisito)", () => {
    const probe = ingestGoldens({
      capturesDir: CAPTURES_DIR,
      fixtures: [
        { slug: "nao-existe-xyz", modes: ["Editável", "Interativa"] },
        // fixture real com um modo extra que não foi capturado em disco:
        { slug: "golden-bardo", modes: ["Resumo"] },
      ],
    });
    expect(probe.fixtures["nao-existe-xyz"].editavel).toEqual({ present: false });
    expect(probe.fixtures["nao-existe-xyz"].interativa).toEqual({ present: false });
    // golden-bardo não tem captura de Resumo em disco:
    expect(probe.fixtures["golden-bardo"].resumo).toEqual({ present: false });
    expect(probe.gaps.some((g: string) => g.includes("nao-existe-xyz"))).toBe(true);
  });

  it("todos os fixture×modo reais (12) estão present:true", () => {
    let presentCount = 0;
    for (const f of realFixtures) {
      for (const mode of f.modes) {
        const cell = result.fixtures[f.slug]?.[modeToSlug(mode)];
        expect(cell, `${f.slug}/${mode}`).toBeDefined();
        expect(cell.present, `${f.slug}/${mode}`).toBe(true);
        if (cell.present) presentCount++;
      }
    }
    expect(presentCount).toBe(12);
  });

  it("data-role só existe no modo Interativa (rolesCount>0); demais modos = 0", () => {
    for (const f of realFixtures) {
      for (const mode of f.modes) {
        const cell = result.fixtures[f.slug][modeToSlug(mode)];
        if (!cell.present) continue;
        if (mode === "Interativa") {
          expect(cell.rolesCount, `${f.slug}/${mode}`).toBeGreaterThan(0);
        } else {
          expect(cell.rolesCount, `${f.slug}/${mode}`).toBe(0);
          expect(cell.hiddenRoles, `${f.slug}/${mode}`).toEqual([]);
        }
      }
    }
  });

  it("hiddenRoles ⊆ todos os roles do fixture (nunca inventa um role)", () => {
    for (const f of realFixtures) {
      for (const mode of f.modes) {
        const cell = result.fixtures[f.slug][modeToSlug(mode)];
        if (!cell.present) continue;
        // hiddenRoles é um array de strings (bounded, JSON-serializável).
        expect(Array.isArray(cell.hiddenRoles)).toBe(true);
        // hiddenRoles nunca excede a contagem total de roles.
        expect(cell.hiddenRoles.length).toBeLessThanOrEqual(cell.rolesCount);
      }
    }
  });

  it("renderedEmojis: únicos, não-vazios em todo modo, e todo item é emoji puro", () => {
    for (const f of realFixtures) {
      for (const mode of f.modes) {
        const cell = result.fixtures[f.slug][modeToSlug(mode)];
        if (!cell.present) continue;
        const list = cell.renderedEmojis;
        expect(list.length, `${f.slug}/${mode} vazio`).toBeGreaterThan(0);
        // únicos (saída bounded determinística)
        expect(new Set(list).size).toBe(list.length);
        // cada um é de fato um emoji (não glyph tipográfico ▲/●/→ nem ASCII)
        for (const e of list) {
          expect(isPureEmoji(e), `${f.slug}/${mode}: '${e}' não é emoji puro`).toBe(true);
        }
      }
    }
  });

  it("emoji do modo (registry EMOJI.modo) aparece no mode-switcher renderizado", () => {
    // O mode-switcher mostra os botões de TODOS os modos disponíveis para a
    // família, então cada modo renderizado deve conter ao menos seu próprio
    // ícone (fonte de verdade: EMOJI.modo, não string inventada).
    for (const f of realFixtures) {
      for (const mode of f.modes) {
        const cell = result.fixtures[f.slug][modeToSlug(mode)];
        if (!cell.present) continue;
        const modeIcon = EMOJI.modo[mode === "Editável" ? "Editavel" : mode];
        expect(
          cell.renderedEmojis,
          `${f.slug}/${mode} não exibe seu emoji de modo ${modeIcon}`,
        ).toContain(modeIcon);
      }
    }
  });

  it("totalsByMode é consistente com fixtures (presentes/ausentes/roles)", () => {
    // recomputa a partir de result.fixtures e compara.
    const recomputed: Record<
      string,
      { fixturesPresent: number; rolesTotal: number }
    > = {};
    for (const f of realFixtures) {
      for (const mode of f.modes) {
        const slug = modeToSlug(mode);
        const cell = result.fixtures[f.slug][slug];
        recomputed[slug] ??= { fixturesPresent: 0, rolesTotal: 0 };
        if (cell.present) {
          recomputed[slug].fixturesPresent++;
          recomputed[slug].rolesTotal += cell.rolesCount;
        }
      }
    }
    for (const [slug, agg] of Object.entries(recomputed)) {
      expect(result.totalsByMode[slug].fixturesPresent).toBe(agg.fixturesPresent);
      expect(result.totalsByMode[slug].rolesTotal).toBe(agg.rolesTotal);
      expect(result.totalsByMode[slug].uniqueEmojisTotal).toBeGreaterThan(0);
    }
    // interativa é o único modo com roles agregados.
    expect(result.totalsByMode.interativa.rolesTotal).toBeGreaterThan(0);
    expect(result.totalsByMode.editavel.rolesTotal).toBe(0);
  });

  it("gaps registra a ausência de data-vc-role (role lido de data-role)", () => {
    expect(result.gaps.some((g: string) => g.includes("data-vc-role"))).toBe(true);
  });

  it("saída é JSON-serializável (sem Set/Map/undefined vazando)", () => {
    const round = JSON.parse(JSON.stringify(result));
    expect(round.fixtures["golden-bardo"].interativa.present).toBe(true);
    expect(round.totalsByMode.interativa).toBeDefined();
  });
});
