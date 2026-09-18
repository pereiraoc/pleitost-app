// Report 58401c49 (2026-09-14): tooltip da criatura do bestiário aberta nos
// DETALHES aparecia "muito pro lado esquerdo" do mouse. O fix de 2026-09-11
// (esquerdaDoTip: flip pro lado esquerdo do cursor quando não cabe à direita)
// decidia o lado com a LARGURA MÁXIMA (480px) — mas 480 é só maxWidth; um
// tooltip real de ~220px flipava como se tivesse 480 e nascia a ~250px do
// cursor. Correção: depois de renderizar, o ref MEDE a largura real e
// re-aplica a MESMA esquerdaDoTip com ela (corrigeAposMedida) — a caixa fica
// adjacente ao cursor dos dois lados.
import { describe, expect, it } from 'vitest'
import { esquerdaDoTip, corrigeAposMedida } from '../src/components/tip-posicao'

describe('posicionamento pós-medida do tooltip (report 58401c49)', () => {
  it('o CASO DO BUG: sidebar à direita, caixa estreita fica adjacente ao cursor', () => {
    // cursor a 1200 numa tela de 1440; primeira pintura assumiu 480 de largura
    // → nasceu em esquerdaDoTip(1200, 480, 1440) = 704 (a ~276px do cursor).
    const primeira = esquerdaDoTip(1200, 480, 1440)
    expect(primeira).toBe(704)
    // medida real: 220px → re-aplica com a largura REAL: 1200-16-220 = 964
    // (a caixa TERMINA 16px à esquerda do cursor — adjacente).
    const { left } = corrigeAposMedida({ left: primeira, width: 220, top: 300, bottom: 350 }, 1200, 1440, 768)
    expect(left).toBe(964)
  })

  it('caixa que cabe à direita volta pro lado direito do cursor', () => {
    const { left } = corrigeAposMedida({ left: 704, width: 180, top: 300, bottom: 350 }, 900, 1440, 768)
    expect(left).toBe(916) // x+16 — cabe à direita, fica lá
  })

  it('sem estouro nenhum, posição direita-do-cursor é estável (idempotente)', () => {
    const { left } = corrigeAposMedida({ left: 216, width: 200, top: 300, bottom: 350 }, 200, 1440, 768)
    expect(left).toBe(216)
  })

  it('clamp vertical preservado', () => {
    const { dy } = corrigeAposMedida({ left: 216, width: 200, top: -20, bottom: 30 }, 200, 1440, 768)
    expect(dy).toBe(28) // 8 - (-20)
  })

  it('tela minúscula: nunca sai do piso de 12px', () => {
    const { left } = corrigeAposMedida({ left: 12, width: 500, top: 100, bottom: 150 }, 10, 360, 640)
    expect(left).toBeGreaterThanOrEqual(12)
  })
})
