// DETALHES de um ITEM como o personagem o tem (2026-10-02): a carta da arma
// SEM a qualidade no nome + a carta da propriedade (imbuição/obra-prima/
// material) COM a qualidade — ou a carta do tesouro/consumível na qualidade
// possuída. EXATAMENTE a composição do hover (ItemHover): cartas concisas,
// com a descrição DAQUELA qualidade — não a prosa completa da nota (feedback
// 2026-10-02: a prosa repetia o título e trazia a tabela dataview do fim).
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
  const cut = doc.id.includes('/Classes/')
  if (propDoc) {
    // combo: item base (SEM qualidade no nome) + propriedade (COM qualidade)
    cards.push(itemCardHtml(doc, t, docImageUrl(doc, t, assets), false, false, assets, cut, formulaCtx))
    cards.push(itemCardHtml(propDoc, t, docImageUrl(propDoc, t, assets), true, false, assets, false, formulaCtx))
  } else {
    // avulso: "(Qualidade)" só na família tesouro (a que é comprada por tier)
    cards.push(itemCardHtml(doc, t, docImageUrl(doc, t, assets), docKind(doc) === 'tesouro', false, assets, cut, formulaCtx))
  }
  return (
    <div data-item-detail={id} data-item-detail-prop={propId ?? ''} data-item-detail-tier={t}>
      <style>{ITEM_CARD_CSS}</style>
      <div className="shc-wrap" dangerouslySetInnerHTML={{ __html: cards.join('') }} />
    </div>
  )
}
