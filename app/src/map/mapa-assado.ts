// OVERLAY ASSADO (#573) — mapa + overlay anti-spoiler (clipado nas regiões
// DESABILITADAS do viewer) compostos num bitmap só, que vira o `<img>` do
// mapa; o `<svg>` transformado fica só com vetor (pinos, seleção, contornos).
//
// Por quê: no Gecko (Firefox Android) o `<image>` clipado dentro do SVG
// transformado era re-rasterizado como blob, na CPU, a cada quadro do gesto
// (~280 vezes por gesto no /mapa) — medido em 2026-09-29. Com o bitmap
// assado o subtree transformado é uma imagem nativa: 0 blobs, paint de
// 0,6 ms/quadro no desktop. No Chromium também barateia a re-rasterização
// da camada quando a escala muda.
//
// Regra de segurança: enquanto o bitmap não está pronto (ou falhou), o viewer
// MANTÉM o overlay em SVG — nunca existe um quadro do mapa sem o overlay.
import { useEffect, useMemo, useState } from 'react'
import type { MapaPonto } from './mapa-atlas-store'

/** Lado maior do bitmap assado: a média (#572) já tem ≤ 4000; a cheia (dev,
 *  ou imagem sem média) é reduzida — 4096 é o teto de textura de GPU móvel. */
export const ASSADO_LADO_MAX = 4096
/** Quantos bitmaps ficam em memória (mestre alternando o grupo do preview). */
const CACHE_MAX = 3

export interface Tamanho {
  w: number
  h: number
}

export function tamanhoDoAssado(naturalW: number, naturalH: number): Tamanho {
  const maior = Math.max(naturalW, naturalH)
  if (maior <= ASSADO_LADO_MAX) return { w: naturalW, h: naturalH }
  const f = ASSADO_LADO_MAX / maior
  return { w: Math.round(naturalW * f), h: Math.round(naturalH * f) }
}

/** Chave do cache: as duas fontes + os anéis (ordem dos pontos conta — anel
 *  diferente é recorte diferente). */
export function chaveDoAssado(srcMapa: string, srcOverlay: string, aneis: MapaPonto[][]): string {
  const a = aneis.map((anel) => anel.map((p) => `${p.x},${p.y}`).join(';')).join('|')
  return `${srcMapa}\n${srcOverlay}\n${a}`
}

/** Desenha o mapa e, POR ANEL, clipa e desenha o overlay — a mesma semântica
 *  de UNIÃO do `<clipPath>` com vários `<polygon>` (nada de even-odd: um anel
 *  dentro de outro continua coberto). Anéis em px da FONTE; `bitmap` é o
 *  tamanho do canvas. Anel com menos de 3 pontos não recorta nada. */
export function desenharAssado(
  ctx: CanvasRenderingContext2D,
  bitmap: Tamanho,
  fonte: Tamanho,
  mapa: CanvasImageSource,
  overlay: CanvasImageSource,
  aneis: MapaPonto[][],
): void {
  ctx.drawImage(mapa, 0, 0, bitmap.w, bitmap.h)
  const sx = bitmap.w / fonte.w
  const sy = bitmap.h / fonte.h
  for (const anel of aneis) {
    if (anel.length < 3) continue
    ctx.save()
    ctx.beginPath()
    anel.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x * sx, p.y * sy)
      else ctx.lineTo(p.x * sx, p.y * sy)
    })
    ctx.closePath()
    ctx.clip()
    ctx.drawImage(overlay, 0, 0, bitmap.w, bitmap.h)
    ctx.restore()
  }
}

// ── cache (módulo: sobrevive a remontagens do viewer) ──────────────────────
const cache = new Map<string, string>()

function lembrar(chave: string, url: string): void {
  cache.set(chave, url)
  while (cache.size > CACHE_MAX) {
    const maisAntiga = cache.keys().next().value as string
    const antigo = cache.get(maisAntiga)
    cache.delete(maisAntiga)
    if (antigo) revogar(antigo)
  }
}

function lembrado(chave: string): string | null {
  const url = cache.get(chave)
  if (url === undefined) return null
  // LRU: quem foi usado agora vai pro fim da fila
  cache.delete(chave)
  cache.set(chave, url)
  return url
}

function revogar(url: string): void {
  try {
    URL.revokeObjectURL(url)
  } catch {
    /* ambiente sem URL.revokeObjectURL */
  }
}

export function __resetAssadoForTests(): void {
  for (const url of cache.values()) revogar(url)
  cache.clear()
}

/** Carrega pelo evento `load` — NÃO por `img.decode()`: no Chromium o
 *  decode() rejeita com EncodingError acima de um tamanho (a cheia de 7440 px
 *  cai fora; visto 2026-09-29), e o celular tem limite menor ainda. */
function carregar(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => res(img)
    img.onerror = () => rej(new Error(`imagem não carregou: ${src}`))
    img.src = src
  })
}

