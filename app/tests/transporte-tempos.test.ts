// @vitest-environment node
// TEMPO DE VIAGEM (report 2026-09-10: "tá exagerando demais no tempo total da
// distância — Central até Sarandi, 5 trechos, 1h23"). O modelo compunha
// multiplicadores em cima de velocidades que já eram COMERCIAIS: ônibus a 11
// km/h, kombi a 13, anfíbio a 5,5 — mais devagar que gente andando.
//
// O guarda são as ÂNCORAS que a própria vault declara em prosa (o tempo que a
// nota da linha diz que a viagem leva) e a faixa de velocidade efetiva de cada
// modo. Se alguém mexer nos parâmetros do contexto, é aqui que quebra.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { montarMalha, type LinhaMalha, type Malha } from '../src/transporte/malha'
import { minutosAPe, tempoNaLinha, type Parametros } from '../src/transporte/rotas'
import { parseRecurso } from '../src/recursos/parse-recurso'
import type { ContextoDef } from '../src/data/context-def'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const cyberDir = path.join(path.dirname(appDir), 'vault-data-cyberpunk')
const temDataset = fs.existsSync(path.join(cyberDir, 'contexto.json'))

let cfg: NonNullable<ContextoDef['transporte']>
let malha: Malha
let p: Parametros

if (temDataset) {
  const manifest = JSON.parse(fs.readFileSync(path.join(cyberDir, 'index.json'), 'utf8')) as IndexManifest
  const def = JSON.parse(fs.readFileSync(path.join(cyberDir, 'contexto.json'), 'utf8')) as ContextoDef
  const ler = (id: string) => JSON.parse(fs.readFileSync(path.join(cyberDir, `${id}.json`), 'utf8')) as VaultDoc
  const docs = manifest.docs
    .filter((d) => d.type === 'Linha' || d.type === 'Recurso' || d.basename === 'Malha de Transportes' || d.basename === 'Porto Alegre')
    .map((d) => ler(d.id))
  cfg = def.transporte!
  const planos = new Map<string, number>()
  for (const d of docs) {
    if (d.type !== 'Recurso') continue
    const r = parseRecurso(d)
    if (r?.tipo === def.recursos!.tipos.estilo && r.nivel) planos.set(r.nome, r.nivel)
  }
  malha = montarMalha(docs, cfg, (n) => planos.get(n) ?? null)
  const leaf = docs.find((d) => d.basename === 'Porto Alegre')!.locationBody!.leaflet!
  p = {
    cfg,
    metrosPorUnidade: leaf.scale!,
    posicoes: new Map(leaf.markers.map((m) => [m.nome, { lat: m.lat, long: m.long }])),
    transito: 1,
  }
}

/** Minutos de viagem (sem espera) entre duas paradas de uma linha. */
function viagem(nome: string, de: string, ate: string) {
  const l = malha.linhas.find((x) => x.nome === nome)
  if (!l) throw new Error(`sem linha ${nome}`)
  const i = l.paradas.indexOf(de)
  const j = l.paradas.indexOf(ate)
  if (i < 0 || j < 0) throw new Error(`${nome}: sem parada ${de}/${ate}`)
  const t = tempoNaLinha(l, i, j, p)
  if (!t) throw new Error(`${nome}: sem tempo`)
  return { ...t, linha: l, kmh: t.km / (t.minutos / 60) }
}

/** Velocidade efetiva de uma linha ponta a ponta (km/h). */
function velocidadeDaLinha(l: LinhaMalha): number | null {
  const t = tempoNaLinha(l, 0, l.paradas.length - 1, p)
  return t && t.minutos > 0 ? t.km / (t.minutos / 60) : null
}

