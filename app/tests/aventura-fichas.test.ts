// @vitest-environment node
// FICHA DO INIMIGO DA AVENTURA (2026-09-10) — trocar o nome no fence
// ```combat-marker``` só funciona se o wikilink achar uma ficha REAL no
// dataset do mundo: entrada que não resolve vira "sem ficha no catálogo"
// (roster.ts) e o banner perde tier, vida e retrato. Este guarda-corpo varre
// os combates da Pós Grenal contra o dataset da POA — renomear um inimigo sem
// criar a nota no bestiário quebra aqui, não na mesa.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseFrontmatter } from '../../extractor/parse-frontmatter.mjs'
import { parseAventura } from '../src/aventura/parse-aventura'
import { buildAssetIndex } from '../src/data/assets'
import { creatureImageUrl } from '../src/data/creature-image'
import type { AssetsManifest, IndexManifest, VaultDoc } from '../src/data/types'

const here = path.dirname(fileURLToPath(import.meta.url))
const appDir = path.dirname(here)
const raiz = path.dirname(appDir)
const cyberDir = path.join(raiz, 'vault-data-cyberpunk')
const baseDir = path.join(raiz, 'vault-data')
const temDataset = fs.existsSync(path.join(cyberDir, 'index.json'))

const ler = <T,>(p: string) => JSON.parse(fs.readFileSync(p, 'utf8')) as T

describe.skipIf(!temDataset)('fichas dos combates da Pós Grenal', () => {
  const manifest = ler<IndexManifest>(path.join(cyberDir, 'index.json'))
  const porBasename = new Map(manifest.docs.map((d) => [d.basename, d]))
  const raw = fs.readFileSync(path.join(here, 'fixtures', 'aventuras', 'Pós Grenal.md'), 'utf8')
  const { frontmatter, body } = parseFrontmatter(raw) as {
    frontmatter: Record<string, unknown>
    body: string
  }
  const m = parseAventura({ id: 'Campanhas/Aventuras/Pós Grenal', body, frontmatter } as VaultDoc)
  const alvos = [...new Set(m.combates.flatMap((c) => c.roster.entries.map((e) => e.sourcePath)))]

  // índice de assets do MUNDO = união (cyberpunk vence por path), igual ao app
  const base = ler<AssetsManifest>(path.join(baseDir, 'assets.json'))
  const mundo = ler<AssetsManifest>(path.join(cyberDir, 'assets.json'))
  const porPath = new Map(base.assets.map((a) => [a.path, a]))
  for (const a of mundo.assets) porPath.set(a.path, a)
  const assets = buildAssetIndex({ ...base, assets: [...porPath.values()] })

  it('todo inimigo do fence tem ficha de Monstro com Tier no bestiário', () => {
    const semFicha = alvos.filter((a) => a && porBasename.get(a)?.type !== 'Criatura')
    expect(semFicha, 'wikilink do combate sem nota no bestiário').toEqual([])
    for (const alvo of alvos) {
      const doc = ler<VaultDoc>(path.join(cyberDir, `${porBasename.get(alvo!)!.id}.json`))
      expect(doc.subtype, `${alvo} não é Monstro`).toBe('Monstro')
      // Tier 0 é legítimo (Arruaceiro é capanga T0) — o que não pode é faltar
      expect(Number.isFinite(Number(doc.frontmatter.Tier)), `${alvo} sem Tier`).toBe(true)
      expect(creatureImageUrl(doc, assets), `${alvo} sem retrato`).toBeTruthy()
    }
  })

  it('o Brum entra com o retrato DELE, não com a arte genérica da raça', () => {
    expect(alvos, 'a Fase 2 não chama mais o Brum').toContain('Sargento Valdir Brum')
    const entrada = porBasename.get('Sargento Valdir Brum')
    expect(entrada, 'a ficha do Brum sumiu do bestiário').toBeTruthy()
    const brum = ler<VaultDoc>(path.join(cyberDir, `${entrada!.id}.json`))
    const oficial = ler<VaultDoc>(
      path.join(cyberDir, `${porBasename.get('Guarda Oficial')!.id}.json`),
    )
    const url = creatureImageUrl(brum, assets)
    expect(url).toContain('Sargento%20Valdir%20Brum.png')
    expect(url).not.toBe(creatureImageUrl(oficial, assets))
    // mesma ficha do Guarda Oficial (a aventura declara "o ataque é o da ficha")
    expect(brum.frontmatter.Vida).toEqual(oficial.frontmatter.Vida)
    expect(brum.frontmatter.Tier).toBe(oficial.frontmatter.Tier)
  })
})
