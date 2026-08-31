import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { fetchCatalogForWorld, type Catalog } from './catalog'
import { setActiveContexto } from './reskin'
import { useWorld } from './world'
import { useSettings } from '../settings'
import { loadGmBundle, clearGmBundle } from './gm-bundle'

const CatalogContext = createContext<Catalog | null>(null)

interface Props {
  children: ReactNode
  /** Injeção para testes; em produção o catálogo vem do mundo ativo. */
  catalog?: Catalog
}

export function CatalogProvider({ children, catalog }: Props) {
  const world = useWorld()
  const { mestre } = useSettings()
  const [state, setState] = useState<{ catalog?: Catalog; error?: Error }>(
    catalog ? { catalog } : {},
  )

  useEffect(() => {
    if (catalog) {
      // Injeção de teste: reskin acompanha o catálogo injetado (default: off).
      setActiveContexto(catalog.contextoDef ?? null)
      return
    }
    let alive = true
    setState({})
    // Espelho do MESTRE antes do catálogo: loadDoc consulta gmDoc() síncrono,
    // então o bundle precisa estar residente quando os filhos montarem.
    const preparo = mestre ? loadGmBundle(world) : (clearGmBundle(), Promise.resolve(null))
    preparo
      .then(() => fetchCatalogForWorld(world, mestre))
      .then(
      (loaded) => {
        if (!alive) return
        // #519: ativa o reskin do mundo ANTES dos filhos renderizarem —
        // funciona também em cache-hit (o def viaja dentro do Catalog).
        setActiveContexto(loaded.contextoDef ?? null)
        setState({ catalog: loaded })
      },
      (error: Error) => alive && setState({ error }),
    )
    return () => {
      alive = false
    }
  }, [catalog, world, mestre])

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
