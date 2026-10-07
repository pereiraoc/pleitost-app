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

test("reskin.chamadas / chamadas_sintonia (resumo do wizard por mundo): validados como basenames", () => {
  const reskin = {
    notas: {},
    notas_futuras: {},
    termos: {},
    excecoes: [],
    chamadas: { "Poção de Cura": "Cura de balcão, tarja amarela." },
    chamadas_sintonia: { "Espada Longa": { Água: "Fio frio.", Fogo: "Fio quente." } },
  };
  const art = compileContexto({
    worldId: "poa-1987",
    defs: [defPoa({ reskin }), defBase()],
    basenames: BASENAMES,
  });
  assert.equal(art.reskin.chamadas["Poção de Cura"], "Cura de balcão, tarja amarela.");
  assert.deepEqual(art.reskin.chamadasSintonia["Espada Longa"], { Água: "Fio frio.", Fogo: "Fio quente." });

  // sem o bloco: mapas vazios (o app cai no FM canônico da nota)
  const semBloco = compileContexto({ worldId: "poa-1987", defs: [defPoa(), defBase()], basenames: BASENAMES });
  assert.deepEqual(semBloco.reskin.chamadas, {});
  assert.deepEqual(semBloco.reskin.chamadasSintonia, {});

  // basename inexistente quebra o extract (como descricoes/notas)
  assert.throws(
    () =>
      compileContexto({
        worldId: "poa-1987",
        defs: [defPoa({ reskin: { ...reskin, chamadas: { Inexistente: "x" } } }), defBase()],
        basenames: BASENAMES,
      }),
    /reskin\.chamadas: "Inexistente" não existe/,
  );
  assert.throws(
    () =>
      compileContexto({
        worldId: "poa-1987",
        defs: [defPoa({ reskin: { ...reskin, chamadas_sintonia: { Inexistente: { Água: "x" } } } }), defBase()],
        basenames: BASENAMES,
      }),
    /reskin\.chamadas_sintonia: "Inexistente" não existe/,
  );
});

test("reskin.execucao (como classe/habilidade/sintonia executa cada escola): validado e compilado", () => {
  const basenames = new Set([...BASENAMES, "Arcanista", "Treinamento de Animista", "Fator Positrônico"]);
  const typeByBasename = new Map([
    ["Arcanista", "Classe"],
    ["Treinamento de Animista", "Habilidade"],
    ["Fator Positrônico", "Sintonia"],
    ["Espada Longa", "Item"],
  ]);
  const execucao = {
    padrao: { "Arcana Branca": "Rotina por implante.", Anima: "Reação pelo sangue." },
    classes: { Arcanista: { "Arcana Branca": "Pelo adaptador." } },
    habilidades: { "Treinamento de Animista": { Anima: "Exposição." } },
    sintonias: { "Fator Positrônico": { "Arcana Branca": "Implante." } },
  };
  const reskin = { notas: {}, notas_futuras: {}, termos: {}, excecoes: [], execucao };
  const art = compileContexto({ worldId: "poa-1987", defs: [defPoa({ reskin }), defBase()], basenames, typeByBasename });
  assert.equal(art.reskin.execucao.padrao["Arcana Branca"], "Rotina por implante.");
  assert.equal(art.reskin.execucao.classes.Arcanista["Arcana Branca"], "Pelo adaptador.");
  assert.equal(art.reskin.execucao.habilidades["Treinamento de Animista"].Anima, "Exposição.");
  assert.equal(art.reskin.execucao.sintonias["Fator Positrônico"]["Arcana Branca"], "Implante.");

  // sem o bloco: mapas vazios (app → null → fantasia sem linha de execução)
  const semBloco = compileContexto({ worldId: "poa-1987", defs: [defPoa(), defBase()], basenames: BASENAMES });
  assert.deepEqual(semBloco.reskin.execucao, { padrao: {}, classes: {}, habilidades: {}, sintonias: {} });

  const compila = (ex) =>
    compileContexto({ worldId: "poa-1987", defs: [defPoa({ reskin: { ...reskin, execucao: ex } }), defBase()], basenames, typeByBasename });
  // basename inexistente quebra (como notas/descricoes/chamadas)
  assert.throws(() => compila({ classes: { Inexistente: { Anima: "x" } } }), /reskin\.execucao\.classes: "Inexistente" não existe/);
  // escola fora do vocabulário de Magias.Lista quebra
  assert.throws(() => compila({ padrao: { "Arcana Roxa": "x" } }), /reskin\.execucao\.padrao: escola "Arcana Roxa"/);
  // tipo errado no grupo quebra (um Item não é Classe)
  assert.throws(() => compila({ classes: { "Espada Longa": { Anima: "x" } } }), /reskin\.execucao\.classes: "Espada Longa" é Item/);
});

