// ONDE A CAIXA DO TOOLTIP COMEÇA — compartilhado pelos dois tooltips do app
// (o da ficha, tooltips.tsx, e o da ficha de grupo, grupo/gtip.tsx).
//
// Report 2026-09-11/12: "o tooltip aparece lá no canto esquerdo". Eram duas
// coisas: (1) a caixa larga não cabia à direita do cursor e o código a grudava
// na BORDA da janela, em vez de abrir pro outro lado do mouse; (2) o overlay é
// position:fixed e nascia DENTRO da árvore da tela — um ancestral com
// `transform` vira o bloco de contenção e o "fixed" passa a medir por ele
// (por isso a aba de grupo era a pior). O (2) se resolve com portal pro body.

/** Coordenada X da caixa: à direita do cursor quando cabe; senão à ESQUERDA
 *  DELE; sem caber dos dois lados, encosta na borda. */
export function esquerdaDoTip(x: number, w: number, vw: number): number {
  const direita = x + 16
  if (direita + w <= vw - 12) return direita
  const esquerda = x - 16 - w
  if (esquerda >= 12) return esquerda
  return Math.max(12, vw - 12 - w)
}

/** Correção PÓS-MEDIDA (puro, testável — report 58401c49): re-decide o lado
 *  do cursor com a largura REAL renderizada (o primeiro paint usa o maxWidth,
 *  que num tooltip estreito flipava a caixa pra longe do mouse) e devolve o
 *  ajuste vertical pra caber na viewport (mesmo 8px de sempre). */
export function corrigeAposMedida(
  r: { left: number; width: number; top: number; bottom: number },
  xCursor: number,
  vw: number,
  vh: number,
): { left: number; dy: number } {
  const left = esquerdaDoTip(xCursor, r.width, vw)
  let dy = 0
  if (r.top < 8) dy = 8 - r.top
  else if (r.bottom > vh - 8) dy = vh - 8 - r.bottom
  return { left, dy }
}
