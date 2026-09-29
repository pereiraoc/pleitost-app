// Controles de A/B do mapa (#573) no painel do MODO DEBUG do botão de bug:
// driver do transform, overlay assado, grade em canvas. Só aparecem com o
// modo debug ligado; mudar aqui vale na hora (os viewers assinam).
import type { CSSProperties } from 'react'
import { gravarMapaDebug, useMapaDebug } from './mapa-debug'

const rotulo: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }
const campo: CSSProperties = { background: 'var(--card)', border: '1px solid var(--line2)', color: 'var(--text)', fontSize: 12, padding: '3px 6px' }

export function MapaDebugToggles() {
  const d = useMapaDebug()
  return (
    <div data-mapa-debug="" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', fontSize: 12, color: 'var(--muted)' }}>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.1em' }}>MAPA (A/B)</span>
      <label style={rotulo}>
        transform
        <select
          aria-label="Driver do transform do mapa"
          value={d.driver}
          onChange={(e) => gravarMapaDebug({ driver: e.target.value as typeof d.driver })}
          style={campo}
        >
          <option value="auto">auto</option>
          <option value="estilo">estilo</option>
          <option value="compositor">compositor</option>
        </select>
      </label>
      <label style={rotulo}>
        <input type="checkbox" aria-label="Overlay assado" checked={d.assar} onChange={(e) => gravarMapaDebug({ assar: e.target.checked })} />
        overlay assado
      </label>
      <label style={rotulo}>
        grade
        <select
          aria-label="Grade hex do mapa"
          value={d.grade}
          onChange={(e) => gravarMapaDebug({ grade: e.target.value as typeof d.grade })}
          style={campo}
        >
          <option value="auto">auto</option>
          <option value="canvas">canvas</option>
          <option value="svg">svg</option>
        </select>
      </label>
    </div>
  )
}
