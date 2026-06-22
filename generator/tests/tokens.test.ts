import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { CUSTO_EXTRA, EMOJI } from "../../src/shared/emoji-registry";
import { PALETTE } from "../../src/render/shared/palette-registry";
// @ts-expect-error — módulo .mjs sem tipos (gerador de dev)
import { extractTokens } from "../extract-tokens.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

const tokens = extractTokens({
  emojiRegistryPath: resolve(ROOT, "src/shared/emoji-registry.ts"),
  paletteRegistryPath: resolve(ROOT, "src/render/shared/palette-registry.ts"),
});

describe("extract-tokens (lossless via AST)", () => {
  it("avalia EMOJI idêntico ao import runtime", () => {
    expect(tokens.emojis).toEqual(EMOJI);
  });

  it("avalia PALETTE idêntico ao import runtime", () => {
    expect(tokens.colors).toEqual(PALETTE);
  });

  it("avalia CUSTO_EXTRA idêntico ao import runtime (não perde dígitos de custo)", () => {
    expect(tokens.emojiCostExtra).toEqual(CUSTO_EXTRA);
    for (let d = 0; d <= 9; d++) {
      expect(tokens.emojiCostExtra.digits[String(d)]).toBeTruthy();
    }
  });

  it("decodifica o emoji real (não o escape \\u{...})", () => {
    expect(tokens.emojis.atributo.FOR).toBe("💪");
    expect(tokens.emojis.modo.Editavel).toBe("📝");
  });
});
