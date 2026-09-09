// ÁREAS DE BAIRRO POR COR (2026-09-09) — o marcador `Bairro` do bloco leaflet
// semeia a cor, a cor delimita o território, e clicar em qualquer ponto do
// bairro tem que dar o bairro certo. Além do buffer sintético (regras do
// indexador), roda sobre a IMAGEM REAL do mapa da POA e os marcadores reais da
// nota: é ali que o casamento exato de cor e o corte de croma se provam.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  areaDeBairro,
  bairroEmFracao,
  indexarBairros,
  realceDaArea,
  type SementeBairro,
} from '../src/map/bairros-cor'
import type { IndexManifest, VaultDoc } from '../src/data/types'

/** Buffer RGBA a partir de uma grade de caracteres + paleta. */
function buffer(linhas: string[], paleta: Record<string, [number, number, number]>) {
  const altura = linhas.length
  const largura = linhas[0]!.length
  const px = new Uint8ClampedArray(largura * altura * 4)
  linhas.forEach((linha, y) => {
    [...linha].forEach((c, x) => {
      const [r, g, b] = paleta[c]!
      const i = (y * largura + x) * 4
      px[i] = r
      px[i + 1] = g
      px[i + 2] = b
      px[i + 3] = 255
    })
  })
  return { px, largura, altura }
}

const CENTRO = (largura: number, x: number) => (x + 0.5) / largura

describe('indexarBairros', () => {
  const paleta: Record<string, [number, number, number]> = {
    a: [252, 127, 198], // rosa
    b: [127, 203, 197], // verde
    '.': [228, 228, 228], // papel (acromático)
    w: [255, 255, 255],
  }
  const grade = [
    'aaaa....',
    'aaaa....',
    'aaaabbbb',
    '....bbbb',
  ]
  const { px, largura, altura } = buffer(grade, paleta)
  const sementes: SementeBairro[] = [
    { nome: 'Rosa', fx: CENTRO(largura, 1), fy: CENTRO(altura, 0) },
    { nome: 'Verde', fx: CENTRO(largura, 5), fy: CENTRO(altura, 2) },
    { nome: 'Na Água', fx: CENTRO(largura, 6), fy: CENTRO(altura, 0) },
  ]

  it('cada semente vira a área da cor exata sob ela; cor acromática não é área', () => {
    const idx = indexarBairros(px, largura, altura, sementes)
    expect(idx.areas.map((a) => a.nome)).toEqual(['Rosa', 'Verde'])
    expect(idx.semArea).toEqual(['Na Água'])
    expect(areaDeBairro(idx, 'Rosa')).toMatchObject({ cor: '#fc7fc6', px: 12 })
    expect(areaDeBairro(idx, 'Verde')).toMatchObject({ cor: '#7fcbc5', px: 8 })
    expect(areaDeBairro(idx, 'Na Água')).toBeNull()
  })

  it('clicar em QUALQUER ponto da área dá o bairro; fora dela, nada', () => {
    const idx = indexarBairros(px, largura, altura, sementes)
    // longe da semente, ainda dentro do rosa
    expect(bairroEmFracao(idx, CENTRO(largura, 0), CENTRO(altura, 2))).toBe('Rosa')
    expect(bairroEmFracao(idx, CENTRO(largura, 3), CENTRO(altura, 1))).toBe('Rosa')
    expect(bairroEmFracao(idx, CENTRO(largura, 7), CENTRO(altura, 3))).toBe('Verde')
    // papel: nem rosa nem verde
    expect(bairroEmFracao(idx, CENTRO(largura, 6), CENTRO(altura, 0))).toBeNull()
    expect(bairroEmFracao(idx, CENTRO(largura, 0), CENTRO(altura, 3))).toBeNull()
    // fora da imagem
    expect(bairroEmFracao(idx, 1.4, 0.5)).toBeNull()
  })

  it('a caixa da área diz onde ela começa e quanto ocupa (é o que decide se o nome cabe)', () => {
    const idx = indexarBairros(px, largura, altura, sementes)
    // rosa: colunas 0..3, linhas 0..2
    expect(areaDeBairro(idx, 'Rosa')!.caixa).toEqual({ x: 0, y: 0, largura: 4, altura: 3 })
    // verde: colunas 4..7, linhas 2..3
    expect(areaDeBairro(idx, 'Verde')!.caixa).toEqual({ x: 4, y: 2, largura: 4, altura: 2 })
  })

  it('o realce pinta só os px da área', () => {
    const idx = indexarBairros(px, largura, altura, sementes)
    const rgba = realceDaArea(idx, 'Verde', [255, 0, 0, 128])!
    let pintados = 0
    for (let i = 3; i < rgba.length; i += 4) if (rgba[i]) pintados++
    expect(pintados).toBe(8)
    const dentro = ((2 * largura + 5) * 4) // (5,2) é verde
    expect([rgba[dentro], rgba[dentro + 3]]).toEqual([255, 128])
    expect(realceDaArea(idx, 'Na Água', [255, 0, 0, 128])).toBeNull()
  })

  it('duas sementes na mesma cor: a primeira fica com a área', () => {
    const idx = indexarBairros(px, largura, altura, [
      ...sementes,
      { nome: 'Rosa Bis', fx: CENTRO(largura, 2), fy: CENTRO(altura, 1) },
    ])
    expect(idx.areas.map((a) => a.nome)).toEqual(['Rosa', 'Verde'])
    expect(idx.semArea).toContain('Rosa Bis')
  })
})

