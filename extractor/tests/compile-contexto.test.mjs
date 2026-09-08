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

test("bloco auto:contexto desatualizado QUEBRA o compile (auditoria corpo↔FM)", () => {
  const def = { ...defPoa(), body: "prosa\n<!-- auto:contexto -->\ntabela velha\n<!-- /auto:contexto -->\n" };
  assert.throws(
    () => compileContexto({ worldId: "poa-1987", defs: [def, defBase()], basenames: BASENAMES }),
    /DESATUALIZADO/,
  );
});

test("bloco auto:contexto em dia passa", async () => {
  const { renderContextoDoc } = await import("../contexto-doc.mjs");
  const d = defPoa();
  const bloco = renderContextoDoc(d.contexto, new Map());
  const def = { ...d, body: `prosa\n<!-- auto:contexto -->\n${bloco}\n<!-- /auto:contexto -->\n` };
  const art = compileContexto({ worldId: "poa-1987", defs: [def, defBase()], basenames: BASENAMES });
  assert.equal(art.id, "poa-1987");
});

test("matriz.preco: multiplicador por linha (número, '0,7', '×1,5', '70%'); ausente = 1", () => {
  const mundo = {
    relPath: "Ctx/M.md",
    contexto: {
      id: "m", nome: "M", moeda: { simbolo: "$", nome: "d" }, atlas: { raiz: "Atlas" },
      disponibilidade: { matriz: {
        "Pequena Cidade": { Adepto: "33%", Experiente: "—", Mestre: "—", preco: "0,7" },
        "Grande Cidade": { Adepto: "50%", Experiente: "10%", Mestre: "—" },
        "Capital": { Adepto: "100%", Experiente: "25%", Mestre: "2%", preco: "×1,5" },
        "Iluminada": { Adepto: "150%", Experiente: "50%", Mestre: "5%", preco: "120%" },
      } },
    },
  };
  const out = compileContexto({ worldId: "m", defs: [mundo], basenames: new Set(), typeByBasename: new Map() });
  const m = out.disponibilidade.matriz;
  assert.equal(m["Pequena Cidade"].preco, 0.7);
  assert.equal(m["Grande Cidade"].preco, 1);
  assert.equal(m["Capital"].preco, 1.5);
  assert.equal(m["Iluminada"].preco, 1.2);
});

test("moeda.fator: inteiro ≥ 1 vira fator; ausente = 1; inválido quebra", () => {
  const base = (moeda) => ({ relPath: "Ctx/M.md", contexto: { id: "m", nome: "M", moeda, atlas: { raiz: "Atlas" } } });
  assert.equal(compileContexto({ worldId: "m", defs: [base({ simbolo: "Cz$", nome: "Cruzado", fator: 1000 })], basenames: new Set(), typeByBasename: new Map() }).moeda.fator, 1000);
  assert.equal(compileContexto({ worldId: "m", defs: [base({ simbolo: "PO", nome: "Ouro" })], basenames: new Set(), typeByBasename: new Map() }).moeda.fator, 1);
  assert.throws(() => compileContexto({ worldId: "m", defs: [base({ simbolo: "$", nome: "d", fator: 0.5 })], basenames: new Set(), typeByBasename: new Map() }), /moeda\.fator/);
});

// RECURSOS (2026-09-07): bloco opcional do mundo → contexto.json `recursos`
// {raiz, abas, precoEm}; exige ao menos uma nota `categoria: Recurso`.
test("recursos: compila raiz/abas/precoEm e valida a existência de notas Recurso", () => {
  const typeByBasename = new Map([["Gurgel Carajás", "Recurso"]]);
  const out = compileContexto({
    worldId: "poa-1987",
    defs: [defPoa({ recursos: { raiz: "Contexto/Recursos/", abas: [{ nome: "Transporte", papel: "transporte" }, { nome: "Moradia", papel: "moradia" }], tipos: { passagem: "Passagem", estilo: "Estilo de Vida" }, ofertas: { campo: "Serviços", aba: "Serviços" }, disponibilidade: { Capital: { niveis: [3, 6], quantidade: 1 } } } }), defBase()],
    basenames: BASENAMES,
    typeByBasename,
  });
  assert.deepEqual(out.recursos, { raiz: "Contexto/Recursos", abas: [{ nome: "Transporte", papel: "transporte" }, { nome: "Moradia", papel: "moradia" }], precoEm: "moeda", niveis: [], tipos: { passagem: "Passagem", estilo: "Estilo de Vida" }, ofertas: { campo: "Serviços", aba: "Serviços" }, disponibilidade: { Capital: { niveis: [3, 6], quantidade: 1 } } });
  assert.throws(
    () =>
      compileContexto({
        worldId: "poa-1987",
        defs: [defPoa({ recursos: { raiz: "Contexto/Recursos", abas: [{ nome: "Transporte", papel: "transporte" }], tipos: { passagem: "Passagem", estilo: "Estilo de Vida" }, ofertas: { campo: "Serviços", aba: "Serviços" } } }), defBase()],
        basenames: BASENAMES,
        typeByBasename: new Map(),
      }),
    /nenhuma nota `categoria: Recurso`/,
  );
  assert.throws(
    () =>
      compileContexto({
        worldId: "poa-1987",
        defs: [defPoa({ recursos: { raiz: "Contexto/Recursos", abas: [{ nome: "X", papel: "outro" }], preco_em: "dolar" } }), defBase()],
        basenames: BASENAMES,
        typeByBasename,
      }),
    /recursos\.abas.*|recursos\.preco_em/,
  );
  // sem o bloco: sem `recursos` no artefato
  assert.equal("recursos" in compileContexto({ worldId: "poa-1987", defs: [defPoa(), defBase()], basenames: BASENAMES, typeByBasename }), false);
});

