// REGRA DOS ATRIBUTOS (report do mestre, 2026-09-13): "não existe ter 1 em
// dois atributos, tu basicamente tem 3, 2, 1, 0 apenas, e aí muda onde".
//
// O array é o MESMO pra todo mundo — herói de nível 1, herói de nível 7 e
// criatura de qualquer tier: uma permutação de 3/2/1/0, com o 3 sempre no
// atributo Principal. Atributo não é medida de poder; o poder vem do
// tier/nível por proficiência, EV e potência.
//
// 17 criaturas da POA tinham entrado com [3,1,1,1] — mesma soma, distribuição
// impossível —, e era o que fazia duas fichas da mesma classe e tier
// aparecerem com FOR 2 e FOR 1. Esta guarda existe pra não voltar.
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IndexManifest } from '../src/data/types'

const repoDir = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))))
const ATRS = ['FOR', 'AGI', 'INT', 'PRE'] as const

type Ficha = { frontmatter?: Record<string, unknown> }
type Atributos = Partial<Record<(typeof ATRS)[number] | 'Principal', unknown>>

/** Toda ficha com bloco de Atributos dos dois datasets. */
function fichas(dir: string): { nome: string; a: Atributos }[] {
  const raiz = path.join(repoDir, dir)
  if (!fs.existsSync(path.join(raiz, 'index.json'))) return []
  const manifest = JSON.parse(fs.readFileSync(path.join(raiz, 'index.json'), 'utf8')) as IndexManifest
  const out: { nome: string; a: Atributos }[] = []
  for (const d of manifest.docs) {
    if (d.type !== 'Criatura' || !d.basename) continue
    const f = path.join(raiz, `${d.id}.json`)
    if (!fs.existsSync(f)) continue
    const fm = (JSON.parse(fs.readFileSync(f, 'utf8')) as Ficha).frontmatter ?? {}
    const a = fm['Atributos'] as Atributos | undefined
    if (a?.['Principal']) out.push({ nome: d.basename, a })
  }
  return out
}

const todas = [...fichas('vault-data'), ...fichas('vault-data-cyberpunk')]

describe.skipIf(!todas.length)('atributos: permutação de 3/2/1/0', () => {
  it('nenhuma ficha repete valor nem foge do array', () => {
    const fora = todas
      .map(({ nome, a }) => ({ nome, vals: ATRS.map((k) => Number(a[k])) }))
      .filter(({ vals }) => String([...vals].sort((x, y) => y - x)) !== '3,2,1,0')
      .map(({ nome, vals }) => `${nome}: ${vals.join('/')}`)
    expect(fora).toEqual([])
  })

  it('o 3 está sempre no atributo Principal', () => {
    const fora = todas
      .filter(({ a }) => Number(a[String(a['Principal']) as (typeof ATRS)[number]]) !== 3)
      .map(({ nome, a }) => `${nome}: Principal ${String(a['Principal'])}`)
    expect(fora).toEqual([])
  })

  it('a guarda está mesmo vendo as fichas (senão passaria vazia)', () => {
    expect(todas.length).toBeGreaterThan(100)
  })
})
