// FICHA DO HERÓI — casca da rota /heroi/<id>?tab=<aba>. As abas são as
// CHAR_TABS do design (sidebar contextual no AppShell); cada tela replica a
// seção correspondente do design puxado — SEM chrome extra: cada tela do
// design já tem sua própria estrutura (o PERFIL abre com o próprio topo de
// rank/retrato) e a volta pra lista de heróis é pela sidebar (HERÓIS).
import { useParams, useSearchParams } from 'react-router-dom'
import { useMemo } from 'react'
import { useDoc } from '../../data/useDoc'
import { useCatalog } from '../../data/CatalogContext'
import { useHeroModel } from '../../data/useHeroModel'
import type { VaultDoc } from '../../data/types'
import { GrupoView } from '../../grupo/GrupoView'
import { clip } from './bits'
import { str, wikiTarget } from './hero-model'
import { useHeroRefs } from './useHeroRefs'
import { PerfilTab } from './PerfilTab'
import { AnotacoesTab } from './AnotacoesTab'
import { HabilidadesTab } from './HabilidadesTab'
import { InventarioTab } from './InventarioTab'
import { CombateTab } from './CombateTab'

/** Aba GRUPO = ficha do GRUPO ATIVO (issue #8): herói em 2+ grupos mostra UMA
 *  ficha por vez, com o seletor "Grupo Ativo" no topo; a escolha persiste por
 *  herói no overlay (session `grupos.ativo` do hero-store — estado de UI sem
 *  home no FM, sobrevive a reload). */
function GruposTab({ doc }: { doc: VaultDoc }) {
  const catalog = useCatalog()
  const model = useHeroModel(doc, 'grupos')
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
  // Escolha salva só vale enquanto o herói continuar naquele grupo.
  const salvo = str(model.session('grupos.ativo'))
  const ativo = groupIds.includes(salvo) ? salvo : groupIds[0]

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
    // .grupo-screen = segundo contentPad da tela GRUPO desenhada (dc.html:1108).
    <div className="grupo-screen" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div
        style={{
          maxWidth: 1180,
          margin: '0 auto',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        {/* Rótulo pedido pelo user (#8); estilo mono dos títulos do design. */}
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '.12em',
            color: 'var(--muted)',
            flex: 'none',
          }}
        >
          GRUPO ATIVO
        </span>
        {/* Pill de select desenhado — verbatim do padrão de select do design
            (Companion App.dc.html:636, armadura/escudo do inventário). */}
        <span
          style={{
            flex: '0 1 auto',
            minWidth: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            background: 'var(--card)',
            border: '1px solid var(--line2)',
            clipPath: clip(7),
          }}
        >
          <select
            value={ativo}
            onChange={(e) => model.setSession('grupos.ativo', e.target.value, 'imediato')}
            aria-label="Grupo Ativo"
            style={{
              appearance: 'none',
              WebkitAppearance: 'none',
              background: 'transparent',
              border: 'none',
              color: 'var(--blue)',
              fontSize: 14,
              fontWeight: 600,
              fontFamily: 'inherit',
              cursor: 'pointer',
              outline: 'none',
              flex: '0 1 auto',
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {groupIds.map((id) => (
              <option key={id} value={id}>
                {catalog.entryById.get(id)?.basename ?? id}
              </option>
            ))}
          </select>
          <span style={{ color: 'var(--muted)', fontSize: 10 }}>▾</span>
        </span>
      </div>
      <GrupoView key={ativo} groupId={ativo} />
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
