// SIDEBAR DIREITA (#87) — duas faces: SESSÃO (personagem selecionado, persistido
// via #86) e DETALHES (conteúdo empurrado pelo DetailContext — doc do compêndio
// já; local/comércio em #89). Fixa no desktop; drawer no mobile.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCatalog } from '../../data/CatalogContext'
import { useAssetIndex } from '../../data/assets'
import { useDoc } from '../../data/useDoc'
import { useDetail } from '../../data/detail-context'
import { useSelectedCreature } from '../../data/selected-creature-store'
import { creatureImageUrl } from '../../data/creature-image'
import { linkLabel } from '../../markdown/dataview-value'
import { heroPath } from '../../paths'
import { DocView } from '../compendium/DocPage'

/** Face SESSÃO: quem está selecionado + atalho pra ficha. */
function SessionPanel({ onNavigate }: { onNavigate: () => void }) {
  const selectedId = useSelectedCreature()
  const catalog = useCatalog()
  const assets = useAssetIndex()
  const { doc } = useDoc(selectedId ?? '')
  if (!selectedId) {
    return <div className="detail-empty">Nenhum personagem selecionado.</div>
  }
  const nome = doc?.basename ?? catalog.entryById.get(selectedId)?.basename ?? selectedId
  const classe = linkLabel(doc?.frontmatter['Classe'])
  const nivel = doc?.frontmatter['Nível']
  const portrait = creatureImageUrl(doc, assets)
  return (
    <div className="session-panel">
      <div className="session-hero">
        {portrait ? (
          <div className="session-portrait" style={{ backgroundImage: `url("${portrait}")` }} />
        ) : (
          <div className="session-portrait session-portrait-empty" aria-hidden />
        )}
        <div style={{ minWidth: 0 }}>
          <div className="session-nome">{nome}</div>
          {classe ? (
            <div className="session-sub">
              {classe}
              {nivel ? ` · Nível ${nivel}` : ''}
            </div>
          ) : null}
        </div>
      </div>
      <Link className="session-open" to={heroPath(selectedId)} onClick={onNavigate}>
        Abrir ficha
      </Link>
    </div>
  )
}

function DocDetail({ id }: { id: string }) {
  const { doc } = useDoc(id)
  if (!doc) return <div className="loading">Carregando…</div>
  return <DocView doc={doc} />
}

/** Face DETALHES: renderiza o alvo atual do DetailContext. */
function DetailPanel({ onNavigate }: { onNavigate: () => void }) {
  const detail = useDetail()
  const target = detail?.target
  if (!target) {
    return <div className="detail-empty">Clique num link, item ou local pra ver os detalhes aqui.</div>
  }
  return (
    <div className="detail-panel" data-detail-kind={target.kind}>
      <div className="detail-panel-bar">
        {detail?.canBack ? (
          <button className="detail-back" onClick={() => detail.back()}>
            ‹ voltar
          </button>
        ) : (
          <span />
        )}
        {target.kind === 'doc' ? (
          <Link className="detail-fullscreen" to={`/doc/${target.id.split('/').map(encodeURIComponent).join('/')}`} onClick={onNavigate}>
            tela cheia ↗
          </Link>
        ) : null}
        <button className="detail-close" aria-label="Fechar detalhes" onClick={() => detail?.close()}>
          ×
        </button>
      </div>
      {target.kind === 'doc' ? (
        <DocDetail id={target.id} />
      ) : (
        <div className="detail-empty">(local/comércio: chega nesta sidebar no #89)</div>
      )}
    </div>
  )
}

export function RightSidebar({
  drawerOpen,
  onCloseDrawer,
}: {
  drawerOpen: boolean
  onCloseDrawer: () => void
}) {
  const detail = useDetail()
  const [tab, setTab] = useState<'sessao' | 'detalhes'>('sessao')
  const targetKey = detail?.target ? `${detail.target.kind}:${detail.target.id}` : null
  // algo abriu nos detalhes → foca a face DETALHES (e abre o drawer no mobile)
  useEffect(() => {
    if (targetKey) setTab('detalhes')
  }, [targetKey])

  return (
    <aside
      data-right-sidebar=""
      className={['sidebar-right', drawerOpen ? 'drawer-open' : ''].filter(Boolean).join(' ')}
    >
      <div className="sidebar-right-tabs">
        <button
          className={tab === 'sessao' ? 'srt active' : 'srt'}
          aria-pressed={tab === 'sessao'}
          onClick={() => setTab('sessao')}
        >
          SESSÃO
        </button>
        <button
          className={tab === 'detalhes' ? 'srt active' : 'srt'}
          aria-pressed={tab === 'detalhes'}
          onClick={() => setTab('detalhes')}
        >
          DETALHES
        </button>
        <button className="srt-close" aria-label="Fechar" onClick={onCloseDrawer}>
          ×
        </button>
      </div>
      <div className="sidebar-right-body">
        {tab === 'sessao' ? (
          <SessionPanel onNavigate={onCloseDrawer} />
        ) : (
          <DetailPanel onNavigate={onCloseDrawer} />
        )}
      </div>
    </aside>
  )
}
