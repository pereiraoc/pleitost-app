// ABA MURAL da sidebar de SESSÃO (2026-10-04): as imagens que o MESTRE mandou
// pros jogadores verem — um mural por sessão (`state.mural`). Mais nova
// primeiro; clicar amplia. O mestre tira com ×; põe com o 📌 MURAL das figuras
// (FiguraStrip / Lightbox). Imagem pública vem do manifesto (VaultImage pelo
// alvo); cifrada vem da url do Storage (o jogador não tem a chave).
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import type { MuralItem } from '../../data/session-repo/contract'
import { getLiveSession, useLiveSelector } from '../../data/session-repo/live-session'
import { useSessionRepo } from '../../data/session-repo/provider'
import { useIsSessionMestre } from '../../data/session-mestre'
import { removerDoMural } from '../../data/session-repo/mural-actions'
import { VaultImage } from '../compendium/VaultImage'
import { Lightbox } from '../Lightbox'
import { clip } from '../ficha/bits'

const mono = (extra: CSSProperties = {}): CSSProperties => ({ fontFamily: 'var(--mono)', ...extra })

export function MuralPanel() {
  const temSala = useLiveSelector((l) => !!l?.sessionId)
  const mural = useLiveSelector((l) => l?.state?.mural)
  const { roleMestre } = useIsSessionMestre()
  const repo = useSessionRepo()
  const [erro, setErro] = useState<string | null>(null)
  const itens = useMemo(() => [...(mural ?? [])].sort((a, b) => b.em.localeCompare(a.em)), [mural])

  const tirar = async (id: string) => {
    const live = getLiveSession()
    if (!repo || !live) return
    setErro(null)
    try {
      await removerDoMural(repo, live, id)
    } catch (err) {
      setErro(`não deu pra tirar do mural: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return (
    <div data-mural-panel="" style={{ maxWidth: 1180, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={mono({ fontSize: 11, letterSpacing: '.12em', color: 'var(--muted)' })}>// MURAL DA SESSÃO</div>
      {!temSala ? (
        <Vazio>O mural precisa da sessão conectada ao servidor.</Vazio>
      ) : itens.length === 0 ? (
        <Vazio>
          O mural está vazio.
          {roleMestre ? ' Pra mostrar uma imagem aos jogadores, use 📌 MURAL numa imagem (figuras da aventura ou imagem ampliada).' : ' Quando o mestre mostrar uma imagem, ela aparece aqui.'}
        </Vazio>
      ) : (
        <div className="mural-lista">
          {itens.map((m) => (
            <ItemMural key={m.id} item={m} onTirar={roleMestre && repo ? () => void tirar(m.id) : undefined} />
          ))}
        </div>
      )}
      {erro ? (
        <div role="alert" style={mono({ fontSize: 11, color: 'var(--red)', letterSpacing: '.04em' })}>
          {erro}
        </div>
      ) : null}
    </div>
  )
}

function Vazio({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        padding: '14px 18px',
        background: 'var(--panel)',
        border: '1px dashed var(--line2)',
        clipPath: clip(10),
        color: 'var(--muted)',
        fontSize: 13,
        lineHeight: 1.45,
      }}
    >
      {children}
    </div>
  )
}

function ItemMural({ item, onTirar }: { item: MuralItem; onTirar?: () => void }) {
  const [aberto, setAberto] = useState(false)
  const legenda = item.legenda ?? item.target ?? ''
  return (
    <figure className="mural-item" data-mural-item={item.id}>
      {item.url ? (
        <>
          <img className="mural-item-img" src={item.url} alt={legenda} loading="lazy" style={{ cursor: 'zoom-in' }} onClick={() => setAberto(true)} />
          {aberto ? <Lightbox src={item.url} alt={legenda} onClose={() => setAberto(false)} /> : null}
        </>
      ) : item.target ? (
        <VaultImage target={item.target} className="mural-item-img" zoom thumb legenda={item.legenda} />
      ) : null}
      {item.legenda ? <figcaption className="mural-item-legenda">{item.legenda}</figcaption> : null}
      {onTirar ? (
        <button type="button" className="mural-item-tirar" aria-label={`Tirar do mural: ${legenda}`} title="Tirar do mural" onClick={onTirar}>
          ×
        </button>
      ) : null}
    </figure>
  )
}