// ───────────────────────── imagem REAL da POA ─────────────────────────

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const cyberDir = path.join(path.dirname(appDir), 'vault-data-cyberpunk')

function docPorBasename(basename: string): VaultDoc | null {
  const idx = path.join(cyberDir, 'index.json')
  if (!fs.existsSync(idx)) return null
  const m = JSON.parse(fs.readFileSync(idx, 'utf8')) as IndexManifest
  const achado = m.docs.find((d) => d.basename === basename)
  if (!achado) return null
  const arq = path.join(cyberDir, `${achado.id}.json`)
  return fs.existsSync(arq) ? (JSON.parse(fs.readFileSync(arq, 'utf8')) as VaultDoc) : null
}

const poa = docPorBasename('Porto Alegre')
const leaflet = poa?.locationBody?.leaflet ?? null
const mapaPng = (() => {
  if (!leaflet) return null
  const p = path.join(cyberDir, 'assets', 'Recursos e Mídia', 'Imagens', 'Contextos', leaflet.image)
  return fs.existsSync(p) ? p : null
})()

describe.skipIf(!leaflet || !mapaPng)('mapa REAL de Porto Alegre', () => {
  it('as 14 regiões pintadas viram bairro; o Delta Radioativo (na água) não; todo marcador cai no bairro da nota dele', async () => {
    const sharp = (await import('sharp')).default
    const { data, info } = await sharp(mapaPng!)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    const px = new Uint8ClampedArray(data.buffer, data.byteOffset, data.length)
    const latMax = leaflet!.bounds![1][0] - leaflet!.bounds![0][0]
    const longMax = leaflet!.bounds![1][1] - leaflet!.bounds![0][1]
    const fracao = (m: { lat: number; long: number }) => ({
      fx: m.long / longMax,
      fy: 1 - m.lat / latMax,
    })
    const sementes = leaflet!.markers
      .filter((m) => m.tipo === 'Bairro')
      .map((m) => ({ nome: m.nome, ...fracao(m) }))
    const idx = indexarBairros(px, info.width, info.height, sementes)

    // 14 marcadores `Bairro` = 14 regiões pintadas. O Delta Radioativo, que
    // fica na água, entra no bloco como `Radioativo` (pino), então nem semeia —
    // e se algum dia virar `Bairro`, o corte de croma o manda pra `semArea`.
    expect(sementes.length).toBe(14)
    expect(idx.areas.length).toBe(14)
    expect(idx.semArea).toEqual([])
    expect(leaflet!.markers.find((m) => m.nome === 'Delta Radioativo')?.tipo).toBe('Radioativo')
    // a maior área é a Zona Deserta (o sul inteiro da cidade)
    expect([...idx.areas].sort((a, b) => b.px - a.px)[0]!.nome).toBe('Zona Deserta')
    // e todo marcador do bloco cai dentro do bairro do próprio marcador de
    // bairro — o gerador (scripts/poa_mapa_bairros.py) garante isso
    const bairroDe = new Map(sementes.map((s) => [s.nome, s.nome]))
    for (const m of leaflet!.markers) {
      if (!bairroDe.has(m.nome)) continue
      const f = fracao(m)
      expect(bairroEmFracao(idx, f.fx, f.fy), m.nome).toBe(m.nome)
    }
    // ENCLAVE: a Restinga é uma ilha de cor no meio da Zona Deserta — o px do
    // meio dela é Restinga, não Zona Deserta (é o que o mapa mostra).
    const restinga = leaflet!.markers.find((m) => m.nome === 'Restinga')!
    const f = fracao(restinga)
    expect(bairroEmFracao(idx, f.fx, f.fy)).toBe('Restinga')
    expect(bairroEmFracao(idx, f.fx, f.fy + 0.09)).toBe('Zona Deserta')
    // a caixa de cada área é o que decide se o nome cabe na tela: a Zona
    // Deserta tem espaço de sobra no mapa inteiro; o Bom Fim, um punhado de px
    // (é por isso que o nome dele só aparece aproximado).
    const zona = idx.areas.find((a) => a.nome === 'Zona Deserta')!
    const bomFim = idx.areas.find((a) => a.nome === 'Bom Fim')!
    expect(zona.caixa.largura).toBeGreaterThan(200)
    expect(bomFim.caixa.largura).toBeLessThan(60)
    // fora da cidade (canto de cima à esquerda, o Guaíba) não há bairro
    expect(bairroEmFracao(idx, 0.02, 0.02)).toBeNull()
  })
})
