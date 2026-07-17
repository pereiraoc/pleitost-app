// @vitest-environment node
// #291 (rules-fidelity): o BFS de regras é PARALELIZADO por nível — a fronteira
// inteira resolve via Promise.all (extract.ts:183). A preocupação da revisão era
// que o CORTE por maxNodes pudesse divergir do serial do plugin (stop-at-maxNodes)
// num herói grande (>420 nós). Este teste prova a EQUIVALÊNCIA: o corte é serial
// por-item na ORDEM DA FRONTEIRA (extract.ts:186-190), então visita exatamente
// os primeiros maxNodes docs — idêntico ao serial, e INDEPENDENTE da ordem/latência
// de resolução (que é justamente o que a paralelização muda). Passando >maxNodes
// SEEDS, a primeira fronteira já excede o orçamento e exercita o corte no limite.
import { describe, expect, it } from 'vitest'
import { bfsRules, type DocResolver } from '../src/rules/extract'
import type { VaultDoc } from '../src/data/types'

const doc = (i: number): VaultDoc => ({ id: `D${i}`, basename: `D${i}`, ruleElements: [] }) as unknown as VaultDoc

const N = 500
const MAX = 420
const seeds = Array.from({ length: N }, (_, i) => `D${i}`)

// Resolve em ordem INTERCALADA (ímpares completam antes dos pares) — Promise.all
// preserva o índice, então o corte não pode depender de quem chega primeiro.
const interleaved: DocResolver = async (name) => {
  const i = Number(name.slice(1))
  await Promise.resolve()
  if (i % 2 === 0) await Promise.resolve()
  return doc(i)
}
const immediate: DocResolver = async (name) => doc(Number(name.slice(1)))

describe('#291: corte do BFS paralelo == serial (maxNodes)', () => {
  it('visita EXATAMENTE maxNodes docs, os PRIMEIROS da fronteira (mesmo com resolução fora de ordem)', async () => {
    const res = await bfsRules(seeds, interleaved, { maxDepth: 6, maxNodes: MAX })
    expect(res.visitedDocs.size).toBe(MAX)
    expect([...res.visitedDocs.keys()]).toEqual(seeds.slice(0, MAX))
  })

  it('determinístico: resolver intercalado e resolver imediato produzem o MESMO conjunto visitado', async () => {
    const a = await bfsRules(seeds, interleaved, { maxDepth: 6, maxNodes: MAX })
    const b = await bfsRules(seeds, immediate, { maxDepth: 6, maxNodes: MAX })
    expect([...a.visitedDocs.keys()]).toEqual([...b.visitedDocs.keys()])
  })

  it('sem exceder maxNodes: visita todos os seeds (corte não dispara)', async () => {
    const few = seeds.slice(0, 100)
    const res = await bfsRules(few, interleaved, { maxDepth: 6, maxNodes: MAX })
    expect(res.visitedDocs.size).toBe(100)
    expect([...res.visitedDocs.keys()]).toEqual(few)
  })
})
