import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { SHEET_FAMILIES } from "../../src/types/family";
import { ATRIBUTOS, PERICIAS } from "../../src/types/model";
// @ts-expect-error — módulo .mjs sem tipos (gerador de dev)
import { extractDataModel } from "../extract-data-model.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

const MODEL_PATH = resolve(ROOT, "src/types/model.ts");
const FAMILY_PATH = resolve(ROOT, "src/types/family.ts");
const INTERATIVA_PATH = resolve(ROOT, "src/types/interativa-state.ts");
const DOC_PATH = resolve(ROOT, "docs/architecture/data-model.md");

const dm = extractDataModel({
  modelPath: MODEL_PATH,
  familyPath: FAMILY_PATH,
  interativaStatePath: INTERATIVA_PATH,
});

describe("extract-data-model (AST do modelo interno)", () => {
  it("aponta a root interface correta", () => {
    expect(dm.rootInterface).toBe("InternalSheetModel");
    expect(dm.interfaces[dm.rootInterface]).toBeTruthy();
  });

  it("é totalmente JSON-serializável", () => {
    expect(() => JSON.stringify(dm)).not.toThrow();
  });

  describe("enums (uniões string-literal em ordem de fonte)", () => {
    it("AtributoId deepEquals [FOR, AGI, INT, PRE]", () => {
      expect(dm.enums.AtributoId).toEqual(["FOR", "AGI", "INT", "PRE"]);
    });

    it("cada enum bate com seu const array runtime (fonte paralela)", () => {
      // o extractor lê da UNIÃO; os arrays runtime são fonte independente.
      expect(dm.enums.AtributoId).toEqual([...ATRIBUTOS]);
      expect(dm.enums.PericiaId).toEqual([...PERICIAS]);
      expect(dm.enums.SheetFamily).toEqual([...SHEET_FAMILIES]);
    });

    it("Proficiencia é o rank NAEM", () => {
      expect(dm.enums.Proficiencia).toEqual(["N", "A", "E", "M"]);
    });

    it("expõe exatamente as 4 chaves de enum do contrato", () => {
      expect(Object.keys(dm.enums).sort()).toEqual([
        "AtributoId",
        "PericiaId",
        "Proficiencia",
        "SheetFamily",
      ]);
    });
  });

  describe("interfaces", () => {
    it("InternalSheetModel tem fields não-vazios", () => {
      const root = dm.interfaces.InternalSheetModel;
      expect(root.fields.length).toBeGreaterThan(0);
      // todos os blocos de topo do modelo estão presentes como fields
      const names = root.fields.map((f: { name: string }) => f.name);
      for (const expected of [
        "meta",
        "vida",
        "atributos",
        "pericias",
        "inventario",
        "interativa",
        "biografia",
      ]) {
        expect(names).toContain(expected);
      }
    });

    it("inclui a interface NÃO-exportada InterativaState (membro do root)", () => {
      // InterativaState não tem `export` mas é o tipo de InternalSheetModel.interativa
      expect(dm.interfaces.InterativaState).toBeTruthy();
      expect(dm.interfaces.InterativaState.fields.length).toBeGreaterThan(0);
      const names = dm.interfaces.InterativaState.fields.map((f: { name: string }) => f.name);
      expect(names).toContain("recursosRestantes");
    });

    it("coleta interfaces dos 3 arquivos-fonte", () => {
      // model.ts, family.ts (nenhuma interface), interativa-state.ts → CondicaoAtivaUI
      expect(dm.interfaces.FontedLink).toBeTruthy(); // model.ts
      expect(dm.interfaces.CondicaoAtivaUI).toBeTruthy(); // interativa-state.ts
    });

    it("cada field tem name/type/optional/jsdoc com tipos corretos", () => {
      for (const [, iface] of Object.entries(
        dm.interfaces as Record<string, { jsdoc: string | null; fields: unknown[] }>,
      )) {
        expect(iface.jsdoc === null || typeof iface.jsdoc === "string").toBe(true);
        for (const f of iface.fields as Array<{
          name: string;
          type: string | null;
          optional: boolean;
          jsdoc: string | null;
        }>) {
          expect(typeof f.name).toBe("string");
          expect(f.type === null || typeof f.type === "string").toBe(true);
          expect(typeof f.optional).toBe("boolean");
          expect(f.jsdoc === null || typeof f.jsdoc === "string").toBe(true);
        }
      }
    });

    it("captura type EXATO da fonte (member.type.getText)", () => {
      const escola = dm.interfaces.FontedLink.fields.find(
        (f: { name: string }) => f.name === "escola",
      );
      expect(escola.optional).toBe(true);
      expect(escola.type).toBe('"ArcanaNegra" | "ArcanaBranca" | "Anima" | "Tesouros" | null');
      // o type texto deve aparecer LITERALMENTE no source da interface
      const src = readFileSync(MODEL_PATH, "utf8");
      expect(src).toContain(escola.type);
    });

    it("captura JSDoc verbatim do member (e null quando não há JSDoc-block)", () => {
      const escola = dm.interfaces.FontedLink.fields.find(
        (f: { name: string }) => f.name === "escola",
      );
      expect(escola.jsdoc).toMatch(/^\/\*\*/); // começa com /**
      expect(escola.jsdoc.endsWith("*/")).toBe(true);
      // o JSDoc capturado tem que existir LITERALMENTE no source (verbatim)
      const src = readFileSync(MODEL_PATH, "utf8");
      expect(src).toContain(escola.jsdoc);

      // OficioState.nome só tem comentário trailing `//` (não é JSDoc) → null
      const oficioNome = dm.interfaces.OficioState.fields.find(
        (f: { name: string }) => f.name === "nome",
      );
      expect(oficioNome.jsdoc).toBeNull();
    });

    it("captura JSDoc verbatim no nível da interface", () => {
      // VolatileMemory tem doc-block multilinha
      expect(dm.interfaces.VolatileMemory.jsdoc).toMatch(/^\/\*\*/);
      const src = readFileSync(MODEL_PATH, "utf8");
      expect(src).toContain(dm.interfaces.VolatileMemory.jsdoc);
      // FontedLink não tem doc no nível da interface
      expect(dm.interfaces.FontedLink.jsdoc).toBeNull();
    });
  });

  describe("typeAliases", () => {
    it("inclui aliases não-enum com text+jsdoc da fonte", () => {
      expect(dm.typeAliases.Wikilink.text).toBe("string");
      expect(dm.typeAliases.ProfBinaria.text).toBe('"N" | "P"');
      // ArmaState é alias de AtaqueState, com JSDoc
      expect(dm.typeAliases.ArmaState.text).toBe("AtaqueState");
      expect(dm.typeAliases.ArmaState.jsdoc).toMatch(/^\/\*\*/);
      const src = readFileSync(MODEL_PATH, "utf8");
      expect(src).toContain(dm.typeAliases.ArmaState.jsdoc);
    });

    it("NÃO duplica os 4 enums dentro de typeAliases", () => {
      for (const enumName of ["AtributoId", "PericiaId", "Proficiencia", "SheetFamily"]) {
        expect(dm.typeAliases[enumName]).toBeUndefined();
      }
    });

    it("coleta aliases dos arquivos auxiliares (interativa-state.ts)", () => {
      expect(dm.typeAliases.SeletoresMap.text).toBe("Record<string, string | number>");
    });
  });

  describe("blocks (tabela do data-model.md)", () => {
    it("extrai a tabela de blocos verbatim, em ordem de fonte", () => {
      expect(Array.isArray(dm.blocks)).toBe(true);
      expect(dm.blocks.length).toBeGreaterThan(0);
      // primeira linha da tabela é `meta`
      expect(dm.blocks[0].name).toContain("meta");
      // cada name/desc tem que aparecer LITERALMENTE no doc
      const doc = readFileSync(DOC_PATH, "utf8");
      for (const b of dm.blocks as Array<{ name: string; desc: string }>) {
        expect(typeof b.name).toBe("string");
        expect(typeof b.desc).toBe("string");
        expect(doc).toContain(b.name);
        expect(doc).toContain(b.desc);
      }
    });

    it("não reporta gap de blocks quando o doc existe", () => {
      const gaps: string[] = dm.gaps ?? [];
      expect(gaps.some((g) => g.startsWith("blocks:"))).toBe(false);
    });
  });

  it("não reporta gaps quando todos os enums são uniões puras e o doc existe", () => {
    // estado verde esperado contra o repo atual
    expect(dm.gaps ?? []).toEqual([]);
  });
});
