// MODIFICADORES ASSADOS (2026-10-06, #573) — as marcas dos modificadores do
// mapa viram UM bitmap (blob: URL) do recorte da vista, mostrado como <img>
// na camada transformada. Medido no Gecko (bench-mapa-gesto, Firefox): com
// as marcas em <path> no SVG o paint por quadro do gesto ia de ~3-4 ms pra
// ~12-14 ms (o SVG é re-rasterizado a cada quadro do transform); bitmap na
// camada é só composição, como o mapa e o overlay assado (mapa-assado.ts).
//
// Enquanto assa (ou sem canvas 2D — jsdom, navegador sem suporte), quem
// chama mostra os <path> no SVG: o resultado é o mesmo, só mais caro no gesto.
import { useEffect, useState } from 'react'
import { marcaDeLinha, type AreaFonte, type MarcaMapa } from './terreno-mundo'

/** Teto de pixels do bitmap (~6 Mpx ≈ 24 MB RGBA) e do lado (limites de
 *  canvas no celular). */
const MAX_PX = 6_000_000
const MAX_LADO = 4096

/** Escala fonte → bitmap pra um recorte (≤ 1). */
export function escalaDoAssado(area: AreaFonte): number {
  return Math.min(1, Math.sqrt(MAX_PX / Math.max(1, area.w * area.h)), MAX_LADO / Math.max(1, area.w, area.h))
}

/** "#rrggbb" misturado com preto (fração `cor` da cor) → rgb(); outra
 *  notação volta como veio (o canvas entende cores CSS simples). */
export function escurecer(cor: string, fracCor: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(cor.trim())
  if (!m) return cor
  const n = parseInt(m[1]!, 16)
  const c = (v: number) => Math.round(v * fracCor)
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`
}

/** Cor da config utilizável no canvas (var(--x) não resolve lá). */
function corCanvas(cor: string): string {
  return cor.startsWith('var(') ? '#888888' : cor
}

function assar(marcas: readonly MarcaMapa[], area: AreaFonte): Promise<string | null> {
  if (typeof document === 'undefined') return Promise.resolve(null)
  const canvas = document.createElement('canvas')
  let ctx: CanvasRenderingContext2D | null = null
  try {
    ctx = canvas.getContext('2d')
  } catch {
    ctx = null
  }
  if (!ctx || typeof Path2D === 'undefined') return Promise.resolve(null)
  const s = escalaDoAssado(area)
  canvas.width = Math.max(1, Math.round(area.w * s))
  canvas.height = Math.max(1, Math.round(area.h * s))
  ctx.setTransform(s, 0, 0, s, -area.x * s, -area.y * s)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  // mesma pintura do SVG (estiloMarca no painel): linha = traço escurecido;
  // cheia = cor da config + contorno escuro fino
  for (const m of marcas) {
    const p = new Path2D(m.d)
    const cor = corCanvas(m.cor)
    if (marcaDeLinha(m.forma)) {
      ctx.strokeStyle = escurecer(cor, 0.55)
      ctx.lineWidth = 2.2
      ctx.stroke(p)
    } else {
      ctx.fillStyle = cor
      ctx.fill(p)
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'
      ctx.lineWidth = 1.2
      ctx.stroke(p)
    }
  }
  return new Promise((resolve) => {
    if (typeof canvas.toBlob !== 'function') return resolve(null)
    canvas.toBlob((b) => resolve(b ? URL.createObjectURL(b) : null), 'image/png')
  })
}

/** blob: URL do bitmap das marcas pro recorte `area` (null enquanto assa,
 *  sem marcas ou sem canvas). Re-assa quando as marcas mudam (o array vem
 *  memoizado de marcasDoMapa — mesma referência = mesmo conteúdo). */
export function useMarcasAssadas(marcas: readonly MarcaMapa[], area: AreaFonte): string | null {
  const [pronto, setPronto] = useState<{ de: readonly MarcaMapa[]; url: string } | null>(null)
  useEffect(() => {
    if (marcas.length === 0) return
    let vivo = true
    let url: string | null = null
    assar(marcas, area)
      .then((u) => {
        url = u
        if (!u) return
        if (vivo) setPronto({ de: marcas, url: u })
        else URL.revokeObjectURL(u)
      })
      .catch(() => {
        /* sem bitmap → o SVG cobre */
      })
    return () => {
      vivo = false
      if (url) {
        const morta = url
        URL.revokeObjectURL(morta)
        // o array de marcas é memoizado: religar devolve o MESMO — não pode
        // apontar pro blob revogado
        setPronto((p) => (p?.url === morta ? null : p))
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marcas, area.x, area.y, area.w, area.h])
  return pronto && pronto.de === marcas ? pronto.url : null
}
