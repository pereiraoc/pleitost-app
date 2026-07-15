// #259 — helper PURO de detecção de swipe das sidebars. Cobre edge-zone,
// threshold de distância, dominância horizontal e a lógica de abrir/fechar
// conforme o estado dos drawers. Sem DOM/React aqui — só a decisão.
import { describe, expect, it } from 'vitest'
import {
  detectEdgeSwipe,
  EDGE_ZONE_PX,
  SWIPE_THRESHOLD_PX,
  type DrawerState,
} from '../src/components/layout/edge-swipe'

const VW = 400
const CLOSED: DrawerState = { leftOpen: false, rightOpen: false }

describe('detectEdgeSwipe (#259)', () => {
  it('abre a ESQUERDA: começa na borda esquerda e arrasta pra direita', () => {
    const action = detectEdgeSwipe({ x: 4, y: 200 }, { x: 4 + 90, y: 205 }, VW, CLOSED)
    expect(action).toEqual({ kind: 'open-left' })
  })

  it('abre a DIREITA: começa na borda direita e arrasta pra esquerda', () => {
    const action = detectEdgeSwipe({ x: VW - 4, y: 200 }, { x: VW - 4 - 90, y: 205 }, VW, CLOSED)
    expect(action).toEqual({ kind: 'open-right' })
  })

  it('NÃO abre nada quando o gesto começa no MEIO da tela (fora do edge-zone)', () => {
    const mid = VW / 2
    expect(detectEdgeSwipe({ x: mid, y: 200 }, { x: mid + 90, y: 200 }, VW, CLOSED)).toBeNull()
    expect(detectEdgeSwipe({ x: mid, y: 200 }, { x: mid - 90, y: 200 }, VW, CLOSED)).toBeNull()
  })

  it('ignora gestos curtos (abaixo do threshold de distância)', () => {
    const dist = SWIPE_THRESHOLD_PX - 5
    expect(detectEdgeSwipe({ x: 4, y: 200 }, { x: 4 + dist, y: 200 }, VW, CLOSED)).toBeNull()
  })

  it('ignora gestos verticais (scroll) mesmo começando na borda', () => {
    // grande deslocamento vertical, horizontal insuficiente pra dominar
    const action = detectEdgeSwipe({ x: 4, y: 100 }, { x: 4 + 70, y: 100 + 200 }, VW, CLOSED)
    expect(action).toBeNull()
  })

  it('exige que o horizontal domine o vertical', () => {
    // dx=70 (>threshold) mas dy=60 → 70 < 60*1.4 = 84 → não dispara
    const almostDiagonal = detectEdgeSwipe({ x: 4, y: 100 }, { x: 74, y: 160 }, VW, CLOSED)
    expect(almostDiagonal).toBeNull()
    // dx=70, dy=30 → 70 >= 30*1.4=42 → dispara
    const mostlyHoriz = detectEdgeSwipe({ x: 4, y: 100 }, { x: 74, y: 130 }, VW, CLOSED)
    expect(mostlyHoriz).toEqual({ kind: 'open-left' })
  })

  it('FECHA a esquerda: com a esquerda aberta, arrastar pra esquerda fecha (de qualquer ponto)', () => {
    const state: DrawerState = { leftOpen: true, rightOpen: false }
    // começa no meio da tela (drawer aberto cobre a tela), vai pra esquerda
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

  it('edge-zone respeita a largura da viewport (borda direita móvel)', () => {
    const narrow = 320
    const start = { x: narrow - (EDGE_ZONE_PX - 2), y: 150 }
    const action = detectEdgeSwipe(start, { x: start.x - 90, y: 150 }, narrow, CLOSED)
    expect(action).toEqual({ kind: 'open-right' })
  })
})
