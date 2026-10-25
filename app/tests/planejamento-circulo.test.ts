// @vitest-environment node
// CÍRCULO DAS ESSÊNCIAS NO PLANEJAMENTO (2026-10-25): "quando for pra
// selecionar uma magia anima tu tem que mostrar o circulo naquele contexto".
// A essência escolhida num nível é um registro `magia` (contexto Anima) com o
// NÍVEL em que o slot foi gasto; o card de cada nível que GANHA slot A/E/M
// traz o Círculo daquele momento (o que já tinha antes + o do próprio nível).
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { buildLevelTimeline, fichaTemGasto, pinsFaltantes } from '../src/rules/level-timeline'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const catalog = buildCatalog(JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest)
const load = async (id: string): Promise<VaultDoc> =>
  JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${id}.json`), 'utf8')) as VaultDoc

const base = {
  Classe: '[[Animista]]',
  Sintonia: '[[Traço Elemental do Fogo]]',
  Atributos: { Principal: 'PRE', FOR: 0, AGI: 1, INT: 2, PRE: 3 },
}
const habDe = (fm: Record<string, unknown>) =>
  JSON.stringify(((fm['Habilidades'] as Record<string, unknown>)?.['Lista'] ?? []) as unknown[])

describe('Círculo das Essências por nível no Planejamento', () => {
  it('só os níveis que GANHAM slot A/E/M têm Círculo, com os slots daquele nível', async () => {
    const cards = await buildLevelTimeline({ ...base, 'Nível': 1 }, catalog, load)
    const c1 = cards[0]!.circulos
    expect(c1).toHaveLength(1)
    expect(c1[0]!.sec).toBe(false)
    expect(c1[0]!.slots.A).toEqual({ total: 2, usados: 0 })
    expect(cards[1]!.circulos[0]!.slots.A).toEqual({ total: 1, usados: 0 })
    expect(cards[2]!.circulos[0]!.slots.A).toEqual({ total: 1, usados: 0 })
    // Elementalista (N4) traz o E; o N10 não ganha slot
    expect(cards[3]!.circulos[0]!.slots.E).toEqual({ total: 2, usados: 0 })
    expect(cards[9]!.circulos).toHaveLength(0)
  }, 60000)

  it('essência PLANEJADA no N2: gasto do N2, magias no N2, Círculo do N1 não a tem', async () => {
    const fm = {
      ...base,
      'Nível': 1,
      Planejamento: {
        gastosSlots: [{ nivel: 2, tipo: 'magia', rank: 'A', alvo: '[[Essência Explosiva Adepta]]', contexto: 'Anima' }],
      },
    }
    const cards = await buildLevelTimeline(fm, catalog, load)
    const g2 = cards[1]!.gastos.magias.find((g) => g.link.includes('Essência Explosiva'))
    expect(g2).toMatchObject({ essencia: true, planejado: true, rank: 'A', escola: 'Anima' })
    // a essência não vira magia aprendida na escola
    expect(cards.some((c) => c.gastos.magias.some((g) => g.link.includes('Explosiva') && !g.essencia))).toBe(false)
    expect(cards[1]!.magiasRegra.map((m) => m.link).join(' ')).toContain('Estouro')
    expect(cards[0]!.magiasRegra.map((m) => m.link).join(' ')).not.toContain('Estouro')
    expect(habDe(cards[0]!.circulos[0]!.fm)).not.toContain('Essência Explosiva')
    const c2 = cards[1]!.circulos[0]!
    expect(habDe(c2.fm)).toContain('Essência Explosiva Adepta')
    expect(habDe(c2.fmSalvo)).toContain('{"[[Essência Explosiva Adepta]]":"Slot.A"}')
    expect(c2.slots.A).toEqual({ total: 1, usados: 1 })
    // no N3 ela já é "de antes" (acesa, mas não se desfaz ali)
    const c3 = cards[2]!.circulos[0]!
    expect(habDe(c3.fm)).toContain('Essência Explosiva Adepta')
    expect(habDe(c3.fmSalvo)).not.toContain('Explosiva')
  }, 60000)

  it('essência REAL registrada no N3 não aparece no Círculo do N2', async () => {
    const fm = {
      ...base,
      'Nível': 5,
      Habilidades: { Lista: [{ '[[Essência Explosiva Adepta]]': 'Slot.A' }] },
      Planejamento: {
        gastosSlots: [{ nivel: 3, tipo: 'magia', rank: 'A', alvo: '[[Essência Explosiva Adepta]]', contexto: 'Anima' }],
        nivelSincronizado: 5,
      },
    }
    const cards = await buildLevelTimeline(fm, catalog, load)
    expect(cards[2]!.gastos.magias.find((g) => g.link.includes('Explosiva'))).toMatchObject({ essencia: true })
    expect(cards[2]!.gastos.magias.find((g) => g.link.includes('Explosiva'))?.planejado).toBeUndefined()
    expect(habDe(cards[1]!.circulos[0]!.fm)).not.toContain('Essência Explosiva')
    expect(habDe(cards[2]!.circulos[0]!.fmSalvo)).toContain('Essência Explosiva Adepta')
    // o pin congela a essência real no nível dela (earliest-fit não a move)
    const pins = pinsFaltantes(cards, [])
    expect(pins).toContainEqual(expect.objectContaining({ tipo: 'magia', alvo: '[[Essência Explosiva Adepta]]', nivel: 3 }))
  }, 60000)

  it('fichaTemGasto procura a essência em Habilidades.Lista', () => {
    const r = { nivel: 2, tipo: 'magia' as const, rank: 'A' as const, alvo: '[[Essência Explosiva Adepta]]', contexto: 'Anima' }
    expect(fichaTemGasto({ Habilidades: { Lista: [{ '[[Essência Explosiva Adepta]]': 'Slot.A' }] } }, r)).toBe(true)
    expect(fichaTemGasto({ Habilidades: { Lista: [] } }, r)).toBe(false)
  })
})
