// Painel Publicar/Exportar do Modo Dev (#252/#253, F8/F9) — na tela CONFIG,
// gated por `desenvolvedor`. Mostra quantos docs estão editados, PUBLICA os
// rascunhos locais no overlay compartilhado (Supabase, exige login) e EXPORTA os
// .md pra colar de volta no Obsidian (round-trip). Estilo no vocabulário do app.
import { useState, type CSSProperties } from 'react'
import { useLocalDraftVersion, allLocalDrafts } from '../../data/local-draft-store'
import { usePublishedOverlayVersion } from '../../data/published-overlay-store'
import {
  editedDocCount,
  publishAllDrafts,
  buildExportBundle,
  downloadExportBundle,
} from '../../data/dev-publish'
import { useSupabaseUser, loginGitHub } from '../../data/session-repo/auth-state'

const boxStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  padding: '14px 16px',
  background: 'var(--panel)',
  border: '1px dashed color-mix(in srgb,var(--accent) 45%,var(--line2))',
  clipPath: 'polygon(0 0,calc(100% - 8px) 0,100% 8px,100% 100%,8px 100%,0 calc(100% - 8px))',
}
const btn: CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 12,
  letterSpacing: '.04em',
  padding: '7px 14px',
  border: '1px solid var(--accent)',
  background: 'transparent',
  color: 'var(--accent)',
  cursor: 'pointer',
}
const btnMuted: CSSProperties = { ...btn, borderColor: 'var(--line2)', color: 'var(--text)' }

function stamp(): string {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
}

export function DevPublishPanel() {
  useLocalDraftVersion()
  usePublishedOverlayVersion()
  const user = useSupabaseUser()
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const localCount = Object.keys(allLocalDrafts()).length
  const total = editedDocCount()

  async function onPublish() {
    if (!user) {
      setMsg('Entre com o GitHub pra publicar.')
      return
    }
    setBusy('publish')
    setMsg(null)
    try {
      const n = await publishAllDrafts(user.nome)
      setMsg(n ? `Publicado: ${n} doc(s). Os jogadores já recebem.` : 'Nada local pra publicar.')
    } catch (e) {
      setMsg('Falha ao publicar: ' + (e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function onExport() {
    setBusy('export')
    setMsg(null)
    try {
      const bundle = await buildExportBundle()
      if (!bundle.length) {
        setMsg('Nada editado pra exportar.')
        return
      }
      downloadExportBundle(bundle, stamp())
      setMsg(`Exportado ${bundle.length} .md — aplique com \`node scripts/apply-edits.mjs\`.`)
    } catch (e) {
      setMsg('Falha ao exportar: ' + (e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <section data-dev-publish="" style={boxStyle}>
      <div className="kicker" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>{'// PUBLICAR / EXPORTAR'}</span>
        <span style={{ color: 'var(--accent)', fontSize: 9 }}>MODO DEV</span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
        {total === 0 ? (
          'Nenhum doc editado.'
        ) : (
          <>
            <b style={{ color: 'var(--text)' }}>{total}</b> doc(s) editado(s)
            {localCount > 0 ? (
              <>
                {' · '}
                <b style={{ color: 'var(--accent)' }}>{localCount}</b> em rascunho local (não publicado)
              </>
            ) : null}
          </>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {user ? (
          <button
            type="button"
            data-publish
            onClick={onPublish}
            disabled={busy !== null || localCount === 0}
            style={{ ...btn, opacity: busy || localCount === 0 ? 0.5 : 1 }}
          >
            {busy === 'publish' ? 'Publicando…' : `Publicar ${localCount} alteração(ões)`}
          </button>
        ) : (
          <button type="button" onClick={() => void loginGitHub()} style={btn}>
            Entrar com GitHub p/ publicar
          </button>
        )}
        <button
          type="button"
          data-export
          onClick={onExport}
          disabled={busy !== null || total === 0}
          style={{ ...btnMuted, opacity: busy || total === 0 ? 0.5 : 1 }}
        >
          {busy === 'export' ? 'Exportando…' : 'Exportar pro Obsidian'}
        </button>
      </div>

      {msg ? (
        <div data-dev-msg style={{ fontSize: 11, color: 'var(--muted)' }}>
          {msg}
        </div>
      ) : null}
      <div style={{ fontSize: 10, color: 'var(--muted)' }}>
        Publicar = manda o rascunho local pro compartilhado (todos recebem). Exportar = baixa os
        .md pra colar de volta no Obsidian (vault continua a fonte).
      </div>
    </section>
  )
}
