// VISUALIZADOR DE ITEM (#245, F1 do épico #243) — mostra um doc `type: Item`
// (Arma/Armadura/Escudo/Tesouro) como a MESMA carta que aparece no tooltip do
// inventário/comércio, agora em tamanho de página. NADA de layout novo: reusa
// itemCardHtml/docImageUrl/docTier de components/item-card.tsx (fonte de verdade
// da carta) no modo RESUMO — o mesmo que o tooltip mostra. A grade da folha
// (várias armas/tesouros numa pasta) é a mesma carta repetida.
//
// Registro: registerDocView({id:'item'}) pro DocView (carta como página) e
// registerLeafView('Item') pro FolderView (grade de cartas em vez da DocTable).
// Ambos os pontos de extensão já existem — este arquivo só os preenche.
import { Link } from 'react-router-dom'
import type { VaultDoc } from '../../data/types'
import type { IndexDocEntry } from '../../data/types'
import { useDocs } from '../../data/useDoc'
import { useAssetIndex } from '../../data/assets'
import { docPath } from '../../paths'
import { COMPENDIO_KICKER } from '../layout/design-nav'
import { TipProvider } from '../ficha/tooltips'
import {
  itemCardHtml,
  docImageUrl,
  docTier,
  ITEM_CARD_CSS,
} from '../item-card'
import { registerDocView } from './doc-view-registry'
import { registerLeafView } from './leaf-view-registry'
import { DocRuleElements } from './RuleElements'

/** Categoria que dispara este visualizador. `doc.type` espelha
 *  `frontmatter.categoria` (extractor/parse-doc.mjs) — Armas/Armaduras/Escudos/
 *  Tesouros são todos `categoria: Item` (subtype = subcategoria). */
export const ITEM_CATEGORY = 'Item'

export function isItem(doc: VaultDoc): boolean {
  return doc.type === ITEM_CATEGORY
}

/** HTML da carta de um item — a MESMA `itemCardHtml` do tooltip (modo resumo).
 *  Tier/figura vêm dos helpers do item-card (a qualidade do Tesouro é dele mesmo
 *  → showTier; Arma/Armadura/Escudo base não têm qualidade). */
function itemCard(doc: VaultDoc, assets: ReturnType<typeof useAssetIndex>): string {
  const tier = docTier(doc)
  const showTier = doc.subtype === 'Tesouro'
  return itemCardHtml(doc, tier, docImageUrl(doc, tier, assets), showTier, false, assets)
}

// ─────────────────────────── página de um Item ───────────────────────────

/** Ficha de página de um Item: a MESMA carta do tooltip (figura + stats +
 *  descrição), em tamanho grande, na linguagem do compêndio (kicker mono).
 *  É o modo RESUMO (não fullBody): o corpo de uma arma é só a tabela de stats
 *  crua + blocos dataview/carta-item — que a carta já resume em linhas; a
 *  descrição vem da prosa (bodyDesc) ou do inline por tier, exatamente como o
 *  tooltip do inventário/comércio. `TipProvider`/`ITEM_CARD_CSS` mantêm os
 *  tooltips aninhados funcionando aqui também. */
export function ItemSheet({ doc }: { doc: VaultDoc }) {
  const assets = useAssetIndex()
  const html = itemCard(doc, assets)
  return (
    <TipProvider>
      <section className="page item-page">
        <style>{ITEM_CARD_CSS}</style>
        <div className="kicker">{COMPENDIO_KICKER}</div>
        <div className="item-page-card" dangerouslySetInnerHTML={{ __html: html }} />
        {/* F7 (#251): itens têm elementos de regra (imbuições/qualidades) —
            visualizador+cobertura no fim; DocRuleElements gate por mestre. */}
        <DocRuleElements doc={doc} />
      </section>
    </TipProvider>
  )
}

// ─────────────────────── grade de cartas de uma pasta ───────────────────────

/** Grade de cartas de itens (folha de uma pasta de Items). Cada carta é a MESMA
 *  do tooltip (modo resumo), linkando pro doc. Docs ainda carregando mostram o
 *  nome enquanto o lote resolve. */
export function ItemGrid({ entries }: { entries: IndexDocEntry[] }) {
  const assets = useAssetIndex()
  const docs = useDocs(entries.map((e) => e.id))
  if (!entries.length) return null
  return (
    <TipProvider>
      <div className="item-grid">
        <style>{ITEM_CARD_CSS}</style>
        {entries.map((entry) => {
          const doc = docs?.get(entry.id)
          return (
            <Link key={entry.id} to={docPath(entry.id)} className="item-grid-cell">
              {doc ? (
                <span dangerouslySetInnerHTML={{ __html: itemCard(doc, assets) }} />
              ) : (
                <span className="item-grid-loading">{entry.basename ?? entry.id}</span>
              )}
            </Link>
          )
        })}
      </div>
    </TipProvider>
  )
}

// ─────────────────────────── registro (side-effect) ───────────────────────────

registerDocView({
  id: 'item',
  match: isItem,
  view: (doc) => <ItemSheet doc={doc} />,
})

// FolderView: pasta homogênea de `type: Item` vira grade de cartas.
registerLeafView({ type: ITEM_CATEGORY, view: (entries) => <ItemGrid entries={entries} /> })
