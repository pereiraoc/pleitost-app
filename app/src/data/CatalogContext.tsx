import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { fetchCatalogForWorld, type Catalog } from './catalog'
import { useWorld } from './world'

const CatalogContext = createContext<Catalog | null>(null)

interface Props {
  children: ReactNode
  /** Injeção para testes; em produção o catálogo vem do mundo ativo. */
  catalog?: Catalog
}

export function CatalogProvider({ children, catalog }: Props) {
  const world = useWorld()
  const [state, setState] = useState<{ catalog?: Catalog; error?: Error }>(
    catalog ? { catalog } : {},
  )

  useEffect(() => {
    if (catalog) return
    let alive = true
    setState({})
    fetchCatalogForWorld(world).then(
      (loaded) => alive && setState({ catalog: loaded }),
      (error: Error) => alive && setState({ error }),
    )
    return () => {
      alive = false
    }
  }, [catalog, world])

  if (state.error) {
    return <p role="alert">Falha ao carregar o índice da vault: {state.error.message}</p>
  }
  if (!state.catalog) return <p className="loading">Carregando índice…</p>
  return (
    // key={world}: trocar de mundo REMONTA a subárvore inteira — todo estado
    // derivado do catálogo (projeções, refs, rotas de herói) renasce no mundo
    // novo (#519 C2)
    <CatalogContext.Provider key={world} value={state.catalog}>
      {state.catalog.worldDatasetAusente ? (
        <div
          role="status"
          style={{
            background: 'color-mix(in srgb, var(--accent) 18%, transparent)',
            borderBottom: '1px solid var(--line2)',
            padding: '6px 14px',
            fontSize: 12.5,
            textAlign: 'center',
          }}
        >
          Dataset do mundo ainda não publicado — mostrando o conteúdo base enquanto isso.
        </div>
      ) : null}
      {children}
    </CatalogContext.Provider>
  )
}

export function useCatalog(): Catalog {
  const catalog = useContext(CatalogContext)
  if (!catalog) throw new Error('useCatalog fora de <CatalogProvider>')
  return catalog
}
