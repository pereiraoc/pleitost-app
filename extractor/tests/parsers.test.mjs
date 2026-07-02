import { test } from "node:test";
import assert from "node:assert/strict";

import { parseFrontmatter } from "../parse-frontmatter.mjs";
import { parseInlineFields } from "../parse-inline-fields.mjs";
import { parseLinks } from "../parse-links.mjs";
import { parseRuleElements } from "../load-rule-parser.mjs";

test("frontmatter: separa FM do corpo", () => {
  const raw = "---\ncategoria: Regra\nNível: 3\n---\nCorpo aqui [[X]]\n";
  const { hadFrontmatter, frontmatter, body } = parseFrontmatter(raw);
  assert.equal(hadFrontmatter, true);
  assert.equal(frontmatter.categoria, "Regra");
  assert.equal(frontmatter["Nível"], 3);
  assert.equal(body, "Corpo aqui [[X]]\n");
});

test("frontmatter: arquivo sem FM mantém corpo inteiro", () => {
  const raw = "Sem frontmatter\n```dataview\nTABLE\n```\n";
  const { hadFrontmatter, body } = parseFrontmatter(raw);
  assert.equal(hadFrontmatter, false);
  assert.equal(body, raw);
});

test("inline fields: linha-campo dentro de %% e valor vazio", () => {
  const body = "%%\nup:: [[Regras]]\nprev:: \npropriedades:: corte\n%%\nprosa";
  const f = parseInlineFields(body);
  assert.equal(f.up, "[[Regras]]");
  assert.equal(f.prev, "");
  assert.equal(f.propriedades, "corte");
});

test("inline fields: campo colchetado embutido", () => {
  const f = parseInlineFields("texto [dano:: 1d6] e (tipo:: corte) fim");
  assert.equal(f.dano, "1d6");
  assert.equal(f.tipo, "corte");
});

test("inline fields: não confunde URL com campo", () => {
  const f = parseInlineFields("veja https://exemplo.com/x");
  assert.deepEqual(f, {});
});

test("links: wikilink, alias, embed, imagem e rota dupla", () => {
  const links = parseLinks("[[Atributos]] e [[Monge|Monges]]\n![[Monge.jpeg]]\n[[Lilá]] > [[Safira]]");
  assert.deepEqual(links[0], { target: "Atributos", kind: "wikilink" });
  assert.deepEqual(links[1], { target: "Monge", kind: "wikilink", alias: "Monges" });
  assert.deepEqual(links[2], { target: "Monge.jpeg", kind: "embed", isImage: true });
  assert.equal(links[3].target, "Lilá");
  assert.equal(links[4].target, "Safira");
});

test("DSL: reusa o parser real do plugin (não avalia, só estrutura)", async () => {
  const recs = await parseRuleElements(
    ["Nivel 1 Definir Vida.Vitalidade 15", "Nivel 1 Complementar Habilidades.Lista [[Arte Marcial]]"],
    "Monge"
  );
  assert.equal(recs.length, 2);
  assert.equal(recs[0].raw, "Nivel 1 Definir Vida.Vitalidade 15");
  assert.ok(Array.isArray(recs[0].parsed));
  assert.ok(recs[0].parsed.length >= 1, "primeira linha deve produzir >=1 ParsedRule");
  // estrutura canônica do plugin: tem verbo/ação reconhecida
  const r0 = recs[0].parsed[0];
  assert.ok(r0 && typeof r0 === "object", "ParsedRule é objeto");
});
