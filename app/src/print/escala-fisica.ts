// ESCALA FÍSICA DO MAPA DE MESA (2026-09-10) — o PNG com grid carrega o
// próprio tamanho de papel no chunk pHYs (pixels por metro, gravado junto com
// o grid: 1 quadrado = 25 mm no A3). O papel lê daqui; nenhum px/mm solto no
// código. Sem pHYs em metros → null, e o papel só ajusta o mapa à folha.
import { useEffect, useState } from 'react'

export interface TamanhoFisico {
  larguraMm: number
  alturaMm: number
}

const ASSINATURA = [137, 80, 78, 71, 13, 10, 26, 10]

/** Largura/altura em mm declaradas pelo PNG (IHDR + pHYs antes do IDAT). */
export function tamanhoFisicoPng(bytes: Uint8Array): TamanhoFisico | null {
  if (bytes.length < 8 || ASSINATURA.some((b, i) => bytes[i] !== b)) return null
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let w = 0
  let h = 0
  for (let p = 8; p + 8 <= bytes.length; ) {
    const len = dv.getUint32(p)
    const tipo = String.fromCharCode(bytes[p + 4]!, bytes[p + 5]!, bytes[p + 6]!, bytes[p + 7]!)
    const d = p + 8
    if (d + len > bytes.length) return null
    if (tipo === 'IHDR' && len >= 8) {
      w = dv.getUint32(d)
      h = dv.getUint32(d + 4)
    } else if (tipo === 'pHYs' && len >= 9) {
      const ppmX = dv.getUint32(d)
      const ppmY = dv.getUint32(d + 4)
      if (bytes[d + 8] !== 1 || !ppmX || !ppmY || !w || !h) return null // unidade 1 = metro
      return { larguraMm: (w / ppmX) * 1000, alturaMm: (h / ppmY) * 1000 }
    } else if (tipo === 'IDAT' || tipo === 'IEND') {
      return null // pHYs só vale antes dos dados
    }
    p = d + len + 4 // + CRC
  }
  return null
}

/** Tamanho físico do PNG na URL (lê os bytes; null enquanto não chega). */
export function useTamanhoFisico(url: string | null): TamanhoFisico | null {
  const [lido, setLido] = useState<{ url: string; tam: TamanhoFisico | null } | null>(null)
  useEffect(() => {
    if (!url) return
    let vivo = true
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.arrayBuffer()
      })
      .then(
        (buf) => vivo && setLido({ url, tam: tamanhoFisicoPng(new Uint8Array(buf)) }),
        (err: unknown) => console.warn(`[papel] escala física indisponível: ${url}`, err),
      )
    return () => {
      vivo = false
    }
  }, [url])
  return lido && lido.url === url ? lido.tam : null
}
