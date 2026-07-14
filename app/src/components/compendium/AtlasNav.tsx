// Navegação do Atlas (#250, F6) — a faixa "o que dentro de o que" (breadcrumb,
// subir pela cadeia Geolocalização) + os lugares-filhos (descer). Fica no topo
// da ficha de Localização. O MAPA navegável (pedido AS-IS) espera o mapa-raiz da
// vault; até lá, esta navegação por breadcrumb+filhos entrega o "navegar entre
// lugares" — que é o fallback sem-mapa escolhido pelo usuário.
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import type { VaultDoc } from '../../data/types'
import { useCatalog } from '../../data/CatalogContext'
import { useDocs } from '../../data/useDoc'
import { docPath } from '../../paths'
import { LOCALIZACAO_TYPE, ancestorChain, buildAtlasIndex, type AtlasNode } from '../../data/atlas-nav'

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
  // não repetimos o nome. Pedido do usuário (#264): PEQUENO, logo abaixo do
  // título — só um fio de texto mono/muted, sem chip nem caixa, pouco espaço, pra
  // as infos da página ficarem "na mesma parte".
  const crumbs = chain.slice(0, -1)

  if (crumbs.length === 0 && children.length === 0) return null

  return (
    <nav
      data-atlas-nav=""
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
      {crumbs.length ? <span style={{ color: 'var(--line2)', fontSize: 11 }}>›</span> : null}

      {/* lugares-filhos: continuam na mesma linha, discretos, separados por · */}
      {children.length ? (
        <span
          style={{
            display: 'inline-flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 5,
            marginLeft: crumbs.length ? 10 : 0,
          }}
        >
          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.1em', color: 'var(--line2)' }}>
            AQUI:
          </span>
          {children.map((id, i) => (
            <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              {i > 0 ? <span style={{ color: 'var(--line2)' }}>·</span> : null}
              <Link
                to={docPath(id)}
                data-atlas-child={id}
                style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--accent)', textDecoration: 'none' }}
              >
                {nameOf(id)}
              </Link>
            </span>
          ))}
        </span>
      ) : null}
    </nav>
  )
}