describe.skipIf(!temDataset)('tempo de viagem na malha da POA', () => {
  it('as âncoras que a vault escreve em prosa batem com o que o app calcula', () => {
    // "Nova Sarandi e Passo D'Areia ao Centro em DOZE MINUTOS" (L1 POPULAR NORTE)
    const l1 = viagem('L1 POPULAR NORTE', 'Estação Sarandi', 'Estação Central')
    expect(l1.minutos, 'L1 diz doze minutos').toBeGreaterThan(10)
    expect(l1.minutos).toBeLessThan(16)

    // "POUCO MAIS DE UMA HORA de ponta a ponta" (T1 SARANDI — PORTO NOVO)
    const t1 = viagem('T1 SARANDI — PORTO NOVO', 'Rua da Sarandi', 'Estação Porto Novo')
    expect(t1.minutos).toBeGreaterThan(50)
    expect(t1.minutos).toBeLessThan(75)

    // o caso do report: Central → Sarandi de ônibus. Era 83 min de viagem.
    const radial = viagem('SARANDI — CENTRO', 'Estação Central', 'Estação Sarandi')
    expect(radial.km).toBeGreaterThan(12)
    expect(radial.km).toBeLessThan(17)
    expect(radial.minutos, 'o radial da Assis Brasil não leva mais de uma hora').toBeLessThan(60)
    // e o trilho elevado continua ganhando MUITO do ônibus — é o ponto da ficção
    expect(l1.minutos * 2).toBeLessThan(radial.minutos)
  })

  it('cada modo roda na faixa de velocidade que a realidade admite', () => {
    // (mínimo, máximo) de km/h efetivos — a régua é Porto Alegre de verdade:
    // ônibus de cidade faz 18–22 comerciais; van/lotação um pouco mais; o
    // anfíbio é o único mais lento que bicicleta, e a nota da A1 diz por quê
    // ("15 km/h na rua, 6 na água").
    const faixa: Record<string, [number, number]> = {
      Aeromóvel: [45, 65],
      Ônibus: [17, 23],
      'Ônibus Anfíbio': [6, 9],
      Lotação: [24, 31],
      Kombi: [19, 25],
      Balsa: [10, 15],
      Caravana: [15, 23],
    }
    const fora: string[] = []
    for (const l of malha.linhas) {
      if (l.fechada || l.paradas.length < 2) continue
      const v = velocidadeDaLinha(l)
      const f = faixa[l.modo]
      if (v === null || !f) continue
      if (v < f[0] || v > f[1]) fora.push(`${l.nome} (${l.modo} ★${l.qualidade}): ${v.toFixed(1)} km/h`)
    }
    expect(fora).toEqual([])
  })

  it('ninguém do transporte coletivo perde pra quem vai a pé', () => {
    const aPe = cfg.aPe!
    for (const l of malha.linhas) {
      if (l.fechada || l.paradas.length < 2) continue
      const v = velocidadeDaLinha(l)
      if (v === null) continue
      expect(v, `${l.nome} anda menos que a pé`).toBeGreaterThan(aPe.velocidade)
    }
  })

  it('a pé se mede em quilômetro, não em múltiplo do ônibus', () => {
    // 9 km a 4,5 km/h × 1,15 de esquina e cansaço = 2h18
    expect(minutosAPe(9, cfg.aPe!)).toBeCloseTo(138, 0)
    // e não depende de quão bom é o transporte daquele trecho
    expect(minutosAPe(1, cfg.aPe!)).toBeCloseTo(minutosAPe(9, cfg.aPe!) / 9, 5)
  })

  it('o Aeromóvel não paga a sinuosidade da rua (viaduto é reto)', () => {
    const trilho = viagem('L1 POPULAR NORTE', 'Estação Sarandi', 'Estação Central')
    const onibus = viagem('SARANDI — CENTRO', 'Estação Central', 'Estação Sarandi')
    // mesmo par de pontas: o ônibus dá a volta pela rua, o trilho vai reto
    expect(trilho.km).toBeLessThan(onibus.km)
    expect(onibus.km / trilho.km).toBeCloseTo(cfg.sinuosidade ?? 1, 1)
  })
})
