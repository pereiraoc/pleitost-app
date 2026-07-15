import { Fragment, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useCatalog } from '../../data/CatalogContext'
import type { FolderNode } from '../../data/catalog'
import { compendiumFolderPath, docPath } from '../../paths'
import { useSettings } from '../../settings'
import { COMPENDIO_KICKER, TITLES } from '../layout/design-nav'
import { DocTable } from './DocTable'
import { LIST_COLUMNS } from './list-columns'
import { MestreTables, pillStyle } from './MestreTables'
import { hasVisibleDescendant, isHidden, subtreeDocs, visibleCount, visibleFolders } from './sections'
import { isNavNode, navChildren, navLabel, navMeta } from './compendio-registry'
import { resolveLeafEntry } from './leaf-view-registry'
import { localEntriesOfKind, useLocalStoreVersion } from '../../data/local-entities'
// SIDE-EFFECT: registra os visualizadores de folha (Item → grade de cartas).
// Mesmo barrel que o DocPage carrega; a importação aqui garante o registro
// mesmo que a folha seja alcançada sem passar por um doc antes.
import './register-doc-views'

/** Botões GRANDES de seção/subseção (#244) — lêem ícone/label do registro
 *  (fonte de verdade da navegação); a contagem vem da subárvore visível. */
function SectionButtons({ paths }: { paths: string[] }) {
  const catalog = useCatalog()
  return (
    <div className="sec-grid">
      {paths.map((path) => {
        const node = catalog.folderByPath.get(path)
        const meta = navMeta(path)
        const count = node ? visibleCount(node) : 0
        const filhos = navChildren(path).length
        return (
          <Link key={path} to={compendiumFolderPath(path)} className="sec-card">
            <span className="sec-card-ic" aria-hidden>
              {meta?.icon ?? '📁'}
            </span>
            <span className="sec-card-body">
              <span className="sec-card-name">{navLabel(path)}</span>
              <span className="sec-card-count">
                {filhos ? `${filhos} seções` : `${count} ${count === 1 ? 'item' : 'itens'}`}
              </span>
            </span>
          </Link>
        )
      })}
    </div>
  )
}

/** Cards menores das subpastas de uma FOLHA (ex.: Items → Armas, Armaduras…). */
function FolderCards({ folders }: { folders: FolderNode[] }) {
  if (!folders.length) return null
  return (
    <div className="type-grid">
      {folders.map((folder) => (
        <Link key={folder.path} to={compendiumFolderPath(folder.path)} className="type-card">
          <span className="type-card-name">{navLabel(folder.path)}</span>
          <span className="type-card-count">{visibleCount(folder)}</span>
        </Link>
      ))}
    </div>
  )
}

function Breadcrumb({ path }: { path: string }) {
  const segments = path.split('/')
  return (
    <nav className="breadcrumb">
      <Link to="/compendio">{TITLES.compendio}</Link>
      {segments.map((segment, i) => {
        const prefix = segments.slice(0, i + 1).join('/')
        const isLast = i === segments.length - 1
        // rótulo do registro (Equipamento → "Items"); senão o próprio segmento
        const label = navMeta(prefix)?.label ?? segment
        return (
          <Fragment key={prefix}>
            <span className="breadcrumb-sep">/</span>
            {isLast ? <span>{label}</span> : <Link to={compendiumFolderPath(prefix)}>{label}</Link>}
          </Fragment>
        )
      })}
    </nav>
  )
}

