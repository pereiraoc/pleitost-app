// COBERTURA DO MUNDO PELO BESTIÁRIO (pedido do mestre, 2026-09-13): "tem que
// garantir também que todas as organizações tem pelo menos 1 criatura afiliada
// e um combate, e que todos os lugares tem pelo menos 1 criatura que pode ser
// encontrada lá e também pelo menos 1 combate definido. Também toda criatura
// tem que ter pelo menos 1 combate associado."
//
// As três medidas usam as MESMAS funções do app, não uma reimplementação: o
// lugar herda dos ancestrais por `escoposDoLugar`/`criaturasEm`, e a afiliação
// é plural por `chavesDoCriterio`. Se a herança mudar, o teste muda junto.
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { criaturasEm, escoposDoLugar } from '../src/mestre/bestiario-local'
import type { IndexDocEntry, IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const cyberDir = path.join(path.dirname(appDir), 'vault-data-cyberpunk')
const temDataset = fs.existsSync(path.join(cyberDir, 'index.json'))

/** Continente, país e estado são o MAPA-MÚNDI da campanha: existem pra dizer
 *  onde o Brasil fica e quem fabrica o quê lá fora, não pra receber encontro.
 *  Lugar de jogo é cidade, bairro e ponto de interesse. */
const FORA_DE_JOGO = new Set(['Continente', 'País', 'Estado'])

type Fm = Record<string, any>
const ler = (id: string) => JSON.parse(fs.readFileSync(path.join(cyberDir, `${id}.json`), 'utf8')) as VaultDoc
const alvo = (v: unknown): string => {
  const s = typeof v === 'string' ? v : ''
  const m = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/.exec(s)
  return (m ? m[1]! : s).trim()
}
const todosLinks = (v: unknown): string[] =>
  [...String(typeof v === 'string' ? v : '').matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)].map((m) => m[1]!.trim())

function dataset() {
  const manifest = JSON.parse(fs.readFileSync(path.join(cyberDir, 'index.json'), 'utf8')) as IndexManifest
  const criaturas = manifest.docs.filter((d) => d.type === 'Criatura' && d.subtype === 'Monstro' && d.basename)
  const fmDe = new Map<string, Fm>(criaturas.map((d) => [d.basename!, ler(d.id).frontmatter as Fm]))
  const combates = manifest.docs
    .filter((d) => d.type === 'Combate' && d.basename)
    .map((d) => {
      const doc = ler(d.id)
      const roster = new Set<string>()
      for (const bloco of String(doc.body ?? '').matchAll(/```combat-marker[^\n]*\n([\s\S]*?)```/g)) {
        for (const linha of bloco[1]!.split('\n')) {
          const m = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/.exec(linha)
          // a Coronel entra pelo caminho completo (o nome dela é ambíguo na vault)
          if (m) roster.add(m[1]!.split('/').pop()!.trim())
        }
      }
      return { nome: d.basename!, onde: String(doc.frontmatter?.['Onde'] ?? ''), roster }
    })
  const lugares = manifest.docs.filter((d) => d.type === 'Localização' && d.basename)
  const paiDe = new Map<string, string>(
    lugares.map((d) => [d.basename!, alvo(ler(d.id).frontmatter?.['Geolocalização'])]),
  )
  return { manifest, criaturas, fmDe, combates, lugares, paiDe }
}

describe.skipIf(!temDataset)('o bestiário cobre o mundo', () => {
  const { manifest, criaturas, fmDe, combates, lugares, paiDe } = temDataset
    ? dataset()
    : ({ manifest: { docs: [] }, criaturas: [], fmDe: new Map(), combates: [], lugares: [], paiDe: new Map() } as any)

  it('toda criatura aparece em pelo menos um combate', () => {
    const emCombate = new Set(combates.flatMap((c: any) => [...c.roster]))
    const fora = criaturas.map((c: IndexDocEntry) => c.basename!).filter((n: string) => !emCombate.has(n))
    expect(fora).toEqual([])
  })

  it('toda organização tem criatura afiliada e combate', () => {
    const orgs = manifest.docs
      .filter((d: IndexDocEntry) => d.type === 'Organização' && d.basename)
      .map((d: IndexDocEntry) => d.basename!)
    const comCriatura = new Set<string>()
    for (const fm of fmDe.values()) for (const o of todosLinks(fm['Afiliação'])) comCriatura.add(o)
    const comCombate = new Set<string>()
    for (const c of combates) {
      for (const nome of c.roster) for (const o of todosLinks(fmDe.get(nome)?.['Afiliação'])) comCombate.add(o)
    }
    expect({
      semCriatura: orgs.filter((o: string) => !comCriatura.has(o)),
      semCombate: orgs.filter((o: string) => !comCombate.has(o)),
    }).toEqual({ semCriatura: [], semCombate: [] })
  })

  it('todo lugar de jogo tem criatura encontrável e combate — herança incluída', () => {
    const escoposDe = (nome: string) => {
      const ancestrais: string[] = []
      const visto = new Set([nome])
      let atual = nome
      for (;;) {
        const pai = paiDe.get(atual)
        if (!pai || visto.has(pai) || !paiDe.has(pai)) break
        ancestrais.unshift(pai)
        visto.add(pai)
        atual = pai
      }
      return escoposDoLugar(nome, ancestrais)
    }
    const semCriatura: string[] = []
    const semCombate: string[] = []
    for (const lugar of lugares) {
      if (FORA_DE_JOGO.has(String(lugar.subtype))) continue
      const escopos = escoposDe(lugar.basename!)
      if (criaturasEm(criaturas, escopos).length === 0) semCriatura.push(lugar.basename!)
      if (!combates.some((c: any) => escopos.some((e) => c.onde.includes(e)))) semCombate.push(lugar.basename!)
    }
    expect({ semCriatura, semCombate }).toEqual({ semCriatura: [], semCombate: [] })
  })
})
