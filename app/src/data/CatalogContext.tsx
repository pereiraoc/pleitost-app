import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { fetchCatalog, type Catalog } from './catalog'

const CatalogContext = createContext<Catalog | null>(null)

interface Props {
  children: ReactNode
  /** Injeção para testes; em produção o catálogo vem de fetchCatalog(). */
  catalog?: Catalog
}

export function CatalogProvider({ children, catalog }: Props) {
  const [state, setState] = useState<{ catalog?: Catalog; error?: Error }>(
    catalog ? { catalog } : {},
  )

  useEffect(() => {
    if (catalog) return
    let alive = true
    fetchCatalog().then(
      (loaded) => alive && setState({ catalog: loaded }),
      (error: Error) => alive && setState({ error }),
    )
    return () => {
      alive = false
    }
  }, [catalog])

  if (state.error) {
    return <p role="alert">Falha ao carregar o índice da vault: {state.error.message}</p>
  }
  if (!state.catalog) return <p className="loading">Carregando índice…</p>
  return <CatalogContext.Provider value={state.catalog}>{children}</CatalogContext.Provider>
}

export function useCatalog(): Catalog {
  const catalog = useContext(CatalogContext)
  if (!catalog) throw new Error('useCatalog fora de <CatalogProvider>')
  return catalog
}
