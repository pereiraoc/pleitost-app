import { renderContextoDoc, blocoAutoAtual, AUTO_INI } from "./contexto-doc.mjs";
// Compilador de contexto (#519 — arquitetura de mundos, Opção 1).
//
// Fonte: notas de Contexto-Def na vault (frontmatter `Contexto:` — ver
// "Contexto POA 1987.md" na vault POA e "Contexto Fantasia.md"/"Contexto
// Base.md" na pleitost-vault). O extract localiza a def cujo `id` bate com o
// MUNDO sendo extraído (PLEITOST_WORLD_ID), VALIDA contra os basenames reais
// da vault e emite `contexto.json` no OUT_DIR — o app consome esse artefato
// na camada de mundo (vaultUrl/world-dataset).
//
// Princípios:
//  - Identidade canônica nunca muda: reskin é apresentação (display) pura;
//    Elementos de Regra e wikilinks seguem operando nos basenames de fantasia.
//  - Extract QUEBRA em def inválida (basename inexistente, garantia do Base
//    violada) — nunca deriva silencioso.
//  - `Contexto Base` (id "base") declara `sempre_disponiveis`: itens que
//    NENHUM contexto pode marcar indisponível.

function isPlainObject(v) {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

function asStringMap(v, label, problems) {
  if (v == null) return {};
  if (!isPlainObject(v)) {
    problems.push(`${label}: esperado mapa chave→valor`);
    return {};
  }
  const out = {};
  for (const [k, val] of Object.entries(v)) {
    if (typeof val !== "string" || !val.trim()) {
      problems.push(`${label}["${k}"]: valor vazio/não-string`);
      continue;
    }
    if (!k.trim()) {
      problems.push(`${label}: chave vazia`);
      continue;
    }
    out[k] = val;
  }
  return out;
}

function asStringArray(v, label, problems) {
  if (v == null) return [];
  if (!Array.isArray(v)) {
    problems.push(`${label}: esperado lista`);
    return [];
  }
  return v.filter((s) => {
    if (typeof s !== "string" || !s.trim()) {
      problems.push(`${label}: entrada vazia/não-string`);
      return false;
    }
    return true;
  });
}

/**
 * @param {object} p
 * @param {string} p.worldId          mundo sendo extraído (ex.: "fantasia", "poa-1987")
 * @param {Array<{relPath: string, contexto: object}>} p.defs  notas com FM `Contexto:`
 * @param {Set<string>} p.basenames   basenames de TODOS os docs de conteúdo da vault
 * @returns {object|null}             artefato contexto.json, ou null se não há def do mundo
 * @throws {Error}                    def inválida (mensagem lista TODOS os problemas)
 */
export function compileContexto({ worldId, defs, basenames, typeByBasename }) {
  const doMundo = defs.filter((d) => d.contexto?.id === worldId);
  if (doMundo.length === 0) return null;
  if (doMundo.length > 1) {
    throw new Error(
      `contexto: duas notas declaram id "${worldId}": ` +
        doMundo.map((d) => d.relPath).join(" e "),
    );
  }
  const doBase = defs.filter((d) => d.contexto?.id === "base");
  if (doBase.length > 1) {
    throw new Error(
      `contexto: duas notas declaram id "base": ` + doBase.map((d) => d.relPath).join(" e "),
    );
  }

  const problems = [];
  const def = doMundo[0].contexto;
  const fonte = doMundo[0].relPath;

  if (typeof def.nome !== "string" || !def.nome.trim()) problems.push("nome: obrigatório");
  const moeda = isPlainObject(def.moeda) ? def.moeda : {};
  if (typeof moeda.simbolo !== "string" || typeof moeda.nome !== "string") {
    problems.push("moeda: {simbolo, nome} obrigatórios");
  }
  // FATOR de exibição da moeda (2026-09-07): valor do mundo = PO × fator,
  // inteiro ≥ 1 (POA: 1000 → Cz$). Ausente = 1 (fantasia: só o rótulo muda).
  let fator = 1;
  if (moeda.fator !== undefined && moeda.fator !== null) {
    const n = Number(moeda.fator);
    if (Number.isInteger(n) && n >= 1) fator = n;
    else problems.push(`moeda.fator: "${moeda.fator}" (esperado inteiro ≥ 1)`);
  }
  const atlas = isPlainObject(def.atlas) ? def.atlas : {};
  if (typeof atlas.raiz !== "string" || !atlas.raiz.trim()) problems.push("atlas.raiz: obrigatório");

  // RECURSOS (2026-09-07): notas `categoria: Recurso` (transporte/moradia/
  // alimentação) que a aba RECURSOS da ficha vende/mostra. `abas` = subcategorias
  // na ordem da aba; `preco_em` diz em que unidade o FM `Preço` está (moeda do
  // mundo, inteiro — ou po). Mundo sem o bloco = sem aba.
  let recursos = null;
  if (def.recursos !== undefined && def.recursos !== null) {
    const r = isPlainObject(def.recursos) ? def.recursos : {};
    if (typeof r.raiz !== "string" || !r.raiz.trim()) problems.push("recursos.raiz: obrigatório");
    const PAPEIS = ["transporte", "moradia", "alimentacao"];
    const abas = [];
    if (!Array.isArray(r.abas) || r.abas.length === 0) problems.push("recursos.abas: lista de {nome, papel} obrigatória");
    else {
      for (const a of r.abas) {
        if (!isPlainObject(a) || typeof a.nome !== "string" || !a.nome.trim()) { problems.push("recursos.abas: cada aba precisa de `nome`"); continue; }
        if (!PAPEIS.includes(a.papel)) problems.push(`recursos.abas: "${a.nome}" papel "${a.papel}" (esperado ${PAPEIS.join("|")})`);
        abas.push({ nome: a.nome.trim(), papel: String(a.papel ?? "") });
      }
    }
    const tiposIn = isPlainObject(r.tipos) ? r.tipos : {};
    const tipos = { passagem: tiposIn.passagem, estilo: tiposIn.estilo };
    for (const k of ["passagem", "estilo"]) {
      if (typeof tipos[k] !== "string" || !tipos[k].trim()) problems.push(`recursos.tipos.${k}: obrigatório (nome do Tipo nas notas)`);
    }
    // OPCIONAL (2026-09-08): fontes de crédito. Mundo sem `emprestimo` não tem
    // empréstimo — a ficha simplesmente não oferece dívida.
    if (typeof tiposIn.emprestimo === "string" && tiposIn.emprestimo.trim()) tipos.emprestimo = tiposIn.emprestimo.trim();
    // REGALIAS DE CLASSE (2026-09-08): nota que descreve o que cada classe
    // ganha de terceiro. Opcional — mundo sem ela não mostra a seção.
    const regalias = typeof r.regalias === "string" && r.regalias.trim() ? r.regalias.trim() : null;
    // ONDE se compra (2026-09-07b): campo FM das Localizações com as ofertas
    // + rótulo da aba no local. Obrigatório — sem isso a ficha não tem de
    // onde comprar.
    const ofIn = isPlainObject(r.ofertas) ? r.ofertas : {};
    const ofertas = { campo: ofIn.campo, aba: ofIn.aba };
    for (const k of ["campo", "aba"]) {
      if (typeof ofertas[k] !== "string" || !ofertas[k].trim()) problems.push(`recursos.ofertas.${k}: obrigatório`);
    }
    // Disponibilidade por linha da régua (opcional): {niveis: [min, max], quantidade}.
    const disponibilidade = {};
    if (r.disponibilidade !== undefined && r.disponibilidade !== null) {
      if (!isPlainObject(r.disponibilidade)) problems.push("recursos.disponibilidade: mapa linha → {niveis, quantidade}");
      else {
        for (const [linha, v] of Object.entries(r.disponibilidade)) {
          const niv = Array.isArray(v?.niveis) ? v.niveis.map(Number) : [];
          const q = Number(v?.quantidade ?? 1);
          if (niv.length !== 2 || !niv.every((n) => Number.isInteger(n) && n >= 1) || niv[0] > niv[1]) problems.push(`recursos.disponibilidade.${linha}.niveis: esperado [min, max] inteiros`);
          if (!(q > 0)) problems.push(`recursos.disponibilidade.${linha}.quantidade: esperado > 0`);
          disponibilidade[linha] = { niveis: [niv[0] ?? 1, niv[1] ?? 6], quantidade: q > 0 ? q : 1 };
        }
      }
    }
    const precoEm = r.preco_em ?? "moeda";
    if (precoEm !== "moeda" && precoEm !== "po") problems.push(`recursos.preco_em: "${precoEm}" (esperado moeda|po)`);
    const temRecurso = [...typeByBasename.values()].some((t) => t === "Recurso");
    if (!temRecurso) problems.push("recursos: nenhuma nota `categoria: Recurso` na vault");
    // NÍVEIS (2026-09-12): lista única (legado/fantasia) OU um mapa por papel
    // — o plano passou a se chamar pelo que vende ("Kitnet", "Marmita"), e
    // cada eixo tem a sua escada. O app lê os dois formatos.
    let niveis;
    if (isPlainObject(r.niveis)) {
      niveis = {};
      for (const [papel, lista] of Object.entries(r.niveis)) {
        if (!PAPEIS.includes(papel)) { problems.push(`recursos.niveis: papel "${papel}" (esperado ${PAPEIS.join("|")})`); continue; }
        niveis[papel] = asStringArray(lista, `recursos.niveis.${papel}`, problems);
      }
    } else {
      niveis = asStringArray(r.niveis, "recursos.niveis", problems);
    }
    // CLASSE SOCIAL (2026-09-12): a régua do retrato do mês. Opcional — mundo
    // sem o bloco não mostra o banner.
    let classeSocial = null;
    if (isPlainObject(r.classe_social ?? r.classeSocial)) {
      const cs = r.classe_social ?? r.classeSocial;
      const letras = asStringArray(cs.letras, "recursos.classe_social.letras", problems);
      if (letras.length !== 6) problems.push("recursos.classe_social.letras: esperado 6 (um por degrau)");
      const rotulos = isPlainObject(cs.rotulos) ? Object.fromEntries(Object.entries(cs.rotulos).map(([k, v]) => [k, String(v)])) : {};
      // O padrão de vida define o degrau; `pesos` é a média do que o herói TEM
      // e `ajuste` diz o quanto isso pode mexer no resultado.
      const pesosIn = isPlainObject(cs.pesos) ? cs.pesos : {};
      const pesos = {};
      for (const k of ["patrimonio", "equipamento", "dinheiro"]) {
        const n = Number(pesosIn[k] ?? 0);
        if (!Number.isFinite(n) || n < 0) problems.push(`recursos.classe_social.pesos.${k}: número ≥ 0`);
        pesos[k] = Number.isFinite(n) && n > 0 ? n : 0;
      }
      if (!Object.values(pesos).some((n) => n > 0)) problems.push("recursos.classe_social.pesos: pelo menos um peso > 0");
      const ajIn = isPlainObject(cs.ajuste) ? cs.ajuste : {};
      const ajMax = Number(ajIn.max ?? 1);
      const ajDiv = Number(ajIn.divisor ?? 1);
      if (!Number.isFinite(ajMax) || ajMax < 0) problems.push("recursos.classe_social.ajuste.max: número ≥ 0");
      if (!Number.isFinite(ajDiv) || ajDiv <= 0) problems.push("recursos.classe_social.ajuste.divisor: número > 0");
      const ajuste = { max: Number.isFinite(ajMax) && ajMax >= 0 ? ajMax : 1, divisor: Number.isFinite(ajDiv) && ajDiv > 0 ? ajDiv : 1 };
      const faixas = {};
      const faixasIn = isPlainObject(cs.faixas) ? cs.faixas : {};
      for (const k of ["patrimonio", "equipamento", "dinheiro"]) {
        const lista = Array.isArray(faixasIn[k]) ? faixasIn[k].map(Number) : [];
        if (lista.length !== 6 || !lista.every((n) => Number.isFinite(n) && n >= 0)) problems.push(`recursos.classe_social.faixas.${k}: esperado 6 números ≥ 0`);
        else faixas[k] = lista;
      }
      const tendencias = {};
      const tendIn = isPlainObject(cs.tendencias) ? cs.tendencias : {};
      for (const [classe, t] of Object.entries(tendIn)) {
        if (!isPlainObject(t)) { problems.push(`recursos.classe_social.tendencias.${classe}: objeto`); continue; }
        const lim = (campo) => {
          const lista = Array.isArray(t[campo]) ? t[campo].map(Number) : null;
          if (lista === null) return undefined;
          if (lista.length !== 3 || !lista.every((n) => Number.isInteger(n) && n >= 1 && n <= 6)) {
            problems.push(`recursos.classe_social.tendencias.${classe}.${campo}: 3 degraus (1..6), um por tier`);
            return undefined;
          }
          return lista;
        };
        // Só PISO (2026-09-13): o `teto` saiu do mundo — a profissão garante um
        // chão e nunca impede de subir. O freio de quem sobe é `recursos.imposto`.
        const piso = lim("piso");
        tendencias[classe] = { ...(piso ? { piso } : {}), ...(typeof t.nota === "string" && t.nota.trim() ? { nota: t.nota.trim() } : {}) };
      }
      classeSocial = { letras, rotulos, ajuste, pesos, faixas, tendencias };
    }
    // IMPOSTO (2026-09-13): alíquota por `Nível` do bem (6 degraus, em %), que
    // incide sobre o MÊS — manutenção da posse e preço do plano. `disfarce.fracao`
    // é o que o terceiro cobra pra segurar o bem no lugar do herói.
    let imposto = null;
    if (isPlainObject(r.imposto)) {
      const porNivel = Array.isArray(r.imposto.por_nivel ?? r.imposto.porNivel)
        ? (r.imposto.por_nivel ?? r.imposto.porNivel).map(Number)
        : [];
      if (porNivel.length !== 6 || !porNivel.every((n) => Number.isFinite(n) && n >= 0)) {
        problems.push("recursos.imposto.por_nivel: esperado 6 números ≥ 0 (um por nível)");
      } else {
        const fr = Number(r.imposto.disfarce?.fracao ?? r.imposto.disfarce?.fração);
        if (r.imposto.disfarce !== undefined && (!Number.isFinite(fr) || fr < 0 || fr > 100)) {
          problems.push("recursos.imposto.disfarce.fracao: percentual de 0 a 100");
        }
        imposto = { porNivel, ...(Number.isFinite(fr) ? { disfarce: { fracao: fr } } : {}) };
      }
    }
    recursos = { raiz: String(r.raiz ?? "").replace(/\/+$/, ""), abas, precoEm, niveis, tipos, ofertas, disponibilidade, ...(regalias ? { regalias } : {}), ...(classeSocial ? { classeSocial } : {}), ...(imposto ? { imposto } : {}) };
  }
  // MALHA DE TRANSPORTES (2026-09-08): notas `categoria: <transporte.categoria>`
  // (Paradas em ordem, Acesso, Cor) + a nota `mapa` com o bloco ```malha```
  // (posições esquemáticas). `modos` diz o traço de cada subcategoria.
  let transporte = null;
  if (def.transporte !== undefined && def.transporte !== null) {
    const t = isPlainObject(def.transporte) ? def.transporte : {};
    if (typeof t.categoria !== "string" || !t.categoria.trim()) problems.push("transporte.categoria: obrigatório (categoria das notas de linha)");
    const mapaRaw = typeof t.mapa === "string" ? t.mapa.trim() : "";
    const mapa = mapaRaw.replace(/^\[\[/, "").replace(/\]\]$/, "").split("|")[0].trim();
    if (!mapa) problems.push("transporte.mapa: obrigatório (wikilink da nota com o bloco ```malha```)");
    else if (!basenames.has(mapa)) problems.push(`transporte.mapa: "${mapa}" não existe na vault`);
    const TRACOS = ["cheio", "tracejado", "pontilhado"];
    const modos = [];
    if (!Array.isArray(t.modos) || t.modos.length === 0) problems.push("transporte.modos: lista de {nome, traco, largura} obrigatória");
    else {
      for (const m of t.modos) {
        if (!isPlainObject(m) || typeof m.nome !== "string" || !m.nome.trim()) { problems.push("transporte.modos: cada modo precisa de `nome`"); continue; }
        const traco = m.traco ?? "cheio";
        if (!TRACOS.includes(traco)) problems.push(`transporte.modos: "${m.nome}" traco "${traco}" (esperado ${TRACOS.join("|")})`);
        const largura = Number(m.largura ?? 4);
        if (!(largura > 0)) problems.push(`transporte.modos: "${m.nome}" largura esperada > 0`);
        const modo = { nome: m.nome.trim(), traco, largura };
        // tempo de viagem (planejador): velocidade km/h, espera média min, rua = sofre trânsito
        if (m.velocidade !== undefined) { if (!(Number(m.velocidade) > 0)) problems.push(`transporte.modos: "${m.nome}" velocidade esperada > 0 (km/h)`); modo.velocidade = Number(m.velocidade); }
        if (m.espera !== undefined) { if (!(Number(m.espera) >= 0)) problems.push(`transporte.modos: "${m.nome}" espera esperada ≥ 0 (min)`); modo.espera = Number(m.espera); }
        if (m.rua !== undefined) modo.rua = m.rua === true;
        modos.push(modo);
      }
    }
    if (typeof t.categoria === "string" && t.categoria.trim()) {
      const temLinha = [...typeByBasename.values()].some((x) => x === t.categoria.trim());
      if (!temLinha) problems.push(`transporte: nenhuma nota \`categoria: ${t.categoria.trim()}\` na vault`);
    }
    transporte = { categoria: String(t.categoria ?? "").trim(), mapa, modos };
    // PLANEJADOR DE TRAJETO (2026-09-08b): cidade = Localização cujo leaflet dá
    // a distância real entre paradas; sinuosidade, parada, baldeação, atraso por
    // qualidade (★1..★5) e períodos de trânsito — todos opcionais; sem `cidade`
    // o app não planeja.
    if (t.cidade !== undefined) {
      const cidade = String(t.cidade).trim().replace(/^\[\[/, "").replace(/\]\]$/, "").split("|")[0].trim();
      if (!cidade) problems.push("transporte.cidade: wikilink da Localização com o mapa da cidade");
      else if (!basenames.has(cidade)) problems.push(`transporte.cidade: "${cidade}" não existe na vault`);
      transporte.cidade = cidade;
    }
    for (const k of ["sinuosidade", "parada", "baldeacao"]) {
      if (t[k] !== undefined) { if (!(Number(t[k]) >= 0)) problems.push(`transporte.${k}: número ≥ 0`); transporte[k] = Number(t[k]); }
    }
    // A PÉ (2026-09-09): fator sobre o tempo da rota completa + velocidade de
    // caminhada. Opcional — sem ele o app não oferece o trecho a pé.
    if (t.a_pe !== undefined) {
      const a = isPlainObject(t.a_pe) ? t.a_pe : {};
      const fator = Number(a.fator);
      const velocidade = Number(a.velocidade);
      if (!(fator > 0) || !(velocidade > 0)) problems.push("transporte.a_pe: { fator > 0, velocidade > 0 }");
      else transporte.aPe = { fator, velocidade };
    }
    if (t.taxi !== undefined) {
      const fator = Number(isPlainObject(t.taxi) ? t.taxi.fator : NaN);
      if (!(fator > 0)) problems.push("transporte.taxi: { fator > 0 }");
      else transporte.taxi = { fator };
    }
    if (t.atraso_por_qualidade !== undefined) {
      const a = Array.isArray(t.atraso_por_qualidade) ? t.atraso_por_qualidade.map(Number) : [];
      if (a.length !== 5 || a.some((x) => !(x > 0))) problems.push("transporte.atraso_por_qualidade: 5 fatores > 0 (★1..★5)");
      transporte.atrasoPorQualidade = a;
    }
    if (t.periodos !== undefined) {
      const ps = [];
      if (!Array.isArray(t.periodos) || t.periodos.length === 0) problems.push("transporte.periodos: lista de {nome, transito}");
      else for (const pr of t.periodos) {
        if (!isPlainObject(pr) || typeof pr.nome !== "string" || !pr.nome.trim() || !(Number(pr.transito) > 0)) { problems.push("transporte.periodos: cada período precisa de nome e transito > 0"); continue; }
        ps.push({ nome: pr.nome.trim(), transito: Number(pr.transito) });
      }
      transporte.periodos = ps;
    }
  }

  // VIAGEM DO HEXCRAWL (regras v3, 2026-10-06): `custo` do terreno =
  // MULTIPLICADOR do movimento (normal 1, difícil 2, muito difícil 3, mar 3);
  // `custo_por_meio` = multiplicador próprio de um meio (Barco no mar = 1);
  // `agua: true` = hex de água (passo entre água e terra = COSTA). `rotas` =
  // CAMADA sobre o terreno (estrada, rota marítima): `bonus` hex/dia a mais
  // pros `meios` listados no hex com a rota. Cada meio declara `hex_por_dia`
  // e `em` (terrenos onde anda); `so_em_rota` = só anda em hex com aquela rota
  // (Caravana → estrada); `costa: true` = faz o passo da costa (Barco, A pé);
  // `antigos` = nomes antigos gravados nas trilhas (Carruagem → Caravana).
  // Tempo por hex = custo / (hex_por_dia + bônus) DIAS. Chave = o que fica
  // gravado na nota de terreno; `nome` = rótulo do app (nunca derivado da
  // chave); `cor` opcional = tinta no editor. Ordem do FM preservada. Sem o
  // bloco, o app não mostra nada de viagem.
  let viagem = null;
  if (def.viagem !== undefined && def.viagem !== null) {
    const v = isPlainObject(def.viagem) ? def.viagem : {};
    const nomesMeios = new Set(Array.isArray(v.meios) ? v.meios.filter((m) => isPlainObject(m) && typeof m.nome === "string").map((m) => m.nome.trim()) : []);
    const terrenos = [];
    if (!isPlainObject(v.terrenos) || Object.keys(v.terrenos).length === 0) {
      problems.push("viagem.terrenos: mapa chave → { custo, nome, cor? } obrigatório");
    } else {
      for (const [chave, t] of Object.entries(v.terrenos)) {
        if (!isPlainObject(t)) { problems.push(`viagem.terrenos.${chave}: esperado { custo, nome, cor? }`); continue; }
        const custo = Number(t.custo);
        if (!(Number.isFinite(custo) && custo > 0)) problems.push(`viagem.terrenos.${chave}: custo esperado > 0 (multiplicador do movimento)`);
        if (typeof t.nome !== "string" || !t.nome.trim()) problems.push(`viagem.terrenos.${chave}: nome obrigatório (rótulo no app)`);
        if (t.cor !== undefined && (typeof t.cor !== "string" || !t.cor.trim())) problems.push(`viagem.terrenos.${chave}: cor esperada string (ex.: "#c9a36b")`);
        if (t.agua !== undefined && typeof t.agua !== "boolean") problems.push(`viagem.terrenos.${chave}: agua esperado true/false`);
        let custoPorMeio = null;
        if (t.custo_por_meio !== undefined) {
          if (!isPlainObject(t.custo_por_meio)) problems.push(`viagem.terrenos.${chave}: custo_por_meio esperado mapa meio → custo`);
          else {
            custoPorMeio = {};
            for (const [meio, c] of Object.entries(t.custo_por_meio)) {
              if (!nomesMeios.has(meio)) problems.push(`viagem.terrenos.${chave}: custo_por_meio "${meio}" não é meio declarado`);
              const n = Number(c);
              if (!(Number.isFinite(n) && n > 0)) problems.push(`viagem.terrenos.${chave}: custo_por_meio "${meio}" esperado > 0`);
              custoPorMeio[meio] = n;
            }
          }
        }
        terrenos.push({
          chave,
          nome: String(t.nome ?? "").trim(),
          custo,
          ...(typeof t.cor === "string" && t.cor.trim() ? { cor: t.cor.trim() } : {}),
          ...(t.agua === true ? { agua: true } : {}),
          ...(custoPorMeio ? { custoPorMeio } : {}),
        });
      }
    }
    const chaves = new Set(terrenos.map((t) => t.chave));
    const padrao = typeof v.padrao === "string" ? v.padrao.trim() : "";
    if (!chaves.has(padrao)) problems.push(`viagem.padrao: "${v.padrao}" não é terreno declarado (${[...chaves].join("|")})`);
    // rotas (camada sobre o terreno)
    const rotas = [];
    if (v.rotas !== undefined && v.rotas !== null) {
      if (!isPlainObject(v.rotas)) problems.push("viagem.rotas: mapa chave → { nome, bonus, meios } esperado");
      else {
        for (const [chave, r] of Object.entries(v.rotas)) {
          if (!isPlainObject(r)) { problems.push(`viagem.rotas.${chave}: esperado { nome, bonus, meios }`); continue; }
          if (chaves.has(chave)) problems.push(`viagem.rotas.${chave}: chave já é terreno (rotas são outra camada)`);
          if (typeof r.nome !== "string" || !r.nome.trim()) problems.push(`viagem.rotas.${chave}: nome obrigatório (rótulo no app)`);
          const bonus = Number(r.bonus);
          if (!(Number.isFinite(bonus) && bonus > 0)) problems.push(`viagem.rotas.${chave}: bonus esperado > 0 (hex/dia a mais)`);
          const meiosR = Array.isArray(r.meios) ? r.meios.map((x) => String(x).trim()) : [];
          if (!Array.isArray(r.meios)) problems.push(`viagem.rotas.${chave}: meios esperado lista`);
          for (const m of meiosR) if (!nomesMeios.has(m)) problems.push(`viagem.rotas.${chave}: meio "${m}" não declarado`);
          if (r.cor !== undefined && (typeof r.cor !== "string" || !r.cor.trim())) problems.push(`viagem.rotas.${chave}: cor esperada string`);
          rotas.push({ chave, nome: String(r.nome ?? "").trim(), ...(typeof r.cor === "string" && r.cor.trim() ? { cor: r.cor.trim() } : {}), bonus, meios: meiosR });
        }
      }
    }
    const chavesRotas = new Set(rotas.map((r) => r.chave));
    const meios = [];
    if (!Array.isArray(v.meios) || v.meios.length === 0) problems.push("viagem.meios: lista de { nome, hex_por_dia, em } obrigatória");
    else {
      const antigosVistos = new Set();
      for (const m of v.meios) {
        if (!isPlainObject(m) || typeof m.nome !== "string" || !m.nome.trim()) { problems.push("viagem.meios: cada meio precisa de `nome`"); continue; }
        const nome = m.nome.trim();
        const hexPorDia = Number(m.hex_por_dia);
        if (!(Number.isFinite(hexPorDia) && hexPorDia > 0)) problems.push(`viagem.meios: "${nome}" hex_por_dia esperado > 0`);
        const em = Array.isArray(m.em) ? m.em.map((x) => String(x).trim()) : [];
        if (em.length === 0) problems.push(`viagem.meios: "${nome}" precisa de \`em\` (terrenos onde anda)`);
        for (const k of em) if (!chaves.has(k)) problems.push(`viagem.meios: "${nome}" em terreno "${k}" não declarado`);
        if (meios.some((x) => x.nome === nome)) problems.push(`viagem.meios: "${nome}" duplicado`);
        // ícone (2026-10-05): o app mostra ao lado do tempo — nunca hardcoded
        const icone = typeof m.icone === "string" ? m.icone.trim() : "";
        if (!icone) problems.push(`viagem.meios: "${nome}" icone obrigatório (emoji exibido no app)`);
        // padrao: entra no automático (o 1º, básico, entra sempre)
        if (m.padrao !== undefined && typeof m.padrao !== "boolean") problems.push(`viagem.meios: "${nome}" padrao esperado true/false`);
        let soEmRota = null;
        if (m.so_em_rota !== undefined && m.so_em_rota !== null) {
          soEmRota = String(m.so_em_rota).trim();
          if (!chavesRotas.has(soEmRota)) problems.push(`viagem.meios: "${nome}" so_em_rota "${soEmRota}" não é rota declarada`);
        }
        if (m.costa !== undefined && typeof m.costa !== "boolean") problems.push(`viagem.meios: "${nome}" costa esperado true/false`);
        let antigos = null;
        if (m.antigos !== undefined && m.antigos !== null) {
          if (!Array.isArray(m.antigos) || m.antigos.some((x) => typeof x !== "string" || !x.trim())) problems.push(`viagem.meios: "${nome}" antigos esperado lista de nomes`);
          else {
            antigos = m.antigos.map((x) => x.trim());
            for (const a of antigos) {
              if (nomesMeios.has(a)) problems.push(`viagem.meios: "${nome}" antigo "${a}" já é nome de meio`);
              if (antigosVistos.has(a)) problems.push(`viagem.meios: "${nome}" antigo "${a}" duplicado`);
              antigosVistos.add(a);
            }
          }
        }
        meios.push({
          nome,
          icone,
          padrao: m.padrao === true,
          hexPorDia,
          em,
          ...(soEmRota ? { soEmRota } : {}),
          ...(m.costa === true ? { costa: true } : {}),
          ...(antigos ? { antigos } : {}),
        });
      }
    }
    // terreno (2026-10-05): wikilink da nota com o FM `Terreno` (camada base)
    // e `Rotas` (camada de rotas) — chave → lista de "col,row" na grade da
    // trilha; dado do MUNDO, editado no Modo Dev do app. Resolve pro basename.
    let terrenoNota = null;
    if (v.terreno !== undefined && v.terreno !== null) {
      const raw = typeof v.terreno === "string" ? v.terreno.trim() : "";
      terrenoNota = raw.replace(/^\[\[/, "").replace(/\]\]$/, "").split("|")[0].trim();
      if (!terrenoNota) problems.push("viagem.terreno: esperado wikilink da nota de terreno");
      else if (!basenames.has(terrenoNota)) problems.push(`viagem.terreno: "${terrenoNota}" não existe na vault`);
    }
    viagem = { padrao, terrenos, ...(rotas.length ? { rotas } : {}), meios, ...(terrenoNota ? { terreno: terrenoNota } : {}) };
  }

  const pericias = asStringMap(def.pericias, "pericias", problems);

  const reskinIn = isPlainObject(def.reskin) ? def.reskin : {};
  const notas = asStringMap(reskinIn.notas, "reskin.notas", problems);
  const notasFuturas = asStringMap(reskinIn.notas_futuras, "reskin.notas_futuras", problems);
  const termos = asStringMap(reskinIn.termos, "reskin.termos", problems);
  const excecoes = asStringArray(reskinIn.excecoes, "reskin.excecoes", problems);
  for (const k of Object.keys(notas)) {
    if (!basenames.has(k)) {
      problems.push(`reskin.notas: "${k}" não existe como basename na vault (use notas_futuras se a nota ainda não existe)`);
    }
  }

  const dispIn = isPlainObject(def.disponibilidade) ? def.disponibilidade : {};
  const padrao = dispIn.padrao ?? "disponivel";
  if (padrao !== "disponivel" && padrao !== "indisponivel") {
    problems.push(`disponibilidade.padrao: "${padrao}" (esperado disponivel|indisponivel)`);
  }
  const indisponiveis = asStringArray(dispIn.indisponiveis, "disponibilidade.indisponiveis", problems);
  const restritos = asStringMap(dispIn.restritos, "disponibilidade.restritos", problems);
  for (const b of indisponiveis) {
    if (!basenames.has(b)) problems.push(`disponibilidade.indisponiveis: "${b}" não existe na vault`);
  }
  for (const b of Object.keys(restritos)) {
    if (!basenames.has(b)) problems.push(`disponibilidade.restritos: "${b}" não existe na vault`);
  }

  // Régua da LOJA por mundo (#72 no mundo): linhas CANÔNICAS (o FM Comércio
  // dos locais aponta pra elas) com rótulo do mundo + % por tier. Célula
  // "33%"/33 → número; "—"/null → indisponível.
  const LINHAS_MATRIZ = ["Pequena Cidade", "Grande Cidade", "Capital", "Iluminada"];
  const TIERS_MATRIZ = [["Adepto", "A"], ["Experiente", "E"], ["Mestre", "M"]];
  let matriz = null;
  if (dispIn.matriz !== undefined) {
    if (!isPlainObject(dispIn.matriz)) {
      problems.push("disponibilidade.matriz: esperado mapa linha → células");
    } else {
      matriz = {};
      for (const [linha, celulas] of Object.entries(dispIn.matriz)) {
        if (!LINHAS_MATRIZ.includes(linha)) {
          problems.push(`disponibilidade.matriz: linha "${linha}" não é canônica (${LINHAS_MATRIZ.join("/")})`);
          continue;
        }
        if (!isPlainObject(celulas)) {
          problems.push(`disponibilidade.matriz.${linha}: esperado mapa de células`);
          continue;
        }
        const row = { rotulo: typeof celulas.rotulo === "string" && celulas.rotulo.trim() ? celulas.rotulo.trim() : linha };
        // PREÇO POR BAIRRO (2026-09-07): multiplicador do preço da loja nessa
        // linha da régua (ex.: 0.7 na periferia, 1.5 no bairro nobre). Aceita
        // número ou string "0,7" / "×0,7" / "70%". Ausente = 1 (fantasia).
        if (celulas.preco !== undefined && celulas.preco !== null && String(celulas.preco).trim() !== "") {
          const raw = String(celulas.preco).replace("×", "").replace("x", "").trim();
          const pct = raw.endsWith("%");
          const n = Number(raw.replace("%", "").replace(",", "."));
          if (Number.isFinite(n) && n > 0) row.preco = pct ? n / 100 : n;
          else problems.push(`disponibilidade.matriz.${linha}.preco: "${celulas.preco}" não é multiplicador`);
        } else {
          row.preco = 1;
        }
        for (const [col, key] of TIERS_MATRIZ) {
          const raw = celulas[col];
          if (raw === undefined || raw === null || String(raw).trim() === "—" || String(raw).trim() === "") {
            row[key] = null;
          } else {
            const n = Number(String(raw).replace("%", "").trim());
            if (Number.isFinite(n)) row[key] = n;
            else { problems.push(`disponibilidade.matriz.${linha}.${col}: "${raw}" não é % nem "—"`); row[key] = null; }
          }
        }
        matriz[linha] = row;
      }
      for (const linha of LINHAS_MATRIZ) {
        if (!matriz[linha]) problems.push(`disponibilidade.matriz: linha canônica "${linha}" ausente`);
      }
    }
  }

  // Garantia do Base: sempre_disponiveis não podem ser excluídos por contexto.
  const baseDef = doBase[0]?.contexto ?? {};
  const sempreDisponiveis = asStringArray(
    baseDef.sempre_disponiveis,
    "base.sempre_disponiveis",
    problems,
  );
  // Conteúdo POR MUNDO (Base declara o que NÃO é sistema compartilhado):
  // pastas/tipos cujo conteúdo é exclusivo de cada mundo — a fantasia não
  // vaza pro cyberpunk nem vice-versa. Vazio → o app usa o fallback interno.
  const cdmIn = isPlainObject(baseDef.conteudo_de_mundo) ? baseDef.conteudo_de_mundo : {};
  const conteudoDeMundo = {
    pastas: asStringArray(cdmIn.pastas, "base.conteudo_de_mundo.pastas", problems),
    tipos: asStringArray(cdmIn.tipos, "base.conteudo_de_mundo.tipos", problems),
  };
  for (const b of sempreDisponiveis) {
    if (!basenames.has(b)) problems.push(`base.sempre_disponiveis: "${b}" não existe na vault`);
  }
  // FORMATO DE AVENTURA (2026-09-05): nomes das seções que o app lê, tipos
  // de cena e campos visíveis na lista trancada. Declarado no Base; um
  // mundo NÃO sobrescreve (formato é do sistema, não do mundo).
  const avIn = isPlainObject(baseDef.aventura) ? baseDef.aventura : null;
  let aventura = null;
  if (avIn) {
    const secoes = asStringMap(avIn.secoes, "base.aventura.secoes", problems);
    for (const k of ["resumo", "roteiro", "contexto", "contexto_aventura", "notas_mestre", "personagens", "locais", "mapa", "combates", "cenas", "abertura", "cena", "desfecho"]) {
      if (!secoes[k]) problems.push(`base.aventura.secoes.${k}: obrigatório`);
    }
    aventura = {
      secoes,
      tiposDeCena: asStringArray(avIn.tipos_de_cena, "base.aventura.tipos_de_cena", problems),
      camposListaTrancada: asStringArray(avIn.campos_lista_trancada, "base.aventura.campos_lista_trancada", problems),
    };
  }
  for (const b of indisponiveis) {
    if (sempreDisponiveis.includes(b)) {
      problems.push(
        `disponibilidade.indisponiveis: "${b}" é sempre_disponivel do Contexto Base — não pode ser excluído`,
      );
    }
  }

  // Auditoria corpo↔FM (report 2026-09-01): notas Contexto-Def com bloco
  // <!-- auto:contexto --> precisam estar em dia com o próprio FM — regenere
  // com `npm run contexto:doc` (ou :cyberpunk). Falha = corpo divergente.
  for (const d of defs) {
    if (typeof d.body !== "string" || !d.body.includes(AUTO_INI)) continue;
    const atual = blocoAutoAtual(d.body);
    const esperado = renderContextoDoc(d.contexto, typeByBasename);
    if (atual !== null && atual !== esperado.trim()) {
      problems.push(
        `${d.relPath}: bloco auto:contexto DESATUALIZADO em relação ao FM — rode npm run contexto:doc`,
      );
    }
  }

  // Corpo do MUNDO por nota (#538): valida os basenames como as notas.
  const descricoes = {};
  for (const [de, texto] of Object.entries(reskinIn.descricoes ?? {})) {
    if (typeof texto !== "string" || texto.trim() === "") continue;
    if (!basenames.has(de)) {
      problems.push(`reskin.descricoes: "${de}" não existe como basename na vault`);
      continue;
    }
    descricoes[de] = texto;
  }

  // CHAMADAS do wizard por mundo (2026-09-23): resumo curto de classe/opção
  // de subclasse (`chamadas`) e por elemento de sintonia (`chamadas_sintonia`
  // — Monge/Animista). Mesmo contrato do descricoes: basename validado, o FM
  // `Chamada`/`Chamada_Sintonia` da vault segue intocado; ausente = o app usa
  // o canônico passado pela cascata de termos.
  const chamadas = {};
  for (const [de, texto] of Object.entries(reskinIn.chamadas ?? {})) {
    if (typeof texto !== "string" || texto.trim() === "") continue;
    if (!basenames.has(de)) {
      problems.push(`reskin.chamadas: "${de}" não existe como basename na vault`);
      continue;
    }
    chamadas[de] = texto;
  }
  const chamadasSintonia = {};
  for (const [de, porElemento] of Object.entries(reskinIn.chamadas_sintonia ?? {})) {
    if (!isPlainObject(porElemento)) continue;
    if (!basenames.has(de)) {
      problems.push(`reskin.chamadas_sintonia: "${de}" não existe como basename na vault`);
      continue;
    }
    const mapa = {};
    for (const [elemento, texto] of Object.entries(porElemento)) {
      if (typeof texto === "string" && texto.trim() !== "") mapa[elemento] = texto;
    }
    if (Object.keys(mapa).length > 0) chamadasSintonia[de] = mapa;
  }

  // EXECUÇÃO (2026-10-01): como cada classe / habilidade / sintonia EXECUTA
  // cada escola no mundo — a frase do gesto, nada mecânico. O app resolve na
  // cascata habilidades → classes → sintonias → padrao; a fantasia, sem o
  // bloco, não mostra nada. Chave validada como basename (e tipo, quando o
  // extract conhece); escola = os `Nome` de Magias.Lista das fichas.
  const ESCOLAS_MAGIA = ["Arcana Branca", "Arcana Negra", "Anima", "Tesouros"];
  const exIn = isPlainObject(reskinIn.execucao) ? reskinIn.execucao : {};
  const porEscola = (v, label) => {
    const mapa = asStringMap(v, label, problems);
    for (const esc of Object.keys(mapa)) {
      if (!ESCOLAS_MAGIA.includes(esc)) problems.push(`${label}: escola "${esc}" (esperado ${ESCOLAS_MAGIA.join("|")})`);
    }
    return mapa;
  };
  const grupoExecucao = (grupo, tiposOk) => {
    const out = {};
    const entrada = exIn[grupo];
    if (entrada == null) return out;
    if (!isPlainObject(entrada)) { problems.push(`reskin.execucao.${grupo}: esperado mapa nota → {escola: texto}`); return out; }
    for (const [de, v] of Object.entries(entrada)) {
      if (!basenames.has(de)) { problems.push(`reskin.execucao.${grupo}: "${de}" não existe como basename na vault`); continue; }
      const tipo = typeByBasename?.get(de);
      if (tipo && !tiposOk.includes(tipo)) { problems.push(`reskin.execucao.${grupo}: "${de}" é ${tipo} (esperado ${tiposOk.join("|")})`); continue; }
      const mapa = porEscola(v, `reskin.execucao.${grupo}["${de}"]`);
      if (Object.keys(mapa).length > 0) out[de] = mapa;
    }
    return out;
  };
  const execucao = {
    padrao: porEscola(exIn.padrao, "reskin.execucao.padrao"),
    classes: grupoExecucao("classes", ["Classe"]),
    habilidades: grupoExecucao("habilidades", ["Habilidade", "Técnica"]),
    sintonias: grupoExecucao("sintonias", ["Sintonia"]),
  };

  // Ajustes de regra do mundo (#544 — semente do C7). Shape validado leve;
  // fantasia sem o bloco mantém o comportamento canônico.
  const regrasIn = isPlainObject(def.regras) ? def.regras : {};
  const caIn = isPlainObject(regrasIn.companheiro_animal) ? regrasIn.companheiro_animal : null;
  const regras = caIn
    ? {
        companheiroAnimal: {
          tamanho: typeof caIn.tamanho === "string" ? caIn.tamanho : null,
          semArmasNaturais: caIn.sem_armas_naturais === true,
          arma: isPlainObject(caIn.arma)
            ? {
                grupos: asStringArray(caIn.arma.grupos, "regras.companheiro_animal.arma.grupos", problems),
                maos: typeof caIn.arma.maos === "number" ? caIn.arma.maos : null,
                forcaMax: typeof caIn.arma.forca_max === "number" ? caIn.arma.forca_max : null,
              }
            : null,
        },
      }
    : {};

  if (problems.length > 0) {
    throw new Error(
      `contexto "${worldId}" inválido (${fonte}):\n  - ` + problems.join("\n  - "),
    );
  }

  return {
    id: worldId,
    nome: def.nome,
    fonte,
    moeda: { simbolo: moeda.simbolo, nome: moeda.nome, fator },
    atlas: { raiz: atlas.raiz, mapa: atlas.mapa ?? null },
    pericias,
    reskin: { notas, notasFuturas, termos, excecoes, descricoes, chamadas, chamadasSintonia, execucao },
    disponibilidade: { padrao, indisponiveis, restritos, ...(matriz ? { matriz } : {}) },
    ...(recursos ? { recursos } : {}),
    ...(transporte ? { transporte } : {}),
    ...(viagem ? { viagem } : {}),
    base: { sempreDisponiveis, conteudoDeMundo, ...(aventura ? { aventura } : {}) },
    regras,
  };
}