test("contexto-doc: tabelas de execução só aparecem quando a chave existe", async () => {
  const { renderContextoDoc } = await import("../contexto-doc.mjs");
  const sem = renderContextoDoc(defPoa().contexto, new Map());
  assert.equal(sem.includes("Execução por classe"), false);
  const com = renderContextoDoc(
    defPoa({ reskin: { notas: {}, termos: {}, excecoes: [], execucao: { classes: { Arcanista: { "Arcana Branca": "x", Anima: "y" } }, padrao: { Anima: "z" } } } }).contexto,
    new Map(),
  );
  assert.match(com, /#### Execução por classe/);
  assert.match(com, /\| Arcanista \| Anima, Arcana Branca \|/);
  assert.match(com, /#### Execução padrão/);
  assert.match(com, /\| Anima \| z \|/);
});

// VIAGEM DO HEXCRAWL (regras v3, 2026-10-06): bloco opcional `viagem` →
// contexto.json {padrao, terrenos[{chave,nome,custo,cor?,agua?,custoPorMeio?}]
// na ordem do FM, rotas[{chave,nome,cor?,bonus,meios}], meios[{nome,icone,
// padrao,hexPorDia,em,soEmRota?,costa?,antigos?}]} (FM snake → camelCase).
const VIAGEM_OK = {
  padrao: "normal",
  terrenos: {
    normal: { custo: 1, nome: "Gramado", cor: "#7fb069" },
    dificil: { custo: 2, nome: "Difícil" },
    muito_dificil: { custo: 3, nome: "Montanha" },
    mar: { custo: 3, nome: "Mar", agua: true, custo_por_meio: { Barco: 1 } },
  },
  rotas: {
    estrada: { nome: "Estrada", cor: "#c9a36b", bonus: 1, meios: ["Cavalo", "Caravana"] },
    rota_maritima: { nome: "Rota marítima", bonus: 1, meios: ["Barco"] },
  },
  meios: [
    { nome: "A pé", icone: "🚶", padrao: true, hex_por_dia: 2, em: ["normal", "dificil", "muito_dificil"], costa: true },
    { nome: "Cavalo", icone: "🐎", hex_por_dia: 3, em: ["normal", "dificil"] },
    { nome: "Caravana", icone: "🐪", padrao: true, hex_por_dia: 4, em: ["normal", "dificil", "muito_dificil"], so_em_rota: "estrada", antigos: ["Carruagem"] },
    { nome: "Barco", icone: "⛵", padrao: true, hex_por_dia: 5, em: ["mar"], costa: true, antigos: ["Navio"] },
  ],
};

test("viagem: compila terrenos (ordem do FM), rotas e meios", () => {
  const out = compileContexto({ worldId: "poa-1987", defs: [defPoa({ viagem: VIAGEM_OK }), defBase()], basenames: BASENAMES, typeByBasename: new Map() });
  assert.deepEqual(out.viagem, {
    padrao: "normal",
    terrenos: [
      { chave: "normal", nome: "Gramado", custo: 1, cor: "#7fb069" },
      { chave: "dificil", nome: "Difícil", custo: 2 },
      { chave: "muito_dificil", nome: "Montanha", custo: 3 },
      { chave: "mar", nome: "Mar", custo: 3, agua: true, custoPorMeio: { Barco: 1 } },
    ],
    rotas: [
      { chave: "estrada", nome: "Estrada", cor: "#c9a36b", bonus: 1, meios: ["Cavalo", "Caravana"] },
      { chave: "rota_maritima", nome: "Rota marítima", bonus: 1, meios: ["Barco"] },
    ],
    meios: [
      { nome: "A pé", icone: "🚶", padrao: true, hexPorDia: 2, em: ["normal", "dificil", "muito_dificil"], costa: true },
      { nome: "Cavalo", icone: "🐎", padrao: false, hexPorDia: 3, em: ["normal", "dificil"] },
      { nome: "Caravana", icone: "🐪", padrao: true, hexPorDia: 4, em: ["normal", "dificil", "muito_dificil"], soEmRota: "estrada", antigos: ["Carruagem"] },
      { nome: "Barco", icone: "⛵", padrao: true, hexPorDia: 5, em: ["mar"], costa: true, antigos: ["Navio"] },
    ],
  });
  assert.equal("viagem" in compileContexto({ worldId: "poa-1987", defs: [defPoa(), defBase()], basenames: BASENAMES, typeByBasename: new Map() }), false);
  // sem rotas: a chave some
  const { rotas: _r, ...semRotas } = VIAGEM_OK;
  const meiosSemRota = semRotas.meios.map(({ so_em_rota: _s, ...m }) => m);
  const out2 = compileContexto({ worldId: "poa-1987", defs: [defPoa({ viagem: { ...semRotas, meios: meiosSemRota } }), defBase()], basenames: BASENAMES, typeByBasename: new Map() });
  assert.equal("rotas" in out2.viagem, false);
});

test("viagem: def inválida quebra o extract", () => {
  const run = (viagem) => () => compileContexto({ worldId: "poa-1987", defs: [defPoa({ viagem }), defBase()], basenames: BASENAMES, typeByBasename: new Map() });
  const T = VIAGEM_OK.terrenos;
  assert.throws(run({ ...VIAGEM_OK, padrao: "pantano" }), /viagem\.padrao: "pantano"/);
  assert.throws(run({ ...VIAGEM_OK, meios: [{ nome: "Balão", hex_por_dia: 3, em: ["ceu"] }] }), /viagem\.meios: "Balão" em terreno "ceu"/);
  assert.throws(run({ ...VIAGEM_OK, meios: [{ nome: "Lesma", hex_por_dia: 0, em: ["normal"] }] }), /viagem\.meios: "Lesma" hex_por_dia/);
  assert.throws(run({ ...VIAGEM_OK, meios: [{ nome: "Velho", fator: 2, em: ["normal"] }] }), /viagem\.meios: "Velho" hex_por_dia/);
  assert.throws(run({ ...VIAGEM_OK, terrenos: { ...T, normal: { custo: -1, nome: "Gramado" } } }), /viagem\.terrenos\.normal: custo/);
  assert.throws(run({ ...VIAGEM_OK, terrenos: { ...T, normal: { horas: 16, nome: "Gramado" } } }), /viagem\.terrenos\.normal: custo/);
  assert.throws(run({ ...VIAGEM_OK, terrenos: { ...T, normal: { custo: 1 } } }), /viagem\.terrenos\.normal: nome/);
  assert.throws(run({ ...VIAGEM_OK, meios: [] }), /viagem\.meios/);
  assert.throws(run({ ...VIAGEM_OK, meios: [{ nome: "Mudo", hex_por_dia: 2, em: ["normal"] }] }), /viagem\.meios: "Mudo" icone/);
  assert.throws(run({ ...VIAGEM_OK, meios: [{ nome: "Vazio", icone: " ", hex_por_dia: 2, em: ["normal"] }] }), /viagem\.meios: "Vazio" icone/);
  assert.throws(run({ ...VIAGEM_OK, meios: [{ nome: "Talvez", icone: "?", padrao: "sim", hex_por_dia: 2, em: ["normal"] }] }), /viagem\.meios: "Talvez" padrao/);
  assert.throws(run({ ...VIAGEM_OK, terreno: "[[Nota Que Não Existe]]" }), /viagem\.terreno: "Nota Que Não Existe" não existe/);
  // v3: água, custo por meio, rotas, só em rota, costa, nomes antigos
  assert.throws(run({ ...VIAGEM_OK, terrenos: { ...T, mar: { ...T.mar, agua: "sim" } } }), /viagem\.terrenos\.mar: agua/);
  assert.throws(run({ ...VIAGEM_OK, terrenos: { ...T, mar: { ...T.mar, custo_por_meio: { Dragão: 1 } } } }), /viagem\.terrenos\.mar: custo_por_meio "Dragão" não é meio/);
  assert.throws(run({ ...VIAGEM_OK, terrenos: { ...T, mar: { ...T.mar, custo_por_meio: { Barco: 0 } } } }), /viagem\.terrenos\.mar: custo_por_meio "Barco"/);
  assert.throws(run({ ...VIAGEM_OK, rotas: { estrada: { nome: "Estrada", bonus: 1, meios: ["Trem"] } } }), /viagem\.rotas\.estrada: meio "Trem" não declarado/);
  assert.throws(run({ ...VIAGEM_OK, rotas: { ...VIAGEM_OK.rotas, estrada: { nome: "Estrada", bonus: -1, meios: ["Cavalo"] } } }), /viagem\.rotas\.estrada: bonus/);
  assert.throws(run({ ...VIAGEM_OK, rotas: { ...VIAGEM_OK.rotas, estrada: { bonus: 1, meios: ["Cavalo"] } } }), /viagem\.rotas\.estrada: nome/);
  assert.throws(run({ ...VIAGEM_OK, rotas: { ...VIAGEM_OK.rotas, normal: { nome: "X", bonus: 1, meios: [] } } }), /viagem\.rotas\.normal: chave já é terreno/);
  const meio = (i, extra) => VIAGEM_OK.meios.map((m, j) => (j === i ? { ...m, ...extra } : m));
  assert.throws(run({ ...VIAGEM_OK, meios: meio(2, { so_em_rota: "trilho" }) }), /viagem\.meios: "Caravana" so_em_rota "trilho" não é rota declarada/);
  assert.throws(run({ ...VIAGEM_OK, meios: meio(3, { costa: 1 }) }), /viagem\.meios: "Barco" costa/);
  assert.throws(run({ ...VIAGEM_OK, meios: meio(3, { antigos: "Navio" }) }), /viagem\.meios: "Barco" antigos/);
  assert.throws(run({ ...VIAGEM_OK, meios: meio(3, { antigos: ["Cavalo"] }) }), /viagem\.meios: "Barco" antigo "Cavalo" já é nome/);
});

// TERRENO como DADO DO MUNDO (2026-10-05): `viagem.terreno` = wikilink da nota
// com o FM `Terreno` (chave → lista de "col,row") — resolve pro basename, como
// transporte.mapa; o app acha o doc pelo catálogo (overlay do Modo Dev aplica).
test("viagem.terreno: wikilink da nota de terreno vira basename", () => {
  const basenames = new Set([...BASENAMES, "Terreno do Mundo Livre"]);
  const out = compileContexto({ worldId: "poa-1987", defs: [defPoa({ viagem: { ...VIAGEM_OK, terreno: "[[Terreno do Mundo Livre]]" } }), defBase()], basenames, typeByBasename: new Map() });
  assert.equal(out.viagem.terreno, "Terreno do Mundo Livre");
  const sem = compileContexto({ worldId: "poa-1987", defs: [defPoa({ viagem: VIAGEM_OK }), defBase()], basenames, typeByBasename: new Map() });
  assert.equal("terreno" in sem.viagem, false);
});

test("viagem: o bloco auto renderiza a tabela de terrenos, de rotas e de meios", async () => {
  const { renderContextoDoc } = await import("../contexto-doc.mjs");
  const bloco = renderContextoDoc({ id: "fantasia", viagem: VIAGEM_OK }, new Map());
  assert.match(bloco, /#### Viagem: custo de movimento por terreno/);
  assert.match(bloco, /\| Gramado \(`normal`\) \| ×1 · padrão \(hex sem terreno\) · cor `#7fb069` \|/);
  assert.match(bloco, /\| Montanha \(`muito_dificil`\) \| ×3 \|/);
  assert.match(bloco, /\| Mar \(`mar`\) \| ×3 · água \(passo da costa\) · Barco ×1 \|/);
  assert.match(bloco, /#### Viagem: rotas \(camada sobre o terreno\)/);
  assert.match(bloco, /\| Estrada \(`estrada`\) \| \+1 hex\/dia pra Cavalo, Caravana · cor `#c9a36b` \|/);
  assert.match(bloco, /\| Rota marítima \(`rota_maritima`\) \| \+1 hex\/dia pra Barco \|/);
  assert.match(bloco, /#### Viagem: meios de transporte \(hex por dia\)/);
  assert.match(bloco, /\| 🐎 Cavalo \| 3 hex\/dia · Gramado, Difícil \|/);
  assert.match(bloco, /\| 🐪 Caravana \| 4 hex\/dia · só com Estrada · padrão do grupo · antes: Carruagem \|/);
  assert.match(bloco, /\| ⛵ Barco \| 5 hex\/dia · Mar · costa · padrão do grupo · antes: Navio \|/);
  assert.match(bloco, /\| 🚶 A pé \| 2 hex\/dia · Gramado, Difícil, Montanha · costa · padrão do grupo \|/);
});

// PORTAL (2026-10-06): meio `instantaneo` — 0 dias, dispensa hex_por_dia;
// nunca padrão por si (não entra no automático se não for `padrao`).
test("viagem: meio instantâneo (Portal) compila sem hex_por_dia e o doc mostra instantâneo", async () => {
  const portal = { nome: "Portal", icone: "✨", instantaneo: true, em: ["normal", "dificil", "muito_dificil", "mar"] };
  const out = compileContexto({ worldId: "poa-1987", defs: [defPoa({ viagem: { ...VIAGEM_OK, meios: [...VIAGEM_OK.meios, portal] } }), defBase()], basenames: BASENAMES, typeByBasename: new Map() });
  assert.deepEqual(out.viagem.meios.at(-1), { nome: "Portal", icone: "✨", padrao: false, hexPorDia: 0, em: ["normal", "dificil", "muito_dificil", "mar"], instantaneo: true });
  const run = (m) => () => compileContexto({ worldId: "poa-1987", defs: [defPoa({ viagem: { ...VIAGEM_OK, meios: [...VIAGEM_OK.meios, m] } }), defBase()], basenames: BASENAMES, typeByBasename: new Map() });
  assert.throws(run({ ...portal, instantaneo: "sim" }), /viagem\.meios: "Portal" instantaneo esperado true\/false/);
  // sem instantaneo, hex_por_dia continua obrigatório
  assert.throws(run({ ...portal, instantaneo: false }), /viagem\.meios: "Portal" hex_por_dia/);
  const { renderContextoDoc } = await import("../contexto-doc.mjs");
  const bloco = renderContextoDoc({ id: "fantasia", viagem: { ...VIAGEM_OK, meios: [...VIAGEM_OK.meios, portal] } }, new Map());
  assert.match(bloco, /\| ✨ Portal \| instantâneo \(0 dias\) · Gramado, Difícil, Montanha, Mar \|/);
});

// report 2026-10-06: `terreno:` desindentado pro nível do Contexto (fora de
// `viagem`) passava calado — o app não achava a nota e tudo virava Gramado.
test("viagem: `terreno` fora do bloco viagem quebra o extract", () => {
  const run = () => compileContexto({ worldId: "poa-1987", defs: [defPoa({ viagem: VIAGEM_OK, terreno: "[[Terreno do Mundo Livre]]" }), defBase()], basenames: BASENAMES, typeByBasename: new Map() });
  assert.throws(run, /terreno: fica dentro de `viagem`/);
});
