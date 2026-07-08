// Fragmentos visuais compartilhados da ficha — estilos VERBATIM do design
// puxado (design/pulled/Companion App.dc.html). Cada componente replica um
// pedaço repetido do markup do design; dados chegam prontos por props.
import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { MEDAL, RANK_ORDER, RANK_STATES, type RankLetter, type RankStateKey } from './registry'
import { TipHover, sourceTipHtml } from './tooltips'

/** clip-path de canto cortado usado em todo o design. */
export function clip(n: number): string {
  return `polygon(0 0,calc(100% - ${n}px) 0,100% ${n}px,100% 100%,${n}px 100%,0 calc(100% - ${n}px))`
}

/** Painel padrão: padding:16px 18px;background:var(--panel);border:1px solid var(--line2);clip 14. */
export function Panel({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        padding: '16px 18px',
        background: 'var(--panel)',
        border: '1px solid var(--line2)',
        clipPath: clip(14),
        ...style,
      }}
    >
      {children}
    </div>
  )
}

/** Título mono de painel (ex: "PERÍCIAS", "ARMAS"). */
export function PanelTitle({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        fontFamily: 'var(--mono)',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '.08em',
        textTransform: 'uppercase',
        color: 'var(--muted)',
        marginBottom: 13,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export interface TabDef {
  id: string
  label: string
}

/** Fila de abas internas do design (bioTabs/invTabs/habTabs/combate.tabs). */
export function TabStrip({
  tabs,
  active,
  onSelect,
  pad = '12px 18px',
  right,
}: {
  tabs: TabDef[]
  active: string
  onSelect: (id: string) => void
  pad?: string
  right?: ReactNode
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        borderBottom: '1px solid var(--line)',
      }}
    >
      {tabs.map((t) => {
        const on = t.id === active
        return (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            style={{
              padding: pad,
              background: on ? 'color-mix(in srgb,var(--accent) 7%,transparent)' : 'transparent',
              border: 'none',
              borderBottom: `2px solid ${on ? 'var(--accent)' : 'transparent'}`,
              color: on ? 'var(--accent)' : 'var(--muted)',
              cursor: 'pointer',
              fontWeight: 600,
              letterSpacing: '.07em',
              fontSize: 12,
              whiteSpace: 'nowrap',
              fontFamily: 'var(--body)',
            }}
          >
            {t.label}
          </button>
        )
      })}
      {right ? (
        <>
          <span style={{ flex: 1 }} />
          {right}
        </>
      ) : null}
    </div>
  )
}

/** Trilho horizontal de painéis — O componente de track compartilhado de
 *  TODOS os carrosséis do app (issue #6). Markup verbatim do design puxado
 *  (Companion App.dc.html:166-167/424/1130: clip `position:relative;width:
 *  100%;overflow:hidden` > `div[data-track][data-track-auto]`), transição de
 *  _animateViewChange (dc.html:1533: transform+height .32s/.34s
 *  cubic-bezier(.2,.85,.32,1)) e altura do data-track-auto (dc.html:1534:
 *  track.height = children[idx].offsetHeight; ResizeObserver cobre conteúdo
 *  que muda de altura depois do slide). */
export function PanelTrack({ index, children }: { index: number; children: ReactNode }) {
  const trackRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const track = trackRef.current
    if (!track) return
    const child = track.children[index] as HTMLElement | undefined
    if (!child) return
    const apply = () => {
      const h = child.offsetHeight
      if (h > 0) track.style.height = `${h}px`
    }
    apply()
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(apply)
      ro.observe(child)
      return () => ro.disconnect()
    }
  }, [index])
  return (
    <div style={{ position: 'relative', width: '100%', overflow: 'hidden' }}>
      <div
        ref={trackRef}
        data-track=""
        data-track-auto=""
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'flex-start',
          width: '100%',
          transform: `translateX(-${index * 100}%)`,
          transition:
            'transform .32s cubic-bezier(.2,.85,.32,1), height .34s cubic-bezier(.2,.85,.32,1)',
        }}
      >
        {children}
      </div>
    </div>
  )
}

/** Painel do track ([data-panel] do design). `pad` segue o design por tela
 *  (dc.html:425 '2px 1px' inventário/habilidades · dc.html:170 '4px 1px 2px'
 *  perfil · dc.html:1131 sem padding no grupo). boxSizing:border-box espelha
 *  o `*{box-sizing:border-box}` global do design (dc.html:15) — sem ele o
 *  padding lateral soma à flex-basis de 100% e o painel vizinho vaza no clip
 *  (bug #6). */
