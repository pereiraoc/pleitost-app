// Peças compartilhadas das tabelas da ficha de grupo — markup/estilos
// VERBATIM da seção ===== GRUPOS ===== do design puxado
// (design/pulled/Companion App.dc.html): linha recortada com fator --g
// (linha "Grupo"), cabeçalho-botão ordenável (headMap do build recuperado),
// célula de nome com 👤 (sempre — o markup não condiciona) e célula de valor.
// Cores/pesos vêm do build do grupo no renderVals recuperado:
//   nameCor: grupo → var(--accent); membro → var(--text) (papéis) ou
//     var(--blue) (competências/riqueza)
//   weight: grupo 800; membro 600 (papéis) ou 500 (competências/riqueza)
//   cor das células: grupo → var(--accent); membro → var(--text); a coluna Δ
//     da riqueza usa a classificação do PLUGIN (deltaKind em wealth.ts,
//     issue #9) — o dltCor do design (sinal +/−) fica aqui como referência
import type { CSSProperties, MouseEvent, MouseEventHandler } from 'react'
import type { GrupoTip } from './gtip'
import type { DetailCtl, DetailTarget } from '../data/detail-context'

/**
 * Célula de estrelas do design: 1ª estrela, guia tracejada, resto, e "+"
 * (plus do build; cor do "+" = t.cor). Compartilhada entre a aba PAPÉIS do
 * grupo (GrupoView) e o wizard de criação (#452 — preview de papéis
 * pós-subclasse); a opacidade da estrela vazia (0.18) é a única aproximação
 * restante do pull.
 */
export function StarCell({
  value,
  cor,
  warn,
  onTipEnter,
  tip,
  semGuia,
}: {
  value: number
  cor: string
  /** Coluna com soma do Grupo <1 estrela → aviso do plugin (papelTdWarnStyle). */
  warn?: boolean
  onTipEnter?: (e: MouseEvent) => void
  tip?: GrupoTip
  /** Wizard (#461 item 4): sem a guia tracejada da 1ª estrela (o "mínimo do
   *  grupo" não é relevante na criação individual). */
  semGuia?: boolean
}) {
  const slots = [0, 1, 2].map((k) => k < value)
  const star = (on: boolean, key: number) => (
    <span key={key} style={{ fontSize: 15, lineHeight: 1, color: cor, opacity: on ? 1 : 0.18 }}>
      ★
    </span>
  )
  return (
    <div
      onMouseEnter={onTipEnter}
      onMouseMove={tip?.move}
      onMouseLeave={tip?.hide}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        cursor: 'help',
        ...(warn ? papelTdWarnStyle : null),
      }}
    >
      {star(slots[0]!, 0)}
      {semGuia ? null : (
        <span
          style={{
            width: 0,
            alignSelf: 'stretch',
            borderLeft: '1px dashed color-mix(in srgb,var(--muted) 60%,transparent)',
            margin: '1px -1.5px',
          }}
        />
      )}
      {star(slots[1]!, 1)}
      {star(slots[2]!, 2)}
      {value > 3 ? (
        <span style={{ fontSize: 12, color: cor, marginLeft: 2, fontWeight: 700 }}>+</span>
      ) : null}
    </div>
  )
}

/** Abre um MEMBRO do grupo no painel de DETALHES (direita) — #bug: clicar no
 *  nome nas abas abria a ficha cheia como se fosse do usuário. Membros de
 *  sessão têm id `sessao:<charId>` → resumo-sessao; membros da vault/local →
 *  resumo. Volátil: no-op sem DetailCtl (fora do shell com painel). */
export function abrirMembroDetalhe(detail: DetailCtl | null | undefined, id: string): void {
  if (!detail || !id) return
  const target: DetailTarget = id.startsWith('sessao:')
    ? { kind: 'resumo-sessao', id: id.slice('sessao:'.length) }
    : { kind: 'resumo', id }
  detail.open(target)
}

export const ROW_CLIP = 'polygon(0 0,calc(100% - 9px) 0,100% 9px,100% 100%,9px 100%,0 calc(100% - 9px))'

/** dltCor do design: delta '+' → verde, '-' → vermelho, senão texto. */
export function dltCor(v: string): string {
  return /^\+/.test(v) ? '#3fbf6a' : /^-/.test(v) ? '#d8695c' : 'var(--text)'
}

/** Título "// SEÇÃO" (mono, .16em) — verbatim do design. */
export const sectionTitleStyle: CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 11,
  letterSpacing: '.16em',
  color: 'var(--muted)',
}

/** Célula problemática da tabela de papéis — VERBATIM do plugin
 *  `.pleitost-party__papel-td--warn` (styles.css:12794): coluna com <1 estrela
 *  na soma do Grupo (section-papel.ts:138/163) e tier de membro divergente
 *  (section-papel.ts:127). O theme.css do app aliasa --background-primary. */
