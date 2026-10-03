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

/** No painel DETALHES a carta ocupa a largura disponível (feedback 2026-10-02:
 *  as cartas de 174px do hover ficavam estreitas na lateral): uma carta por
 *  linha, 100% de largura, figura e texto um pouco maiores. Só aqui — o hover
 *  segue com as cartas compactas. */
const ITEM_DETAIL_CSS = `
.item-detail .shc-wrap{flex-direction:column;flex-wrap:nowrap;gap:12px}
.item-detail .shc-card{width:100%;flex:1 1 auto;box-sizing:border-box;padding:10px 12px;gap:4px}
.item-detail .shc-img{max-height:260px}
.item-detail .shc-name{font-size:15px}
.item-detail .shc-tier{font-size:12px}
.item-detail .shc-row{font-size:12.5px}
.item-detail .shc-desc{font-size:12.5px;line-height:1.45}
.item-detail .shc-ability{font-size:12px;line-height:1.4}
`

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
    <div className="item-detail" data-item-detail={id} data-item-detail-prop={propId ?? ''} data-item-detail-tier={t}>
      <style>{ITEM_CARD_CSS + ITEM_DETAIL_CSS}</style>
      <div className="shc-wrap" dangerouslySetInnerHTML={{ __html: cards.join('') }} />
    </div>
  )
}
