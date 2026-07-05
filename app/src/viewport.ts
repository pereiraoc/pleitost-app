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
    const onResize = () => setVw(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return vw
}
