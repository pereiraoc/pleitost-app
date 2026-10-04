// ESCUDO DO MESTRE — sub-aba CENA (fase 2): a cena ATUAL da aventura em curso
// na mesa (state.aventura, formato de aventura), pra o mestre ler pra mesa
// sem sair do escudo: título/tipo, blocos 🔊, personagens e locais da cena
// (cards de registro), combates referenciados e os blocos de combate da cena
// (PREPARAR / + iniciativa) — o MESMO CenaBlock da página da aventura, sempre
// aberto. Navegação ANTERIOR/PRÓXIMA grava a cena atual na sessão
// (irParaCena); Abertura = cena null; a aventura trancada neste aparelho
// manda pro compêndio destravar (a senha nunca passa por aqui). Carga da
// aventura: useAventuraEmCurso (compartilhado com NOTAS); figuras cifradas
// resolvem via ArquivosCifradosProvider, como na DocPage.
import type { CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { reskinName } from '../../../data/reskin'
import { ArquivosCifradosProvider } from '../../../data/arquivos-cifrados'
import type { VaultDoc } from '../../../data/types'
import { useSessionRepo } from '../../../data/session-repo/provider'
import { useLiveSession } from '../../../data/session-repo/live-session'
import { irParaCena } from '../../../aventura/session-actions'
import { useAventuraEmCurso } from '../../../aventura/use-aventura-em-curso'
import { docPath } from '../../../paths'
import { clip } from '../../ficha/bits'
import { MarkdownBody } from '../../../markdown/MarkdownBody'
import { CenaBlock } from '../../compendium/aventura/CenaBlock'
import { FieldBlock } from '../../compendium/FieldBlock'
import { InlineFieldValue } from '../../compendium/InlineFieldValue'

const mono = (extra: CSSProperties = {}): CSSProperties => ({ fontFamily: 'var(--mono)', ...extra })

export function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-escudo-cena-aviso=""
      style={{
        padding: 32,
        textAlign: 'center',
        background: 'var(--panel)',
        border: '1px dashed var(--line2)',
        fontFamily: 'var(--mono)',
        fontSize: 12,
        letterSpacing: '.12em',
        color: 'var(--muted)',
        clipPath: clip(12),
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
      }}
    >
      {children}
    </div>
  )
}

const btn = (disabled: boolean): CSSProperties =>
  mono({
    padding: '6px 12px',
    background: disabled ? 'transparent' : 'color-mix(in srgb,var(--accent) 12%,transparent)',
    border: `1px solid ${disabled ? 'var(--line2)' : 'color-mix(in srgb,var(--accent) 45%,var(--line2))'}`,
    color: disabled ? 'var(--muted)' : 'var(--accent)',
    cursor: disabled ? 'default' : 'pointer',
    fontSize: 10,
    letterSpacing: '.1em',
    clipPath: clip(5),
  })

/** Sem aventura na mesa — o mesmo aviso pra todo painel do escudo que lê a aventura. */
export function SemAventura() {
  return <Aviso>{'// NENHUMA AVENTURA EM CURSO — abra a aventura no compêndio e use "▶ Iniciar na sessão"'}</Aviso>
}

/** Aventura trancada neste aparelho: manda pro compêndio destravar (a senha
 *  nunca passa pelo escudo). */
export function AventuraTrancada({ doc }: { doc: VaultDoc }) {
  const navigate = useNavigate()
  return (
    <Aviso>
      <span data-escudo-cena-trancada="">{`// ${reskinName(doc.basename).toUpperCase()} ESTÁ TRANCADA NESTE APARELHO`}</span>
      <button type="button" onClick={() => navigate(docPath(doc.id))} style={btn(false)}>
        ABRIR A AVENTURA PRA DESTRAVAR ↗
      </button>
    </Aviso>
  )
}

export function SubCena() {
  const repo = useSessionRepo()
  const live = useLiveSession()
  const navigate = useNavigate()
  const { av, doc, locked, model, cfg } = useAventuraEmCurso()
  if (!av) return <SemAventura />
  if (!doc) return <div className="loading">Carregando aventura…</div>
  if (locked || !model) return <AventuraTrancada doc={doc} />
  const nome = reskinName(doc.basename)
  // posição: null = Abertura; senão o índice da cena atual
  const idx = av.cenaAtual ? model.cenas.findIndex((c) => c.slug === av.cenaAtual) : -1
  const cena = idx >= 0 ? model.cenas[idx]! : null
  const anterior = idx > 0 ? model.cenas[idx - 1]!.slug : null
  const temAnterior = idx >= 0 // da cena 1 volta pra Abertura (null)
  const proxima = idx + 1 < model.cenas.length ? model.cenas[idx + 1]!.slug : null
  const podeNavegar = !!repo && !!live
  const ir = (slug: string | null) => {
    if (!podeNavegar) return
    void irParaCena(repo!, live!, slug)
  }
  return (
    <ArquivosCifradosProvider doc={doc}>
    <div data-escudo-sub="cena" data-escudo-cena-atual={cena?.slug ?? 'abertura'} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
          padding: '10px 14px',
          background: 'var(--panel)',
          border: '1px solid var(--line2)',
          clipPath: clip(10),
        }}
      >
        <span style={mono({ fontSize: 10, letterSpacing: '.14em', color: 'var(--muted)' })}>{'// AVENTURA'}</span>
        <button
          type="button"
          onClick={() => navigate(docPath(doc.id))}
          title="Abrir a aventura no compêndio"
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}
        >
          {nome} ↗
        </button>
        <span style={{ flex: 1 }} />
        <button type="button" data-escudo-cena-anterior="" disabled={!temAnterior || !podeNavegar} onClick={() => ir(anterior)} style={btn(!temAnterior || !podeNavegar)}>
          ◀ ANTERIOR
        </button>
        <span style={mono({ fontSize: 10, color: 'var(--muted)' })}>
          {cena ? `${cfg.secoes.cena.toUpperCase()} ${cena.n} / ${model.cenas.length}` : cfg.secoes.abertura.toUpperCase()}
        </span>
        <button type="button" data-escudo-cena-proxima="" disabled={!proxima || !podeNavegar} onClick={() => ir(proxima)} style={btn(!proxima || !podeNavegar)}>
          PRÓXIMA ▶
        </button>
      </div>
      {cena ? (
        <div className="av-formato" data-av-formato="escudo">
          <div className="av-cenas">
            <CenaBlock cena={cena} model={model} doc={doc} aberta onToggle={() => {}} atual />
          </div>
        </div>
      ) : model.abertura ? (
        <div className="av-formato" data-av-formato="escudo" data-escudo-abertura="">
          <h2 className="av-sub-titulo">{cfg.secoes.abertura}</h2>
          {model.abertura.campos.map((c) => (
            <FieldBlock key={c.label} label={c.label}>
              <InlineFieldValue value={c.value} />
            </FieldBlock>
          ))}
          <MarkdownBody doc={{ ...doc, body: model.abertura.corpo }} />
        </div>
      ) : (
        <Aviso>{'// A AVENTURA NÃO TEM ABERTURA — avance pra primeira cena'}</Aviso>
      )}
    </div>
    </ArquivosCifradosProvider>
  )
}
