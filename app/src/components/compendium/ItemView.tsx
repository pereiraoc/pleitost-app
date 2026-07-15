// VISUALIZADOR DE ITEM (#245 F1; #267 agrupamento+filtros) — mostra um doc
// `type: Item` (Arma/Armadura/Escudo/Tesouro) como a MESMA carta do tooltip do
// inventário/comércio, agora em tamanho de página. NADA de layout novo: reusa
// itemCardHtml/docImageUrl/docTier de components/item-card.tsx (fonte de verdade
// da carta) no modo RESUMO. A GRADE de uma pasta (várias armas/tesouros) é a
// mesma carta repetida, agora AGRUPADA por categoria → grupo → subgrupo (#267) e
// com uma BARRA DE FILTRO (facetas do registro item-taxonomy.ts) no topo.
//
// Registro: registerDocView({id:'item'}) pro DocView (carta como página) e
// registerLeafView('Item', subtree:true) pro FolderView — o FolderView achata a
// subárvore da pasta e passa TODOS os Items; este arquivo agrupa e filtra.
import { useMemo, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import type { VaultDoc } from '../../data/types'
import type { IndexDocEntry } from '../../data/types'
import type { Tier } from '../../data/commerce'
import { TIERS } from '../../data/commerce'
import { useDocs } from '../../data/useDoc'
import { useAssetIndex } from '../../data/assets'
import { docPath } from '../../paths'
import { COMPENDIO_KICKER } from '../layout/design-nav'
import { pillStyle } from './MestreTables'
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
import {
  groupFacetedItems,
  itemFacet,
  categoriaTemQualidade,
  qualidadeLabel,
  type ItemCategoria,
  type ItemFacet,
} from './item-taxonomy'

/** Categoria que dispara este visualizador. `doc.type` espelha
 *  `frontmatter.categoria` (extractor/parse-doc.mjs) — Armas/Armaduras/Escudos/
 *  Tesouros são todos `categoria: Item` (subtype = subcategoria). */
export const ITEM_CATEGORY = 'Item'

export function isItem(doc: VaultDoc): boolean {
  return doc.type === ITEM_CATEGORY
}

/** HTML da carta de um item NO TIER pedido — a MESMA `itemCardHtml` do tooltip
 *  (modo resumo). `showTier` = a família tesouro (comprada por qualidade) mostra
 *  "(Adepto/…)"; arma/escudo/armadura base não têm qualidade (é da propriedade). */
function itemCard(
  doc: VaultDoc,
  assets: ReturnType<typeof useAssetIndex>,
  facet: ItemFacet,
  tier: Tier,
): string {
  const showTier = categoriaTemQualidade(facet.categoria)
  const t = showTier ? tier : docTier(doc)
  return itemCardHtml(doc, t, docImageUrl(doc, t, assets), showTier, false, assets)
}

// ─────────────────────────── página de um Item ───────────────────────────

/** Ficha de página de um Item: a MESMA carta do tooltip (figura + stats +
 *  descrição), em tamanho grande, na linguagem do compêndio (kicker mono).
 *  É o modo RESUMO (não fullBody). `TipProvider`/`ITEM_CARD_CSS` mantêm os
 *  tooltips aninhados funcionando aqui também. */
export function ItemSheet({ doc }: { doc: VaultDoc }) {
  const assets = useAssetIndex()
  const facet = itemFacet(doc)
  const tier = categoriaTemQualidade(facet.categoria) ? 'A' : docTier(doc)
  const html = itemCard(doc, assets, facet, tier)
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

// ─────────────────────── uma célula (carta linkada) ───────────────────────

interface Cell {
  entry: IndexDocEntry
  facet: ItemFacet
}

/** Célula de carta linkada (async: mostra o nome até o doc resolver). */
function ItemCell({
  cell,
  docs,
  assets,
  tier,
}: {
  cell: Cell
  docs: ReturnType<typeof useDocs>
  assets: ReturnType<typeof useAssetIndex>
  tier: Tier
}) {
  const doc = docs?.get(cell.entry.id)
  return (
    <Link to={docPath(cell.entry.id)} className="item-grid-cell">
      {doc ? (
        <span dangerouslySetInnerHTML={{ __html: itemCard(doc, assets, cell.facet, tier) }} />
      ) : (
        <span className="item-grid-loading">{cell.entry.basename ?? cell.entry.id}</span>
      )}
    </Link>
  )
}

// ─────────────────── grade AGRUPADA + filtro (folha de uma pasta) ───────────────────

/** Estilo do cabeçalho de seção (categoria) — kicker mono do compêndio. */
const catHeadStyle: CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 12,
  letterSpacing: '.18em',
  color: 'var(--muted)',
  textTransform: 'uppercase',
  margin: '18px 0 8px',
  paddingBottom: 4,
  borderBottom: '1px solid var(--line2)',
}
/** Cabeçalho de grupo (ex.: "Corpo-a-Corpo Simples"). */
const grpHeadStyle: CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 11,
  letterSpacing: '.14em',
  color: 'var(--accent)',
  textTransform: 'uppercase',
  margin: '12px 0 6px',
}
/** Cabeçalho de subgrupo (ex.: tipo de arma natural "Garras"). */
const subHeadStyle: CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 10,
  letterSpacing: '.12em',
  color: 'var(--muted)',
  textTransform: 'uppercase',
  margin: '8px 0 4px',
  opacity: 0.85,
}

