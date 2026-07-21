// Tooltip flutuante da ficha de grupo — mecânica VERBATIM do design puxado
// (Companion App.dc.html):
//   gtipShow(key,e){ this.setState({gtip:{key,x:e.clientX,y:e.clientY}}); }
//   gtipMove(e){ ...atualiza x/y se há gtip... }
//   gtipHide(){ ...limpa... }
//   buildGtip(){ largura por entrada (riq: >=300→560, senão 420), clamp na
//     viewport, flip acima/abaixo em vh*0.62, ref que corrige o top pra
//     caber em [8, vh-8] }
//   componentDidMount: scroll (capture) limpa o gtip (_onScrollG).
// O markup do overlay (§GRUPOS, sc-if grupo.gtip) é replicado em <GtipOverlay>.
import { useLayoutEffect, useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { getGtips } from './gtips'

interface GtipState {
  key: string
  x: number
  y: number
}

/** Handlers que o design liga nos slots (tipE/tipMove/tipHide do renderVals). */
export interface GrupoTip {
  /** tipE(key) do design: onMouseEnter que mostra o tooltip da chave. */
  tipE: (key: string) => (e: MouseEvent) => void
  /** grupo.tipMove do design (onMouseMove). */
  move: (e: MouseEvent) => void
  /** grupo.tipHide do design (onMouseLeave). */
  hide: () => void
  /** setState({gtip:null}) — usado na troca de aba (grupoTabs do design). */
  clear: () => void
  /** Overlay pronto (null sem gtip/chave — como o buildGtip do design). */
  overlay: ReactNode
}

interface BuiltGtip {
  html: string
  w: string
  left: string
  top: string
  tf: string
}

/** Porta VERBATIM do buildGtip() do design. */
function buildGtip(g: GtipState | null): BuiltGtip | null {
  const GT = getGtips()
  if (!g || !GT) return null
  const ix = GT.map[g.key]
  if (ix === undefined) return null
  const ent = GT.store[ix]!
  const vw = window.innerWidth
  const vh = window.innerHeight
  let ew = ent.w
  if (/^riq:/.test(g.key)) ew = ew >= 300 ? 560 : 420
  const w = Math.min(ew, vw - 28)
  let left = g.x + 16
  if (left + w > vw - 12) left = Math.max(12, vw - 12 - w)
  const below = g.y < vh * 0.62
  return {
    html: ent.h,
    w: w + 'px',
    left: left + 'px',
    top: (below ? g.y + 18 : g.y - 14) + 'px',
    tf: below ? 'none' : 'translateY(-100%)',
  }
}

/** Overlay do tooltip — markup/estilos verbatim do design (sc-if grupo.gtip).
 *  F6 (#347, report b5e2a8b6): o clamp era um ref ONE-SHOT (só no mount) — ao
 *  REPOSICIONAR o tooltip no mesmo elemento reutilizado o clamp não rodava de
 *  novo e ele vazava pro canto/fora da tela. Agora é useLayoutEffect por tip,
 *  re-aplica a posição BASE antes de medir (um clamp anterior pode ter mutado
 *  style.top/left) e clampa VERTICAL e HORIZONTAL. */
function GtipOverlay({ tip }: { tip: BuiltGtip }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.top = tip.top
    el.style.left = tip.left
    const r = el.getBoundingClientRect()
    let dy = 0
    if (r.top < 8) dy = 8 - r.top
    else if (r.bottom > window.innerHeight - 8) dy = window.innerHeight - 8 - r.bottom
    let dx = 0
    if (r.left < 8) dx = 8 - r.left
    else if (r.right > window.innerWidth - 8) dx = window.innerWidth - 8 - r.right
    if (dy) el.style.top = parseFloat(el.style.top) + dy + 'px'
    if (dx) el.style.left = parseFloat(el.style.left) + dx + 'px'
  }, [tip])
  return (
    <div
      ref={ref}
      data-gtip-overlay=""
      style={{
        position: 'fixed',
        left: tip.left,
        top: tip.top,
        transform: tip.tf,
        zIndex: 80,
        pointerEvents: 'none',
        maxWidth: tip.w,
        boxSizing: 'border-box',
        background: 'var(--card)',
        border: '1px solid var(--line2)',
        padding: '11px 13px',
        fontSize: 12.5,
        lineHeight: 1.4,
        color: 'var(--text)',
        boxShadow: '0 12px 32px rgba(0,0,0,.5)',
      }}
      dangerouslySetInnerHTML={{ __html: tip.html }}
    />
  )
}

export function useGrupoTip(): GrupoTip {
  const [gtip, setGtip] = useState<GtipState | null>(null)

  // _onScrollG do design: qualquer scroll (capture) esconde o tooltip.
  useEffect(() => {
    const onScroll = () => setGtip((cur) => (cur ? null : cur))
    window.addEventListener('scroll', onScroll, true)
    return () => window.removeEventListener('scroll', onScroll, true)
  }, [])

  // #240: TOQUE também abre — mouseenter não existe no celular e os tooltips
  // "paravam de funcionar" lá. O pointerdown global (abaixo) fecha o tooltip
  // e memoriza a chave: o click que vem em seguida no MESMO alvo vira toggle
  // (fecha); em alvo novo, abre. Hover de desktop segue intacto.
  const prevKeyRef = useRef<string | null>(null)
  useEffect(() => {
    const onDown = () => {
      setGtip((cur) => {
        prevKeyRef.current = cur?.key ?? null
        return null
      })
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [])
  const tipE = useCallback(
    (key: string) => (e: MouseEvent) => {
      if (e.type === 'click' && prevKeyRef.current === key) {
        prevKeyRef.current = null
        return
      }
      // #254: um `click` de TAP ou teclado pode vir com clientX/clientY = 0
      // (Firefox Android, tap sintético) — aí o tooltip ia parar no canto
      // superior esquerdo. Sem coords do cursor, ancora no CENTRO do elemento
      // alvo (getBoundingClientRect); o hover de mouse segue usando o cursor.
      let x = e.clientX
      let y = e.clientY
      if (!x && !y) {
        const r = (e.currentTarget as HTMLElement | null)?.getBoundingClientRect()
        if (r) {
          x = r.left + r.width / 2
          y = r.top + r.height / 2
        }
      }
      setGtip({ key, x, y })
    },
    [],
  )
  const move = useCallback(
    (e: MouseEvent) =>
      setGtip((cur) => (cur ? { ...cur, x: e.clientX, y: e.clientY } : cur)),
    [],
  )
  const hide = useCallback(() => setGtip((cur) => (cur ? null : cur)), [])
  const clear = useCallback(() => setGtip(null), [])

  const built = buildGtip(gtip)
  return { tipE, move, hide, clear, overlay: built ? <GtipOverlay tip={built} /> : null }
}
