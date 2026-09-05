// @vitest-environment jsdom
// Disponibilidade de tesouros POR MUNDO (aprovado 2026-09-05): o Contexto POA
// define `disponibilidade.matriz` — linhas CANÔNICAS (o FM Comércio dos locais
// segue apontando pra elas) com RÓTULO do mundo e % por tier. O app usa a
// matriz do mundo como BASE da loja/CONFIG no cyberpunk (override do GM
// guardado POR MUNDO); na fantasia nada muda (DEFAULT_MATRIX da nota).
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_MATRIX, matrizDoContexto } from '../src/data/commerce'
import { setActiveContexto } from '../src/data/reskin'
import { reloadDisponibilidade, useSettings, __resetSettingsForTests } from '../src/settings'
import { renderHook } from '@testing-library/react'
import type { ContextoDef } from '../src/data/context-def'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const repoDir = path.dirname(appDir)
const defPoa = JSON.parse(
  fs.readFileSync(path.join(repoDir, 'vault-data-cyberpunk', 'contexto.json'), 'utf8'),
) as ContextoDef

function makeStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k: string) => data.get(k) ?? null,
    key: () => null,
    removeItem: (k: string) => void data.delete(k),
    setItem: (k: string, v: string) => void data.set(k, String(v)),
  }
}
beforeAll(() => {
  if (!window.localStorage) {
    Object.defineProperty(window, 'localStorage', { value: makeStorage(), configurable: true })
  }
})
afterEach(() => {
  cleanup()
  window.localStorage.clear()
  setActiveContexto(null)
  reloadDisponibilidade()
  __resetSettingsForTests()
})

describe('matrizDoContexto', () => {
  it('lê valores + rótulos do ContextoDef POA', () => {
    const m = matrizDoContexto(defPoa)
    expect(m?.valores['Pequena Cidade']).toEqual({ A: 33, E: null, M: null })
    expect(m?.valores['Iluminada']).toEqual({ A: 150, E: 50, M: 5 })
    expect(m?.rotulos).toEqual({
      'Pequena Cidade': 'Boca de Bairro',
      'Grande Cidade': 'Rua de Comércio',
      Capital: 'Centro',
      Iluminada: 'Mercadão',
    })
  })
  it('def sem matriz → null (fantasia cai no DEFAULT_MATRIX)', () => {
    expect(matrizDoContexto(null)).toBeNull()
    expect(matrizDoContexto({ disponibilidade: {} } as unknown as ContextoDef)).toBeNull()
  })
})

describe('settings.disponibilidade por mundo', () => {
  it('com o contexto POA ativo, a base é a matriz do mundo', () => {
    setActiveContexto(defPoa)
    reloadDisponibilidade()
    const { result } = renderHook(() => useSettings())
    expect(result.current.disponibilidade['Iluminada']).toEqual({ A: 150, E: 50, M: 5 })
  })
  it('sem contexto (fantasia), base = DEFAULT_MATRIX', () => {
    const { result } = renderHook(() => useSettings())
    expect(result.current.disponibilidade).toEqual(DEFAULT_MATRIX)
  })
})
