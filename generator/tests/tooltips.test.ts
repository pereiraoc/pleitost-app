import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { EMOJI } from "../../src/shared/emoji-registry";
import { buildSourceBreakdown } from "../../src/render/shared/source-tooltip";
// @ts-expect-error — módulo .mjs sem tipos (gerador de dev)
import { extractTooltips } from "../extract-tooltips.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

const spec = extractTooltips({ pluginRoot: ROOT });

/** Resolve um emojiPath "ns.key" no EMOJI runtime (fonte de verdade). */
function emojiAt(path: string): unknown {
  return path.split(".").reduce<any>((o, k) => (o == null ? o : o[k]), EMOJI);
}

describe("extract-tooltips — breakdown", () => {
  it("trigger são eventos DOM reais wireados em attachBreakdown (+ delegação)", () => {
    // Verbatim do código: listeners de attachBreakdown e da delegação global.
    expect(spec.breakdown.trigger).toContain("mouseenter");
    expect(spec.breakdown.trigger).toContain("mouseleave");
    expect(spec.breakdown.trigger).toContain("focusin");
    expect(spec.breakdown.trigger).toContain("focusout");
    // Nenhum trigger inventado: todos são nomes de evento plausíveis (sem espaços).
    for (const ev of spec.breakdown.trigger) {
      expect(typeof ev).toBe("string");
      expect(ev).toMatch(/^[a-z]+$/);
    }
  });

  it("partFields são os campos reais de BreakdownPart, incluindo emoji/value/tone", () => {
    for (const f of ["emoji", "value", "tone"]) {
      expect(spec.breakdown.partFields).toContain(f);
    }
    // label é obrigatório no tipo — deve estar presente também.
    expect(spec.breakdown.partFields).toContain("label");
  });

  it("header.fields refletem o cabeçalho real e EXCLUEM campos só-de-body (bodyMode)", () => {
    expect(spec.breakdown.header.fields).toContain("headerEmoji");
    expect(spec.breakdown.header.fields).toContain("title");
    expect(spec.breakdown.header.fields).toContain("total");
    // bodyMode/parts governam o body, não o header → não devem aparecer.
    expect(spec.breakdown.header.fields).not.toContain("bodyMode");
    expect(spec.breakdown.header.fields).not.toContain("parts");
  });

  it("components não-vazio e cada emojiPath resolve no registry (idêntico ao runtime)", () => {
    expect(spec.breakdown.components.length).toBeGreaterThan(0);
    for (const c of spec.breakdown.components) {
      // emojiPath vive no namespace tooltip.* (componentes do breakdown).
      expect(c.emojiPath.startsWith("tooltip.")).toBe(true);
      const fromRegistry = emojiAt(c.emojiPath);
      expect(typeof fromRegistry).toBe("string");
      expect(fromRegistry).toBeTruthy();
      // O emoji extraído via AST é idêntico ao do registry runtime (lossless).
      expect(c.emoji).toBe(fromRegistry);
    }
  });

  it("components cobrem os componentes canônicos da fórmula (Base/Item/Especialização/Proficiência/Atributo)", () => {
    const paths = new Set(spec.breakdown.components.map((c: any) => c.emojiPath));
    for (const p of [
      "tooltip.Base",
      "tooltip.Item",
      "tooltip.Especializacao",
      "tooltip.Proficiencia",
      "tooltip.Atributo",
    ]) {
      expect(paths.has(p)).toBe(true);
    }
  });

  it("usedBy lista call-sites reais de attachBreakdown (não a própria definição)", () => {
    expect(spec.breakdown.usedBy.length).toBeGreaterThan(0);
    // A definição não se conta como usuário.
    expect(spec.breakdown.usedBy).not.toContain("src/render/shared/breakdown-tooltip.ts");
    // Diamonds da Interativa são consumidores conhecidos.
    expect(
      spec.breakdown.usedBy.some((p: string) => p.includes("interativa/diamonds/")),
    ).toBe(true);
  });
});

describe("extract-tooltips — source", () => {
  it("lineFormat presente e bate com o render real 'Tipo · Origem'", () => {
    expect(spec.source.lineFormat).toBeTruthy();
    // O separador verbatim ' · ' deve estar embutido na lineFormat.
    expect(spec.source.separator).toBe(" · ");
    expect(spec.source.lineFormat).toContain(spec.source.separator);
    // Cross-check contra o output REAL de buildSourceBreakdown: uma source com
    // origin renderiza a linha como `Tipo · Origem`. Confirma que separator e
    // formato batem com o código de produção, não só com o comentário.
    const real = buildSourceBreakdown(["Escolha.[[Método Artístico]]"]);
    expect(real.parts[0].label).toBe(`Escolha${spec.source.separator}Método Artístico`);
  });

  it("header usa título 'Fonte'/'Fontes' e emoji do registry (EMOJI.ui.Fonte)", () => {
    expect(spec.source.header.titles).toContain("Fonte");
    expect(spec.source.header.titles).toContain("Fontes");
    expect(spec.source.header.emojiPath).toBe("ui.Fonte");
    expect(spec.source.header.emoji).toBe(EMOJI.ui.Fonte);
    // E o header real do builder usa esse mesmo emoji.
    expect(buildSourceBreakdown(["Regra"]).headerEmoji).toBe(EMOJI.ui.Fonte);
  });

  it("trigger do source reusa os listeners de breakdown (attachBreakdown)", () => {
    // source-tooltip não wirea listeners próprios; delega a attachBreakdown.
    expect(spec.source.trigger).toEqual(spec.breakdown.trigger);
  });

  it("parsedTypes vêm da fonte (branch Slot. + exemplos doc), sem inventar", () => {
    const raws = spec.source.parsedTypes.map((t: any) => t.raw);
    // Branch literal real do parseSource.
    expect(raws).toContain("Slot.");
    // Exemplos verbatim documentados no cabeçalho do arquivo.
    expect(raws).toContain("Regra");
    expect(raws).toContain("Escolha.[[Método Artístico]]");
    // Cada parsedType tem raw não-vazio (nada nulo/chutado).
    for (const t of spec.source.parsedTypes) {
      expect(typeof t.raw).toBe("string");
      expect(t.raw.length).toBeGreaterThan(0);
    }
  });

  it("usedBy lista call-sites reais de attachSourceTooltip (não a própria definição)", () => {
    expect(spec.source.usedBy.length).toBeGreaterThan(0);
    expect(spec.source.usedBy).not.toContain("src/render/shared/source-tooltip.ts");
    // perfil-card é um consumidor conhecido de tooltip de fonte.
    expect(spec.source.usedBy.some((p: string) => p.includes("groups/perfil-card.ts"))).toBe(true);
  });
});

describe("extract-tooltips — invariantes globais (no invented strings)", () => {
  it("gaps lista APENAS lacunas reais derivadas da fonte (nunca chutes)", () => {
    // Pode haver gaps legítimos (ex: label dinâmico sem fallback), mas devem ser
    // strings descritivas — nenhum dado foi inventado pra preencher.
    expect(Array.isArray(spec.gaps)).toBe(true);
    for (const g of spec.gaps) expect(typeof g).toBe("string");
  });

  it("nenhum component com emoji null silencioso (emoji ausente vira gap explícito)", () => {
    for (const c of spec.breakdown.components) {
      if (c.emoji === null) {
        expect(spec.gaps.some((g: string) => g.includes(c.emojiPath))).toBe(true);
      }
    }
  });
});
