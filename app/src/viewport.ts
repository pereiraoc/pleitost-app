// Largura corrente do viewport — espelho do `state.vw` do design puxado
// (Companion App.dc.html), que dirige os thresholds responsivos do
// renderVals: 560 (portW/padding), 620 (chips/moedas na topbar),
// 720 (apelido na topbar), 820 (sidebar drawer vs colapso).
import { useEffect, useState } from 'react'

export function useViewportWidth(): number {
  const [vw, setVw] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1024,
  )
  useEffect(() => {
    // #291: coalesce por frame (rAF) — o resize dispara continuamente no
    // arraste/rotação e cada evento fazia um setState → re-render de todos os
    // consumidores. Um update por frame chega e evita jank (só re-renderiza se a
    // largura de fato mudou).
    let raf = 0
    const onResize = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        setVw((cur) => (cur === window.innerWidth ? cur : window.innerWidth))
      })
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])
  return vw
}
