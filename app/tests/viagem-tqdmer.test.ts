// VALIDAÇÃO NA TRILHA REAL (report 2026-10-06, sessão TQDMER): "tem muito mar
// que não tá dando pra usar barco… perdeu praticamente tudo quando eu salvei
// porque considerou errado mesmo realmente sendo barco ou caravana". A
// escolha estava gravada (meioPasso/meio), mas caía no automático: (A) o mar
// fora do mapa colorido não estava pintado (virava Gramado) e (B) a linha reta
// que preenche a lacuna entre hexes marcados não vizinhos saía da estrada /
// cortava terra. Fixture SANITIZADA (só coords/kind/meio; o repo é público),
// com o terreno e a config congelados da vault no mesmo dia.
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { calcularViagem, resolverMeio, type ViagemCfg } from '../src/grupo/viagem'
import { indiceTerreno } from '../src/grupo/terreno-mundo'

const dir = path.dirname(fileURLToPath(import.meta.url))
const fx = JSON.parse(fs.readFileSync(path.join(dir, 'fixtures/tqdmer-trilha.json'), 'utf8')) as {
  cfg: ViagemCfg
  terreno: Record<string, string[]>
  rotas: Record<string, string[]>
  hexes: { id: string; col: number; row: number; kind: 'parada' | 'caminho'; meio?: string; meioPasso?: string }[]
}
const ter = indiceTerreno(fx.terreno)
const rot = indiceTerreno(fx.rotas)

/** Passos (índice do hex de chegada) em que a escolha do usuário (Barco ou
 *  Caravana — meioPasso da chegada ?? meio do trecho) NÃO foi usada em tudo. */
function fallbacks() {
  const v = calcularViagem({
    hexes: fx.hexes,
    terrenoDe: (c, r) => ter.get(`${c},${r}`),
    rotaDe: (c, r) => rot.get(`${c},${r}`),
    cfg: fx.cfg,
  })
  // meio do trecho por hex de chegada (o da próxima parada)
  const trecho: (string | undefined)[] = []
  let cur: string | undefined
  for (let i = fx.hexes.length - 1; i >= 0; i--) {
    if (fx.hexes[i]!.kind !== 'caminho') cur = fx.hexes[i]!.meio
    trecho[i] = cur
  }
  const out: { i: number; de: string; para: string; escolha: string; usou: string[] }[] = []
  let escolhas = 0
  v.passos.forEach((p, i) => {
    if (!p) return
    const h = fx.hexes[i]!
    const escolha = resolverMeio(fx.cfg, h.meioPasso ?? trecho[i])
    if (escolha !== 'Barco' && escolha !== 'Caravana') return
    escolhas++
    if (p.meios.length === 1 && p.meios[0] === escolha) return
    const a = fx.hexes[i - 1]!
    out.push({ i, de: `${a.col},${a.row}`, para: `${h.col},${h.row}`, escolha, usou: p.meios })
  })
  return { out, escolhas }
}

describe('trilha real TQDMER: Barco/Caravana escolhidos valem', () => {
  it('154 passos com Barco/Caravana escolhidos: só a descida da serra a pé não usa a escolha', () => {
    const { out, escolhas } = fallbacks()
    if (process.env.TQDMER_OUT) fs.writeFileSync(process.env.TQDMER_OUT, JSON.stringify({ escolhas, out }, null, 1))
    expect(escolhas).toBe(154)
    // passo de comprimento zero (parada repetida no mesmo hex) não anda: ok
    const reais = out.filter((o) => o.de !== o.para)
    // ÚNICO fallback legítimo: o trecho Palácio das Pedras → Magna Vigília é
    // de Caravana, mas o 1º passo desce a serra (32,7 → 32,9: montanha com
    // escadaria, sem estrada) — Caravana só anda na estrada, desce A pé.
    expect(reais).toEqual([{ i: 203, de: '32,7', para: '32,9', escolha: 'Caravana', usou: ['A pé'] }])
  })
  it('o mar fora do mapa colorido é mar (antes virava Gramado e o Barco caía)', () => {
    for (const h of ['26,7', '26,9', '27,9', '28,10', '30,5', '30,12', '35,12', '36,5', '38,12', '39,6', '39,10', '41,13'])
      expect(ter.get(h), h).toBe('mar')
  })
})
