// WIRING do gesto de swipe (#259) — liga o helper puro detectEdgeSwipe a
// listeners nativos de pointer no documento. Só ativa quando os drawers de
// fato existem (telas estreitas): a sidebar ESQUERDA é drawer < 820px e a
// DIREITA é drawer < 1100px (vide app.css). Fora dessas faixas o gesto não
// faz nada (as sidebars são colunas/collapse, não drawers).
import { useEffect, useRef } from 'react'
import { detectEdgeSwipe, HORIZONTAL_DOMINANCE, type DrawerState, type SwipePoint } from './edge-swipe'

/** Larguras de corte espelhadas do app.css (drawer off-canvas). */
const LEFT_DRAWER_MAX = 819
const RIGHT_DRAWER_MAX = 1099

/** Um toque que começa DENTRO de um scroller horizontal (carrossel, tabela,
 *  strip de cards) NÃO deve armar o gesto de drawer — senão o `preventDefault`
 *  do move rouba o scroll lateral do conteúdo (bug: no tablet, com o painel da
 *  direita aberto, não dava pra passar os carrosséis). Detecta GENERICAMENTE:
 *  sobe a árvore e para no primeiro ancestral com overflow-x rolável — cobre
 *  qualquer scroller sem precisar marcar classe a classe. Mantém os seletores
 *  explícitos como rede pra casos onde o overflow só aparece abaixo de um
 *  breakpoint (ex.: `.item-cell-tiers`). */
function startsInHorizontalScroller(target: EventTarget | null): boolean {
  let node = target instanceof Element ? target : null
  for (; node && node !== document.body; node = node.parentElement) {
    if (node.matches('.tabs-scroll, .table-scroll, .item-cell-tiers, [data-hscroll]')) return true
    const ox = getComputedStyle(node).overflowX
    if ((ox === 'auto' || ox === 'scroll') && node.scrollWidth > node.clientWidth + 1) return true
  }
  return false
}

export interface EdgeSwipeHandlers {
  openLeft: () => void
  closeLeft: () => void
  openRight: () => void
  closeRight: () => void
}

/**
 * Instala os handlers de swipe no `document`. Usa Pointer Events (cobre touch e
 * caneta; mouse fica de fora por checar `pointerType`). Guarda o ponto inicial
 * no `pointerdown` e, no `pointerup`, delega a decisão ao helper puro.
 *
 * Não usa `preventDefault` no move: deixa o scroll/toque normais intactos e só
 * age na SOLTA, quando já dá pra distinguir swipe de scroll (o helper exige
 * dominância horizontal). O edge-zone (início perto da borda) evita disparar no
 * meio da tela.
 */
export function useEdgeSwipe(state: DrawerState, handlers: EdgeSwipeHandlers) {
  // refs pra o listener (registrado uma vez) enxergar sempre o estado atual
  const stateRef = useRef(state)
  const handlersRef = useRef(handlers)
  stateRef.current = state
  handlersRef.current = handlers

  useEffect(() => {
    if (typeof window === 'undefined') return
    let start: (SwipePoint & { id: number }) | null = null

    const isNarrowEnough = () => window.innerWidth <= RIGHT_DRAWER_MAX

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return
      if (!isNarrowEnough()) return
      // O gesto vale de QUALQUER ponto (do meio) — arrasta pra abrir/fechar. Só
      // NÃO arma sobre scrollers horizontais de conteúdo (carrosséis/abas/tabelas/
      // trio de qualidades), pra o dedo poder rolá-los pro lado sem mexer no painel.
      if (startsInHorizontalScroller(e.target)) return
      start = { x: e.clientX, y: e.clientY, id: e.pointerId }
    }

    const onUp = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return
      const from = start
      start = null
      const vw = window.innerWidth
      // a sidebar esquerda só é drawer < 820; ignora "abrir esquerda" fora disso
      const leftIsDrawer = vw <= LEFT_DRAWER_MAX
      const action = detectEdgeSwipe(
        from,
        { x: e.clientX, y: e.clientY },
        vw,
        stateRef.current,
      )
      if (!action) return
      const h = handlersRef.current
      switch (action.kind) {
        case 'open-left':
          if (leftIsDrawer) h.openLeft()
          break
        case 'close-left':
          h.closeLeft()
          break
        case 'open-right':
          h.openRight()
          break
        case 'close-right':
          h.closeRight()
          break
      }
    }

    // Reivindica o gesto quando ele JÁ é claramente horizontal: preventDefault
    // (listener NÃO-passivo) impede o scroll/nav do browser de roubar o swipe.
    // Só chega aqui pra gestos ARMADOS (começaram na borda, ou há drawer aberto),
    // então nunca atrapalha scrollers horizontais de conteúdo (que começam no meio
    // e não armam `start`).
    const onMove = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return
      const dx = e.clientX - start.x
      const dy = e.clientY - start.y
      if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * HORIZONTAL_DOMINANCE && e.cancelable) {
        e.preventDefault()
      }
    }

    const onCancel = () => {
      start = null
    }

    document.addEventListener('pointerdown', onDown, { passive: true })
    document.addEventListener('pointermove', onMove, { passive: false })
    document.addEventListener('pointerup', onUp, { passive: true })
    document.addEventListener('pointercancel', onCancel, { passive: true })
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onCancel)
    }
  }, [])
}