// MALHA DE TRANSPORTES (2026-09-08): bloco opcional `transporte` → contexto.json
// {categoria, mapa (basename), modos[{nome,traco,largura}]}; exige a nota do
// mapa na vault e ao menos uma nota da categoria.
test("transporte: compila categoria/mapa/modos e valida nota do mapa e categoria", () => {
  const basenames = new Set([...BASENAMES, "Malha de Transportes"]);
  const typeByBasename = new Map([["Gurgel Carajás", "Recurso"], ["343 BEIRA-RIO", "Linha"]]);
  const out = compileContexto({
    worldId: "poa-1987",
    defs: [defPoa({ transporte: { categoria: "Linha", mapa: "[[Malha de Transportes]]", modos: [{ nome: "Aeromóvel", traco: "cheio", largura: 7 }, { nome: "Kombi", traco: "pontilhado" }] } }), defBase()],
    basenames,
    typeByBasename,
  });
  assert.deepEqual(out.transporte, { categoria: "Linha", mapa: "Malha de Transportes", modos: [{ nome: "Aeromóvel", traco: "cheio", largura: 7 }, { nome: "Kombi", traco: "pontilhado", largura: 4 }] });
  assert.throws(
    () => compileContexto({ worldId: "poa-1987", defs: [defPoa({ transporte: { categoria: "Linha", mapa: "[[Nota Que Não Existe]]", modos: [{ nome: "Ônibus" }] } }), defBase()], basenames, typeByBasename }),
    /transporte\.mapa/,
  );
  assert.throws(
    () => compileContexto({ worldId: "poa-1987", defs: [defPoa({ transporte: { categoria: "Linha", mapa: "[[Malha de Transportes]]", modos: [{ nome: "Ônibus", traco: "ondulado" }] } }), defBase()], basenames, typeByBasename }),
    /traco "ondulado"/,
  );
  assert.throws(
    () => compileContexto({ worldId: "poa-1987", defs: [defPoa({ transporte: { categoria: "Linha", mapa: "[[Malha de Transportes]]", modos: [{ nome: "Ônibus" }] } }), defBase()], basenames, typeByBasename: new Map() }),
    /nenhuma nota `categoria: Linha`/,
  );
  assert.equal("transporte" in compileContexto({ worldId: "poa-1987", defs: [defPoa(), defBase()], basenames, typeByBasename }), false);
});

// PLANEJADOR (2026-09-08b): parâmetros de tempo opcionais no bloco transporte.
test("transporte: parâmetros de tempo (cidade, sinuosidade, atraso, períodos, velocidade/espera/rua por modo)", () => {
  const basenames = new Set([...BASENAMES, "Malha de Transportes", "Porto Alegre"]);
  const typeByBasename = new Map([["343 BEIRA-RIO", "Linha"]]);
  const out = compileContexto({
    worldId: "poa-1987",
    defs: [defPoa({ transporte: { categoria: "Linha", mapa: "[[Malha de Transportes]]", cidade: "[[Porto Alegre]]", sinuosidade: 1.3, parada: 0.5, baldeacao: 5, atraso_por_qualidade: [1.6, 1.35, 1.15, 1.05, 1], periodos: [{ nome: "Pico", transito: 1.5 }], modos: [{ nome: "Ônibus", velocidade: 18, espera: 10, rua: true }] } }), defBase()],
    basenames,
    typeByBasename,
  });
  assert.deepEqual(out.transporte, { categoria: "Linha", mapa: "Malha de Transportes", cidade: "Porto Alegre", sinuosidade: 1.3, parada: 0.5, baldeacao: 5, atrasoPorQualidade: [1.6, 1.35, 1.15, 1.05, 1], periodos: [{ nome: "Pico", transito: 1.5 }], modos: [{ nome: "Ônibus", traco: "cheio", largura: 4, velocidade: 18, espera: 10, rua: true }] });
  assert.throws(
    () => compileContexto({ worldId: "poa-1987", defs: [defPoa({ transporte: { categoria: "Linha", mapa: "[[Malha de Transportes]]", cidade: "[[Cidade Que Não Existe]]", atraso_por_qualidade: [1, 2], modos: [{ nome: "Ônibus", velocidade: -3 }] } }), defBase()], basenames, typeByBasename }),
    /transporte\.cidade|atraso_por_qualidade|velocidade/,
  );
});
