import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useCatalog } from '../../data/CatalogContext'
import { useDoc } from '../../data/useDoc'
import { DocView } from './DocPage'
import { resolveDocView } from './doc-view-registry'
import type { FolderNode } from '../../data/catalog'
import { compendiumFolderPath, docPath } from '../../paths'
import { useSettings } from '../../settings'
import { COMPENDIO_KICKER, TITLES } from '../layout/design-nav'
import { DocTable } from './DocTable'
import { LIST_COLUMNS } from './list-columns'
import { MestreTables, pillStyle } from './MestreTables'
import { hasVisibleDescendant, isHidden, subtreeDocs, visibleCount, visibleFolders } from './sections'
import { isNavNode, navAncestors, navChildren, navIconPath, navLabel, navMeta } from './compendio-registry'
import { resolveLeafEntry } from './leaf-view-registry'
import { localEntriesOfKind, useLocalStoreVersion } from '../../data/local-entities'
import { MarkdownBody } from '../../markdown/MarkdownBody'
import { folderNoteHasBody } from '../../markdown/folder-note-body'
// SIDE-EFFECT: registra os visualizadores de folha (Item → grade de cartas).
// Mesmo barrel que o DocPage carrega; a importação aqui garante o registro
// mesmo que a folha seja alcançada sem passar por um doc antes.
import './register-doc-views'

/** Ícone da navegação do compêndio no estilo da sidebar (#270): <svg> lucide-like
 *  do registro; cai no emoji só se um path não tiver path SVG. */
function CompendioIcon({ path, emoji }: { path: string; emoji?: string }) {
  const svg = navIconPath(path)
  if (!svg) return <>{emoji ?? '📁'}</>
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

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
              <CompendioIcon path={path} emoji={meta?.icon} />
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
  // #269: a trilha segue a árvore LÓGICA de navegação (fonte de verdade), não as
  // pastas cruas da vault — some "Tesouros" (achatado) e o pai de Consumíveis
  // vira "Items", como o usuário montou manualmente.
  const crumbs = navAncestors(path)
  return (
    <nav className="breadcrumb">
      <Link to="/compendio">{TITLES.compendio}</Link>
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1
        return (
          <Fragment key={crumb}>
            <span className="breadcrumb-sep">/</span>
            {isLast ? (
              <span>{navLabel(crumb)}</span>
            ) : (
              <Link to={compendiumFolderPath(crumb)}>{navLabel(crumb)}</Link>
            )}
          </Fragment>
        )
      })}
    </nav>
  )
}

/**
 * #272: nota-da-pasta (folder note do Obsidian, basename = nome da pasta). Se ela
 * tem VIEW DEDICADA (Localização → LocationSheet, Habilidade/Regra → Criacao/
 * RegraView…), renderiza o CONTEÚDO dela embutido — o usuário via só o "o que tem
 * dentro" e não as infos da nota (ex.: Atlas/Mundo Livre). A nota-índice genérica
 * (type null, corpo é uma query dataview) NÃO é embutida — só duplicaria a
 * listagem —, aí fica o título linkável de sempre. A listagem da pasta segue
 * abaixo nos dois casos.
 */
function FolderNote({
  id,
  fallbackTitle,
  listing,
}: {
  id: string
  fallbackTitle: string
  listing: ReactNode
}) {
  const { doc } = useDoc(id)
  const dedicated = doc != null && resolveDocView(doc) !== null
  if (!doc || !dedicated) {
    // #275: folder-note GENÉRICA (type null, sem view dedicada). Se, removidos o
    // heading-título e os fences da listagem (dataview), sobra prosa/transclusões,
    // renderiza o CORPO da nota (com as transclusões resolvidas) ACIMA da lista.
    // Notas-índice que são SÓ dataview não têm corpo útil → só título + lista.
    const showBody = doc != null && folderNoteHasBody(doc)
    return (
      <>
        <h1>
          <Link to={docPath(id)}>{fallbackTitle}</Link>
        </h1>
        {showBody ? <MarkdownBody doc={doc} hideLeadingTitle context="folder-note" /> : null}
        {listing}
      </>
    )
  }
  return (
    <>
      <DocView doc={doc} embedded />
      {listing}
    </>
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
  // NÃO usar useMemo aqui: estão DEPOIS dos early returns (isNavNode/!node), o
  // que mudaria o nº de hooks entre renders → React #310. São computações puras
  // baratas (a subárvore já está em memória); rodar por render é ok.
  const subDocs = !node || portal ? [] : subtreeDocs(node)
  const subTypes = [...new Set(subDocs.map((d) => d.type ?? ''))]
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

  // "O que tem dentro" da pasta: cards de subpasta + toggle mestre + creator +
  // grade/tabela. Extraído pra variável porque a nota-da-pasta (#272) o renderiza
  // ABAIXO do conteúdo dela — nos dois ramos é o mesmo bloco.
  const childrenListing = (
    <>
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
    </>
  )

  return (
    <section className="page">
      <div className="kicker">{COMPENDIO_KICKER}</div>
      <Breadcrumb path={path} />
      {indexDoc && !portal ? (
        <FolderNote id={indexDoc.id} fallbackTitle={navLabel(path)} listing={childrenListing} />
      ) : (
        <>
          <h1>{navLabel(path)}</h1>
          {childrenListing}
        </>
      )}
    </section>
  )
}
