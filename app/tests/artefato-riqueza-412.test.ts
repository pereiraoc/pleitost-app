// @vitest-environment node
// #412 (report c53d8b34): a RIQUEZA multiplicava o preço do artefato pelo
// tier do display ("(Mestre)" ×25) — mas artefato tem preço CRU na nota (o
// tier do alias é raridade). Mesma exceção que o inventário de grupo já
// aplicava (itemValorPO, inventario-item.ts); agora centralizada em
// isArtefatoId e injetada na itemização de tesouros.
import { describe, expect, it } from 'vitest'
import {
  isArtefatoId,
  itemizeTesouros,
  sumInventarioTesouros,
} from '../src/grupo/wealth'

const FM = {
  Inventario: {
    Tesouros: [
      '[[Garras do Rei-Mago|Garras do Rei-Mago (Mestre)]]',
      '[[Anel Canário|Anel Canário (Mestre)]]',
    ],
  },
}
const PRECOS: Record<string, number> = { 'Garras do Rei-Mago': 1750, 'Anel Canário': 10 }
const priceOf = (t: string) => PRECOS[t] ?? 0
const isArtefato = (t: string) => t === 'Garras do Rei-Mago'

describe('#412 — artefato na riqueza vale o preço CRU', () => {
  it('itemizeTesouros: artefato sem multiplicador; tesouro comum multiplica', () => {
    const lines = itemizeTesouros(FM as never, priceOf, isArtefato)
    const garras = lines.find((l) => l.label.startsWith('Garras do Rei-Mago'))
    const anel = lines.find((l) => l.label.startsWith('Anel Canário'))
    expect(garras?.value).toBe(1750) // cru, sem ×25
    expect(garras?.label).toContain('(M)') // raridade segue no rótulo
    expect(anel?.value).toBe(10 * 25) // trap reverso: comum multiplica
  })
  it('sumInventarioTesouros soma com a mesma exceção', () => {
    expect(sumInventarioTesouros(FM as never, priceOf, isArtefato)).toBe(1750 + 250)
  })
  it('isArtefatoId reconhece a pasta de Artefatos', () => {
    expect(isArtefatoId('Sistema/Equipamento/Tesouros/Artefatos/Garras do Rei-Mago')).toBe(true)
    expect(isArtefatoId('Sistema/Equipamento/Tesouros/Equipamentos/Anel Canário')).toBe(false)
    expect(isArtefatoId(null)).toBe(false)
  })
})
