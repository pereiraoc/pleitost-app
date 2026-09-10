// MARCADOR PRA CADA LUGAR (2026-09-09) — os 226 lugares de Atlas/Porto Alegre
// têm ponto no mapa, o TIPO de cada ponto é dado da nota (`markerTag`) e cada
// um cai dentro do bairro que a nota declara. Guarda contra o buraco antigo
// (122 lugares existiam na vault e não no mapa) e contra o bloco e o FM
// discordarem do tipo. Dataset REAL da POA como oráculo.
//
// Também: a régua do rótulo (map/rotulos.ts), que é o que faz 210 nomes não
// virarem parede de texto.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { indexarBairros, bairroEmFracao } from '../src/map/bairros-cor'
import { distanciaAoVizinho, posicionarRotulos, rotuloCabe } from '../src/map/rotulos'
import { MARKER_GLYPHS } from '../src/map/leaflet-local'
import type { IndexManifest, VaultDoc } from '../src/data/types'

describe('régua do rótulo', () => {
  it('distância ao vizinho mais próximo; ponto sozinho tem espaço infinito', () => {
    const d = distanciaAoVizinho([
      { nome: 'A', x: 0, y: 0 },
      { nome: 'B', x: 3, y: 4 },
      { nome: 'C', x: 100, y: 0 },
    ])
    expect(d.get('A')).toBe(5)
    expect(d.get('B')).toBe(5)
    expect(d.get('C')).toBeCloseTo(Math.hypot(97, 4), 6)
    expect(distanciaAoVizinho([{ nome: 'só', x: 1, y: 1 }]).get('só')).toBe(Infinity)
  })

  it('o rótulo entra quando o espaço na TELA passa da folga', () => {
    // 5 px da fonte, folga de 22: precisa de escala 4,4 pra caber
    expect(rotuloCabe(5, 1, 22)).toBe(false)
    expect(rotuloCabe(5, 4, 22)).toBe(false)
    expect(rotuloCabe(5, 4.4, 22)).toBe(true)
    // quem está isolado cabe em qualquer escala
    expect(rotuloCabe(Infinity, 0.1, 22)).toBe(true)
    // escala ainda não medida: mostra (mapa mudo é pior que nome demais)
    expect(rotuloCabe(1, 0, 22)).toBe(true)
    expect(rotuloCabe(undefined, 2, 22)).toBe(true)
  })

  it('nenhum rótulo some: quem não cabe na âncora sai de lado e ganha fio', () => {
    // três nomes na MESMA âncora: um fica, os outros saem
    const postos = posicionarRotulos([
      { nome: 'A', x: 100, y: 100, largura: 40, altura: 10 },
      { nome: 'B', x: 100, y: 100, largura: 40, altura: 10 },
      { nome: 'C', x: 100, y: 100, largura: 40, altura: 10 },
    ])
    expect(postos.map((p) => p.nome)).toEqual(['A', 'B', 'C'])
    expect(postos[0]).toMatchObject({ tx: 100, ty: 100, deslocado: false })
    expect(postos[1]!.deslocado).toBe(true)
    expect(postos[2]!.deslocado).toBe(true)
    // e nenhum par se sobrepõe
    for (let i = 0; i < postos.length; i++) {
      for (let j = i + 1; j < postos.length; j++) {
        const a = postos[i]!
        const b = postos[j]!
        const bate =
          Math.abs(a.tx - b.tx) < (a.largura + b.largura) / 2 &&
          Math.abs(a.ty - b.ty) < (a.altura + b.altura) / 2
        expect(bate, `${a.nome} × ${b.nome}`).toBe(false)
      }
    }
  })

  it('quem tem espaço não se mexe (o primeiro da fila fica com o lugar de honra)', () => {
    const postos = posicionarRotulos([
      { nome: 'longe', x: 0, y: 0, largura: 20, altura: 8 },
      { nome: 'perto', x: 500, y: 500, largura: 20, altura: 8 },
    ])
    expect(postos.every((p) => !p.deslocado)).toBe(true)
    expect(postos[1]).toMatchObject({ tx: 500, ty: 500 })
  })
})

// ───────────────────────── dataset REAL da POA ─────────────────────────

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const cyberDir = path.join(path.dirname(appDir), 'vault-data-cyberpunk')
const idxFile = path.join(cyberDir, 'index.json')
const temDataset = fs.existsSync(idxFile)

const manifest = temDataset
  ? (JSON.parse(fs.readFileSync(idxFile, 'utf8')) as IndexManifest)
  : null

function lerDoc(id: string): VaultDoc {
  return JSON.parse(fs.readFileSync(path.join(cyberDir, `${id}.json`), 'utf8')) as VaultDoc
}

