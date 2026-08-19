// Report 2026-08-18: Pessoas das anotações sumindo — `pleitost.localEntities`
// resolve conflito do MESMO herói por updatedAt da ENTIDADE INTEIRA, então uma
// edição qualquer (vida na mesa) num device com a lista de Pessoas mais curta
// descartava as pessoas cadastradas no outro. Agora Pessoas é um CONJUNTO com
// merge por pessoa (OR-set): união por chave (Alvo ?? nome:Nome), `addedAt`
// mais novo vence a versão, e deleção grava tombstone em `PessoasRemovidas`
// (mata a pessoa só se for mais nova que o addedAt dela — re-adicionar depois
// sobrevive).
import { describe, expect, it } from 'vitest'
import { mergeRecordBlobsByUpdatedAt } from '../src/data/collection-merge'

type Ent = Record<string, unknown>
const HERO = 'local:heroi:carlos'

function ent(updatedAt: string, fm: Record<string, unknown>): Ent {
  return { id: HERO, kind: 'Heroi', updatedAt, frontmatter: { Nome: 'Carlos', ...fm } }
}
function blob(e: Ent): string {
  return JSON.stringify({ [HERO]: e })
}
function pessoasDe(raw: string): string[] {
  const e = (JSON.parse(raw) as Record<string, Ent>)[HERO]!
  const fm = e['frontmatter'] as Record<string, unknown>
  const p = fm['Pessoas']
  return Array.isArray(p) ? p.map((x) => String((x as Ent)['Nome'])) : []
}

const T1 = '2026-08-10T10:00:00.000Z'
const T2 = '2026-08-18T21:00:00.000Z'

describe('Pessoas — merge por pessoa dentro do conflito de entidade', () => {
  it('REPRO da perda: edição de vida (mais nova) NÃO descarta pessoas do outro device', () => {
    // device local (velho): cadastrou Iussilus e Barba
    const local = ent(T1, {
      Pessoas: [
        { Nome: 'Iussilus', addedAt: T1 },
        { Nome: 'Barba', addedAt: T1 },
      ],
    })
    // conta (mais nova): edição de vida na mesa, lista curta
    const remote = ent(T2, { Vida: 10, Pessoas: [{ Nome: 'Iussilus', addedAt: T1 }] })
    const r = mergeRecordBlobsByUpdatedAt(blob(local), blob(remote))
    // a entidade vencedora é a da conta (vida preservada), mas a UNIÃO das
    // pessoas fica — nos DOIS sentidos
    expect(pessoasDe(r.value).sort()).toEqual(['Barba', 'Iussilus'])
    expect(pessoasDe(r.pushValue ?? r.value).sort()).toEqual(['Barba', 'Iussilus'])
    const vida = ((JSON.parse(r.value) as Record<string, Ent>)[HERO]!['frontmatter'] as Ent)['Vida']
    expect(vida).toBe(10)
    expect(r.addedFromRemote).toBe(true) // local ganhou a Vida nova
    expect(r.differsFromRemote).toBe(true) // conta ganha a Barba de volta
  })

  it('deleção propaga: tombstone mais nova que o addedAt mata a pessoa', () => {
    const local = ent(T2, { Pessoas: [], PessoasRemovidas: { 'nome:Barba': T2 } })
    const remote = ent(T1, { Pessoas: [{ Nome: 'Barba', addedAt: T1 }] })
    const r = mergeRecordBlobsByUpdatedAt(blob(local), blob(remote))
    expect(pessoasDe(r.value)).toEqual([])
    expect(pessoasDe(r.pushValue ?? r.value)).toEqual([])
  })

  it('re-adicionar depois da deleção sobrevive (addedAt mais novo que a tombstone)', () => {
    const T3 = '2026-08-19T10:00:00.000Z'
    const local = ent(T3, {
      Pessoas: [{ Nome: 'Barba', addedAt: T3 }],
      PessoasRemovidas: { 'nome:Barba': T2 },
    })
    const remote = ent(T1, { Pessoas: [{ Nome: 'Barba', addedAt: T1 }] })
    const r = mergeRecordBlobsByUpdatedAt(blob(local), blob(remote))
    expect(pessoasDe(r.value)).toEqual(['Barba'])
  })

  it('linha LEGADA sem addedAt: tombstone sempre vence (deleção de dado antigo)', () => {
    const local = ent(T2, { Pessoas: [], PessoasRemovidas: { 'nome:Velho': T2 } })
    const remote = ent(T1, { Pessoas: [{ Nome: 'Velho' }] })
    const r = mergeRecordBlobsByUpdatedAt(blob(local), blob(remote))
    expect(pessoasDe(r.value)).toEqual([])
  })

  it('mesma pessoa nos dois lados: a versão com addedAt mais novo vence', () => {
    const local = ent(T1, { Pessoas: [{ Nome: 'Iussilus', Detalhes: 'velho', addedAt: T1 }] })
    const remote = ent(T2, { Pessoas: [{ Nome: 'Iussilus', Detalhes: 'novo', addedAt: T2 }] })
    const r = mergeRecordBlobsByUpdatedAt(blob(local), blob(remote))
    const p = (JSON.parse(r.value) as Record<string, Ent>)[HERO]!
    const rows = ((p['frontmatter'] as Ent)['Pessoas'] as Ent[])
    expect(rows).toHaveLength(1)
    expect(rows[0]!['Detalhes']).toBe('novo')
  })

  it('entidades sem Pessoas seguem intocadas (sem churn de flags)', () => {
    const mesmo = ent(T1, { Vida: 5 })
    const r = mergeRecordBlobsByUpdatedAt(blob(mesmo), blob(mesmo))
    expect(r.addedFromRemote).toBe(false)
    expect(r.differsFromRemote).toBe(false)
  })
})
