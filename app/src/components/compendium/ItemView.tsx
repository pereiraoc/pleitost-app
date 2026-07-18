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
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
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
  isForcaToken,
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
  // Família tesouro (comprada por qualidade): mostra as 3 cartas (Adepta/
  // Experiente/Mestre) do item (#268); arma/escudo/armadura → 1 carta no tier
  // inerente.
  const temQual = categoriaTemQualidade(facet.categoria)
  const tiers: Tier[] = temQual ? [...TIERS] : [docTier(doc)]
  const html = tiers.map((t) => itemCard(doc, assets, facet, t)).join('')
  return (
    <TipProvider>
      <section className="page item-page">
        <style>{ITEM_CARD_CSS}</style>
        <div className="kicker">{COMPENDIO_KICKER}</div>
        <div
          className={temQual ? 'item-page-card item-cell-tiers' : 'item-page-card'}
          dangerouslySetInnerHTML={{ __html: html }}
        />
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

/** Célula de carta(s) linkada(s) (async: mostra o nome até o doc resolver).
 *  `tier` null = "Todas as qualidades" → mostra as 3 cartas (Adepta/Experiente/
 *  Mestre) das categorias compradas por qualidade (#268); com tier específico,
 *  1 carta. Categorias sem qualidade (arma/escudo/armadura) ignoram o tier. */
function ItemCell({
  cell,
  docs,
  assets,
  tier,
}: {
  cell: Cell
  docs: ReturnType<typeof useDocs>
  assets: ReturnType<typeof useAssetIndex>
  tier: Tier | null
}) {
  const doc = docs?.get(cell.entry.id)
  // Quais tiers renderizar: "Todas" (null) numa família com qualidade → os 3;
  // caso contrário, o tier escolhido (ou 'A' como base pras sem qualidade).
  const temQual = categoriaTemQualidade(cell.facet.categoria)
  const tiersToRender: Tier[] = tier ? [tier] : temQual ? [...TIERS] : ['A']
  return (
    <Link to={docPath(cell.entry.id)} className="item-grid-cell">
      {doc ? (
        <span
          className={tiersToRender.length > 1 ? 'item-cell-tiers' : undefined}
          dangerouslySetInnerHTML={{
            __html: tiersToRender.map((t) => itemCard(doc, assets, cell.facet, t)).join(''),
          }}
        />
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

// Filtro de propriedade TRI-ESTADO (pedido do usuário): 1º clique = CONTÉM o
// valor, 2º = NÃO CONTÉM (excludente — pill vermelha com ícone de bloqueio),
// 3º = limpa. Aplica-se às facetas "de conteúdo" (Propriedade/Força/Propriedades
// da arma), onde o item TEM uma lista de propriedades; categoria/grupo/qualidade
// seguem single-select (são estruturais e cascateiam).
type TriMode = 'inc' | 'exc'
type TriSel = { value: string; mode: TriMode } | null
/** Avança o ciclo do valor clicado: (vazio|outro)→contém, contém→não contém,
 *  não contém→limpa. */
function cycleTri(cur: TriSel, value: string): TriSel {
  if (!cur || cur.value !== value) return { value, mode: 'inc' }
  return cur.mode === 'inc' ? { value, mode: 'exc' } : null
}
/** A célula passa? Sem seleção → passa; contém → precisa ter; não contém →
 *  precisa NÃO ter. */
function passesTri(sel: TriSel, has: boolean): boolean {
  return !sel || (sel.mode === 'inc' ? has : !has)
}
/** Ícone de bloqueio (⊘) da pill excludente. */
function BanIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="11"
      height="11"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      aria-hidden
      style={{ flex: 'none', marginRight: 4, verticalAlign: '-1px' }}
    >
      <circle cx="12" cy="12" r="9" />
      <line x1="5.6" y1="5.6" x2="18.4" y2="18.4" />
    </svg>
  )
}
/** Estilo da pill excludente (vermelho) — deriva do pillStyle ativo. */
function pillStyleExc(): CSSProperties {
  return {
    ...pillStyle(true),
    color: '#fff',
    background: 'var(--red)',
    border: '1px solid color-mix(in srgb,var(--red) 55%,transparent)',
    display: 'inline-flex',
    alignItems: 'center',
  }
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

  // Estado do filtro. categoria/grupo = null → "todas". tier = null → "Todas"
  // as qualidades: mostra as 3 cartas (Adepta/Experiente/Mestre) de cada item
  // comprado por qualidade (#268); com um tier específico, só aquela carta.
  const [catFilter, setCatFilter] = useState<ItemCategoria | null>(null)
  const [grpFilter, setGrpFilter] = useState<string | null>(null)
  // Filtros de conteúdo TRI-ESTADO (contém → não contém → limpa).
  const [subFilter, setSubFilter] = useState<TriSel>(null)
  // #304: filtro de propriedade de ARMA (FOR 1/2/…, Precisa, Arremesso).
  const [propFilter, setPropFilter] = useState<TriSel>(null)
  const [tier, setTier] = useState<Tier | null>(null)
  // #279: a barra de filtros começa COLAPSADA atrás de um botão de funil — menos
  // poluída; clicar abre as linhas de filtro.
  const [filtersOpen, setFiltersOpen] = useState(false)

  // #278: propriedades (subgrupo — ex.: elemento da imbuição: Fogo/Água/…)
  // DISPONÍVEIS no recorte atual (categoria+grupo), pra virar uma linha de filtro
  // própria. Antes o subgrupo só agrupava; agora também filtra.
  const subgrupos = useMemo(() => {
    const seen = new Map<string, string>()
    for (const c of cells) {
      if (catFilter && c.facet.categoria !== catFilter) continue
      if (grpFilter && c.facet.grupo !== grpFilter) continue
      if (!c.facet.subgrupo) continue
      if (!seen.has(c.facet.subgrupo)) seen.set(c.facet.subgrupo, c.facet.subgrupoLabel)
    }
    return [...seen.entries()]
  }, [cells, catFilter, grpFilter])

  // #304: propriedades das ARMAS no recorte atual — FORÇA (FOR 1/2/…) numa linha
  // própria, as demais (Precisa/Arremesso/Ágil/…) numa linha "Propriedades".
  const { forcaTokens, propTokens } = useMemo(() => {
    const forca = new Set<string>()
    const outras = new Set<string>()
    for (const c of cells) {
      if (catFilter && c.facet.categoria !== catFilter) continue
      if (grpFilter && c.facet.grupo !== grpFilter) continue
      for (const t of c.facet.propriedades) (isForcaToken(t) ? forca : outras).add(t)
    }
    const forcaVal = (t: string) => Number(t.replace(/\D+/g, '')) || 0
    return {
      forcaTokens: [...forca].sort((a, b) => forcaVal(a) - forcaVal(b)),
      propTokens: [...outras].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    }
  }, [cells, catFilter, grpFilter])

  const filtered = useMemo(
    () =>
      cells.filter((c) => {
        if (catFilter && c.facet.categoria !== catFilter) return false
        if (grpFilter && c.facet.grupo !== grpFilter) return false
        if (subFilter && !passesTri(subFilter, c.facet.subgrupo === subFilter.value)) return false
        if (propFilter && !passesTri(propFilter, c.facet.propriedades.includes(propFilter.value))) return false
        return true
      }),
    [cells, catFilter, grpFilter, subFilter, propFilter],
  )

  // Árvore agrupada (categoria → grupo → subgrupo) das células filtradas —
  // reusa a faceta JÁ calculada (não re-deriva).
  const tree = useMemo(
    () => groupFacetedItems<Cell>(filtered.map((c) => ({ facet: c.facet, entry: c }))),
    [filtered],
  )

  if (!entries.length) return null

  const activeCount =
    (catFilter ? 1 : 0) +
    (grpFilter ? 1 : 0) +
    (subFilter ? 1 : 0) +
    (propFilter ? 1 : 0) +
    (tier ? 1 : 0)
  const hasFilters =
    categorias.length > 1 ||
    grupos.length > 1 ||
    subgrupos.length > 1 ||
    forcaTokens.length > 0 ||
    propTokens.length > 0 ||
    temQualidade

  const filterPill = (label: string, active: boolean, onClick: () => void) => (
    <button type="button" aria-pressed={active} onClick={onClick} style={pillStyle(active)}>
      {label}
    </button>
  )
  // Pill TRI-ESTADO: contém → não contém (vermelha + ⊘) → limpa. Tooltip explica
  // o estado atual e o que o próximo clique faz.
  const triPill = (label: string, value: string, sel: TriSel, setSel: (s: TriSel) => void) => {
    const mode = sel && sel.value === value ? sel.mode : null
    const title =
      mode === 'inc'
        ? `Mostrando só COM «${label}» — clique para inverter (só SEM)`
        : mode === 'exc'
          ? `Mostrando só SEM «${label}» (excluído) — clique para limpar`
          : `Filtrar «${label}»: 1 clique = contém · 2 = não contém · 3 = limpa`
    return (
      <button
        type="button"
        aria-pressed={mode !== null}
        title={title}
        onClick={() => setSel(cycleTri(sel, value))}
        style={mode === 'exc' ? pillStyleExc() : pillStyle(mode === 'inc')}
      >
        {mode === 'exc' ? <BanIcon /> : null}
        {label}
      </button>
    )
  }
  const filterRow = (facet: string, label: string, pills: ReactNode) => (
    <div className="item-filter-row" data-facet={facet}>
      <span className="item-filter-label">{label}</span>
      {pills}
    </div>
  )

  return (
    <TipProvider>
      <div className="item-grouped">
        <style>{ITEM_CARD_CSS}</style>
        {/* BARRA DE FILTRO (#267/#278) COLAPSÁVEL (#279): só o botão de funil
            aparece; clicar abre as linhas categoria/grupo/propriedade/qualidade —
            facetas do registro (nada hardcodado no call-site). */}
        {hasFilters ? (
          <div className="item-filterbar" role="group" aria-label="Filtros de itens">
            <button
              type="button"
              className="item-filter-toggle"
              aria-expanded={filtersOpen}
              aria-label="Filtros"
              onClick={() => setFiltersOpen((v) => !v)}
            >
              <svg
                viewBox="0 0 24 24"
                width="13"
                height="13"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
              <span>FILTROS</span>
              {activeCount > 0 ? <span className="item-filter-count">{activeCount}</span> : null}
            </button>
            {filtersOpen ? (
              <div className="item-filter-rows">
                {categorias.length > 1
                  ? filterRow(
                      'categoria',
                      'Categoria',
                      <>
                        {filterPill('Todas', catFilter === null, () => {
                          setCatFilter(null)
                          setGrpFilter(null)
                          setSubFilter(null)
                          setPropFilter(null)
                        })}
                        {categorias.map(([cat, label]) => (
                          <span key={cat}>
                            {filterPill(label, catFilter === cat, () => {
                              setCatFilter((v) => (v === cat ? null : cat))
                              setGrpFilter(null)
                              setSubFilter(null)
                              setPropFilter(null)
                            })}
                          </span>
                        ))}
                      </>,
                    )
                  : null}
                {grupos.length > 1
                  ? filterRow(
                      'grupo',
                      'Grupo',
                      <>
                        {filterPill('Todos', grpFilter === null, () => {
                          setGrpFilter(null)
                          setSubFilter(null)
                          setPropFilter(null)
                        })}
                        {grupos.map(([g, label]) => (
                          <span key={g}>
                            {filterPill(label, grpFilter === g, () => {
                              setGrpFilter((v) => (v === g ? null : g))
                              setSubFilter(null)
                              setPropFilter(null)
                            })}
                          </span>
                        ))}
                      </>,
                    )
                  : null}
                {subgrupos.length > 1
                  ? filterRow(
                      'propriedade',
                      'Propriedade',
                      <>
                        {filterPill('Todas', subFilter === null, () => setSubFilter(null))}
                        {subgrupos.map(([s, label]) => (
                          <span key={s}>{triPill(label, s, subFilter, setSubFilter)}</span>
                        ))}
                      </>,
                    )
                  : null}
                {forcaTokens.length > 0
                  ? filterRow(
                      'forca',
                      'Força',
                      <>
                        {filterPill('Todas', propFilter === null || !isForcaToken(propFilter.value), () =>
                          setPropFilter((v) => (v && isForcaToken(v.value) ? null : v)),
                        )}
                        {forcaTokens.map((t) => (
                          <span key={t}>{triPill(t, t, propFilter, setPropFilter)}</span>
                        ))}
                      </>,
                    )
                  : null}
                {propTokens.length > 0
                  ? filterRow(
                      'propriedade-arma',
                      'Propriedades',
                      <>
                        {filterPill(
                          'Todas',
                          propFilter === null || isForcaToken(propFilter.value),
                          () => setPropFilter((v) => (v && !isForcaToken(v.value) ? null : v)),
                        )}
                        {propTokens.map((t) => (
                          <span key={t}>{triPill(t, t, propFilter, setPropFilter)}</span>
                        ))}
                      </>,
                    )
                  : null}
                {temQualidade
                  ? filterRow(
                      'qualidade',
                      'Qualidade',
                      <>
                        {/* "Todas" (#268): mostra as 3 qualidades de cada item, de 3 em 3. */}
                        {filterPill('Todas', tier === null, () => setTier(null))}
                        {TIERS.map((t) => (
                          <span key={t}>
                            {filterPill(qualidadeLabel(t), tier === t, () =>
                              setTier((v) => (v === t ? null : t)),
                            )}
                          </span>
                        ))}
                      </>,
                    )
                  : null}
              </div>
            ) : null}
          </div>
        ) : null}

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
                    {/* "Todas" as qualidades (#268): a família tesouro mostra as
                        3 cartas por item (de 3 em 3) → grade de GRUPOS mais larga. */}
                    <div
                      className={
                        tier === null && categoriaTemQualidade(cat.categoria)
                          ? 'item-grid item-grid--tiers'
                          : 'item-grid'
                      }
                    >
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
