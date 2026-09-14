// FILTRO DO BESTIÁRIO (pedido do mestre, 2026-09-13): "eu quero poder filtrar
// por tier, modificador (comum, competente, elite, solo), classe, afiliação
// também (aí tu faz aquele filtro que tem que clicar no botão pra aparecer as
// opções pra não ocupar muito espaço)".
//
// Lógica pura, testada sem montar a página. As duas regras que importam:
// dentro de uma dimensão vale QUALQUER UMA das marcadas (OU), entre dimensões
// vale TODAS (E) — e dimensão sem nada marcado não filtra nada.
import { describe, expect, it } from 'vitest'
import type { IndexDocEntry, VaultDoc } from '../src/data/types'
import { SEM_AFILIACAO } from '../src/components/creatures/agrupar-bestiario'
import {
  FILTRO_VAZIO,
  MODIFICADORES,
  aplicaFiltro,
  contaFiltrosAtivos,
  modificadorDoDoc,
  opcoesDeFiltro,
} from '../src/components/creatures/filtro-bestiario'

const doc = (id: string, fm: Record<string, unknown>): VaultDoc =>
  ({ id, basename: id.split('/').pop(), frontmatter: fm }) as unknown as VaultDoc

const ficha = (
  nome: string,
  Tier: number,
  classe: string,
  afiliacao: string | undefined,
  Modificador?: string,
) =>
  doc(`c/${nome}`, {
    Tier,
    Classe: `[[${classe}|${classe}${Modificador ? ` ${Modificador}` : ''}]]`,
    ...(Modificador ? { Modificador } : {}),
    ...(afiliacao ? { 'Afiliação': afiliacao } : {}),
  })

const FICHAS: [string, number, string, string | undefined, string?][] = [
  ['Brigadiano de Esquina', 0, 'Soldado', '[[Brigada Militar Metropolitana]]'],
  ['Cabo de Choque', 1, 'Soldado', '[[Brigada Militar Metropolitana]]', 'Competente'],
  ['Exoesqueleto do BOPE', 2, 'Bruto', '[[Brigada Militar Metropolitana]]', 'Elite'],
  ['O Despachante', 3, 'Assassino', '[[A Caixinha]]', 'Solo'],
  // duas afiliações: a criatura genérica responde a mais de uma organização
  ['Estivador de Confiança', 1, 'Soldado', '[[Consórcio das Bandeiras]] · [[Mercosul]]'],
  ['Rato-do-Delta', 0, 'Batedor', undefined],
]
const docs = new Map(FICHAS.map((f) => [`c/${f[0]}`, ficha(...f)]))
const entries = FICHAS.map(([n]) => ({ id: `c/${n}`, basename: n }) as IndexDocEntry)
const nomes = (es: readonly IndexDocEntry[]) => es.map((e) => e.basename).sort()

describe('filtro do bestiário', () => {
  it('comum é a AUSÊNCIA de modificador, e é uma opção como as outras', () => {
    expect(MODIFICADORES).toEqual(['Comum', 'Competente', 'Elite', 'Solo'])
    expect(modificadorDoDoc(docs.get('c/Brigadiano de Esquina'))).toBe('Comum')
    expect(modificadorDoDoc(docs.get('c/Cabo de Choque'))).toBe('Competente')
    expect(modificadorDoDoc(docs.get('c/O Despachante'))).toBe('Solo')
    // valor que a vault não conhece não vira opção nova: cai em Comum
    expect(modificadorDoDoc(ficha('X', 1, 'Soldado', undefined, 'Chefão'))).toBe('Comum')
  })

  it('as opções saem dos DADOS, não de uma lista escrita à mão', () => {
    const o = opcoesDeFiltro(entries, docs)
    expect(o.tiers).toEqual([0, 1, 2, 3])
    expect(o.modificadores).toEqual(['Comum', 'Competente', 'Elite', 'Solo'])
    expect(o.classes).toEqual(['Assassino', 'Batedor', 'Bruto', 'Soldado'])
    // a de duas afiliações entra nas DUAS listas, e quem não tem cai no balde
    expect(o.afiliacoes).toEqual([
      'A Caixinha',
      'Brigada Militar Metropolitana',
      'Consórcio das Bandeiras',
      'Mercosul',
      SEM_AFILIACAO,
    ])
  })

  it('filtro vazio não tira ninguém', () => {
    expect(aplicaFiltro(entries, docs, FILTRO_VAZIO)).toHaveLength(FICHAS.length)
    expect(contaFiltrosAtivos(FILTRO_VAZIO)).toBe(0)
  })

  it('dentro de uma dimensão é OU', () => {
    const r = aplicaFiltro(entries, docs, { ...FILTRO_VAZIO, tiers: [0, 3] })
    expect(nomes(r)).toEqual(['Brigadiano de Esquina', 'O Despachante', 'Rato-do-Delta'])
  })

  it('entre dimensões é E', () => {
    const r = aplicaFiltro(entries, docs, {
      ...FILTRO_VAZIO,
      classes: ['Soldado'],
      modificadores: ['Comum'],
    })
    expect(nomes(r)).toEqual(['Brigadiano de Esquina', 'Estivador de Confiança'])
  })

  it('afiliação casa com QUALQUER uma das organizações da criatura', () => {
    expect(nomes(aplicaFiltro(entries, docs, { ...FILTRO_VAZIO, afiliacoes: ['Mercosul'] })))
      .toEqual(['Estivador de Confiança'])
    expect(nomes(aplicaFiltro(entries, docs, { ...FILTRO_VAZIO, afiliacoes: [SEM_AFILIACAO] })))
      .toEqual(['Rato-do-Delta'])
  })

  it('conta quantas dimensões estão ativas — é o número do botão', () => {
    expect(contaFiltrosAtivos({ ...FILTRO_VAZIO, tiers: [1] })).toBe(1)
    expect(contaFiltrosAtivos({ ...FILTRO_VAZIO, tiers: [1, 2], classes: ['Bruto'] })).toBe(3)
  })
})