export function TrackPanel({
  pad = '2px 1px',
  style,
  children,
}: {
  pad?: string
  style?: CSSProperties
  children?: ReactNode
}) {
  return (
    <div
      data-panel=""
      style={{ flex: '0 0 100%', minWidth: 0, boxSizing: 'border-box', padding: pad, ...style }}
    >
      {children}
    </div>
  )
}

/** Caixinha do modificador (38×34, star/dots) — verbatim das linhas de perícia. */
export function ModBox({
  modStr,
  rank,
  star,
  dots,
  width = 38,
  modColor,
}: {
  modStr: string
  rank: RankLetter
  star?: boolean
  dots?: number
  width?: number
  /** Cor do NÚMERO quando buff/debuff da Interativa altera o mod
   *  (cond-bonus/cond-penalty do plugin); default = cor da medalha. */
  modColor?: string
}) {
  const solid = MEDAL[rank].solid
  return (
    <span
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width,
        height: 34,
        background: 'var(--card)',
        border: `1px solid color-mix(in srgb,${solid} 34%,var(--line2))`,
        color: solid,
        borderRadius: 5,
      }}
    >
      {star ? (
        <span
          style={{
            position: 'absolute',
            top: 1,
            left: 0,
            right: 0,
            textAlign: 'center',
            fontSize: 8,
            lineHeight: 1,
            color: 'var(--accent)',
          }}
        >
          ★
        </span>
      ) : null}
      <span
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 13,
          fontWeight: 800,
          lineHeight: 1,
          ...(modColor ? { color: modColor } : {}),
        }}
      >
        {modStr}
      </span>
      {dots && dots > 0 ? (
        <span
          style={{
            position: 'absolute',
            bottom: 2,
            left: 0,
            right: 0,
            display: 'flex',
            gap: 2,
            justifyContent: 'center',
          }}
        >
          {Array.from({ length: dots }, (_, i) => (
            <span
              key={i}
              style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--golddot)' }}
            />
          ))}
        </span>
      ) : null}
    </span>
  )
}

/** Medalha do rank atual (coluna PROFICIÊNCIA no modo visualização).
 *  `tipSources` = fontes cruas do rank (tooltip de Fonte do plugin —
 *  naem-buttons.ts:84-86 attach por rank; no modo visualização só o rank
 *  atual é renderizado). */
export function RankMedal({ rank, tipSources }: { rank: RankLetter; tipSources?: string[] }) {
  const solid = MEDAL[rank].solid
  return (
    <TipHover html={sourceTipHtml(tipSources)}>
    <span
      style={{
        background: `color-mix(in srgb,${solid} 12%,transparent)`,
        color: solid,
        border: `1px solid ${solid}`,
        width: 25,
        height: 22,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--mono)',
        fontSize: 11,
        fontWeight: 700,
        borderRadius: 5,
      }}
    >
      {rank}
    </span>
    </TipHover>
  )
}

// Estados "não selecionados" (rank acima do atual / N já passado): quando
// DESABILITADOS por falta de slot (fora do teto alcançável) ficam apagados —
// espelho do `.as-naem-btn:disabled:not(.sel)...` do plugin (styles.css:
// 1745-1750: fundo/borda transparentes, cor faint, opacity .45). Estados
// selecionados preservam o visual próprio mesmo desabilitados (rank atual).
const RANK_PLAIN_STATES: ReadonlySet<RankStateKey> = new Set(['off', 'passN'])

/** Fileira N/A/E/M do modo edição, pintada pelos estados do registro.
 *  `tips` = fontes cruas POR RANK (contrato do naemButtons({tooltips}) do
 *  plugin, naem-buttons.ts:84-86: attachSourceTooltip por botão).
 *  `onPick` = clique num rank (naem-buttons.ts onClick): gasta/rebaixa slot
 *  respeitando o piso. Sem `onPick` os degraus ficam só display (defesas/
 *  sentidos/ataque são rule-driven, não editáveis por slot).
 *  `disabledRanks` = ranks fora do intervalo [piso, teto] (economia de slot):
 *  não clicáveis. Espelho de naemButtons({disabledRanks}) do plugin
 *  (naem-buttons.ts:67-70; teto = computePericiaMaxReachable). */
