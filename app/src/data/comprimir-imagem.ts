// COMPRIMIR IMAGEM no navegador (canvas → JPEG): reduz o lado maior pra
// `maxPx` e re-encoda. Dois usos: a foto do grupo (#235, 256px data-url que
// vive inline no sessions.state) e a figura cifrada que o mestre põe no MURAL
// (~1600px, Blob que sobe pro Storage). Sem canvas (jsdom) ou se a imagem não
// decodifica, devolve a fonte original no formato pedido.

/** Lê um Blob como data-url. */
function blobParaDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result ?? ''))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

async function fonteParaBlob(fonte: Blob | string): Promise<Blob> {
  if (typeof fonte !== 'string') return fonte
  return (await fetch(fonte)).blob()
}

function carregar(src: string): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = reject
    i.src = src
  })
}

function canvasReduzido(img: HTMLImageElement, maxPx: number): HTMLCanvasElement | null {
  const escala = Math.min(1, maxPx / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(img.width * escala))
  canvas.height = Math.max(1, Math.round(img.height * escala))
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas
}

/** Comprime pra data-url JPEG (state jsonb). `fonte` = Blob/File ou URL. */
export async function comprimirImagemDataUrl(fonte: Blob | string, maxPx: number, qualidade = 0.72): Promise<string> {
  const dataUrl = typeof fonte === 'string' && fonte.startsWith('data:') ? fonte : await blobParaDataUrl(await fonteParaBlob(fonte))
  try {
    const canvas = canvasReduzido(await carregar(dataUrl), maxPx)
    return canvas ? canvas.toDataURL('image/jpeg', qualidade) : dataUrl
  } catch {
    return dataUrl
  }
}

/** Comprime pra Blob JPEG (upload pro Storage). `fonte` = Blob/File ou URL
 *  (inclusive o blob: de uma figura decifrada). */
export async function comprimirImagemBlob(fonte: Blob | string, maxPx: number, qualidade = 0.82): Promise<Blob> {
  const original = await fonteParaBlob(fonte)
  const url = URL.createObjectURL(original)
  try {
    const canvas = canvasReduzido(await carregar(url), maxPx)
    if (!canvas) return original
    const saida = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', qualidade))
    return saida ?? original
  } catch {
    return original
  } finally {
    URL.revokeObjectURL(url)
  }
}
