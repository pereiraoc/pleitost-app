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

test("parseDoc: doc sem categoria/regra não quebra", async () => {
  const r = await parseDoc({ raw: "# Só prosa\n[[X]]\n", relPath: "Atlas/Nota.md" });
  assert.equal(r.type, null);
  assert.deepEqual(r.ruleElements, []);
  assert.equal(r.links[0].target, "X");
  assert.deepEqual(r.headings, [{ level: 1, text: "Só prosa" }]);
});
