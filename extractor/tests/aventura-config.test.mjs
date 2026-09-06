// FORMATO DE AVENTURA (2026-09-05): o Contexto Base declara as seções que o
// app lê; o compile leva pro contexto.json em base.aventura e QUEBRA se faltar
// seção obrigatória.
import test from "node:test";
import assert from "node:assert/strict";
import { compileContexto } from "../compile-contexto.mjs";

const mundo = {
  relPath: "Ctx/Mundo.md",
  contexto: { id: "fantasia", nome: "Fantasia", moeda: { simbolo: "PO", nome: "Ouro" }, atlas: { raiz: "Atlas" } },
};
const secoes = {
  resumo: "1. Resumo", roteiro: "Roteiro em uma página", contexto: "2. Contexto",
  contexto_aventura: "2.1 Contexto da Aventura", notas_mestre: "2.2 Notas para o Mestre",
  personagens: "2.3 Personagens", locais: "2.4 Locais", mapa: "Mapa", cenas: "3. Cenas",
  abertura: "Abertura", cena: "Cena", desfecho: "Desfecho",
};

test("base.aventura sai compilado em base.aventura (secoes/tiposDeCena/camposListaTrancada)", () => {
  const base = {
    relPath: "Ctx/Base.md",
    contexto: {
      id: "base",
      aventura: { secoes, tipos_de_cena: ["Social", "Combate"], campos_lista_trancada: ["Chamada", "rank"] },
    },
  };
  const out = compileContexto({ worldId: "fantasia", defs: [mundo, base], basenames: new Set(), typeByBasename: new Map() });
  assert.deepEqual(out.base.aventura, {
    secoes,
    tiposDeCena: ["Social", "Combate"],
    camposListaTrancada: ["Chamada", "rank"],
  });
});

test("seção obrigatória ausente QUEBRA o compile", () => {
  const { cena, ...semCena } = secoes;
  const base = { relPath: "Ctx/Base.md", contexto: { id: "base", aventura: { secoes: semCena } } };
  assert.throws(
    () => compileContexto({ worldId: "fantasia", defs: [mundo, base], basenames: new Set(), typeByBasename: new Map() }),
    /base\.aventura\.secoes\.cena: obrigatório/,
  );
});

test("sem bloco aventura no Base → base.aventura ausente (dataset antigo)", () => {
  const base = { relPath: "Ctx/Base.md", contexto: { id: "base" } };
  const out = compileContexto({ worldId: "fantasia", defs: [mundo, base], basenames: new Set(), typeByBasename: new Map() });
  assert.equal("aventura" in out.base, false);
});
