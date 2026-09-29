// @vitest-environment jsdom
// #573 — OVERLAY ASSADO: mapa + overlay anti-spoiler (clipado nas regiões
// desabilitadas) viram UM bitmap, e o SVG do mapa fica só com vetor. No Gecko
// o <image> clipado dentro do SVG transformado era re-rasterizado como blob a
// cada quadro do gesto. jsdom não tem canvas: tudo aqui roda com um contexto
// falso que grava as chamadas, e Image/createObjectURL falsos.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { chaveDoAssado, desenharAssado, tamanhoDoAssado, useMapaAssado, __resetAssadoForTests } from '../src/map/mapa-assado'

const anelA = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]
const anelB = [{ x: 200, y: 200 }, { x: 300, y: 200 }, { x: 250, y: 300 }]

describe('#573 — chaveDoAssado', () => {
  it('muda com o src do mapa, do overlay e com os anéis (ordem dos pontos conta); igual pra entradas iguais', () => {
    const a = chaveDoAssado('m1', 'o1', [anelA])
    expect(chaveDoAssado('m1', 'o1', [anelA])).toBe(a)
    expect(chaveDoAssado('m2', 'o1', [anelA])).not.toBe(a)
    expect(chaveDoAssado('m1', 'o2', [anelA])).not.toBe(a)
    expect(chaveDoAssado('m1', 'o1', [anelB])).not.toBe(a)
    expect(chaveDoAssado('m1', 'o1', [anelA, anelB])).not.toBe(a)
    expect(chaveDoAssado('m1', 'o1', [[anelA[1]!, anelA[0]!, anelA[2]!]])).not.toBe(a)
  })
})

describe('#573 — tamanhoDoAssado', () => {
  it('teto de 4096 no lado maior, proporção preservada; a média (≤4000) fica igual', () => {
    expect(tamanhoDoAssado(4000, 2829)).toEqual({ w: 4000, h: 2829 })
    expect(tamanhoDoAssado(7440, 5262)).toEqual({ w: 4096, h: 2897 })
    expect(tamanhoDoAssado(4352, 5888)).toEqual({ w: 3027, h: 4096 })
  })
})

function contextoFalso() {
  const chamadas: string[] = []
  const ctx = {
    drawImage: (img: { nome: string }, ...args: number[]) => chamadas.push(`drawImage:${img.nome}:${args.join(',')}`),
    save: () => chamadas.push('save'),
    restore: () => chamadas.push('restore'),
    beginPath: () => chamadas.push('beginPath'),
    moveTo: (x: number, y: number) => chamadas.push(`moveTo:${x},${y}`),
    lineTo: (x: number, y: number) => chamadas.push(`lineTo:${x},${y}`),
    closePath: () => chamadas.push('closePath'),
    clip: () => chamadas.push('clip'),
    fill: () => chamadas.push('fill'),
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, chamadas }
}

describe('#573 — desenharAssado', () => {
  it('desenha o mapa e, POR ANEL, clipa e desenha o overlay (união dos polígonos, como o <clipPath> com vários <polygon>), sem fill', () => {
    const { ctx, chamadas } = contextoFalso()
    const mapa = { nome: 'mapa' } as unknown as CanvasImageSource
    const overlay = { nome: 'overlay' } as unknown as CanvasImageSource
    // bitmap 2000×1000 pra fonte 4000×2000 → escala 0,5
    desenharAssado(ctx, { w: 2000, h: 1000 }, { w: 4000, h: 2000 }, mapa, overlay, [anelA, anelB])
    expect(chamadas).toEqual([
      'drawImage:mapa:0,0,2000,1000',
      'save', 'beginPath', 'moveTo:0,0', 'lineTo:50,0', 'lineTo:50,50', 'closePath', 'clip',
      'drawImage:overlay:0,0,2000,1000', 'restore',
      'save', 'beginPath', 'moveTo:100,100', 'lineTo:150,100', 'lineTo:125,150', 'closePath', 'clip',
      'drawImage:overlay:0,0,2000,1000', 'restore',
    ])
    expect(chamadas.includes('fill')).toBe(false)
  })
  it('anel com menos de 3 pontos é ignorado (não clipa nada = não desenha overlay)', () => {
    const { ctx, chamadas } = contextoFalso()
    desenharAssado(ctx, { w: 10, h: 10 }, { w: 10, h: 10 }, { nome: 'mapa' } as unknown as CanvasImageSource, { nome: 'overlay' } as unknown as CanvasImageSource, [[{ x: 0, y: 0 }, { x: 1, y: 1 }]])
    expect(chamadas).toEqual(['drawImage:mapa:0,0,10,10'])
  })
})

// ── hook ────────────────────────────────────────────────────────────────
interface ImagemFalsa { src: string; naturalWidth: number; naturalHeight: number }
let imagens: ImagemFalsa[] = []
let falhar = new Set<string>()
let tipoDevolvido = 'image/webp'
let canvases: Array<{ w: number; h: number; ctx: ReturnType<typeof contextoFalso>; toBlob: unknown }> = []
let urls: string[] = []
let revogadas: string[] = []

