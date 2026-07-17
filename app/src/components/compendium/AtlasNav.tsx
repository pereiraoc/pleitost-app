// Navegação do Atlas (#250, F6) — a hierarquia de lugares vem do FM
// `Geolocalização`. Feedback do mestre: o breadcrumb no topo deve mostrar SÓ o
// CAMINHO (onde está dentro das pastas), sem os lugares-filhos misturados ali
// (confundia "onde estou" com "o que tem dentro"). Os filhos viram uma LISTA
// "Lugares dentro de X" na aba DETALHES (mais abaixo). O mapa navegável (AS-IS)
// espera o mapa-raiz da vault; até lá, breadcrumb + lista de filhos.
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import type { VaultDoc } from '../../data/types'
import { useCatalog } from '../../data/CatalogContext'
import { useDocs } from '../../data/useDoc'
import { docPath } from '../../paths'
import { LOCALIZACAO_TYPE, ancestorChain, buildAtlasIndex, type AtlasNode } from '../../data/atlas-nav'

export interface AtlasRelations {
  /** Ancestrais (caminho ATÉ o lugar atual, sem incluí-lo). */
  crumbs: AtlasNode[]
  /** Ids dos lugares-filhos (um nível abaixo), já ordenados por nome. */
  children: string[]
  nameOf: (id: string) => string
}

/** Relações do Atlas pro lugar atual — breadcrumb (subir) + filhos (descer).
 *  Carrega o lote de Localizações uma vez (useDocs cacheia). */
export function useAtlasRelations(doc: VaultDoc): AtlasRelations {
  const catalog = useCatalog()
  const localIds = useMemo(
    () => (catalog.docsByType.get(LOCALIZACAO_TYPE) ?? []).map((e) => e.id),
    [catalog],
  )
  const docs = useDocs(localIds)
  const nameOf = (id: string) => catalog.entryById.get(id)?.basename ?? id.split('/').pop() ?? id

  return useMemo(() => {
    if (!docs) return { crumbs: [], children: [], nameOf }
    const { parentOf, childrenOf } = buildAtlasIndex(docs.values(), catalog)
    const chain = ancestorChain(doc.id, parentOf, nameOf)
    const children = (childrenOf.get(doc.id) ?? []).slice().sort((a, b) => nameOf(a).localeCompare(nameOf(b)))
    return { crumbs: chain.slice(0, -1), children, nameOf }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docs, catalog, doc.id])
}

/** Breadcrumb do topo — SÓ o caminho (ancestrais). Sem filhos/irmãos aqui:
 *  um fio de texto mono/muted logo abaixo do título, pra deixar claro onde
 *  o lugar está dentro das pastas. */
export function AtlasBreadcrumb({ crumbs }: { crumbs: AtlasNode[] }) {
  if (crumbs.length === 0) return null
  return (
    <nav
      data-atlas-nav=""
      aria-label="Caminho no Atlas"
      style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 5, marginTop: -4 }}
    >
      {crumbs.map((node, i) => (
        <span key={node.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          {i > 0 ? <span style={{ color: 'var(--line2)', fontSize: 11 }}>›</span> : null}
          <Link
            to={docPath(node.id)}
            data-atlas-crumb={node.id}
            style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--muted)', textDecoration: 'none' }}
          >
            {node.basename}
          </Link>
        </span>
      ))}
    </nav>
  )
}

/** "Lugares dentro de X" — a lista dos lugares-filhos, na aba DETALHES (descer
 *  na hierarquia). Fica separada do breadcrumb pra não confundir onde-estou com
 *  o-que-tem-dentro. Nada a mostrar → não renderiza. */
export function AtlasChildren({
  doc,
  children,
  nameOf,
}: {
  doc: VaultDoc
  children: string[]
  nameOf: (id: string) => string
}) {
  if (children.length === 0) return null
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.12em', color: 'var(--muted)' }}>
        {`// LUGARES DENTRO DE ${doc.basename.toUpperCase()} · ${children.length}`}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {children.map((id) => (
          <Link
            key={id}
            to={docPath(id)}
            data-atlas-child={id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              padding: '9px 12px',
              background: 'var(--panel)',
              border: '1px solid var(--line2)',
              color: 'var(--text)',
              textDecoration: 'none',
              clipPath: 'polygon(0 0,calc(100% - 9px) 0,100% 9px,100% 100%,9px 100%,0 calc(100% - 9px))',
            }}
          >
            <span style={{ color: 'var(--accent)', fontSize: 13 }}>📍</span>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600 }}>{nameOf(id)}</span>
            <span style={{ color: 'var(--muted)', fontSize: 14 }}>→</span>
          </Link>
        ))}
      </div>
    </section>
  )
}