export const papelTdWarnStyle: CSSProperties = {
  background: 'color-mix(in srgb, #ff3333 24%, var(--background-primary) 76%)',
  boxShadow: 'inset 0 0 0 1px color-mix(in srgb, #ff3333 45%, transparent)',
}

/** Cabeçalho TIR com tiers divergentes — VERBATIM do plugin
 *  `.pleitost-party__wealth-th--warn` (styles.css:13034; section-papel.ts:71). */
export const thWarnStyle: CSSProperties = {
  background: 'color-mix(in srgb, #ff3333 22%, var(--background-primary) 78%)',
}

/** Casca da linha (bg/borda/clip com fator --g do design), sem o grid. */
export function rowShellStyle(isGroup: boolean): CSSProperties {
  const g = isGroup ? 1 : 0
  return {
    boxSizing: 'border-box',
    minHeight: 42,
    padding: '9px 4px',
    alignItems: 'center',
    background: `color-mix(in srgb,var(--accent) ${g * 13}%,color-mix(in srgb,var(--accent) 3%,var(--panel)))`,
    border: `1px solid color-mix(in srgb,var(--accent) ${g * 45}%,var(--line))`,
    borderTop: `${1 + g * 1.5}px solid color-mix(in srgb,var(--accent) ${g * 85}%,var(--line))`,
    clipPath: ROW_CLIP,
  }
}

/**
 * Cabeçalho de coluna ordenável — botão verbatim do design (headMap):
 * emoji em cima, sigla, seta ▼/▲ em accent quando a coluna está ativa;
 * cor via --a (classe .grupo-sort-head em app.css, com o hover do design).
 */
export function SortHead({
  ic,
  label,
  active,
  arr,
  onClick,
  fontSize = 8.5,
  letterSpacing = '.02em',
  icColor,
  warn,
  onTipEnter,
  tip,
}: {
  ic: string
  label: string
  active: boolean
  arr: string
  onClick: () => void
  fontSize?: number
  letterSpacing?: string
  icColor?: string
  /** Tier divergente no grupo → fundo de aviso do plugin (thWarnStyle). */
  warn?: boolean
  onTipEnter?: MouseEventHandler
  tip?: GrupoTip
}) {
  return (
    <button
      onClick={(e) => {
        onTipEnter?.(e) // #240: tap mostra o tooltip antes de ordenar
        onClick()
      }}
      onMouseEnter={onTipEnter}
      onMouseMove={tip?.move}
      onMouseLeave={tip?.hide}
      className="grupo-sort-head"
      style={
        {
          '--a': active ? 1 : 0,
          textAlign: 'center',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          fontFamily: 'var(--mono)',
          fontSize,
          letterSpacing,
          lineHeight: 1.3,
          ...(warn ? thWarnStyle : null),
        } as CSSProperties
      }
    >
      <div style={{ fontSize: 12, ...(icColor ? { color: icColor } : {}) }}>{ic}</div>
      {label}
      <span style={{ color: 'var(--accent)' }}>{arr}</span>
    </button>
  )
}

/** Célula de nome com 👤 (sempre, como no markup) — verbatim do design. */
export function NameCell({
  name,
  em,
  weight,
  cor,
  onTipEnter,
  onOpen,
  tip,
}: {
  name: string
  em?: string | null
  weight: number
  cor: string
  /** labelTipE do design (só a linha Grupo tem). */
  onTipEnter?: MouseEventHandler
  /** Abre a ficha do personagem (linhas de MEMBRO — clicar no nome). */
  onOpen?: () => void
  tip?: GrupoTip
}) {
  return (
    <div
      onMouseEnter={onTipEnter}
      onClick={onOpen ?? onTipEnter}
      onMouseMove={tip?.move}
      onMouseLeave={tip?.hide}
      title={onOpen ? 'Abrir ficha' : undefined}
      style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, cursor: onOpen ? 'pointer' : undefined }}
    >
      <span style={{ fontSize: 12, flex: 'none' }}>👤</span>
      <span
        style={{
          fontWeight: weight,
          fontSize: 13,
          color: cor,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {name}
      </span>
      {em ? <span style={{ flex: 'none', fontSize: 12 }}>{em}</span> : null}
    </div>
  )
}

/** Célula de valor mono (fontSize 14, cursor:help) — verbatim do design. */
export function ValueCell({
  value,
  weight,
  cor,
  onTipEnter,
  tip,
}: {
  value: string
  weight: number
  cor: string
  onTipEnter?: (e: MouseEvent) => void
  tip?: GrupoTip
}) {
  return (
    <div
      onMouseEnter={onTipEnter}
      onClick={onTipEnter}
      onMouseMove={tip?.move}
      onMouseLeave={tip?.hide}
      style={{
        textAlign: 'center',
        fontFamily: 'var(--mono)',
        fontSize: 14,
        fontWeight: weight,
        cursor: 'help',
        color: cor,
      }}
    >
      {value}
    </div>
  )
}
