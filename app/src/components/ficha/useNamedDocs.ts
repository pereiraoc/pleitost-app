// Resolve docs de REGRA do compêndio pelo NOME (perícia/defesa/sentido/ofício/
// categoria de equipamento/manobra). O tooltip desses campos é a REGRA em si
// (o doc do compêndio), não a fonte nem o rule-element (#105/#106).
import { useMemo } from 'react'
import { useCatalog } from '../../data/CatalogContext'
import { useDocs } from '../../data/useDoc'
import type { VaultDoc } from '../../data/types'

export function useNamedDocs(names: string[]): (name: string) => VaultDoc | undefined {
  const catalog = useCatalog()
  const key = names.join('|')
  const ids = useMemo(() => {
    const s = new Set<string>()
    for (const n of names) {
      const r = catalog.resolve(n)
      if (r.kind === 'doc') s.add(r.id)
    }
    return [...s]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, catalog])
  const docs = useDocs(ids)
  return (name: string) => {
    const r = catalog.resolve(name)
    return r.kind === 'doc' ? docs?.get(r.id) : undefined
  }
}
