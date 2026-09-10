// @vitest-environment jsdom
// QUEM PODE PEGAR QUAL ARMA (report 2026-09-10): "no adicionar arma aparece
// arma que ele não pode usar (sem proficiência)" + "no POA o Empregado pega
// arma daquele jeito limitado; na fantasia é só arma natural". A régua é UMA
// (armaEscolhivel) e vale pro dropdown da linha e pro "+ Adicionar Arma".
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { FichaPage } from '../src/components/ficha/FichaPage'
import { heroPath } from '../src/paths'
import { armaEscolhivel } from '../src/components/ficha/hero-model'
import { __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
import {
  __resetLocalStoreForTests,
  createLocalEntity,
  emptyHeroFrontmatter,
  setLocalEntityFm,
} from '../src/data/local-entities'
import type { ContextoDef } from '../src/data/context-def'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const cybContexto = path.join(path.dirname(appDir), 'vault-data-cyberpunk', 'contexto.json')

const soSimples = { Inventario: { Armas: { Proficiencia: { Simples: 'P', Marciais: 'N', Especificas: [] } } } }

describe('armaEscolhivel — a régua', () => {
  it('herói: simples sim; marcial sem proficiência não; arma de fogo não; natural/especial não', () => {
    expect(armaEscolhivel({ grupo: 'cac-simples', basename: 'Adaga' }, 'Heroi', soSimples, null)).toBe(true)
    expect(armaEscolhivel({ grupo: 'cac-marcial', basename: 'Espada Longa' }, 'Heroi', soSimples, null)).toBe(false)
    expect(armaEscolhivel({ grupo: 'd-arcanonico', basename: 'Pistola Arcanônica' }, 'Heroi', soSimples, null)).toBe(false)
    expect(armaEscolhivel({ grupo: 'natural', basename: 'Garras' }, 'Heroi', soSimples, null)).toBe(false)
    expect(armaEscolhivel({ grupo: 'especial', basename: 'Escudada' }, 'Heroi', soSimples, null)).toBe(false)
  })

  it('herói: arma específica libera mesmo fora da categoria', () => {
    const fm = {
      Inventario: {
        Armas: { Proficiencia: { Simples: 'P', Marciais: 'N', Especificas: ['[[Espada Longa]]'] } },
      },
    }
    expect(armaEscolhivel({ grupo: 'cac-marcial', basename: 'Espada Longa' }, 'Heroi', fm, null)).toBe(true)
    expect(armaEscolhivel({ grupo: 'cac-marcial', basename: 'Alabarda' }, 'Heroi', fm, null)).toBe(false)
  })

  it('companheiro da fantasia não pega arma fabricada nenhuma', () => {
    expect(armaEscolhivel({ grupo: 'cac-simples', maos: 1, basename: 'Adaga' }, 'CompanheiroAnimal', {}, null)).toBe(false)
  })

  it.skipIf(!fs.existsSync(cybContexto))('Empregado (POA): só a regra do Contexto — simples, 1 mão, Força ≤ 2', () => {
    const def = JSON.parse(fs.readFileSync(cybContexto, 'utf8')) as ContextoDef
    const regra = def.regras?.companheiroAnimal?.arma
    expect(regra).toEqual({ grupos: ['cac-simples'], maos: 1, forcaMax: 2 })
    expect(armaEscolhivel({ grupo: 'cac-simples', maos: 1, basename: 'Adaga' }, 'CompanheiroAnimal', {}, regra)).toBe(true)
    expect(armaEscolhivel({ grupo: 'cac-simples', maos: 2, basename: 'Bordão' }, 'CompanheiroAnimal', {}, regra)).toBe(false)
    expect(armaEscolhivel({ grupo: 'cac-simples', maos: 1, forca: 3, basename: 'X' }, 'CompanheiroAnimal', {}, regra)).toBe(false)
    expect(armaEscolhivel({ grupo: 'd-simples', maos: 1, basename: 'Funda' }, 'CompanheiroAnimal', {}, regra)).toBe(false)
  })

  it('monstro escolhe livre (proficiência dele é por regra)', () => {
    expect(armaEscolhivel({ grupo: 'cac-marcial', basename: 'Espada Longa' }, 'Monstro', soSimples, null)).toBe(true)
  })
})

function makeStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    key: (i: number) => [...data.keys()][i] ?? null,
    removeItem: (k: string) => void data.delete(k),
    setItem: (k: string, v: string) => void data.set(k, String(v)),
  }
}

describe('"+ Adicionar Arma" na ficha do herói', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest
  const catalog = buildCatalog(manifest)
  beforeAll(() => {
    if (!window.localStorage) {
      Object.defineProperty(window, 'localStorage', { value: makeStorage(), configurable: true })
    }
    globalThis.fetch = (async (input: unknown) => {
      const rel = decodeURIComponent(String(input).replace(/^\/vault-data\//, ''))
      const file = path.join(vaultDataDir, rel)
      const ok = fs.existsSync(file)
      return { ok, status: ok ? 200 : 404, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) }
    }) as typeof fetch
  })
  beforeEach(() => {
    window.localStorage.clear()
    __resetLocalStoreForTests()
    __resetHeroStoreMemoryForTests()
  })
  afterEach(cleanup)

  it('só lista o que o herói pode usar (sem marcial, sem arma de fogo, sem natural)', async () => {
    const id = createLocalEntity('Heroi', 'Herói Simples', emptyHeroFrontmatter())
    setLocalEntityFm(id, 'Inventario.Armas.Proficiencia', { Simples: 'P', Marciais: 'N', Especificas: [] })
    render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter initialEntries={[heroPath(id, 'inventario')]}>
          <Routes>
            <Route path="/heroi/*" element={<FichaPage />} />
          </Routes>
        </MemoryRouter>
      </CatalogProvider>,
    )
    const fabs = await screen.findAllByText(/\+ Adicionar Arma/, undefined, { timeout: 20000 })
    fireEvent.click(fabs[0]!)
    expect((await screen.findAllByText('Adaga')).length).toBeGreaterThan(0)
    expect(screen.queryAllByText('Espada Longa')).toEqual([])
    expect(screen.queryAllByText('Pistola Arcanônica')).toEqual([])
    expect(screen.queryAllByText('Garras')).toEqual([])
  }, 30000)
})
