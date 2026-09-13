// DUPLICADO LOCAL × BASE (report do mestre, 2026-09-12: "ainda tem duplicado
// aqueles casos de personagens locais e na base tipo representante da camisa
// 12"). O botão "📥 Criar do Bestiário" (#185) copia o monstro da vault
// mantendo o MESMO nome — a lista mesclava os dois e mostrava o par.
//
// Regra combinada com o mestre: o nome de uma criatura da BASE é dela. A
// entidade LOCAL homônima da MESMA família é apagada (removeLocalEntity →
// tombstone, propaga entre dispositivos e não ressuscita); em troca, as
// portas de import nomeiam a cópia com sufixo, pra ela não nascer condenada.
//
// Puro (só dados) — quem chama é a lista (limpeza) e o modal (nome livre).
import type { IndexDocEntry } from './types'

/** Nome comparável: sem espaço nas pontas e sem diferença de caixa. */
function chave(nome: string | null | undefined): string {
  return (nome ?? '').trim().toLocaleLowerCase('pt')
}

/** Ids das entidades locais que repetem o nome de uma entrada da base. */
export function idsLocaisDuplicados(
  vaultEntries: readonly IndexDocEntry[],
  localEntries: readonly IndexDocEntry[],
): string[] {
  const daBase = new Set(vaultEntries.map((e) => chave(e.basename)))
  return localEntries.filter((e) => daBase.has(chave(e.basename))).map((e) => e.id)
}

const SUFIXO = 'cópia'

/** Nome livre: devolve `nome` quando ninguém o ocupa; senão "Nome (cópia)" e,
 *  se essa também estiver ocupada, "(cópia 2)", "(cópia 3)"… */
export function nomeSemColisao(nome: string, ocupados: Iterable<string>): string {
  const usados = new Set([...ocupados].map(chave))
  if (!usados.has(chave(nome))) return nome
  for (let n = 1; ; n++) {
    const tentativa = n === 1 ? `${nome} (${SUFIXO})` : `${nome} (${SUFIXO} ${n})`
    if (!usados.has(chave(tentativa))) return tentativa
  }
}
