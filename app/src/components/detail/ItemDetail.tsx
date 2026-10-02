// DETALHES de um ITEM como o personagem o tem (2026-10-02): a carta da arma
// SEM a qualidade no nome + a carta da propriedade (imbuição/obra-prima/
// material) COM a qualidade — ou a carta do tesouro/consumível na qualidade
// possuída. Mesma composição do hover (ItemHover), com a prosa COMPLETA.
// Antes o clique abria a nota crua da arma, e a imbuição ficava de fora.
import { useDoc } from '../../data/useDoc'
import { useAssetIndex } from '../../data/assets'
import type { Tier } from '../../data/commerce'
import type { FormulaCtx } from '../../interativa/formulas'
import { ITEM_CARD_CSS, docImageUrl, docKind, docTier, itemCardHtml } from '../item-card'

export function ItemDetail({
  id,
  propId,
  tier,
  formulaCtx,
}: {
  id: string
  propId?: string
  tier?: Tier
  formulaCtx?: FormulaCtx
}) {
  const { doc } = useDoc(id)
  const { doc: propDoc } = useDoc(propId ?? '')
  const assets = useAssetIndex()
  if (!doc || (propId && !propDoc)) return <div className="loading">Carregando…</div>
  const t = tier ?? docTier(doc)
  const cards: string[] = []
  if (propDoc) {
    cards.push(itemCardHtml(doc, t, docImageUrl(doc, t, assets), false, true, assets, false, formulaCtx))
    cards.push(itemCardHtml(propDoc, t, docImageUrl(propDoc, t, assets), true, true, assets, false, formulaCtx))
  } else {
    cards.push(itemCardHtml(doc, t, docImageUrl(doc, t, assets), docKind(doc) === 'tesouro', true, assets, false, formulaCtx))
  }
  return (
    <div data-item-detail={id} data-item-detail-prop={propId ?? ''} data-item-detail-tier={t}>
      <style>{ITEM_CARD_CSS}</style>
      <div className="shc-wrap" dangerouslySetInnerHTML={{ __html: cards.join('') }} />
    </div>
  )
}
