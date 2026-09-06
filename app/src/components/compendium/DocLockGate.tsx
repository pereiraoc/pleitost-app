// SENHA POR AVENTURA — o portão (docs/plano-aventuras-na-sessao.md §2.5).
// Um doc com `protegido` (envelope cifrado) só mostra os campos da lista
// trancada + a Chamada e pede a senha; certa → o doc-lock guarda a chave e o
// useDoc passa a entregar o doc completo (este componente some sozinho). Em
// Modo Desenvolvedor tenta a chave do dev ao montar. Vocabulário visual dos
// Criadores do Modo Mestre (mestre/ui.tsx) — sem tela desenhada pra isto.
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import type { VaultDoc } from '../../data/types'
import { reskinName } from '../../data/reskin'
import { useCatalog } from '../../data/CatalogContext'
import { unlockWithDev, unlockWithSenha } from '../../data/doc-lock'
import { useSettings } from '../../settings'
import { aventuraConfig } from '../../aventura/config'
import { fmtAmount } from '../../markdown/bounty/parse-bounty'
import { COMPENDIO_KICKER } from '../layout/design-nav'
import { accentBtnStyle, clip, fieldInputStyle, fieldLabelStyle } from '../mestre/ui'

/** Valor exibível de um campo da lista trancada (string/número/faixa/lista). */
export function valorTrancado(v: unknown): string | null {
  if (v == null || v === '') return null
  if (Array.isArray(v)) return v.map(String).filter(Boolean).join(' · ') || null
  if (typeof v === 'object' && 'min' in (v as object)) return fmtAmount(v)
  return String(v)
}

/** Chips dos campos da lista trancada presentes no FM (menos a Chamada, que é o lead). */
export function TrancadoMeta({ doc, style }: { doc: VaultDoc; style?: CSSProperties }) {
  const catalog = useCatalog()
  const cfg = aventuraConfig(catalog.contextoDef)
  const itens = cfg.camposListaTrancada
    .filter((k) => k !== 'Chamada')
    .map((k) => ({ k, v: valorTrancado(doc.frontmatter[k]) }))
    .filter((x): x is { k: string; v: string } => x.v != null)
  if (!itens.length) return null
  return (
    <div className="av-trancado-meta" style={style}>
      {itens.map(({ k, v }) => (
        <span key={k} className="av-trancado-chip">
          <span className="av-trancado-chip-k">{k}</span>
          <span>{v}</span>
        </span>
      ))}
    </div>
  )
}

const boxStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  padding: '18px 20px',
  maxWidth: 560,
  background: 'var(--panel)',
  border: '1px solid var(--line2)',
  clipPath: clip(10),
}

export function DocLockGate({ doc, children }: { doc: VaultDoc; children: ReactNode }) {
  const { desenvolvedor } = useSettings()
  const [senha, setSenha] = useState('')
  const [lembrar, setLembrar] = useState(true)
  const [erro, setErro] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const trancado = !!doc.protegido

  // Modo Desenvolvedor: tudo destravado sem senha (chave do dev guardada no
  // Config). Falha silenciosa = doc extraído sem senha de dev → pede a senha.
  useEffect(() => {
    if (!trancado || !desenvolvedor) return
    void unlockWithDev(doc)
  }, [trancado, desenvolvedor, doc])

  if (!trancado) return <>{children}</>

  const destravar = async () => {
    if (!senha) return
    setOcupado(true)
    const ok = await unlockWithSenha(doc, senha, lembrar)
    setOcupado(false)
    setErro(!ok)
    if (ok) setSenha('')
  }
  const chamada = valorTrancado(doc.frontmatter['Chamada'])

  return (
    <section className="page aventura-page av-lock" data-doc-lock="">
      <div className="kicker">{COMPENDIO_KICKER}</div>
      <div style={boxStyle}>
        <div className="kicker">{'// AVENTURA TRANCADA 🔒'}</div>
        <h1 style={{ margin: 0, fontSize: 22 }}>{reskinName(doc.basename)}</h1>
        {chamada ? <p className="av-chamada">{chamada}</p> : null}
        <TrancadoMeta doc={doc} />
        <label>
          <span style={fieldLabelStyle}>SENHA DA AVENTURA</span>
          <input
            type="password"
            aria-label="Senha da aventura"
            value={senha}
            onChange={(e) => {
              setSenha(e.target.value)
              setErro(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void destravar()
            }}
            style={{ ...fieldInputStyle, width: '100%', borderColor: erro ? 'var(--red)' : undefined }}
          />
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5 }}>
          <input type="checkbox" checked={lembrar} onChange={(e) => setLembrar(e.target.checked)} />
          <span>Lembrar neste aparelho</span>
        </label>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            style={accentBtnStyle(!!senha && !ocupado)}
            disabled={!senha || ocupado}
            onClick={() => void destravar()}
          >
            {ocupado ? '…' : 'DESTRAVAR'}
          </button>
          {erro ? (
            <span role="alert" style={{ fontSize: 12, color: 'var(--red)' }}>
              senha incorreta
            </span>
          ) : null}
          {desenvolvedor ? (
            <span style={{ fontSize: 11.5, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
              {'// modo dev sem chave para este doc — use a senha'}
            </span>
          ) : null}
        </div>
      </div>
    </section>
  )
}