beforeEach(() => {
  imagens = []
  falhar = new Set()
  tipoDevolvido = 'image/webp'
  canvases = []
  urls = []
  revogadas = []
  __resetAssadoForTests()
  // Image falsa por evento `load` (o hook não usa decode(): no Chromium ele
  // rejeita acima de um tamanho) — dispara load/error no próximo tick
  vi.stubGlobal('Image', class {
    _src = ''
    naturalWidth = 4000
    naturalHeight = 2829
    decoding = ''
    onload: null | (() => void) = null
    onerror: null | (() => void) = null
    constructor() {
      imagens.push(this as unknown as ImagemFalsa)
    }
    get src() {
      return this._src
    }
    set src(v: string) {
      this._src = v
      setTimeout(() => (falhar.has(v) ? this.onerror?.() : this.onload?.()), 0)
    }
  })
  vi.stubGlobal('createImageBitmap', undefined)
  const origCreate = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    if (tag !== 'canvas') return origCreate(tag)
    const c = { w: 0, h: 0, ctx: contextoFalso(), toBlob: null as unknown }
    const el = {
      set width(v: number) { c.w = v },
      get width() { return c.w },
      set height(v: number) { c.h = v },
      get height() { return c.h },
      getContext: () => c.ctx.ctx,
      toBlob: (cb: (b: Blob | null) => void, tipo: string) => {
        const t = tipo === 'image/webp' ? tipoDevolvido : tipo
        cb(new Blob(['x'], { type: t }))
      },
    }
    canvases.push(c)
    return el as unknown as HTMLElement
  })
  vi.stubGlobal('OffscreenCanvas', undefined)
  let n = 0
  vi.stubGlobal('URL', Object.assign(Object.create(URL), {
    createObjectURL: (b: Blob) => {
      const u = `blob:assado-${++n}-${b.type}`
      urls.push(u)
      return u
    },
    revokeObjectURL: (u: string) => {
      revogadas.push(u)
    },
  }))
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const esperar = () => act(async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)) })

describe('#573 — useMapaAssado', () => {
  const base = { srcMapa: '/m.webp', srcOverlay: '/o.webp', fonteW: 4000, fonteH: 2829, aneis: [anelA] }
  it('inativo: src null e nenhuma imagem carregada', async () => {
    const { result } = renderHook(() => useMapaAssado({ ...base, ativo: false }))
    await esperar()
    expect(result.current.src).toBeNull()
    expect(imagens.length).toBe(0)
  })
  it('ativo: carrega as duas imagens, desenha no tamanho da fonte carregada, codifica webp e entrega um blob: URL', async () => {
    const { result } = renderHook(() => useMapaAssado({ ...base, ativo: true }))
    expect(result.current.src).toBeNull() // ainda assando → o viewer mantém o SVG
    await esperar()
    expect(imagens.map((i) => i.src)).toEqual(['/m.webp', '/o.webp'])
    expect(canvases[0]!.w).toBe(4000)
    expect(canvases[0]!.h).toBe(2829)
    expect(canvases[0]!.ctx.chamadas[0]).toBe('drawImage:undefined:0,0,4000,2829')
    expect(result.current.src).toBe('blob:assado-1-image/webp')
  })
  it('navegador sem encoder webp (devolve png) → recodifica em jpeg', async () => {
    tipoDevolvido = 'image/png'
    const { result } = renderHook(() => useMapaAssado({ ...base, ativo: true }))
    await esperar()
    expect(result.current.src).toBe('blob:assado-1-image/jpeg')
  })
  it('imagem que falha → src null (o SVG continua cobrindo; nunca um quadro sem overlay)', async () => {
    falhar.add('/o.webp')
    const { result } = renderHook(() => useMapaAssado({ ...base, ativo: true }))
    await esperar()
    expect(result.current.src).toBeNull()
    expect(canvases.length).toBe(0)
  })
  it('anéis novos → chave nova, bitmap novo; o cache guarda 3 e revoga o mais antigo', async () => {
    const { result, rerender } = renderHook((p: { aneis: typeof base.aneis }) => useMapaAssado({ ...base, ativo: true, aneis: p.aneis }), { initialProps: { aneis: [anelA] } })
    await esperar()
    const u1 = result.current.src
    rerender({ aneis: [anelB] })
    await esperar()
    const u2 = result.current.src
    expect(u2).not.toBe(u1)
    rerender({ aneis: [anelA] }) // volta: vem do cache, sem assar de novo
    await esperar()
    expect(result.current.src).toBe(u1)
    expect(canvases.length).toBe(2)
    rerender({ aneis: [anelA, anelB] })
    await esperar()
    rerender({ aneis: [anelB, anelA] })
    await esperar()
    // LRU: A foi reusado depois de B, então o mais antigo é B
    expect(revogadas).toEqual([u2])
  })
  it('sem anéis (nada desabilitado) → src null mesmo ativo', async () => {
    const { result } = renderHook(() => useMapaAssado({ ...base, ativo: true, aneis: [] }))
    await esperar()
    expect(result.current.src).toBeNull()
  })
})
