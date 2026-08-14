// Peças visuais compartilhadas dos passos do wizard (#452) — mesmo idioma da
// ficha (panel/clip/mono-title). A LISTA DE CARDS é o padrão pedido no spec:
// "selecionar em uma lista (não dropdown)" com o clique selecionando E abrindo
// o doc nos DETALHES (sidebar direita — canal useDetail existente).
import type { CSSProperties, ReactNode } from 'react'
import { useDetail } from '../../data/detail-context'
import type { Catalog } from '../../data/catalog'
import { wikiTarget } from '../ficha/hero-model'
import { clip } from '../ficha/bits'

/** Doc do catálogo por wikilink/target ("[[Bardo|X]]" → id do doc) — o
 *  resolvedor único dos cards do wizard (detalheId). */
export function docIdOf(catalog: Catalog, wikilink: string): string | null {
  const r = catalog.resolve(wikiTarget(wikilink))
  return r.kind === 'doc' ? r.id : null
}

export const wizTitulo: CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: '.12em',
  color: 'var(--muted)',
}

export function WizSecao({
  titulo,
  children,
  nota,
  pendente,
}: {
  titulo: string
  children: ReactNode
  nota?: ReactNode
  /** #461 item 8: seção OBRIGATÓRIA ainda não satisfeita → asterisco vermelho
   *  pequeno ao lado do título (obrigatoriedade implícita: sem asterisco =
   *  opcional ou já resolvido). */
  pendente?: boolean
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 22 }}>
      <span style={wizTitulo}>
        {`// ${titulo.toUpperCase()}`}
        {pendente ? (
          <span aria-label="obrigatório" title="Obrigatório" style={{ color: '#f87171', marginLeft: 4 }}>
            *
          </span>
        ) : null}
      </span>
      {nota ? (
        <span style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5, textWrap: 'pretty' }}>{nota}</span>
      ) : null}
      {children}
    </div>
  )
}

/** Moldura de retrato dos cards/barras do wizard — thumb com fallback pro
 *  CHEIO no onError (idioma do VaultImage); cheio também falhou → some. */
export function WizThumb({
  img,
  imgFull,
  size = 40,
  cover,
}: {
  img: string
  imgFull?: string | null
  size?: number
  /** cover pra retratos (classe); contain pra itens (armas). */
  cover?: boolean
}) {
  return (
    <span
      style={{
        flex: 'none',
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        background: 'var(--panel2)',
        border: '1px solid var(--line2)',
        clipPath: clip(6),
      }}
    >
      <img
        src={img}
        alt=""
        loading="lazy"
        onError={(e) => {
          const el = e.currentTarget
          if (imgFull && el.src !== imgFull) el.src = imgFull
          else (el.parentElement as HTMLElement).style.display = 'none'
        }}
        style={{ width: '100%', height: '100%', objectFit: cover ? 'cover' : 'contain' }}
      />
    </span>
  )
}

export interface WizCardItem {
  id: string
  titulo: string
  /** Linha secundária (ex.: subtítulo/resumo curto). */
  sub?: string
  /** Emoji/ícone à esquerda. */
  ic?: string
  /** Imagem (thumb) à esquerda — tem precedência sobre `ic` (ex.: retrato da
   *  arma, como nos cards de inventário). */
  img?: string | null
  /** Fallback CHEIO quando o thumb 404a (mesmo idioma do VaultImage: troca o
   *  src UMA vez no onError; sem ele, esconde a moldura). */
  imgFull?: string | null
  /** Badge à direita (ex.: MUITO RECOMENDADA). */
  badge?: string
  badgeCor?: string
  /** Doc a abrir nos DETALHES ao clicar (default: o próprio id). */
  detalheId?: string | null
}

/** Lista vertical de cards selecionáveis — clique SELECIONA e abre os
 *  DETALHES do doc (spec: "quando clicar mostra nos detalhes"). */