/** Bitmap já no tamanho do assado: `createImageBitmap` com resize decodifica
 *  e reduz fora da thread principal (e sem materializar os 39 Mpx da cheia);
 *  sem ele (ou se falhar), o próprio elemento vai pro drawImage. Quem chama
 *  fecha o bitmap depois de desenhar. */
async function bitmapDe(img: HTMLImageElement, alvo: Tamanho): Promise<CanvasImageSource> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(img, { resizeWidth: alvo.w, resizeHeight: alvo.h, resizeQuality: 'high' })
    } catch {
      /* cai no elemento */
    }
  }
  return img
}

function fechar(fonte: CanvasImageSource): void {
  const b = fonte as { close?: () => void }
  if (typeof b.close === 'function') b.close()
}

type Canvas2D = { getContext(tipo: '2d'): CanvasRenderingContext2D | null; width: number; height: number }

function criarCanvas(t: Tamanho): { canvas: Canvas2D; paraBlob: (tipo: string, q: number) => Promise<Blob | null> } {
  if (typeof OffscreenCanvas === 'function') {
    const c = new OffscreenCanvas(t.w, t.h)
    return {
      canvas: c as unknown as Canvas2D,
      paraBlob: (tipo, quality) => c.convertToBlob({ type: tipo, quality }).catch(() => null),
    }
  }
  const c = document.createElement('canvas')
  c.width = t.w
  c.height = t.h
  return {
    canvas: c,
    paraBlob: (tipo, quality) => new Promise((res) => c.toBlob((b) => res(b), tipo, quality)),
  }
}

/** Codifica em webp; navegador sem encoder webp devolve outro tipo (png por
 *  spec) → recodifica em jpeg (o mapa é pintura; png de 11 Mpx é lento e
 *  pesado demais pro celular). */
async function codificar(paraBlob: (tipo: string, q: number) => Promise<Blob | null>): Promise<Blob | null> {
  const webp = await paraBlob('image/webp', 0.9)
  if (webp && webp.type === 'image/webp') return webp
  return paraBlob('image/jpeg', 0.92)
}

async function assar(srcMapa: string, srcOverlay: string, fonte: Tamanho, aneis: MapaPonto[][]): Promise<string | null> {
  const [mapaEl, overlayEl] = await Promise.all([carregar(srcMapa), carregar(srcOverlay)])
  const bitmap = tamanhoDoAssado(mapaEl.naturalWidth, mapaEl.naturalHeight)
  if (!bitmap.w || !bitmap.h) return null
  const [mapa, overlay] = await Promise.all([bitmapDe(mapaEl, bitmap), bitmapDe(overlayEl, bitmap)])
  try {
    const { canvas, paraBlob } = criarCanvas(bitmap)
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    desenharAssado(ctx, bitmap, fonte, mapa, overlay, aneis)
    const blob = await codificar(paraBlob)
    if (!blob) return null
    return URL.createObjectURL(blob)
  } finally {
    fechar(mapa)
    fechar(overlay)
  }
}

export interface UseMapaAssadoArgs {
  srcMapa: string | null
  srcOverlay: string | null
  /** Dimensões da FONTE das coordenadas dos anéis (o atlas: 7440×5262). */
  fonteW: number
  fonteH: number
  /** Anéis das regiões desabilitadas, em px da fonte (`r.aneis ?? [r.pontos]`). */
  aneis: MapaPonto[][]
  ativo: boolean
}

/** `src` do bitmap assado (blob: URL) quando pronto; `null` enquanto assa, se
 *  falhou, se inativo ou se não há nada a cobrir — e aí o viewer mostra a
 *  imagem normal + overlay em SVG, como sempre. */
export function useMapaAssado(args: UseMapaAssadoArgs): { src: string | null } {
  const { srcMapa, srcOverlay, fonteW, fonteH, ativo } = args
  // chave estável por conteúdo dos anéis (o array vem novo a cada render)
  const chave = useMemo(
    () => (ativo && srcMapa && srcOverlay && args.aneis.length > 0 ? chaveDoAssado(srcMapa, srcOverlay, args.aneis) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ativo, srcMapa, srcOverlay, args.aneis.map((a) => a.map((p) => `${p.x},${p.y}`).join(';')).join('|')],
  )
  const aneisRef = args.aneis
  const [pronto, setPronto] = useState<{ chave: string; url: string } | null>(null)

  useEffect(() => {
    if (!chave || !srcMapa || !srcOverlay) return
    const emCache = lembrado(chave)
    if (emCache) {
      setPronto({ chave, url: emCache })
      return
    }
    let vivo = true
    assar(srcMapa, srcOverlay, { w: fonteW, h: fonteH }, aneisRef)
      .then((url) => {
        if (!url) return
        if (!vivo) {
          // resultado tardio: guarda no cache mesmo assim (não desperdiça o assado)
          lembrar(chave, url)
          return
        }
        lembrar(chave, url)
        setPronto({ chave, url })
      })
      .catch(() => {
        /* falhou → segue sem assado (SVG cobre) */
      })
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, srcMapa, srcOverlay, fonteW, fonteH])

  return { src: pronto && pronto.chave === chave ? pronto.url : null }
}
