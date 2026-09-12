// COBERTURA E COMPATIBILIDADE DE EQUIPAMENTO NO BESTIÁRIO (pedido do mestre,
// 2026-09-12): "se eu procurar nas criaturas eu vou achar pelo menos uma pra
// cada tipo de arma e pelo menos uma com cada tipo de módulo… cuidado que tem
// limitações de combinações de armas e módulos".
//
// Duas guardas, as duas sobre o dataset REAL da POA:
//  1. COMPATIBILIDADE — todo módulo/premium que uma criatura carrega passa no
//     `AplicavelA` do próprio tesouro contra a arma/armadura/escudo hospedeira.
//     Usa `tesouroAplicavelAoItem` (a implementação do app, que espelha o
//     plugin) — nada de reimplementar a semântica aqui.
//  2. COBERTURA — cada arma, cada módulo, cada equipamento e cada consumível do
//     catálogo aparece em pelo menos uma criatura.
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IndexManifest, VaultDoc } from '../src/data/types'
import { tesouroAplicavelAoItem } from '../src/rules/aplicavel-a'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const cyberDir = path.join(path.dirname(appDir), 'vault-data-cyberpunk')
const temDataset = fs.existsSync(path.join(cyberDir, 'index.json'))

/** Itens que ninguém "carrega": são o estado padrão de quem não tem nada. */
const SEM_DONO = new Set(['Ataque Desarmado', 'Sem Armadura'])

/** O que o MUNDO declara que não existe nele (contexto.json → disponibilidade)
 *  não entra na cobertura — a POA 1987 não tem as Garras do Rei-Mago. */
function indisponiveisDoMundo(): Set<string> {
  const def = JSON.parse(fs.readFileSync(path.join(cyberDir, 'contexto.json'), 'utf8')) as {
    disponibilidade?: { indisponiveis?: string[] }
  }
  return new Set(def.disponibilidade?.indisponiveis ?? [])
}

type Fm = Record<string, any>

function lerDoc(id: string): VaultDoc {
  return JSON.parse(fs.readFileSync(path.join(cyberDir, `${id}.json`), 'utf8')) as VaultDoc
}

function dataset() {
  const manifest = JSON.parse(fs.readFileSync(path.join(cyberDir, 'index.json'), 'utf8')) as IndexManifest
  const criaturas = manifest.docs
    .filter((d) => d.type === 'Criatura' && d.subtype === 'Monstro' && d.basename)
    .map((d) => ({ nome: d.basename!, fm: lerDoc(d.id).frontmatter as Fm }))
  const itens = new Map<string, VaultDoc>()
  for (const d of manifest.docs) {
    if (d.type === 'Item' && d.basename && !itens.has(d.basename)) itens.set(d.basename, lerDoc(d.id))
  }
  return { manifest, criaturas, itens }
}

/** Basename de um wikilink de FM ("[[Adaga|faca]]" → "Adaga"); '' se vazio. */
function alvo(v: unknown): string {
  const s = typeof v === 'string' ? v : ''
  const m = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/.exec(s)
  return (m ? m[1]! : s).trim()
}

/** Pares (tesouro, hospedeiro) que uma criatura declara. */
function hospedagens(fm: Fm): { host: string; tesouro: string; onde: string }[] {
  const out: { host: string; tesouro: string; onde: string }[] = []
  const inv = fm['Inventario'] ?? {}
  for (const a of (inv['Armas']?.['Lista'] ?? []) as Fm[]) {
    const t = alvo(a?.['Propriedade'])
    if (t) out.push({ host: alvo(a?.['Nome']), tesouro: t, onde: 'arma' })
  }
  for (const slot of ['Armadura', 'Escudo'] as const) {
    const t = alvo(inv[slot]?.['Propriedade'])
    if (t) out.push({ host: alvo(inv[slot]?.['Nome']), tesouro: t, onde: slot.toLowerCase() })
  }
  return out
}

/** Tudo que a criatura "tem", pra contar cobertura. */
function carregados(fm: Fm): string[] {
  const inv = fm['Inventario'] ?? {}
  const nomes: string[] = []
  for (const a of (inv['Armas']?.['Lista'] ?? []) as Fm[]) {
    nomes.push(alvo(a?.['Nome']), alvo(a?.['Propriedade']))
  }
  for (const slot of ['Armadura', 'Escudo'] as const) {
    nomes.push(alvo(inv[slot]?.['Nome']), alvo(inv[slot]?.['Propriedade']))
  }
  for (const t of (inv['Tesouros'] ?? []) as unknown[]) nomes.push(alvo(t))
  for (const c of (inv['Consumiveis'] ?? []) as unknown[]) nomes.push(alvo(c))
  return nomes.filter(Boolean)
}

describe.skipIf(!temDataset)('equipamento do bestiário', () => {
  const { manifest, criaturas, itens } = temDataset
    ? dataset()
    : { manifest: { docs: [] } as unknown as IndexManifest, criaturas: [], itens: new Map<string, VaultDoc>() }

  it('todo módulo/premium é aplicável ao item que hospeda', () => {
    const erros: string[] = []
    for (const { nome, fm } of criaturas) {
      for (const { host, tesouro, onde } of hospedagens(fm)) {
        const hostDoc = itens.get(host)
        const tesouroDoc = itens.get(tesouro)
        if (!hostDoc) { erros.push(`${nome}: ${onde} "${host}" não existe no catálogo`); continue }
        if (!tesouroDoc) { erros.push(`${nome}: tesouro "${tesouro}" não existe no catálogo`); continue }
        if (!tesouroAplicavelAoItem(tesouroDoc, hostDoc)) {
          erros.push(`${nome}: ${tesouro} não é aplicável a ${host} (${onde})`)
        }
      }
    }
    expect(erros).toEqual([])
  })

  it('toda arma do catálogo está com alguma criatura', () => {
    const usadas = new Set(criaturas.flatMap((c) => carregados(c.fm)))
    const fora = indisponiveisDoMundo()
    const faltando = manifest.docs
      .filter((d) => d.type === 'Item' && d.subtype === 'Arma' && d.basename)
      .map((d) => d.basename!)
      .filter((n) => !SEM_DONO.has(n) && !fora.has(n) && !usadas.has(n))
    expect(faltando).toEqual([])
  })

  it('todo tesouro do catálogo (módulo, equipamento, consumível) está com alguma criatura', () => {
    const usadas = new Set(criaturas.flatMap((c) => carregados(c.fm)))
    const fora = indisponiveisDoMundo()
    const faltando = manifest.docs
      .filter((d) => d.type === 'Item' && d.subtype !== 'Arma' && d.basename)
      .map((d) => d.basename!)
      .filter((n) => !SEM_DONO.has(n) && !fora.has(n) && !usadas.has(n))
    expect(faltando).toEqual([])
  })
})
