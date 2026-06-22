import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// @ts-expect-error — módulo .mjs sem tipos (gerador de dev)
import { foldDocs } from "../fold-docs.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
// tests/design-spec → tests → pleitost-autosheet (plugin root)
const PLUGIN_ROOT = resolve(__dirname, "../..");

// Subdir relativo da vault com a Documentação Adicional.
const DOC_SUBDIR = "Recursos e Mídia/Documentação Adicional/Autosheet Plugin";

// Acha o vault root subindo a árvore até a pasta que contém DOC_SUBDIR — robusto
// à contagem de "..". (Estruturalmente fica em ../../../../.. a partir daqui.)
function findVaultRoot(): string | null {
  let dir = PLUGIN_ROOT;
  for (let i = 0; i < 8; i++) {
    if (existsSync(resolve(dir, DOC_SUBDIR))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

const VAULT_ROOT = findVaultRoot();

// docPaths montado AQUI (o extrator não conhece a lista — recebe-a). Aponta os
// docs de arquitetura (plugin root) + os de Documentação Adicional (vault).
function buildDocPaths(): Array<{ key: string; path: string }> {
  const arch = (name: string) => resolve(PLUGIN_ROOT, "docs/architecture", name);
  const vault = (name: string) =>
    resolve(VAULT_ROOT ?? PLUGIN_ROOT, DOC_SUBDIR, name);
  return [
    { key: "modes", path: arch("modes.md") },
    { key: "pipeline", path: arch("pipeline.md") },
    { key: "painel-detalhes", path: arch("painel-detalhes.md") },
    { key: "modos-doc", path: vault("Modos.md") },
    { key: "frontmatter", path: vault("Frontmatter.md") },
    { key: "elementos-regra", path: vault("Elementos de Regra.md") },
    { key: "efeitos-interativos", path: vault("Efeitos Interativos.md") },
    { key: "ficha-grupo", path: vault("Ficha de Grupo.md") },
    { key: "combat-tracker", path: vault("Combat Tracker.md") },
    { key: "como-funciona", path: vault("Como Funciona.md") },
  ];
}

const docPaths = buildDocPaths();
const result = foldDocs({ docPaths });

describe("fold-docs (prosa VERBATIM por headingPath)", () => {
  it("resolveu o vault root real (pré-condição das fontes da vault)", () => {
    expect(VAULT_ROOT).not.toBeNull();
    expect(existsSync(resolve(VAULT_ROOT as string, DOC_SUBDIR, "Modos.md"))).toBe(
      true,
    );
  });

  it("retorna o shape esperado { docs, typography, gaps }", () => {
    expect(result).toHaveProperty("docs");
    expect(result).toHaveProperty("typography");
    expect(Array.isArray(result.gaps)).toBe(true);
  });

  it('docs["modes"] tem chaves (headingPaths)', () => {
    expect(result.docs.modes).toBeTruthy();
    const keys = Object.keys(result.docs.modes);
    expect(keys.length).toBeGreaterThan(0);
    // headingPath do H1 é exatamente o título do arquivo.
    expect(keys).toContain("Modos — arquitetura interna");
  });

  it("algum corpo tem texto real (não-vazio)", () => {
    const bodies = Object.values(result.docs.modes) as string[];
    expect(bodies.some((b) => b.trim().length > 0)).toBe(true);
  });

  it("headingPath usa ' > ' pra hierarquia e o corpo é VERBATIM do arquivo", () => {
    // "Save: write-through em `userEdits`" é um H3 sob H2 Interativa sob o H1.
    const path =
      "Modos — arquitetura interna > Interativa > Save: write-through em `userEdits`";
    const body = result.docs.modes[path];
    expect(typeof body).toBe("string");
    // Trecho literal que SÓ existe nessa subseção.
    expect(body).toContain("structuredClone");
    // Verbatim: o corpo recortado é substring exata do arquivo-fonte.
    const raw = readFileSync(
      resolve(PLUGIN_ROOT, "docs/architecture/modes.md"),
      "utf8",
    );
    expect(raw).toContain(body);
    expect(body.length).toBeGreaterThan(0);
  });

  it("corpo de um H2 ENGLOBA os H3 filhos (stop em nível <= atual)", () => {
    // Interativa (H2) deve conter o título do seu filho "Auto-save" no corpo.
    const interativa = result.docs.modes["Modos — arquitetura interna > Interativa"];
    expect(interativa).toContain("### Auto-save");
    // ...mas para no H2 seguinte (Resumo) — não vaza pra ele.
    expect(interativa).not.toContain("## Resumo");
  });

  it("respeita code fences: NÃO cria heading de comentário `#` em bloco YAML", () => {
    // Frontmatter.md tem `# Sem Moral em Monstro` dentro de um ```yaml.
    const fm = result.docs.frontmatter;
    expect(fm).toBeTruthy();
    const hasFalseHeading = Object.keys(fm).some((p) =>
      /Sem Moral em Monstro|Habilidades_Especiais é o jeito Monstro/.test(p),
    );
    expect(hasFalseHeading).toBe(false);
    // O comentário sobrevive DENTRO do corpo verbatim da subseção Monstro.
    const monstro = Object.entries(fm).find(([p]) => p.endsWith("> Monstro (mínimo, Tier 1, Goblin Soldado)"));
    expect(monstro).toBeTruthy();
    expect((monstro as [string, string])[1]).toContain("# Sem Moral em Monstro");
  });

  it("indexa docs aninhados até #### (Efeitos Interativos)", () => {
    const ei = result.docs["efeitos-interativos"];
    expect(ei).toBeTruthy();
    // Um headingPath de 4 níveis (H1 > H2 > H3 > H4) deve existir.
    const deep = Object.keys(ei).find((p) => p.split(" > ").length >= 4);
    expect(deep).toBeTruthy();
  });

  it("typography: tiers em ordem com size/weight verbatim + $source", () => {
    expect(result.typography).not.toBeNull();
    const typo = result.typography as {
      tiers: Array<{ name: string; size: string | null; weight: number | null; role: string }>;
      $source: string;
    };
    expect(Array.isArray(typo.tiers)).toBe(true);
    expect(typo.tiers.length).toBeGreaterThan(0);
    for (const t of typo.tiers) {
      // contrato pedido: se typography não-null, tiers têm size.
      expect(typeof t.size).toBe("string");
      expect((t.size as string).length).toBeGreaterThan(0);
    }
    expect(typo.$source.startsWith("docs:modes.md#")).toBe(true);

    // Valores reais do modes.md (verbatim), em ORDEM de fonte: 13 → 12 → 11px.
    expect(typo.tiers.map((t) => t.size)).toEqual(["13px", "12px", "11px"]);
    expect(typo.tiers.map((t) => t.weight)).toEqual([500, 600, 700]);
    expect(typo.tiers[0].name).toBe("Tier H");
    expect(typo.tiers[0].role).toBe("primeiro nível de container");
  });

  it("gaps: doc ausente entra em gaps e NÃO é chutado", () => {
    const bogus = foldDocs({
      docPaths: [
        { key: "modes", path: resolve(PLUGIN_ROOT, "docs/architecture/modes.md") },
        { key: "inexistente", path: resolve(PLUGIN_ROOT, "docs/architecture/__nao_existe__.md") },
      ],
    });
    expect(bogus.gaps.some((g: string) => g.includes("inexistente"))).toBe(true);
    expect(bogus.docs).not.toHaveProperty("inexistente");
  });

  it("typography vira null + gap quando o doc modes não tem a seção", () => {
    // Usa um doc real SEM a seção de tipografia como se fosse "modes".
    const noTypo = foldDocs({
      docPaths: [
        { key: "modes", path: resolve(PLUGIN_ROOT, "docs/architecture/pipeline.md") },
      ],
    });
    expect(noTypo.typography).toBeNull();
    expect(noTypo.gaps.some((g: string) => /typography/i.test(g))).toBe(true);
  });

  it("saída é JSON-serializável (sem ciclos / valores não-serializáveis)", () => {
    expect(() => JSON.stringify(result)).not.toThrow();
  });
});
