// @vitest-environment jsdom
// FICHA DE GRUPO NO POA 1987 (report 2026-09-10): "abri a ficha de grupo da
// sessão e abriu uma página de Mundo Livre — eu tô no POA" + "deixa sem a
// exploração pra POA por hora; não vai ter hexploration nesse contexto".
// A EXPLORAÇÃO era a primeira aba (e a padrão), com o hexcrawl do Mundo Livre.
// Agora ela só existe quando a região de hexcrawl está no dataset do MUNDO.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mundoTemHexcrawl } from '../src/data/region-maps'
import { setWorldDataset, __resetWorldDatasetForTests } from '../src/data/world-dataset'
import { abasDoGrupo } from '../src/grupo/abas-do-grupo'
import { useTheme, __resetThemeForTests } from '../src/theme'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const cyberIndex = path.join(path.dirname(appDir), 'vault-data-cyberpunk', 'index.json')

const setContext = (c: 'fantasia' | 'cyberpunk') => {
  const { result } = renderHook(() => useTheme())
  act(() => result.current.setContext(c))
}

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
beforeAll(() => {
  if (!window.localStorage) {
    Object.defineProperty(window, 'localStorage', { value: makeStorage(), configurable: true })
  }
})
beforeEach(() => {
  window.localStorage.clear()
  __resetThemeForTests()
  __resetWorldDatasetForTests()
})
afterEach(() => __resetWorldDatasetForTests())

describe('hexcrawl por mundo', () => {
  it('fantasia tem (o Mundo Livre é o dataset base)', () => {
    setContext('fantasia')
    expect(mundoTemHexcrawl()).toBe(true)
  })

  it.skipIf(!fs.existsSync(cyberIndex))('POA 1987 não tem: o dataset do mundo não traz o Mundo Livre', () => {
    setContext('cyberpunk')
    const manifest = JSON.parse(fs.readFileSync(cyberIndex, 'utf8')) as IndexManifest
    setWorldDataset('cyberpunk', manifest.docs.map((d) => `${d.id}.json`))
    expect(mundoTemHexcrawl()).toBe(false)
  })

  it('mundo que TRAZ a região no dataset dele tem hexcrawl (a regra é o dado, não o nome)', () => {
    setContext('cyberpunk')
    setWorldDataset('cyberpunk', ['Atlas/Mundo Livre/Mundo Livre.json'])
    expect(mundoTemHexcrawl()).toBe(true)
  })
})

describe('abas da ficha de grupo', () => {
  it('com hexcrawl a EXPLORAÇÃO abre (primeira aba)', () => {
    expect(abasDoGrupo(true)[0]!.id).toBe('exploracao')
  })

  it('sem hexcrawl ela some e a ficha abre no INVENTÁRIO', () => {
    const abas = abasDoGrupo(false)
    expect(abas.map((t) => t.id)).not.toContain('exploracao')
    expect(abas[0]!.id).toBe('inventario')
    // o resto da ordem não muda
    expect(abas.map((t) => t.id)).toEqual(abasDoGrupo(true).slice(1).map((t) => t.id))
  })
})
