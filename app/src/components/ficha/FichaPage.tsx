// FICHA DO HERÓI — casca da rota /heroi/<id>?tab=<aba>. As abas são as
// CHAR_TABS do design (sidebar contextual no AppShell); cada tela replica a
// seção correspondente do design puxado — SEM chrome extra: cada tela do
// design já tem sua própria estrutura (o PERFIL abre com o próprio topo de
// rank/retrato) e a volta pra lista de heróis é pela sidebar (HERÓIS).
import { useParams, useSearchParams } from 'react-router-dom'
import { useMemo } from 'react'
import { useDoc } from '../../data/useDoc'
import { useCatalog } from '../../data/CatalogContext'
import type { VaultDoc } from '../../data/types'
import { GrupoView } from '../../grupo/GrupoView'
import { wikiTarget } from './hero-model'
import { useHeroRefs } from './useHeroRefs'
import { PerfilTab } from './PerfilTab'
import { AnotacoesTab } from './AnotacoesTab'
import { HabilidadesTab } from './HabilidadesTab'
import { InventarioTab } from './InventarioTab'
import { CombateTab } from './CombateTab'

/** Aba GRUPO = ficha de grupo pronta (GrupoView) dos grupos do FM `grupo`. */
function GruposTab({ doc }: { doc: VaultDoc }) {
  const catalog = useCatalog()
  const groupIds = useMemo(() => {
    const raw = doc.grupo
    const list = Array.isArray(raw) ? raw : raw ? [raw] : []
    const ids: string[] = []
    for (const value of list) {
      const res = catalog.resolve(wikiTarget(value))
      if (res.kind === 'doc' && !ids.includes(res.id)) ids.push(res.id)
    }
    return ids
  }, [catalog, doc])

  if (!groupIds.length) {
    return (
      <div
        style={{
          padding: 50,
          textAlign: 'center',
          background: 'var(--panel)',
          border: '1px dashed var(--line2)',
          fontFamily: 'var(--mono)',
          fontSize: 12,
          letterSpacing: '.12em',
          color: 'var(--muted)',
        }}
      >
        {/* empty state verbatim do design (§NPCS) */}
        {'// NENHUM REGISTRO NESTA CATEGORIA'}
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      {groupIds.map((id) => (
        <GrupoView key={id} groupId={id} />
      ))}
    </div>
  )
}

export function FichaPage() {
  const params = useParams()
  const id = params['*'] ?? ''
  const [searchParams] = useSearchParams()
  const tab = searchParams.get('tab') ?? 'perfil'
  const { doc, error } = useDoc(id)
  const refs = useHeroRefs(doc)

  if (error) return <p role="alert">Herói não encontrado: {id}</p>
  if (!doc) return <p className="loading">Carregando ficha…</p>

  return (
    <div key={doc.id}>
      {tab === 'perfil' ? <PerfilTab doc={doc} /> : null}
      {tab === 'anotacoes' ? <AnotacoesTab doc={doc} /> : null}
      {tab === 'grupos' ? <GruposTab doc={doc} /> : null}
      {tab === 'habilidades' ? <HabilidadesTab doc={doc} refs={refs} /> : null}
      {tab === 'inventario' ? <InventarioTab doc={doc} refs={refs} /> : null}
      {tab === 'combate' ? <CombateTab doc={doc} refs={refs} /> : null}
    </div>
  )
}
