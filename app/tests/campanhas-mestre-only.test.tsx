// @vitest-environment jsdom
// #441 — a pasta Campanhas (Aventuras/Combates preparados) é SÓ do mestre:
// jogadores (Modo Mestre OFF) não veem no compêndio (nem card, nem nav, nem
// navegação direta) — senão vira spoiler.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { FolderView } from '../src/components/compendium/FolderView'
import { isHidden, visibleFolders, isMestreOnlyFolder } from '../src/components/compendium/sections'
import { __resetSettingsForTests } from '../src/settings'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest
const catalog = buildCatalog(manifest)

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
  globalThis.fetch = (async (input: unknown) => {
    const rel = decodeURIComponent(String(input).replace(/^\/vault-data\//, ''))
    const file = path.join(vaultDataDir, rel)
    const ok = fs.existsSync(file)
    return { ok, status: ok ? 200 : 404, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) }
  }) as typeof fetch
})
beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
})
afterEach(cleanup)

function renderFolder(initial: string) {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route path="/compendio/*" element={<FolderView />} />
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}

describe('#441 sections: Campanhas é mestre-only', () => {
  it('isMestreOnlyFolder marca Campanhas e subpastas', () => {
    expect(isMestreOnlyFolder('Campanhas')).toBe(true)
    expect(isMestreOnlyFolder('Campanhas/Aventuras')).toBe(true)
    expect(isMestreOnlyFolder('Atlas')).toBe(false)
  })

  it('isHidden esconde Campanhas SÓ quando não-mestre', () => {
    expect(isHidden('Campanhas', false)).toBe(true) // jogador
    expect(isHidden('Campanhas', true)).toBe(false) // mestre
    expect(isHidden('Campanhas/Combates', false)).toBe(true)
    // Atlas nunca é escondido pelo gating de mestre
    expect(isHidden('Atlas', false)).toBe(false)
  })

  it('visibleFolders na raiz oculta Campanhas pro jogador, mostra pro mestre', () => {
    const raiz = catalog.folderByPath.get('')!
    const nomesJogador = visibleFolders(raiz, false).map((f) => f.name)
    const nomesMestre = visibleFolders(raiz, true).map((f) => f.name)
    expect(nomesJogador).not.toContain('Campanhas')
    expect(nomesMestre).toContain('Campanhas')
  })
})

describe('#441 FolderView: navegação em Campanhas gateada', () => {
  it('jogador navegando /compendio/Campanhas → pasta não encontrada', async () => {
    renderFolder('/compendio/Campanhas')
    expect(await screen.findByText(/Pasta não encontrada/)).toBeTruthy()
  })

  it('mestre navegando /compendio/Campanhas → mostra a pasta', async () => {
    window.localStorage.setItem('pleitost.settings.mestre', 'true')
    __resetSettingsForTests()
    renderFolder('/compendio/Campanhas')
    // não cai no "não encontrada"; renderiza o compêndio
    expect(screen.queryByText(/Pasta não encontrada/)).toBeNull()
  })
})