/** Grade AGRUPADA de cartas de Items de uma pasta (subárvore achatada pelo
 *  FolderView). Agrupa por categoria → grupo → subgrupo (item-taxonomy.groupItems)
 *  e mostra uma barra de filtro no topo (categoria/grupo/qualidade — facetas do
 *  registro, nada hardcodado no call-site). */
export function ItemGrid({ entries }: { entries: IndexDocEntry[] }) {
  const assets = useAssetIndex()
  const docs = useDocs(entries.map((e) => e.id))

  // Facetas de cada entry (categoria/grupo/subgrupo/qualidade), 1x por render.
  // Só entries com doc resolvido têm faceta; enquanto carrega, cai no facet cru
  // (categoria por path do id — itemFacet lê doc.id/FM; sem doc, usa um stub).
  const cells: Cell[] = useMemo(
    () =>
      entries.map((entry) => {
        const doc = docs?.get(entry.id)
        // Sem doc ainda: deriva a categoria só pelo path (id) via um stub mínimo —
        // grupo/subgrupo/qualidade chegam quando o doc resolve.
        const facet = doc
          ? itemFacet(doc)
          : itemFacet({ id: entry.id, basename: entry.basename ?? entry.id, frontmatter: {} } as VaultDoc)
        return { entry, facet }
      }),
    [entries, docs],
  )

  // Facetas disponíveis pro filtro (categoria/grupo) — só as que EXISTEM nos dados.
  const categorias = useMemo(() => {
    const seen = new Map<ItemCategoria, string>()
    for (const c of cells) if (!seen.has(c.facet.categoria)) seen.set(c.facet.categoria, c.facet.categoriaLabel)
    return [...seen.entries()]
  }, [cells])
  const grupos = useMemo(() => {
    const seen = new Map<string, string>()
    for (const c of cells) {
      if (!c.facet.grupo) continue
      if (!seen.has(c.facet.grupo)) seen.set(c.facet.grupo, c.facet.grupoLabel)
    }
    return [...seen.entries()]
  }, [cells])
  // A qualidade só faz sentido pras categorias compradas por tier (tesouro).
  const temQualidade = useMemo(
    () => cells.some((c) => categoriaTemQualidade(c.facet.categoria)),
    [cells],
  )

  // Estado do filtro. categoria/grupo = null → "todas"; tier controla em qual
  // qualidade as cartas de tesouro aparecem (default Adepto).
  const [catFilter, setCatFilter] = useState<ItemCategoria | null>(null)
  const [grpFilter, setGrpFilter] = useState<string | null>(null)
  const [tier, setTier] = useState<Tier>('A')

  const filtered = useMemo(
    () =>
      cells.filter((c) => {
        if (catFilter && c.facet.categoria !== catFilter) return false
        if (grpFilter && c.facet.grupo !== grpFilter) return false
        return true
      }),
    [cells, catFilter, grpFilter],
  )

  // Árvore agrupada (categoria → grupo → subgrupo) das células filtradas —
  // reusa a faceta JÁ calculada (não re-deriva).
  const tree = useMemo(
    () => groupFacetedItems<Cell>(filtered.map((c) => ({ facet: c.facet, entry: c }))),
    [filtered],
  )

  if (!entries.length) return null

  const filterPill = (label: string, active: boolean, onClick: () => void) => (
    <button type="button" aria-pressed={active} onClick={onClick} style={pillStyle(active)}>
      {label}
    </button>
  )

  return (
    <TipProvider>
      <div className="item-grouped">
        <style>{ITEM_CARD_CSS}</style>
        {/* BARRA DE FILTRO (#267): facetas do registro — categoria/grupo/qualidade */}
        <div className="item-filterbar" role="group" aria-label="Filtros de itens">
          {categorias.length > 1 ? (
            <div className="item-filter-row" data-facet="categoria">
              {filterPill('Todas', catFilter === null, () => {
                setCatFilter(null)
                setGrpFilter(null)
              })}
              {categorias.map(([cat, label]) =>
                <span key={cat}>
                  {filterPill(label, catFilter === cat, () => {
                    setCatFilter((v) => (v === cat ? null : cat))
                    setGrpFilter(null)
                  })}
                </span>,
              )}
            </div>
          ) : null}
          {grupos.length > 1 ? (
            <div className="item-filter-row" data-facet="grupo">
              {filterPill('Todos', grpFilter === null, () => setGrpFilter(null))}
              {grupos.map(([g, label]) => (
                <span key={g}>
                  {filterPill(label, grpFilter === g, () => setGrpFilter((v) => (v === g ? null : g)))}
                </span>
              ))}
            </div>
          ) : null}
          {temQualidade ? (
            <div className="item-filter-row" data-facet="qualidade">
              {TIERS.map((t) => (
                <span key={t}>
                  {filterPill(qualidadeLabel(t), tier === t, () => setTier(t))}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {/* SEÇÕES agrupadas (categoria → grupo → subgrupo) */}
        {tree.map((cat) => (
          <section key={cat.categoria} className="item-cat" data-categoria={cat.categoria}>
            {categorias.length > 1 ? (
              <h2 className="item-cat-head" style={catHeadStyle}>
                {cat.categoriaLabel}
              </h2>
            ) : null}
            {cat.grupos.map((grp) => (
              <div key={grp.grupo || '_'} className="item-grp" data-grupo={grp.grupo}>
                {grp.grupoLabel ? (
                  <h3 className="item-grp-head" style={grpHeadStyle}>
                    {grp.grupoEmoji ? `${grp.grupoEmoji} ` : ''}
                    {grp.grupoLabel}
                  </h3>
                ) : null}
                {grp.subgrupos.map((sub) => (
                  <div key={sub.subgrupo || '_'} className="item-sub" data-subgrupo={sub.subgrupo}>
                    {sub.subgrupoLabel ? (
                      <h4 className="item-sub-head" style={subHeadStyle}>
                        {sub.subgrupoLabel}
                      </h4>
                    ) : null}
                    <div className="item-grid">
                      {sub.entries.map((cell) => (
                        <ItemCell
                          key={cell.entry.id}
                          cell={cell}
                          docs={docs}
                          assets={assets}
                          tier={tier}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </section>
        ))}
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

// FolderView: pasta de `type: Item` vira grade AGRUPADA de cartas. `subtree`:
// achata as subpastas (Armas Simples/Corpo-a-Corpo Simples/…) numa única grade.
registerLeafView({
  type: ITEM_CATEGORY,
  view: (entries) => <ItemGrid entries={entries} />,
  subtree: true,
})
