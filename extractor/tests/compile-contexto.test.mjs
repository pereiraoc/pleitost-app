// Compilador de contexto (#519 Opção 1): a nota de Contexto-Def (FM
// `Contexto:`) vira o artefato `contexto.json` do mundo, VALIDADO contra os
// basenames reais da vault — extract quebra em vez de derivar silencioso.
import test from "node:test";
import assert from "node:assert/strict";
import { compileContexto } from "../compile-contexto.mjs";

const BASENAMES = new Set([
  "Garras do Rei-Mago",
  "Míssil Mágico",
  "Poção de Cura",
  "Espada Longa",
]);

function defPoa(overrides = {}) {
  return {
    relPath: "Contexto/Reskin/Contexto POA 1987.md",
    contexto: {
      id: "poa-1987",
      nome: "Porto Alegre 1987",
      moeda: { simbolo: "Cz$", nome: "Cruzado" },
      atlas: { raiz: "Atlas", mapa: "Mapa de Porto Alegre RPG.png" },
      pericias: { Arcana: "Trônicos", Anima: "Lênicos" },
      reskin: {
        notas: { "Míssil Mágico": "Dardo Teleguiado" },
        notas_futuras: { Avatar: "Catalisador" },
        termos: { "Magia Arcana": "Trônica" },
        excecoes: ["Corpo em Sintonia"],
      },
      disponibilidade: {
        padrao: "disponivel",
        indisponiveis: ["Garras do Rei-Mago"],
        restritos: {},
      },
      ...overrides,
    },
  };
}

function defBase(sempre = [], conteudoDeMundo = undefined) {
  return {
    relPath: "Contexto/Contexto Base.md",
    contexto: {
      id: "base",
      sempre_disponiveis: sempre,
      ...(conteudoDeMundo ? { conteudo_de_mundo: conteudoDeMundo } : {}),
    },
  };
}

test("compila o artefato do mundo com base embutida", () => {
  const art = compileContexto({
    worldId: "poa-1987",
    defs: [defPoa(), defBase(["Espada Longa"])],
    basenames: BASENAMES,
  });
  assert.equal(art.id, "poa-1987");
  assert.equal(art.fonte, "Contexto/Reskin/Contexto POA 1987.md");
  assert.equal(art.moeda.simbolo, "Cz$");
  assert.equal(art.pericias.Arcana, "Trônicos");
  assert.equal(art.reskin.notas["Míssil Mágico"], "Dardo Teleguiado");
  assert.equal(art.reskin.notasFuturas.Avatar, "Catalisador");
  assert.deepEqual(art.disponibilidade.indisponiveis, ["Garras do Rei-Mago"]);
  assert.deepEqual(art.base.sempreDisponiveis, ["Espada Longa"]);
});

test("base.conteudo_de_mundo (pastas/tipos de conteúdo POR MUNDO) embute no artefato", () => {
  const art = compileContexto({
    worldId: "poa-1987",
    defs: [
      defPoa(),
      defBase([], { pastas: ["Atlas/", "Contexto/"], tipos: ["Criatura", "Pessoa"] }),
    ],
    basenames: BASENAMES,
  });
  assert.deepEqual(art.base.conteudoDeMundo, {
    pastas: ["Atlas/", "Contexto/"],
    tipos: ["Criatura", "Pessoa"],
  });
});

test("sem conteudo_de_mundo no base → listas vazias (app usa fallback)", () => {
  const art = compileContexto({
    worldId: "poa-1987",
    defs: [defPoa(), defBase()],
    basenames: BASENAMES,
  });
  assert.deepEqual(art.base.conteudoDeMundo, { pastas: [], tipos: [] });
});

test("sem nota do mundo → null (caller avisa)", () => {
  assert.equal(
    compileContexto({ worldId: "poa-1987", defs: [defBase()], basenames: BASENAMES }),
    null,
  );
});

test("reskin.notas com basename inexistente → quebra listando o problema", () => {
  const def = defPoa({
    reskin: { notas: { "Nota Que Nao Existe": "X" }, termos: {}, excecoes: [] },
  });
  assert.throws(
    () => compileContexto({ worldId: "poa-1987", defs: [def], basenames: BASENAMES }),
    /Nota Que Nao Existe/,
  );
});

test("indisponível inexistente na vault → quebra", () => {
  const def = defPoa({
    disponibilidade: { indisponiveis: ["Item Fantasma"] },
  });
  assert.throws(
    () => compileContexto({ worldId: "poa-1987", defs: [def], basenames: BASENAMES }),
    /Item Fantasma/,
  );
});

test("indisponível que é sempre_disponivel do Base → quebra (garantia do Base)", () => {
  const def = defPoa({
    disponibilidade: { indisponiveis: ["Espada Longa"] },
  });
  assert.throws(
    () =>
      compileContexto({
        worldId: "poa-1987",
        defs: [def, defBase(["Espada Longa"])],
        basenames: BASENAMES,
      }),
    /Espada Longa/,
  );
});

test("duas notas pro mesmo mundo → quebra", () => {
  assert.throws(
    () =>
      compileContexto({
        worldId: "poa-1987",
        defs: [defPoa(), defPoa()],
        basenames: BASENAMES,
      }),
    /duas notas/i,
  );
});

test("fantasia mínima (sem reskin) compila com defaults", () => {
  const art = compileContexto({
    worldId: "fantasia",
    defs: [
      {
        relPath: "Contexto/Contexto Fantasia.md",
        contexto: {
          id: "fantasia",
          nome: "Fantasia",
          moeda: { simbolo: "PO", nome: "Peças de Ouro" },
          atlas: { raiz: "Atlas", mapa: null },
        },
      },
    ],
    basenames: BASENAMES,
  });
  assert.deepEqual(art.reskin.notas, {});
  assert.deepEqual(art.disponibilidade.indisponiveis, []);
  assert.equal(art.disponibilidade.padrao, "disponivel");
  assert.deepEqual(art.base.sempreDisponiveis, []);
});
