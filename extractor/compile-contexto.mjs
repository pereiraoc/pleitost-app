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
export function compileContexto({ worldId, defs, basenames }) {
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
  const atlas = isPlainObject(def.atlas) ? def.atlas : {};
  if (typeof atlas.raiz !== "string" || !atlas.raiz.trim()) problems.push("atlas.raiz: obrigatório");

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

  // Garantia do Base: sempre_disponiveis não podem ser excluídos por contexto.
  const baseDef = doBase[0]?.contexto ?? {};
  const sempreDisponiveis = asStringArray(
    baseDef.sempre_disponiveis,
    "base.sempre_disponiveis",
    problems,
  );
  for (const b of sempreDisponiveis) {
    if (!basenames.has(b)) problems.push(`base.sempre_disponiveis: "${b}" não existe na vault`);
  }
  for (const b of indisponiveis) {
    if (sempreDisponiveis.includes(b)) {
      problems.push(
        `disponibilidade.indisponiveis: "${b}" é sempre_disponivel do Contexto Base — não pode ser excluído`,
      );
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `contexto "${worldId}" inválido (${fonte}):\n  - ` + problems.join("\n  - "),
    );
  }

  return {
    id: worldId,
    nome: def.nome,
    fonte,
    moeda: { simbolo: moeda.simbolo, nome: moeda.nome },
    atlas: { raiz: atlas.raiz, mapa: atlas.mapa ?? null },
    pericias,
    reskin: { notas, notasFuturas, termos, excecoes },
    disponibilidade: { padrao, indisponiveis, restritos },
    base: { sempreDisponiveis },
  };
}
