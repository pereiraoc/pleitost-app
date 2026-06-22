import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { EMOJI } from "../../src/shared/emoji-registry";
import { PALETTE } from "../../src/render/shared/palette-registry";
// @ts-expect-error — módulo .mjs sem tipos (gerador de dev)
import { extractGrupo } from "../extract-grupo.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

const spec = extractGrupo({ pluginRoot: ROOT });

/** Conjunto de TODOS os valores (chars) da registry EMOJI — pra checar
 *  proveniência sem assumir grupo/chave específicos. */
const ALL_EMOJI_VALUES = new Set<string>(
  Object.values(EMOJI as Record<string, Record<string, string>>).flatMap((g) => Object.values(g)),
);
/** Todos os valores da PALETTE (cores/box-shadows). */
const ALL_PALETTE_VALUES = new Set<string>(
  Object.values(PALETTE as Record<string, Record<string, string>>).flatMap((g) => Object.values(g)),
);

describe("extract-grupo (autosheet-grupo)", () => {
  it("block é autosheet-grupo", () => {
    expect(spec.block).toBe("autosheet-grupo");
  });

  it("extração roda sem gaps", () => {
    expect(spec.gaps).toEqual([]);
  });

  // ── structure.sections ───────────────────────────────────────────
  it("structure.sections é não-vazio e cada seção aponta um arquivo .ts existente", () => {
    expect(Array.isArray(spec.structure.sections)).toBe(true);
    expect(spec.structure.sections.length).toBeGreaterThan(0);
    for (const sec of spec.structure.sections) {
      expect(typeof sec.name).toBe("string");
      expect(sec.name.length).toBeGreaterThan(0);
      expect(sec.file).toMatch(/^src\/render\/modes\/grupo\/.+\.ts$/);
    }
  });

  it("os nomes de seção são STRING-LITERAIS reais do coordenador (ordem de fonte)", () => {
    const coord = readFileSync(resolve(ROOT, "src/render/modes/grupo/render-party-sheet.ts"), "utf8");
    // Cada label aparece literal no source E na ordem em que appendSection é chamado.
    const positions = spec.structure.sections.map((s: { name: string }) => {
      const idx = coord.indexOf(`"${s.name}"`);
      expect(idx, `label "${s.name}" deve aparecer literal no coordenador`).toBeGreaterThan(-1);
      return idx;
    });
    const sorted = [...positions].sort((a, b) => a - b);
    expect(positions).toEqual(sorted); // ordem de fonte preservada
  });

  // ── tokensUsed ────────────────────────────────────────────────────
  it("tokensUsed.emojis: não-vazio e TODO emoji existe na registry EMOJI (sem invenção)", () => {
    expect(spec.tokensUsed.emojis.length).toBeGreaterThan(0);
    for (const e of spec.tokensUsed.emojis) {
      expect(ALL_EMOJI_VALUES.has(e), `emoji ${JSON.stringify(e)} deve vir da registry`).toBe(true);
    }
    // sem duplicatas (set de chars distintos)
    expect(new Set(spec.tokensUsed.emojis).size).toBe(spec.tokensUsed.emojis.length);
  });

  it("tokensUsed.emojis batem com os paths de registry resolvidos (_refs.emojiPaths)", () => {
    for (const path of spec._refs.emojiPaths) {
      const [g, k] = path.split(".");
      const value = (EMOJI as Record<string, Record<string, string>>)[g]?.[k];
      expect(value, `path ${path} deve existir na registry`).toBeTruthy();
      expect(spec.tokensUsed.emojis).toContain(value);
    }
  });

  it("tokensUsed.colors: cada cor vem da PALETTE OU é uma cor literal observada no allowlist", () => {
    expect(spec.tokensUsed.colors.length).toBeGreaterThan(0);
    const literal = new Set<string>(spec._refs.literalColors);
    for (const c of spec.tokensUsed.colors) {
      const fromRegistry = ALL_PALETTE_VALUES.has(c);
      expect(
        fromRegistry || literal.has(c),
        `cor ${JSON.stringify(c)} deve vir da PALETTE ou ser literal observada`,
      ).toBe(true);
    }
  });

  // ── iconSources ───────────────────────────────────────────────────
  it("iconSources.supercharged é true (member-link emite data-link-* inline)", () => {
    expect(spec.iconSources.supercharged).toBe(true);
    const memberLink = readFileSync(resolve(ROOT, "src/render/modes/grupo/member-link.ts"), "utf8");
    expect(memberLink).toMatch(/data-link-categoria/);
  });

  it("iconSources.inline: emojis HARDCODED de grupo-tooltips-port.ts (NÃO do registry, allowlist)", () => {
    expect(spec.iconSources.inline.length).toBeGreaterThan(0);
    expect(spec._refs.inlineFromFile).toBe("src/render/modes/grupo/grupo-tooltips-port.ts");
    const port = readFileSync(resolve(ROOT, "src/render/modes/grupo/grupo-tooltips-port.ts"), "utf8");
    // Cada literal inline aparece de fato no arquivo allowlistado.
    for (const lit of spec.iconSources.inline) {
      expect(port.includes(lit), `inline literal ${JSON.stringify(lit)} deve estar no arquivo`).toBe(true);
    }
    // O arquivo está mesmo declarado no allowlist do lint (cabeçalho cita ALLOWED_FILES).
    expect(port).toMatch(/allow|ALLOWED_FILES|eslint-disable/i);
    // notes explicita que inline NÃO vem do registry.
    expect(spec.notes).toMatch(/NÃO|HARDCODED/);
  });

  it("captura o emoji literal hardcoded ⚖️ (Balanceamento de papéis) e a cor literal #ca8a04", () => {
    // ⚖️ é hardcoded inline nos templates (não EMOJI.* nesse arquivo).
    expect(spec.iconSources.inline).toContain("⚖️");
    expect(spec.tokensUsed.colors).toContain("#ca8a04");
    expect(spec._refs.literalColors).toContain("#ca8a04");
  });

  // ── descriptionRef ────────────────────────────────────────────────
  it("descriptionRef é o H1 verbatim do doc de arquitetura", () => {
    expect(spec.descriptionRef).toBe("Ficha de grupo (autosheet-grupo)");
    const doc = readFileSync(resolve(ROOT, "docs/architecture/grupo.md"), "utf8");
    expect(doc.split(/\r?\n/)[0]).toBe(`# ${spec.descriptionRef}`);
  });
});
