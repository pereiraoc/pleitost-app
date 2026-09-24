// Superfície de GESTO (#572): um elemento que trata os próprios toques (pan,
// pinça — o viewport de mapa, `touch-action: none`) é marcado com este
// atributo pelo próprio useMapView. O swipe dos drawers (useEdgeSwipe) NÃO arma
// num toque que começa dentro de uma: metade de toda pinça é um dedo andando
// na horizontal, e isso fechava o painel de detalhes com o mapa dentro — o
// mapa sumia debaixo do dedo. Contrato compartilhado entre os dois hooks; o
// marcador é explícito (jsdom não expõe touch-action computado) e a checagem
// de `touch-action` computado cobre superfícies de terceiros no browser real.
export const GESTURE_SURFACE_ATTR = 'data-gesture-surface'

export function marcarSuperficieDeGesto(el: Element): void {
  el.setAttribute(GESTURE_SURFACE_ATTR, '')
}

/** O toque começou dentro de uma superfície de gesto? Sobe a árvore até o body. */
export function startsInGestureSurface(target: EventTarget | null): boolean {
  let node = target instanceof Element ? target : null
  for (; node && node !== document.body; node = node.parentElement) {
    if (node.hasAttribute(GESTURE_SURFACE_ATTR)) return true
    const ta = typeof getComputedStyle === 'function' ? getComputedStyle(node).touchAction : undefined
    // `none` e `pan-y` = o elemento é dono do gesto horizontal
    if (ta === 'none' || ta === 'pan-y') return true
  }
  return false
}
