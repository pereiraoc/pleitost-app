// Corte mestre×jogador (2026-08-31): whitelist de campos + callout [!gm] +
// seção Contexto Oculto + FM GM:true. O público NUNCA carrega segredo; o
// espelho gm guarda o record completo.
import test from "node:test";
import assert from "node:assert/strict";
import { gmSplit, gmConfigFromBase } from "../gm-split.mjs";

const CFG = gmConfigFromBase({
  gm: {
    campos_publicos: {
      "Organização": ["Resumo", "Descrição", "Líder"],
      "Pessoa": ["Função", "Organização", "Aparência"],
      "Localização": ["População", "Descrição", "Aparência_do_Local", "Locais_de_Interesse", "Geolocalização"],
    },
  },
});

function rec(over = {}) {
  return {
    id: "Contexto/Organizações/Facções/Teste",
    basename: "Teste",
    type: "Organização",
    subtype: "Facção",
    frontmatter: {
      categoria: "Organização",
      Resumo: "Fachada de rua.",
      Líder: "[[Fulana]]",
      Objetivo_de_Longo_Prazo: "Dominar tudo.",
      Objetivo_Imediato: "Roubar o porto.",
      Completo: true,
    },
    links: [{ target: "Fulana", kind: "wiki" }, { target: "Porto Novo", kind: "wiki" }],
    body: [
      "#Organização",
      "> [!info] Facção: teste",
      "> **Resumo:** `= this.Resumo`",
      "",
      ">**Objetivo de Longo Prazo:** Dominar tudo.",
      ">**Descrição:** Todo mundo conhece a fachada.",
      "",
      "Prosa pública sobre a facção.",
      "",
      "> [!gm]",
      "> O segredo: eles respondem ao [[Porto Novo]].",
      "",
      "Fim público.",
    ].join("\n"),
    ...over,
  };
}

test("whitelist: campos fora da lista somem do FM e do corpo públicos", () => {
  const { publico, gmDoc, notaGm } = gmSplit(rec(), CFG);
  assert.equal(notaGm, false);
  assert.equal(publico.frontmatter.Resumo, "Fachada de rua.");
  assert.equal(publico.frontmatter.Líder, "[[Fulana]]");
  assert.equal(publico.frontmatter.Objetivo_de_Longo_Prazo, undefined);
  assert.equal(publico.frontmatter.Objetivo_Imediato, undefined);
  assert.ok(!publico.body.includes("Dominar tudo"));
  assert.ok(publico.body.includes("Todo mundo conhece a fachada"));
  // o espelho carrega o record COMPLETO
  assert.equal(gmDoc.frontmatter.Objetivo_de_Longo_Prazo, "Dominar tudo.");
  assert.ok(gmDoc.body.includes("Dominar tudo"));
});

test("callout [!gm] some do corpo público (e o link que só existia nele)", () => {
  const { publico } = gmSplit(rec(), CFG);
  assert.ok(!publico.body.includes("[!gm]"));
  assert.ok(!publico.body.includes("O segredo"));
  assert.ok(publico.body.includes("Fim público."));
  assert.deepEqual(publico.links.map((l) => l.target), ["Fulana"]);
});

test("continuações em bullet seguem o campo (Locais de Interesse fica; Influências some)", () => {
  const r = rec({
    type: "Localização",
    frontmatter: { categoria: "Localização", Descrição: "" },
    body: [
      "> [!info] Informações",
      "> ℹ️**Descrição:** Bairro na beira do lago.",
      "> 🛡️**Influências:**",
      ">- **[[Facção X]]:** manda em tudo;",
      ">- **[[Facção Y]]:** cobra pedágio.",
      "> 🗺️**Locais de Interesse:**",
      ">- [[Mercado]] central;",
      ">- [[Bar]] da esquina.",
    ].join("\n"),
    links: [],
  });
  const { publico } = gmSplit(r, CFG);
  assert.ok(publico.body.includes("beira do lago"));
  assert.ok(!publico.body.includes("Facção X"));
  assert.ok(!publico.body.includes("pedágio"));
  assert.ok(publico.body.includes("[[Mercado]] central"));
});

test("seção Contexto Oculto (legado) some do público", () => {
  const r = rec({
    type: "Contexto",
    frontmatter: { categoria: "Contexto" },
    body: "Público.\n\n## Contexto Oculto\nSegredo enorme.\n\n## Outra Seção\nPúblico de novo.",
    links: [],
  });
  const { publico, gmDoc } = gmSplit(r, CFG);
  assert.ok(!publico.body.includes("Segredo enorme"));
  assert.ok(publico.body.includes("Público de novo"));
  assert.ok(gmDoc.body.includes("Segredo enorme"));
});

test("FM GM:true → nota inteira do mestre (sem versão pública)", () => {
  const r = rec({ frontmatter: { categoria: "Pessoa", GM: true } });
  const { publico, gmDoc, notaGm } = gmSplit(r, CFG);
  assert.equal(publico, null);
  assert.equal(notaGm, true);
  assert.equal(gmDoc.basename, "Teste");
});

test("categoria fora da config (Sistema) + sem marcadores: intocado, sem espelho", () => {
  const r = rec({
    type: "Técnica",
    frontmatter: { categoria: "Técnica", custo: "3A" },
    body: "Você aprende a habilidade X.",
    links: [],
  });
  const { publico, gmDoc } = gmSplit(r, CFG);
  assert.equal(gmDoc, null);
  assert.equal(publico.body, "Você aprende a habilidade X.");
  assert.equal(publico.frontmatter.custo, "3A");
});
