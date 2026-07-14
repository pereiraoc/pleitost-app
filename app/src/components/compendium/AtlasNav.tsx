// Navegação do Atlas (#250, F6) — a faixa "o que dentro de o que" (breadcrumb,
// subir pela cadeia Geolocalização) + os lugares-filhos (descer). Fica no topo
// da ficha de Localização. O MAPA navegável (pedido AS-IS) espera o mapa-raiz da
// vault; até lá, esta navegação por breadcrumb+filhos entrega o "navegar entre
// lugares" — que é o fallback sem-mapa escolhido pelo usuário.
import { useMemo, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import type { VaultDoc } from '../../data/types'
import { useCatalog } from '../../data/CatalogContext'
import { useDocs } from '../../data/useDoc'
import { docPath } from '../../paths'
import { LOCALIZACAO_TYPE, ancestorChain, buildAtlasIndex, type AtlasNode } from '../../data/atlas-nav'

const chipStyle: CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 11,
  padding: '3px 9px',
  border: '1px solid var(--line2)',
  color: 'var(--muted)',
  textDecoration: 'none',
  clipPath: 'polygon(0 0,calc(100% - 4px) 0,100% 4px,100% 100%,4px 100%,0 calc(100% - 4px))',
}

export function AtlasNav({ doc }: { doc: VaultDoc }) {
  const catalog = useCatalog()
  const localIds = useMemo(
    () => (catalog.docsByType.get(LOCALIZACAO_TYPE) ?? []).map((e) => e.id),
    [catalog],
  )
  const docs = useDocs(localIds)
  const nameOf = (id: string) => catalog.entryById.get(id)?.basename ?? id.split('/').pop() ?? id

  const { chain, children } = useMemo(() => {
    if (!docs) return { chain: [{ id: doc.id, basename: doc.basename }] as AtlasNode[], children: [] as string[] }
    const { parentOf, childrenOf } = buildAtlasIndex(docs.values(), catalog)
    return {
      chain: ancestorChain(doc.id, parentOf, nameOf),
      children: (childrenOf.get(doc.id) ?? []).sort((a, b) => nameOf(a).localeCompare(nameOf(b))),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docs, catalog, doc.id, doc.basename])

  // breadcrumb = caminho ATÉ aqui (ancestrais); o lugar atual já é o <h1>, então
  // não repetimos o nome (evita duplicar e polui menos).
  const crumbs = chain.slice(0, -1)

  if (crumbs.length === 0 && children.length === 0) return null

  return (
    <nav data-atlas-nav="" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {crumbs.length ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
          <span className="kicker" style={{ fontSize: 9 }}>
            {'// ATLAS'}
          </span>
          {crumbs.map((node, i) => (
            <span key={node.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {i > 0 ? <span style={{ color: 'var(--line2)' }}>›</span> : null}
              <Link to={docPath(node.id)} style={chipStyle} data-atlas-crumb={node.id}>
                {node.basename}
              </Link>
            </span>
          ))}
          <span style={{ color: 'var(--line2)' }}>›</span>
        </div>
      ) : null}

      {/* lugares aqui dentro (descer) */}
      {children.length ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
          <span className="kicker" style={{ fontSize: 9 }}>
            {'// LUGARES AQUI'}
          </span>
          {children.map((id) => (
            <Link key={id} to={docPath(id)} style={chipStyle} data-atlas-child={id}>
              {nameOf(id)}
            </Link>
          ))}
        </div>
      ) : null}
    </nav>
  )
}