export function RankBtns({
  states,
  tips,
  onPick,
  disabledRanks,
}: {
  states: Record<RankLetter, RankStateKey>
  tips?: Partial<Record<RankLetter, string[]>>
  onPick?: (letter: RankLetter) => void
  disabledRanks?: RankLetter[]
}) {
  const disabledSet = new Set(disabledRanks ?? [])
  return (
    <>
      {RANK_ORDER.map((letter) => {
        const s = RANK_STATES[states[letter]]
        const disabled = !!onPick && disabledSet.has(letter)
        // Desabilitado + estado "plano" (off/passN) → apagado (não clicável).
        const faint = disabled && RANK_PLAIN_STATES.has(states[letter])
        const clickable = !!onPick && !disabled
        return (
          <TipHover key={letter} html={disabled ? '' : sourceTipHtml(tips?.[letter])}>
            <span
              role={onPick ? 'button' : undefined}
              aria-label={onPick ? `Rank ${letter}` : undefined}
              aria-disabled={disabled ? 'true' : undefined}
              onClick={clickable ? () => onPick!(letter) : undefined}
              style={{
                background: faint ? 'transparent' : s.bg,
                color: faint ? 'color-mix(in srgb,var(--muted) 70%,transparent)' : s.fg,
                border: `1px solid ${faint ? 'transparent' : s.bd}`,
                width: 25,
                height: 22,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'var(--mono)',
                fontSize: 11,
                fontWeight: 700,
                borderRadius: 5,
                opacity: faint ? 0.45 : 1,
                cursor: clickable ? 'pointer' : 'default',
              }}
            >
              {letter}
            </span>
          </TipHover>
        )
      })}
    </>
  )
}

/** Bolinhas douradas de ITEM BÔNUS (11px). `tipSources` = fontes cruas do
 *  bônus de item (tooltip de Fonte no CONTAINER dos dots — contrato do
 *  bonusDots({tooltip}) do plugin, bonus-dots.ts:62-63). */
export function GoldDots({
  on,
  max = 3,
  tipSources,
}: {
  on: number
  max?: number
  tipSources?: string[]
}) {
  return (
    <TipHover html={sourceTipHtml(tipSources)} style={{ gap: 5 }}>
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          style={{
            width: 11,
            height: 11,
            borderRadius: '50%',
            background: i < on ? 'var(--gold)' : 'transparent',
            border: `1px solid ${i < on ? 'var(--gold)' : 'color-mix(in srgb,var(--muted) 60%,transparent)'}`,
          }}
        />
      ))}
    </TipHover>
  )
}

/** Bolinhas de USOS (verdes, clicáveis) — usoDots do design. */
export function UsoDots({
  cur,
  max,
  onToggle,
}: {
  cur: number
  max: number
  onToggle?: (next: number) => void
}) {
  return (
    <span style={{ display: 'flex', gap: 5 }}>
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          onClick={onToggle ? () => onToggle(cur === i + 1 ? i : i + 1) : undefined}
          style={{
            width: 11,
            height: 11,
            borderRadius: '50%',
            background: i < cur ? '#2f8f5b' : 'transparent',
            border: `1px solid ${i < cur ? '#43c07f' : 'var(--line2)'}`,
            cursor: 'pointer',
          }}
        />
      ))}
    </span>
  )
}

/** Badge do atributo (emoji + sigla) das linhas de perícia. */
export function AttrBadge({ ic, at }: { ic: string; at: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 7px',
        background: 'var(--card)',
        border: '1px solid var(--line2)',
        fontFamily: 'var(--mono)',
        fontSize: 10,
        fontWeight: 700,
        color: 'var(--muted)',
        flex: 'none',
      }}
    >
      <span>{ic}</span>
      <span>{at}</span>
    </span>
  )
}

/** Botão "✎ Alterar"/"✓ Concluir" dos cards editáveis. */
export function EditToggle({ edit, onToggle }: { edit: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 12px',
        background: 'var(--card)',
        border: '1px solid var(--line2)',
        color: 'var(--accent)',
        cursor: 'pointer',
        fontFamily: 'var(--mono)',
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: '.05em',
        clipPath: clip(8),
      }}
    >
      {edit ? '✓ Concluir' : '✎ Alterar'}
    </button>
  )
}
