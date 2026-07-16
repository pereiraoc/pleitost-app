// #259 — helper PURO de detecção de swipe das sidebars. Abrir vale de QUALQUER
// ponto da tela por DIREÇÃO (pedido do usuário): arrastar pra direita abre a
// esquerda, pra esquerda abre a direita. Fechar tem prioridade quando há drawer
// aberto. Cobre threshold de distância e dominância horizontal. Sem DOM/React.
import { describe, expect, it } from 'vitest'
import { detectEdgeSwipe, SWIPE_THRESHOLD_PX, type DrawerState } from '../src/components/layout/edge-swipe'

const VW = 400
const CLOSED: DrawerState = { leftOpen: false, rightOpen: false }

describe('detectEdgeSwipe (#259)', () => {
  it('abre a ESQUERDA: arrasta pra direita (de qualquer ponto)', () => {
    const action = detectEdgeSwipe({ x: 4, y: 200 }, { x: 4 + 90, y: 205 }, VW, CLOSED)
    expect(action).toEqual({ kind: 'open-left' })
  })

  it('abre a DIREITA: arrasta pra esquerda (de qualquer ponto)', () => {
    const action = detectEdgeSwipe({ x: VW - 4, y: 200 }, { x: VW - 4 - 90, y: 205 }, VW, CLOSED)
    expect(action).toEqual({ kind: 'open-right' })
  })

  it('abre do MEIO da tela por direção (não precisa começar na borda)', () => {
    const mid = VW / 2
    expect(detectEdgeSwipe({ x: mid, y: 200 }, { x: mid + 90, y: 200 }, VW, CLOSED)).toEqual({
      kind: 'open-left',
    })
    expect(detectEdgeSwipe({ x: mid, y: 200 }, { x: mid - 90, y: 200 }, VW, CLOSED)).toEqual({
      kind: 'open-right',
    })
  })

  it('ignora gestos curtos (abaixo do threshold de distância)', () => {
    const dist = SWIPE_THRESHOLD_PX - 5
    expect(detectEdgeSwipe({ x: 200, y: 200 }, { x: 200 + dist, y: 200 }, VW, CLOSED)).toBeNull()
  })

  it('ignora gestos verticais (scroll)', () => {
    // grande deslocamento vertical, horizontal insuficiente pra dominar
    const action = detectEdgeSwipe({ x: 200, y: 100 }, { x: 200 + 70, y: 100 + 200 }, VW, CLOSED)
    expect(action).toBeNull()
  })

  it('exige que o horizontal domine o vertical', () => {
    // dx=70 (>threshold) mas dy=60 → 70 < 60*1.4 = 84 → não dispara
    const almostDiagonal = detectEdgeSwipe({ x: 200, y: 100 }, { x: 270, y: 160 }, VW, CLOSED)
    expect(almostDiagonal).toBeNull()
    // dx=70, dy=30 → 70 >= 30*1.4=42 → dispara
    const mostlyHoriz = detectEdgeSwipe({ x: 200, y: 100 }, { x: 270, y: 130 }, VW, CLOSED)
    expect(mostlyHoriz).toEqual({ kind: 'open-left' })
  })

  it('FECHA a esquerda: com a esquerda aberta, arrastar pra esquerda fecha', () => {
    const state: DrawerState = { leftOpen: true, rightOpen: false }
    const action = detectEdgeSwipe({ x: 220, y: 200 }, { x: 220 - 90, y: 200 }, VW, state)
    expect(action).toEqual({ kind: 'close-left' })
  })

  it('FECHA a direita: com a direita aberta, arrastar pra direita fecha', () => {
    const state: DrawerState = { leftOpen: false, rightOpen: true }
    const action = detectEdgeSwipe({ x: 180, y: 200 }, { x: 180 + 90, y: 200 }, VW, state)
    expect(action).toEqual({ kind: 'close-right' })
  })

  it('não abre a esquerda se ela já está aberta (mesma direção não faz nada)', () => {
    const state: DrawerState = { leftOpen: true, rightOpen: false }
    const action = detectEdgeSwipe({ x: 4, y: 200 }, { x: 4 + 90, y: 200 }, VW, state)
    expect(action).toBeNull()
  })
})
