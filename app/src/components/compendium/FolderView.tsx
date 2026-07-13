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
import { compendiumSections, hasVisibleDescendant, isHidden, visibleCount, visibleFolders } from './sections'

function FolderCards({ folders }: { folders: FolderNode[] }) {
  if (!folders.length) return null
  return (
    <div className="type-grid">
      {folders.map((folder) => (
        <Link key={folder.path} to={compendiumFolderPath(folder.path)} className="type-card">
          <span className="type-card-name">{folder.name}</span>
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
        return (
          <Fragment key={prefix}>
            <span className="breadcrumb-sep">/</span>
            {isLast ? (
              <span>{segment}</span>
            ) : (
              <Link to={compendiumFolderPath(prefix)}>{segment}</Link>
            )}
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
  const path = splat.replace(/\/+$/, '')
  const node = catalog.folderByPath.get(path)

  // identidade estável pro useEffect do DocTable
  const listDocs = useMemo(
    () => (node ? node.docs.filter((d) => d.basename !== node.name) : []),
    [node],
  )

  // raiz: as seções registradas
  if (!path) {
    return (
      <section className="page">
        <div className="kicker">{COMPENDIO_KICKER}</div>
        <FolderCards folders={compendiumSections(catalog)} />
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
  const docsVisiveis = portal ? [] : listDocs
  const types = [...new Set(docsVisiveis.map((d) => d.type ?? ''))]
  const columns = types.length === 1 ? LIST_COLUMNS[types[0]] : undefined

  return (
    <section className="page">
      <div className="kicker">{COMPENDIO_KICKER}</div>
      <Breadcrumb path={path} />
      <h1>
        {indexDoc && !portal ? <Link to={docPath(indexDoc.id)}>{node.name}</Link> : node.name}
      </h1>
      <FolderCards folders={visibleFolders(node)} />
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
      {mestre && tabela ? (
        <MestreTables entries={docsVisiveis} />
      ) : (
        <DocTable entries={docsVisiveis} columns={columns} />
      )}
    </section>
  )
}
