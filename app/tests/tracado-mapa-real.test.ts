// @vitest-environment node
// TRAÇADO NO MAPA REAL, com a malha REAL da POA (report 2026-09-10: "tem
// umas linhas com umas curvas fazendo umas voltas nada a ver"). A primeira
// versão punha cotovelo de metrô em todo trecho — nos trechos curtos (paradas
// a 4–20 unidades) e nas meias-voltas o cotovelo, o deslocamento e o
// arredondamento se atropelavam e viravam laço. As réguas aqui dizem o que é
// "nada a ver", medido contra o caminho parada-a-parada:
//   1. o traço não passa de 30% mais comprido que o percurso reto;
//   2. não inventa meia-volta (>150°) onde as paradas não voltam;
//   3. não cruza a si mesmo mais vezes do que o percurso reto já cruza.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { montarMalha } from '../src/transporte/malha'
import { parseRecurso } from '../src/recursos/parse-recurso'
import { tracarLinhasNoMapa, type PontoXY } from '../src/transporte/tracado-mapa'
import type { ContextoDef } from '../src/data/context-def'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const cyber = path.join(path.dirname(appDir), 'vault-data-cyberpunk')
const temDataset = fs.existsSync(path.join(cyber, 'contexto.json'))

function comprimento(pts: PontoXY[]): number {
  let s = 0
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y)
  return s
}
function viradas(pts: PontoXY[], limite: number): number {
  let n = 0
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1]!, v = pts[i]!, b = pts[i + 1]!
    const l1 = Math.hypot(v.x - a.x, v.y - a.y), l2 = Math.hypot(b.x - v.x, b.y - v.y)
    if (l1 < 1e-6 || l2 < 1e-6) continue
    const cos = ((v.x - a.x) * (b.x - v.x) + (v.y - a.y) * (b.y - v.y)) / (l1 * l2)
    if ((Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI > limite) n++
  }
  return n
}
function cruzamentos(pts: PontoXY[]): number {
  const cruza = (p: PontoXY, q: PontoXY, r: PontoXY, s: PontoXY) => {
    const d = (a: PontoXY, b: PontoXY, c: PontoXY) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
    const d1 = d(r, s, p), d2 = d(r, s, q), d3 = d(p, q, r), d4 = d(p, q, s)
    return d1 * d2 < 0 && d3 * d4 < 0
  }
  let n = 0
  for (let i = 0; i < pts.length - 1; i++)
    for (let j = i + 2; j < pts.length - 1; j++) if (cruza(pts[i]!, pts[i + 1]!, pts[j]!, pts[j + 1]!)) n++
  return n
}

describe.skipIf(!temDataset)('traçado da malha REAL no mapa do Atlas', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(cyber, 'index.json'), 'utf8')) as IndexManifest
  const def = JSON.parse(fs.readFileSync(path.join(cyber, 'contexto.json'), 'utf8')) as ContextoDef
  const ler = (id: string) => JSON.parse(fs.readFileSync(path.join(cyber, `${id}.json`), 'utf8')) as VaultDoc
  const docs = manifest.docs
    .filter((d) => d.type === 'Linha' || d.type === 'Recurso' || d.basename === 'Malha de Transportes' || d.basename === 'Porto Alegre')
    .map((d) => ler(d.id))
  const planos = new Map<string, number>()
  for (const d of docs) {
    const r = d.type === 'Recurso' ? parseRecurso(d) : null
    if (r?.tipo === def.recursos!.tipos.estilo && r.nivel) planos.set(r.nome, r.nivel)
  }
  const malha = montarMalha(docs, def.transporte!, (n) => planos.get(n) ?? null)
  const leaf = docs.find((d) => d.basename === 'Porto Alegre')!.locationBody!.leaflet! as unknown as {
    bounds: number[][]
    markers: { nome: string; lat: number; long: number }[]
  }
  const latMax = leaf.bounds[1]![0]!
  const pos = new Map(leaf.markers.map((m) => [m.nome, { x: m.long, y: latMax - m.lat }]))
  const ponto = (n: string) => pos.get(n) ?? null
  const linhas = malha.linhas.filter((l) => !l.fechada && l.paradas.length > 1)
  // escala do mapa ajustado à tela (a mais apertada: é onde os laços apareciam)
  const tracado = tracarLinhasNoMapa(linhas, ponto, { folga: 7, raio: 22 })
  const reto = (l: (typeof linhas)[number]) =>
    (l.circular && l.paradas.length > 2 ? [...l.paradas, l.paradas[0]!] : l.paradas)
      .map((n) => pos.get(n))
      .filter((p): p is PontoXY => !!p)

  it('nenhuma linha dá volta à toa: comprimento, meia-volta e cruzamento', () => {
    const problemas: string[] = []
    for (const l of linhas) {
      const base = reto(l)
      const pts = tracado.get(l.id)!.pontos
      const razao = comprimento(pts) / Math.max(1e-6, comprimento(base))
      if (razao > 1.3) problemas.push(`${l.nome}: ${Math.round((razao - 1) * 100)}% mais comprido`)
      const extras = viradas(pts, 150) - viradas(base, 150)
      if (extras > 0) problemas.push(`${l.nome}: ${extras} meia-volta(s) inventada(s)`)
      const cr = cruzamentos(pts) - cruzamentos(base)
      if (cr > 0) problemas.push(`${l.nome}: cruza a si mesma ${cr}× a mais`)
    }
    expect(problemas, problemas.join(' | ')).toEqual([])
  })
})
