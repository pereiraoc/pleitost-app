// @vitest-environment node
// TOOLTIP DA FICHA DE GRUPO (report 2026-09-11: "na parte de riqueza, se eu
// coloco o mouse em cima, vejo o tooltip lá pra esquerda"). A caixa da riqueza
// tem 560 px: não cabendo à direita do cursor, o código grudava na borda da
// janela — longe do mouse. Agora ela abre pro lado ESQUERDO DO CURSOR, e só
// encosta quando não cabe dos dois lados.
import { describe, expect, it } from 'vitest'
import { esquerdaDoTip } from '../src/components/tip-posicao'

describe('onde a caixa do tooltip começa', () => {
  const vw = 1400
  it('cabendo à direita do cursor, abre ali', () => {
    expect(esquerdaDoTip(300, 560, vw)).toBe(316)
  })

  it('sem caber à direita, abre à esquerda DO CURSOR (não na borda)', () => {
    // cursor em 1200: 1200+16+560 = 1776 > 1400 → abre em 1200−16−560
    expect(esquerdaDoTip(1200, 560, vw)).toBe(624)
    // o antigo encostava na borda: 1400−12−560 = 828 (bem longe do mouse)
    expect(esquerdaDoTip(1200, 560, vw)).toBeLessThan(828)
  })

  it('não cabendo dos dois lados, encosta na borda', () => {
    // caixa mais larga que a janela inteira: não há lado que caiba
    expect(esquerdaDoTip(500, 980, 1000)).toBe(12)
    expect(esquerdaDoTip(900, 900, 1000)).toBe(88)
  })
})
