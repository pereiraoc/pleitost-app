// GESTO DE SWIPE DAS SIDEBARS (#259) — no mobile os dois painéis são drawers
// off-canvas; o usuário quer PUXÁ-LOS com o dedo (como apps nativos):
//   • arrastar da borda ESQUERDA → direita  → abre a sidebar ESQUERDA
//   • arrastar da borda DIREITA  → esquerda → abre a sidebar DIREITA
//   • arrastar no sentido oposto sobre um drawer aberto → fecha
//
// A DETECÇÃO é um helper PURO (sem DOM, sem React) pra ser testável isolada:
// recebe o ponto de início e o de fim + a largura da tela e devolve a ação.
// O wiring com listeners nativos (useEdgeSwipe) só chama este helper.

/** Zona de borda: o gesto SÓ conta como "puxar a sidebar" se COMEÇOU a até
 *  esta distância (px) da borda da tela — no meio da tela o toque é conteúdo
 *  normal (scroll, clique) e não deve mexer nos drawers. */
export const EDGE_ZONE_PX = 40
/** Distância horizontal mínima (px) pra confirmar o swipe — abaixo disso é
 *  toque/tap acidental. */
export const SWIPE_THRESHOLD_PX = 56
/** O movimento horizontal precisa DOMINAR o vertical por esta razão, senão é
 *  um scroll vertical e o gesto é ignorado (não sequestra o scroll). */
export const HORIZONTAL_DOMINANCE = 1.4

export interface SwipePoint {
  x: number
  y: number
}

/** Estado atual dos drawers, pro helper decidir abrir vs. fechar. */
export interface DrawerState {
  leftOpen: boolean
  rightOpen: boolean
}

export type SwipeAction =
  | { kind: 'open-left' }
  | { kind: 'close-left' }
  | { kind: 'open-right' }
  | { kind: 'close-right' }
  | null

/**
 * Decide a ação de um gesto horizontal a partir do ponto inicial/final.
 *
 * Regras (só dispara quando os drawers estão disponíveis — narrow):
 *  - ABRIR ESQUERDA: começa na borda esquerda + arrasta pra DIREITA, com a
 *    esquerda fechada.
 *  - ABRIR DIREITA: começa na borda direita + arrasta pra ESQUERDA, com a
 *    direita fechada.
 *  - FECHAR: com um drawer aberto, arrastar no sentido oposto (independe da
 *    borda de início — o drawer cobre a tela) fecha esse drawer.
 *
 * Retorna `null` quando o gesto não é um swipe de sidebar válido (curto demais,
 * vertical demais, ou começou no meio da tela sem drawer aberto).
 */
export function detectEdgeSwipe(
  start: SwipePoint,
  end: SwipePoint,
  viewportWidth: number,
  state: DrawerState,
): SwipeAction {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const adx = Math.abs(dx)
  const ady = Math.abs(dy)

  // curto demais, ou vertical demais → não é swipe de sidebar
  if (adx < SWIPE_THRESHOLD_PX) return null
  if (adx < ady * HORIZONTAL_DOMINANCE) return null

  const toRight = dx > 0
  void viewportWidth // não mais usado: o gesto vale de QUALQUER ponto (do meio)

  // FECHAR tem prioridade: com um drawer aberto, o gesto oposto o fecha.
  if (state.leftOpen && !toRight) return { kind: 'close-left' }
  if (state.rightOpen && toRight) return { kind: 'close-right' }

  // ABRIR por DIREÇÃO, de qualquer ponto da tela (pedido do usuário — não precisa
  // começar na borda): arrastar pra DIREITA abre a ESQUERDA; pra ESQUERDA abre a
  // DIREITA.
  if (!state.leftOpen && toRight) return { kind: 'open-left' }
  if (!state.rightOpen && !toRight) return { kind: 'open-right' }

  return null
}
