// SIDEBAR DIREITA (#87) — duas faces: SESSÃO (personagem selecionado, persistido
// via #86) e DETALHES (conteúdo empurrado pelo DetailContext — doc do compêndio
// já; local/comércio em #89). Fixa no desktop; drawer no mobile.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useDoc } from '../../data/useDoc'
import { useDetail } from '../../data/detail-context'
import { DocView } from '../compendium/DocPage'
import { SessaoPage } from '../sessao/SessaoPage'
import { LocalDetail } from '../detail/LocalDetail'
import { ResumoDetail } from '../detail/ResumoDetail'
import { CommerceDetail } from '../detail/CommerceDetail'

function DocDetail({ id }: { id: string }) {
  const { doc } = useDoc(id)
  if (!doc) return <div className="loading">Carregando…</div>
  return <DocView doc={doc} sidebar />
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
      ) : target.kind === 'local' ? (
        <LocalDetail id={target.id} />
      ) : target.kind === 'resumo' ? (
        <ResumoDetail id={target.id} />
      ) : (
        <CommerceDetail id={target.id} />
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
        {/* SESSÃO inteira vive AQUI (decisão do usuário): lista/criar/entrar,
            iniciativa e detalhes — o nav esquerdo não tem mais SESSÃO. */}
        {tab === 'sessao' ? <SessaoPage /> : <DetailPanel onNavigate={onCloseDrawer} />}
      </div>
    </aside>
  )
}