export function WizCardLista({
  itens,
  selecionado,
  onPick,
  ariaLabel,
}: {
  itens: WizCardItem[]
  selecionado: string | null
  onPick: (id: string) => void
  ariaLabel: string
}) {
  const detail = useDetail()
  return (
    <div role="listbox" aria-label={ariaLabel} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {itens.map((it) => {
        const on = it.id === selecionado
        return (
          <button
            key={it.id}
            role="option"
            aria-selected={on}
            onClick={() => {
              onPick(it.id)
              const alvo = it.detalheId === undefined ? it.id : it.detalheId
              if (alvo) detail?.open({ kind: 'doc', id: alvo })
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '11px 14px',
              textAlign: 'left',
              fontFamily: 'inherit',
              fontSize: 14,
              color: 'var(--text)',
              background: on ? 'color-mix(in srgb,var(--accent) 13%,var(--card))' : 'var(--card)',
              border: `1px solid ${on ? 'color-mix(in srgb,var(--accent) 55%,var(--line2))' : 'var(--line2)'}`,
              cursor: 'pointer',
              clipPath: clip(8),
            }}
          >
            {it.img ? (
              <WizThumb img={it.img} imgFull={it.imgFull} />
            ) : it.ic ? (
              <span style={{ fontSize: 17, flex: 'none' }}>{it.ic}</span>
            ) : null}
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontWeight: 700 }}>{it.titulo}</span>
              {it.sub ? (
                <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{it.sub}</span>
              ) : null}
            </span>
            {it.badge ? (
              <span
                style={{
                  flex: 'none',
                  fontFamily: 'var(--mono)',
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: '.08em',
                  padding: '3px 8px',
                  color: it.badgeCor ?? 'var(--accent)',
                  border: `1px solid ${it.badgeCor ?? 'var(--accent)'}`,
                  clipPath: clip(5),
                }}
              >
                {it.badge}
              </span>
            ) : null}
            {on ? <span style={{ flex: 'none', color: 'var(--accent)', fontWeight: 800 }}>✓</span> : null}
          </button>
        )
      })}
    </div>
  )
}

/** Input de texto com rótulo mono (identidade/nome). */
export function WizCampo({
  label,
  value,
  onChange,
  placeholder,
  multiline,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  multiline?: boolean
}) {
  const estilo: CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '9px 12px',
    background: 'var(--card)',
    border: '1px solid var(--line2)',
    color: 'var(--text)',
    fontFamily: 'inherit',
    fontSize: 14,
    outline: 'none',
    clipPath: clip(7),
    resize: 'vertical',
  }
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{ ...wizTitulo, fontSize: 10 }}>{label.toUpperCase()}</span>
      {multiline ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={3} style={estilo} />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={estilo} />
      )}
    </label>
  )
}

/** Pill de escolha do wizard — o botão único de todas as fileiras de pills
 *  (gênero, filtro CaC×Distância, escolha de atributo). Estados: ligado
 *  (accent), desligado, desabilitado (esmaecido). */
export function WizPillBtn({
  on,
  onClick,
  disabled,
  title,
  children,
}: {
  on: boolean
  onClick?: () => void
  disabled?: boolean
  title?: string
  children: ReactNode
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-pressed={on}
      title={title}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontFamily: 'var(--mono)',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '.06em',
        padding: '7px 14px',
        color: on ? 'var(--ink)' : disabled ? 'var(--muted)' : 'var(--text)',
        background: on ? 'var(--accent)' : 'var(--card)',
        border: `1px solid ${on ? 'var(--accent)' : 'var(--line2)'}`,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        clipPath: clip(6),
      }}
    >
      {children}
    </button>
  )
}

/** Pills de escolha única com rótulo (ex.: Gênero M/F/Outro). */
export function WizPills({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: string[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{ ...wizTitulo, fontSize: 10 }}>{label.toUpperCase()}</span>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {options.map((o) => (
          <WizPillBtn key={o} on={o === value} onClick={() => onChange(o)}>
            {o}
          </WizPillBtn>
        ))}
      </div>
    </div>
  )
}
