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
