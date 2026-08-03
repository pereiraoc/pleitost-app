// @vitest-environment node
// Report #416 ("Thoren tem 0/1 Mestre mas nao ta aparecendo o que ta
// escolhido"): o YAML que o PLUGIN grava pode agregar DOIS pares no mesmo
// objeto de incremento — o Thoren real da vault tem, em Sobrevivência:
//   - Bonus_Item: Regra.[[Cinto dos Ermos]]
//     M: Slot.M
// O parseIncrementos do plugin (frontmatter-helpers.ts:282) itera TODAS as
// entries de cada objeto; o app lia só a PRIMEIRA chave (incKey/rankKey =
// Object.keys[0]) — o M ficava invisível: a barra contava o slot gasto
// ("M 0/1", usedBy lê por chave), mas o rank recalculado caía pra E e o NAEM
// não mostrava onde o Mestre foi gasto.
import { describe, expect, it } from 'vitest'
import { mergeCalculatedIntoFm } from '../src/rules/merge-calculated'
import { applyPericiaRankEdit, pisoLetterFromIncrementos } from '../src/rules/apply-pericia-rank-edit'

// Shape VERBATIM do Thoren.md da vault (Sobrevivência).
const INCS_THOREN = () => [
  { A: 'Slot.A' },
  { Bonus_Item: 'Regra.[[Cinto dos Ermos]]', M: 'Slot.M' },
  { Bonus_Item: 'Regra.[[Cinto dos Ermos]]' },
  { E: 'Slot.E' },
]

const savedFm = () => ({
  Pericias: {
    Slots: { A: 3, E: 3, M: 1 },
    Lista: [
      {
        Nome: 'Sobrevivência',
        Atributo: 'INT',
        Proficiencia: 'E', // scalar STALE (o bug rebaixava e persistia E)
        Bonus_Item: 1,
        Bonus_Especial: 0,
        Especializacao: '[[Navegação]]',
        Maestria: '',
        Incrementos: INCS_THOREN(),
      },
    ],
  },
})

describe('#416 — incremento com MÚLTIPLOS pares no mesmo objeto (YAML do plugin)', () => {
  it('merge recomputa Proficiencia = M (o Slot.M no objeto de 2 chaves conta)', () => {
    const out = mergeCalculatedIntoFm(savedFm(), {}, [])
    const per = (out['Pericias'] as { Lista: Record<string, unknown>[] }).Lista
    const sob = per.find((r) => r.Nome === 'Sobrevivência')!
    expect(sob.Proficiencia).toBe('M')
  })

  it('rebaixar M→E remove SÓ a chave M do objeto (preserva o par Bonus_Item)', () => {
    const out = applyPericiaRankEdit(
      savedFm().Pericias.Lista as never,
      INCS_THOREN() as never,
      'Sobrevivência',
      'E',
    )
    const sob = out.find((r) => String(r.Nome) === 'Sobrevivência')!
    const incs = sob.Incrementos as Record<string, unknown>[]
    // nenhum M sobrando (o slot foi devolvido de verdade)
    expect(incs.some((i) => 'M' in i)).toBe(false)
    // e o Bonus_Item que dividia o objeto com o M sobrevive
    const bonusItens = incs.filter((i) => 'Bonus_Item' in i)
    expect(bonusItens.length).toBeGreaterThanOrEqual(2)
    expect(sob.Proficiencia).toBe('E')
  })

  it('piso ignora Slot.* também em objeto multi-par (segue N)', () => {
    expect(pisoLetterFromIncrementos(INCS_THOREN() as never)).toBe('N')
  })
})
