// @vitest-environment jsdom
// #519 C2 — catálogo por MUNDO: fantasia inalterada; cyberpunk sem dataset =
// fallback total + flag de banner; com dataset = UNIÃO (docs do mundo vencem
// por id, resto herda) e o vaultUrl roteia os rels registrados.
import { beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchCatalogForWorld, __resetCatalogForTests } from '../src/data/catalog'
import { __resetContextoDefForTests } from '../src/data/context-def'
import { vaultUrl } from '../src/data/base-url'
import { __resetWorldDatasetForTests } from '../src/data/world-dataset'
import { useTheme, __resetThemeForTests } from '../src/theme'
import { renderHook, act } from '@testing-library/react'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')

let cyberpunkIndex: IndexManifest | null = null

beforeEach(() => {
  window.localStorage?.clear?.()
  __resetThemeForTests()
  __resetWorldDatasetForTests()
  __resetCatalogForTests()
  __resetContextoDefForTests()
  cyberpunkIndex = null
  globalThis.fetch = (async (input: unknown) => {
    const url = String(input)
    const relCyb = url.match(/vault-data-cyberpunk\/(.+)$/)?.[1]
    if (relCyb) {
      if (decodeURIComponent(relCyb) === 'index.json' && cyberpunkIndex) {
        return { ok: true, status: 200, json: async () => cyberpunkIndex }
      }
      return { ok: false, status: 404, json: async () => ({}) }
    }
    const rel = decodeURIComponent(url.replace(/^.*vault-data\//, ''))
    const file = path.join(vaultDataDir, rel)
    const ok = fs.existsSync(file)
    return { ok, status: ok ? 200 : 404, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) }
  }) as typeof fetch
})

const setContext = (c: 'fantasia' | 'cyberpunk') => {
  const { result } = renderHook(() => useTheme())
  act(() => result.current.setContext(c))
}

describe('catálogo por mundo (C2)', () => {
  it('fantasia: comportamento de sempre, sem flag', async () => {
    const cat = await fetchCatalogForWorld('fantasia')
    expect(cat.worldDatasetAusente).toBeUndefined()
    expect(cat.content.length).toBeGreaterThan(500)
    expect(vaultUrl('index.json')).toContain('vault-data/')
  })

  it('cyberpunk SEM dataset: catálogo herda a fantasia + flag do banner', async () => {
    setContext('cyberpunk')
    const cat = await fetchCatalogForWorld('cyberpunk')
    expect(cat.worldDatasetAusente).toBe(true)
    expect(cat.content.length).toBeGreaterThan(500) // fallback total
    // sem rels registrados, TODO fetch cai na fantasia
    expect(vaultUrl('Sistema/qualquer.json')).toContain('vault-data/')
  })

  it('cyberpunk COM dataset: união por id e roteamento dos rels do mundo', async () => {
    const fant = JSON.parse(
      fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
    ) as IndexManifest
    const guerreiro = fant.docs.find((d) => d.id.endsWith('/Guerreiro'))!
    cyberpunkIndex = {
      ...fant,
      docs: [
        { ...guerreiro }, // override do mundo (mesmo id)
        {
          id: 'Atlas/Porto Alegre/Porto Alegre',
          path: 'Atlas/Porto Alegre/Porto Alegre.md',
          basename: 'Porto Alegre',
          kind: 'content',
          type: 'Localização',
          subtype: 'Cidade',
          grupo: null,
        },
      ],
    }
    setContext('cyberpunk')
    const cat = await fetchCatalogForWorld('cyberpunk')
    expect(cat.worldDatasetAusente).toBeUndefined()
    // doc NOVO do mundo entrou; os da fantasia seguem lá (união)
    expect(cat.entryById.has('Atlas/Porto Alegre/Porto Alegre')).toBe(true)
    expect(cat.content.length).toBeGreaterThan(500)
    // rel do doc do mundo roteia pro dataset do mundo; os demais caem na base
    expect(vaultUrl(`${guerreiro.id}.json`)).toContain('vault-data-cyberpunk/')
    expect(vaultUrl('Sistema/Outro Doc.json')).toContain('vault-data/')
  })
})

// C9 — união com o DATASET REAL da POA 1987 (skip quando não extraído:
// vault-data-cyberpunk é gitignored como o da fantasia)
const cybDir = path.join(path.dirname(appDir), 'vault-data-cyberpunk')
describe.skipIf(!fs.existsSync(path.join(cybDir, 'index.json')))(
  'invariantes com o dataset real (C9)',
  () => {
    beforeEach(() => {
      // O beforeEach global já resetou os caches (inclusive o do Contexto-Def
      // — sem isso o 404 do stub C2 envenenava o def do C9 como null).
      globalThis.fetch = (async (input: unknown) => {
        const url = String(input)
        const m = url.match(/(vault-data(?:-cyberpunk)?)\/(.+)$/)
        if (!m) return { ok: false, status: 404, json: async () => ({}) }
        const root = m[1] === 'vault-data-cyberpunk' ? cybDir : vaultDataDir
        const rel = m[2]!.split('/').map((s) => {
          try {
            return decodeURIComponent(s)
          } catch {
            return s
          }
        }).join('/')
        const file = path.join(root, rel)
        const ok = fs.existsSync(file)
        return {
          ok,
          status: ok ? 200 : 404,
          json: async () => JSON.parse(fs.readFileSync(file, 'utf8')),
        }
      }) as typeof fetch
    })

    it('conteúdo de MUNDO não herda: bestiário/organizações/contexto da fantasia ficam fora', async () => {
      setContext('cyberpunk')
      const cat = await fetchCatalogForWorld('cyberpunk')
      // organizações da fantasia (report: Sociedade Aberta/Ordem Bestial)
      const orgs = (cat.docsByType.get('Organização') ?? []).map((d) => d.basename)
      expect(orgs).not.toContain('Sociedade Aberta')
      expect(orgs).not.toContain('Ordem Bestial')
      // bestiário/heróis/grupos da fantasia fora; Atlas fantasia fora
      const criaturas = (cat.docsByType.get('Criatura') ?? []).map((d) => d.id)
      expect(criaturas.some((id) => id.includes('Carlos Facão'))).toBe(false)
      expect(cat.entryById.has('Atlas/Mundo Livre/Mundo Livre')).toBe(false)
      // conteúdo do MUNDO presente (Contexto próprio da POA)
      expect((cat.docsByType.get('Contexto') ?? []).length).toBeGreaterThan(0)
      expect((cat.docsByType.get('Organização') ?? []).length).toBeGreaterThan(0)
      // e o SISTEMA segue herdável/unido
      expect((cat.docsByType.get('Classe') ?? []).length).toBeGreaterThan(0)
    })

    it('cyberpunk real: Porto Alegre no catálogo, sistema herdado, roteamento certo', async () => {
      setContext('cyberpunk')
      const cat = await fetchCatalogForWorld('cyberpunk')
      expect(cat.worldDatasetAusente).toBeUndefined()
      // Atlas POA presente
      expect(cat.entryById.has('Atlas/Porto Alegre/Porto Alegre')).toBe(true)
      // heróis da FANTASIA não vazam? Eles EXISTEM no catálogo união (docs),
      // mas o dataset POA tem os próprios docs de sistema — Guerreiro do
      // mundo roteia pro dataset do mundo
      const guerreiro = [...cat.entryById.keys()].find((id) => id.endsWith('/Guerreiro'))!
      expect(vaultUrl(`${guerreiro}.json`)).toContain('vault-data-cyberpunk/')
      // alias do mundo vem do MAPA do Contexto-Def, não mais de FM na vault
      // (2026-08-30: Sistema/Classes revertido ao byte-idêntico da fantasia;
      // aplicarContextoAosDocs injeta o rename de notas do contexto.json)
      expect(cat.entryById.get(guerreiro)?.alias).toBe('Soldado')
      // heróis da fantasia NÃO existem no catálogo do mundo (exclusividade)
      expect([...cat.entryById.keys()].some((id) => id.includes('Carlos Facão'))).toBe(false)
    })

    it('fantasia segue byte-idêntica com o eixo introduzido', async () => {
      const cat = await fetchCatalogForWorld('fantasia')
      expect(cat.worldDatasetAusente).toBeUndefined()
      expect(vaultUrl('index.json')).toContain('vault-data/')
      expect(vaultUrl('index.json')).not.toContain('cyberpunk')
    })
  },
)
