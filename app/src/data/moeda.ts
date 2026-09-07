// MOEDA DO MUNDO (2026-09-07, decisão do user): o sistema conta em PO (ficha,
// riqueza por nível, matriz, preços dos itens — Sistema/ intocado); cada mundo
// pode declarar um FATOR de exibição no Contexto (`moeda.fator`): POA 1987 =
// Cz$ = PO × 1000. Apresentação PURA, como o reskin: tudo que mostra dinheiro
// passa por aqui, e tudo que EDITA dinheiro converte de volta pra PO INTEIRO
// (nada fracionário — a ficha da POA conta em milhares de Cruzados).
import { activeContextoDef } from './reskin'

export interface Moeda {
  simbolo: string
  nome: string
  /** PO → valor do mundo. 1 = fantasia (rótulo só). Inteiro ≥ 1. */
  fator: number
}

const FANTASIA: Moeda = { simbolo: 'PO', nome: 'Peças de Ouro', fator: 1 }

export function moedaAtiva(): Moeda {
  const d = activeContextoDef()
  if (!d?.moeda) return FANTASIA
  const f = d.moeda.fator
  return {
    simbolo: d.moeda.simbolo || FANTASIA.simbolo,
    nome: d.moeda.nome || FANTASIA.nome,
    fator: typeof f === 'number' && f >= 1 ? Math.round(f) : 1,
  }
}

/** PO (canônico) → valor do mundo, inteiro. */
export function paraMoeda(po: number): number {
  return Math.round(po * moedaAtiva().fator)
}

/** Valor do mundo → PO INTEIRO (arredonda ao PO mais próximo: com fator 1000,
 *  a menor unidade da ficha é Cz$ 1.000 — troco miúdo é narrativo). */
export function deMoeda(valor: number): number {
  return Math.round(valor / moedaAtiva().fator)
}

/** Número exibido (sem símbolo): fantasia sem separador ("1000", como sempre);
 *  mundo com fator com separador pt-BR ("40.000"). */
export function moedaNumero(po: number): string {
  const m = moedaAtiva()
  const v = Math.round(po * m.fator)
  return m.fator === 1 ? String(v) : v.toLocaleString('pt-BR')
}

/** "40 PO" (fantasia) · "Cz$ 40.000" (mundo com fator). */
export function formatMoeda(po: number): string {
  const m = moedaAtiva()
  return m.fator === 1 ? `${moedaNumero(po)} ${m.simbolo}` : `${m.simbolo} ${moedaNumero(po)}`
}

export function moedaSimbolo(): string {
  return moedaAtiva().simbolo
}
export function moedaFator(): number {
  return moedaAtiva().fator
}

/** Valor JÁ na moeda do mundo (ex.: FM `Preço` das notas de Recurso, Cz$
 *  inteiro) → "Cz$ 4.000"; fantasia (fator 1) → "40 PO". Não multiplica. */
export function formatValorMoeda(valor: number): string {
  const m = moedaAtiva()
  const v = Math.round(valor)
  const n = m.fator === 1 ? String(v) : v.toLocaleString('pt-BR')
  return m.fator === 1 ? `${n} ${m.simbolo}` : `${m.simbolo} ${n}`
}