const ATLAS_POA = 'Atlas/Porto Alegre/'
const lugares = (manifest?.docs ?? []).filter(
  (d) => d.id.startsWith(ATLAS_POA) && d.type === 'Localização' && d.basename !== 'Porto Alegre',
)
const poa = temDataset ? lerDoc(`${ATLAS_POA}Porto Alegre`) : null
const leaflet = poa?.locationBody?.leaflet ?? null

describe.skipIf(!leaflet)('marcadores do mapa de Porto Alegre', () => {
  it('todo lugar do Atlas tem marcador, e todo marcador é um lugar do Atlas', () => {
    const marcados = new Set(leaflet!.markers.map((m) => m.nome))
    const semMarcador = lugares.filter((d) => !marcados.has(d.basename ?? '')).map((d) => d.basename)
    expect(semMarcador, `sem marcador: ${semMarcador.join(', ')}`).toEqual([])
    // 226 notas de lugar (menos a própria Porto Alegre) = 225 marcadores
    expect(leaflet!.markers.length).toBe(lugares.length)
    const nomes = new Set(lugares.map((d) => d.basename))
    const orfaos = [...marcados].filter((n) => !nomes.has(n))
    expect(orfaos, `marcador sem nota: ${orfaos.join(', ')}`).toEqual([])
  })

  it('o TIPO do marcador é o `markerTag` da nota — bloco e FM não discordam', () => {
    const porNome = new Map(leaflet!.markers.map((m) => [m.nome, m.tipo]))
    const divergentes: string[] = []
    const semTag: string[] = []
    for (const d of lugares) {
      const doc = lerDoc(d.id)
      const tag = doc.frontmatter['markerTag']
      if (typeof tag !== 'string' || !tag) {
        semTag.push(d.basename ?? d.id)
        continue
      }
      if (tag !== porNome.get(d.basename ?? '')) divergentes.push(`${d.basename}: FM ${tag} × bloco ${porNome.get(d.basename ?? '')}`)
    }
    expect(semTag, `sem markerTag: ${semTag.join(', ')}`).toEqual([])
    expect(divergentes).toEqual([])
  })

  it('todo tipo usado tem glifo próprio, fora o pino genérico dos pontos de interesse', () => {
    const tipos = [...new Set(leaflet!.markers.map((m) => m.tipo))].sort()
    const semGlifo = tipos.filter((t) => !(t in MARKER_GLYPHS))
    // o único que cai no pino genérico é o "Ponto de Interesse" (o que a nota
    // declara como subcategoria) — qualquer outro sem glifo é descuido
    expect(semGlifo).toEqual(['Ponto de Interesse'])
    expect(tipos).toContain('Bairro')
    expect(tipos).toContain('Estação')
  })

  it('cada marcador cai DENTRO do bairro que a nota dele declara', async () => {
    const sharp = (await import('sharp')).default
    const png = path.join(
      cyberDir, 'assets', 'Recursos e Mídia', 'Imagens', 'Contextos', leaflet!.image,
    )
    if (!fs.existsSync(png)) return
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const px = new Uint8ClampedArray(data.buffer, data.byteOffset, data.length)
    const latMax = leaflet!.bounds![1][0] - leaflet!.bounds![0][0]
    const longMax = leaflet!.bounds![1][1] - leaflet!.bounds![0][1]
    const fracao = (m: { lat: number; long: number }) => ({ fx: m.long / longMax, fy: 1 - m.lat / latMax })
    const idx = indexarBairros(
      px,
      info.width,
      info.height,
      leaflet!.markers.filter((m) => m.tipo === 'Bairro').map((m) => ({ nome: m.nome, ...fracao(m) })),
    )
    // bairro declarado, subindo a cadeia do FM `Geolocalização` até achar um
    // bairro COM região (a Cidade Baixa fica dentro do Centro Histórico)
    const porNome = new Map(lugares.map((d) => [d.basename ?? d.id, d.id]))
    const comArea = new Set(idx.areas.map((a) => a.nome))
    const alvo = (nome: string): string | null => {
      const vistos = new Set<string>()
      let atual: string | null = nome
      while (atual && !vistos.has(atual)) {
        vistos.add(atual)
        if (comArea.has(atual) && atual !== nome) return atual
        const id = porNome.get(atual)
        const fm = id ? (lerDoc(id).frontmatter['Geolocalização'] as unknown) : null
        const pai = typeof fm === 'string' ? /\[\[([^\]|#]+)/.exec(fm)?.[1]?.trim() : null
        if (!pai || pai === atual) return null
        atual = pai
      }
      return null
    }
    const fora: string[] = []
    for (const m of leaflet!.markers) {
      const bairro = m.tipo === 'Bairro' && comArea.has(m.nome) ? m.nome : alvo(m.nome)
      if (!bairro) continue // o Guaíba, o delta e o que mora na água
      const f = fracao(m)
      const onde = bairroEmFracao(idx, f.fx, f.fy)
      if (onde !== bairro) fora.push(`${m.nome}: declara ${bairro}, cai em ${onde}`)
    }
    expect(fora).toEqual([])
  })
})
