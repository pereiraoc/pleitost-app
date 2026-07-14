import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDoc } from "../parse-doc.mjs";

// Fixture real reduzida (espelha um doc de Classe da vault: FM com
// Elementos_de_Regra + Imagem, corpo com inline fields e wikilinks).
const MONGE = `---
categoria: Classe
subcategoria: Marcialista
atributo-chave: FOR ou AGI
Imagem: "[[Monge.jpeg]]"
Elementos_de_Regra:
- Nivel 1 Definir Vida.Vitalidade 15
- Nivel 1 Complementar Habilidades.Lista [[Arte Marcial]]
---
%%
up:: [[Classes]]
%%
O [[Monge]] usa [[Agilidade]] pra desviar.
`;

test("parseDoc: registro Opção A completo de uma Classe", async () => {
  const r = await parseDoc({ raw: MONGE, relPath: "Sistema/Criação de Personagem/Classes/Monge.md" });

  assert.equal(r.id, "Sistema/Criação de Personagem/Classes/Monge");
  assert.equal(r.basename, "Monge");
  assert.equal(r.type, "Classe");
  assert.equal(r.subtype, "Marcialista");

  // inline fields do corpo (dentro de %%)
  assert.equal(r.inlineFields.up, "[[Classes]]");

  // DSL estruturada (não avaliada)
  assert.equal(r.ruleElements.length, 2);
  assert.equal(r.ruleElements[0].raw, "Nivel 1 Definir Vida.Vitalidade 15");
  assert.ok(Array.isArray(r.ruleElements[0].parsed));

  // imagem veio do frontmatter Imagem
  assert.deepEqual(r.images, [{ target: "Monge.jpeg", from: "frontmatter:Imagem" }]);

  // links: corpo (Monge, Agilidade) + FM (Arte Marcial via DSL string, Classes via inline não conta — é corpo)
  const targets = r.links.map((l) => l.target);
  assert.ok(targets.includes("Monge"));
  assert.ok(targets.includes("Agilidade"));
  assert.ok(targets.includes("Arte Marcial"), "wikilink dentro do Elementos_de_Regra do FM");

  // body lossless: preserva o bloco %% e a prosa
  assert.ok(r.body.includes("%%"));
  assert.ok(r.body.includes("desviar"));
});

// Nota de Condição real (Agarrado): as Elementos_de_Regra usam o subsistema de
// condição (Derivar/Escalavel/Somar), que o parser genérico ignora — o extractor
// precisa fundir `condition` (parseado pelo parser de condição do plugin).
const AGARRADO = `---
categoria: Regra
subcategoria: Condição
Elementos_de_Regra:
- Escalavel 3
- Somar Condicao.Vigor -2
- Derivar Condicao Preso
---
## \`= this.file.name\`
Alvo agarrado.
`;

test("parseDoc: Condição funde `condition` do parser de condição", async () => {
  const r = await parseDoc({ raw: AGARRADO, relPath: "Sistema/Regras/Condições/Agarrado.md" });
  assert.equal(r.type, "Regra");
  assert.equal(r.subtype, "Condição");
  assert.equal(r.ruleElements.length, 3);

  // parser genérico não cobre esses verbos → parsed vazio
  assert.deepEqual(r.ruleElements[0].parsed, []);

  // condition parseado pelo subsistema real do plugin (fonte de verdade)
  assert.equal(r.ruleElements[0].condition.scaleMax, 3, "Escalavel 3");
  assert.deepEqual(r.ruleElements[1].condition.rules, [
    { kind: "number", key: "vigor", value: -2 },
  ]);
  assert.deepEqual(r.ruleElements[2].condition.derived, ["Preso"]);
});

test("parseDoc: não-Condição NÃO ganha campo condition", async () => {
  const r = await parseDoc({ raw: MONGE, relPath: "Sistema/Criação de Personagem/Classes/Monge.md" });
  assert.equal(r.ruleElements[0].condition, undefined);
});

test("parseDoc: item de lista VAZIO em Elementos_de_Regra é ignorado (não vira erro)", async () => {
  // `Elementos_de_Regra:\n- ` → null no YAML; não é regra → 0 elementos.
  const raw = `---
categoria: Habilidade
subcategoria: Classe
Elementos_de_Regra:
-
---
Corpo.
`;
  const r = await parseDoc({ raw, relPath: "Sistema/Criação de Personagem/Habilidades/Mago/Arma Arcana.md" });
  assert.deepEqual(r.ruleElements, []);
});

test("parseDoc: doc sem categoria/regra não quebra", async () => {
  const r = await parseDoc({ raw: "# Só prosa\n[[X]]\n", relPath: "Atlas/Nota.md" });
  assert.equal(r.type, null);
  assert.deepEqual(r.ruleElements, []);
  assert.equal(r.links[0].target, "X");
  assert.deepEqual(r.headings, [{ level: 1, text: "Só prosa" }]);
});
