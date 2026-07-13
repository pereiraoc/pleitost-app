// REPORTAR BUG (#220) — botão especificado pelo usuário: "cria acima de onde
// tem HEROIS no painel da esquerda com fundo vermelho e ícone de bugs com
// nome 'REPORTAR BUG'. Quero que qualquer um consiga fazer." Abre um modal
// com textarea; o envio vai pro canal aberto de bug-report.ts (sem login).
import { useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { enviarBugReport } from '../../data/bug-report'
import { clip } from '../ficha/bits'

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 70,
  background: 'rgba(0,0,0,.55)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 20,
}

type Estado = 'editando' | 'enviando' | 'enviado' | 'erro'

export function BugReportButton({ onOpenChange }: { onOpenChange?: () => void }) {
  const [open, setOpen] = useState(false)
  const [texto, setTexto] = useState('')
  const [estado, setEstado] = useState<Estado>('editando')
  const [erro, setErro] = useState('')

  const fechar = () => {
    setOpen(false)
    setEstado('editando')
    setErro('')
  }

  const enviar = async () => {
    setEstado('enviando')
    try {
      await enviarBugReport(texto)
      setEstado('enviado')
      setTexto('')
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
      setEstado('erro')
    }
  }

  return (
    <>
      <button
        className="nav-item"
        onClick={() => {
          setOpen(true)
          onOpenChange?.()
        }}
        style={{
          background: 'var(--red)',
          color: '#fff',
          fontWeight: 700,
        }}
      >
        <span aria-hidden style={{ width: 18, textAlign: 'center' }}>
          🐞
        </span>
        <span className="nav-label">REPORTAR BUG</span>
      </button>
      {/* #221: o modal renderiza num PORTAL no body — dentro da sidebar o
          overflow:hidden + transform do drawer prendem o position:fixed e a
          caixa aparecia DENTRO do painel esquerdo. */}
      {open ? (
        createPortal(
        <div style={overlayStyle} onClick={fechar}>
          <div
            role="dialog"
            aria-label="Reportar bug"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(520px, 100%)',
              background: 'var(--panel)',
              border: '1px solid var(--line)',
              clipPath: clip(12),
              padding: '18px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span aria-hidden>🐞</span>
              <span style={{ fontWeight: 700, fontSize: 15, flex: 1 }}>Reportar bug</span>
              <button
                type="button"
                aria-label="Fechar"
                onClick={fechar}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--line2)',
                  color: 'var(--muted)',
                  cursor: 'pointer',
                  padding: '4px 10px',
                  fontSize: 13,
                }}
              >
                ✕
              </button>
            </div>
            {estado === 'enviado' ? (
              <>
                <div style={{ fontSize: 13.5 }}>
                  ✅ Reporte enviado — valeu! Vamos olhar e corrigir.
                </div>
                <button type="button" onClick={fechar} style={btnStyle(false)}>
                  FECHAR
                </button>
              </>
            ) : (
              <>
                <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                  Conta o que aconteceu (o que você fez, o que esperava e o que apareceu). A tela
                  atual e a versão do app vão junto automaticamente.
                </div>
                <textarea
                  aria-label="Descrição do bug"
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  rows={5}
                  placeholder="ex.: cliquei em X na ficha do meu herói e aconteceu Y…"
                  style={{
                    background: 'var(--card)',
                    border: '1px solid var(--line2)',
                    color: 'var(--text)',
                    fontFamily: 'inherit',
                    fontSize: 13,
                    padding: '10px 12px',
                    resize: 'vertical',
                  }}
                />
                {estado === 'erro' ? (
                  <div role="alert" style={{ color: 'var(--red)', fontSize: 12.5 }}>
                    {erro}
                  </div>
                ) : null}
                <button
                  type="button"
                  disabled={!texto.trim() || estado === 'enviando'}
                  onClick={() => void enviar()}
                  style={btnStyle(!texto.trim() || estado === 'enviando')}
                >
                  {estado === 'enviando' ? 'ENVIANDO…' : 'ENVIAR REPORTE'}
                </button>
              </>
            )}
          </div>
        </div>,
        document.body,
        )
      ) : null}
    </>
  )
}

function btnStyle(disabled: boolean): CSSProperties {
  return {
    padding: '10px 16px',
    background: disabled ? 'var(--card)' : 'var(--red)',
    border: '1px solid var(--line2)',
    color: disabled ? 'var(--muted)' : '#fff',
    fontWeight: 700,
    fontSize: 13,
    letterSpacing: '.04em',
    cursor: disabled ? 'default' : 'pointer',
    clipPath: clip(8),
  }
}