export function FolderView() {
  const splat = useParams()['*'] ?? ''
  const catalog = useCatalog()
  // #192: Modo Mestre pode alternar a lista pra visão TABELA por tipo
  const { mestre } = useSettings()
  const [tabela, setTabela] = useState(false)
  // #248: entidades locais (aventuras criadas no app) reagem ao store local.
  const localVersion = useLocalStoreVersion()
  const path = splat.replace(/\/+$/, '')
  const node = catalog.folderByPath.get(path)

  // identidade estável pro useEffect do DocTable
  const listDocs = useMemo(
    () => (node ? node.docs.filter((d) => d.basename !== node.name) : []),
    [node],
  )

  // #244: home e nós de navegação (Campanhas/Contexto/Histórias/Sistema)
  // mostram BOTÕES GRANDES dos filhos do registro — a árvore é explícita
  // (Diários/Criaturas ficam fora; "Equipamento" vira "Items").
  if (isNavNode(path)) {
    return (
      <section className="page">
        <div className="kicker">{COMPENDIO_KICKER}</div>
        {path ? <Breadcrumb path={path} /> : null}
        <SectionButtons paths={navChildren(path)} />
      </section>
    )
  }

  // pasta oculta com exceção visível dentro (#213: Grupos de Criaturas) é
  // PORTAL: navegável, mas sem listar os docs ocultos dela
  const portal = node && isHidden(path) && hasVisibleDescendant(node)
  if (!node || (isHidden(path) && !portal)) {
    return (
      <section className="page">
        <div className="kicker">{COMPENDIO_KICKER}</div>
        <p>Pasta não encontrada: {path}</p>
      </section>
    )
  }

  // folder note do Obsidian (basename = nome da pasta) é a página da própria
  // pasta, não um item da lista
  const indexDoc = node.docs.find((d) => d.basename === node.name)

  // colunas só quando a lista é homogênea e o tipo tem registro
  const vaultDocs = portal ? [] : listDocs
  const types = [...new Set(vaultDocs.map((d) => d.type ?? ''))]
  const directType = types.length === 1 ? types[0] : undefined
  // #267: uma folha pode declarar `subtree` no registro — aí a grade coleta os
  // docs desse tipo na SUBÁRVORE inteira (ex.: "Armas" não tem docs diretos, mas
  // a grade mostra TODAS as armas das subpastas, agrupadas). Detecta pela
  // subárvore quando ela é homogênea de um tipo cujo leaf-entry pede subtree.
  const subDocs = useMemo(
    () => (!node || portal ? [] : subtreeDocs(node)),
    [node, portal],
  )
  const subTypes = useMemo(() => [...new Set(subDocs.map((d) => d.type ?? ''))], [subDocs])
  const subHomoType = subTypes.length === 1 ? subTypes[0] : undefined
  const subLeaf = resolveLeafEntry(subHomoType)
  const useSubtree = !!subLeaf?.subtree && subDocs.length > vaultDocs.length
  const homogeneousType = useSubtree ? subHomoType : directType
  const columns = homogeneousType ? LIST_COLUMNS[homogeneousType] : undefined
  // Folha HOMOGÊNEA de um tipo com visualizador dedicado (ex.: Item → grade de
  // cartas; Aventura → grade de bounties). O registro pode declarar `localKind`
  // → entidades criadas no app entram na listagem junto das da vault (#248),
  // `creator` → afixo de criação (mestre-gated) acima da grade, e `subtree` →
  // achata as subpastas numa grade agrupada (#267).
  const leafEntry = resolveLeafEntry(homogeneousType)
  const localExtra =
    !portal && leafEntry?.localKind ? localEntriesOfKind(leafEntry.localKind) : []
  const baseDocs = useSubtree ? subDocs : vaultDocs
  const docsVisiveis = [...baseDocs, ...localExtra]
  const leafView = docsVisiveis.length > 0 ? (leafEntry?.view ?? null) : null
  const creator = leafEntry?.creator ?? null
  void localVersion // dep de recomputo (localExtra reage ao store local)

  return (
    <section className="page">
      <div className="kicker">{COMPENDIO_KICKER}</div>
      <Breadcrumb path={path} />
      <h1>
        {indexDoc && !portal ? <Link to={docPath(indexDoc.id)}>{navLabel(path)}</Link> : navLabel(path)}
      </h1>
      {/* #267: na grade agrupada por subárvore (Items), o agrupamento por
          categoria/grupo/subgrupo SUBSTITUI os cards de subpasta. */}
      {useSubtree ? null : <FolderCards folders={visibleFolders(node)} />}
      {/* #192: toggle da visão TABELA — só pro Mestre e quando há lista */}
      {mestre && docsVisiveis.length > 0 ? (
        <div style={{ margin: '10px 0' }}>
          <button
            type="button"
            aria-pressed={tabela}
            onClick={() => setTabela((v) => !v)}
            style={pillStyle(tabela)}
          >
            ⊞ TABELA
          </button>
        </div>
      ) : null}
      {/* #248: afixo de criação da folha (mestre-gated pelo próprio componente),
          acima da grade — ex.: "Criar Aventura" na folha Campanhas/Aventuras. */}
      {creator ? creator() : null}
      {mestre && tabela ? (
        <MestreTables entries={docsVisiveis} />
      ) : leafView ? (
        leafView(docsVisiveis)
      ) : (
        <DocTable entries={docsVisiveis} columns={columns} />
      )}
    </section>
  )
}
