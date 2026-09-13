// ARTE ÓRFÃ (2026-09-14) — quando um item do mundo é renomeado, a arte fica
// com o nome velho e o item some da carta EM SILÊNCIO: o resolvedor procura
// por `<nome do mundo>.png`, não acha, e cai no fallback sem avisar ninguém.
//
// Aconteceu de verdade com o "Comunicador de Pulso" → "Transceptor Clavicular":
// o nome estava errado (a peça é um implante de clavícula, não de pulso), e o
// rename só ficou completo porque os três PNGs foram junto. Esta guarda existe
// pra o próximo rename não depender de alguém lembrar.
//
// A regra: todo PNG em Equipamentos/ e Implementos/ tem que corresponder ao
// nome de mundo de alguma nota viva — e "nome de mundo" é o que `reskinName`
// devolve, que é a MESMA função que o resolvedor de figura usa. Não bastava
// olhar o mapa `reskin.notas`: "Sensor Arcano" vira "Sensor Trônico" pela
// cascata de termos, sem nunca aparecer no mapa. Sobra = arte órfã; falta não
// se cobra aqui, porque item sem arte é caso legítimo (cai no emoji).
import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { reskinName, setActiveContexto } from '../src/data/reskin'
import type { ContextoDef } from '../src/data/context-def'
import type { AssetsManifest, IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const repoDir = path.dirname(appDir)
const cyberDir = path.join(repoDir, 'vault-data-cyberpunk')
const temDataset = fs.existsSync(path.join(cyberDir, 'contexto.json'))
const ler = <T>(f: string) => JSON.parse(fs.readFileSync(path.join(cyberDir, f), 'utf8')) as T

/** `Nome (A).png` / `Nome Adepto.png` → `Nome` */
const semTier = (b: string) =>
  b
    .replace(/\.png$/i, '')
    .replace(/\s*\((?:A|E|M)\)$/, '')
    .replace(/\s+(?:Adepto|Experiente|Mestre|Adepta)$/, '')

describe.skipIf(!temDataset)('arte de equipamento do mundo não fica órfã', () => {
  afterEach(() => setActiveContexto(null))

  it('todo PNG de Equipamentos/ e Implementos/ tem um nome de mundo vivo', () => {
    const manifest = ler<AssetsManifest>('assets.json')
    const index = ler<IndexManifest>('index.json')
    setActiveContexto(ler<ContextoDef>('contexto.json'))

    // nome de mundo de TODA nota, pela mesma função que resolve a figura
    const vivos = new Set<string>(
      (index.docs.map((d) => d.basename).filter(Boolean) as string[]).map((b) => reskinName(b)),
    )

    const PASTAS = ['Recursos de Contextos/Equipamentos/', 'Recursos de Contextos/Implementos/']
    const orfas = manifest.assets
      .filter((a) => PASTAS.some((p) => a.path.includes(p)) && a.path.toLowerCase().endsWith('.png'))
      .map((a) => semTier(a.basename))
      .filter((nome) => !vivos.has(nome))

    expect([...new Set(orfas)].sort()).toEqual([])
  })

  // O outro lado do mesmo buraco (2026-09-13): a criatura da POA já NASCE com
  // nome da POA, então reskinar o nome dela tem que ser identidade. Não era:
  // `Rastreador de Sinal` caía na cascata de termos (Rastreador → Auditor) e a
  // arte ia se chamar `Auditor de Sinal.png` — um arquivo que o resolvedor de
  // figura nunca procuraria. A criatura entrava na mesa sem cara e sem erro.
  it('nome de criatura do bestiário não é reescrito pela cascata de termos', () => {
    const index = ler<IndexManifest>('index.json')
    setActiveContexto(ler<ContextoDef>('contexto.json'))
    const mexidas = index.docs
      .filter((d) => d.type === 'Criatura' && d.subtype === 'Monstro' && d.basename)
      .map((d) => d.basename!)
      .filter((nome) => reskinName(nome) !== nome)
    expect(mexidas).toEqual([])
  })
})
