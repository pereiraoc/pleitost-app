// @vitest-environment jsdom
// Reports 2026-08-29:
//   1. As CONTAGENS dos cards do compêndio incluíam a folder-note (a nota-índice
//      de mesmo nome do botão) — "vários casos". visibleCount passa a excluir
//      as folder-notes em todos os níveis, como a listagem/subtreeDocs já fazem.
//   2. Seções "Contexto Oculto" (convenção da vault pra segredo de campanha,
//      ex.: Descoberta de Selênica) só aparecem em MODO MESTRE — gate central
//      no MarkdownBody (cobre linha do tempo, HistoriaView, DocPage e
//      transclusões).
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { FolderView } from '../src/components/compendium/FolderView'
import { visibleCount, subtreeDocs } from '../src/components/compendium/sections'
import { stripContextoOculto } from '../src/markdown/strip-oculto'
import { __resetSettingsForTests } from '../src/settings'
import { compendiumFolderPath } from '../src/paths'
import type { IndexManifest } from '../src/data/types'
import '../src/components/compendium/register-doc-views'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const repoDir = path.dirname(appDir)
const lerCatalog = (dir: string) =>
  buildCatalog(
    JSON.parse(fs.readFileSync(path.join(repoDir, dir, 'index.json'), 'utf8')) as IndexManifest,
  )
const catalogCyber = lerCatalog('vault-data-cyberpunk')
const catalogFant = lerCatalog('vault-data')

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
    const url = String(input)
    const rel = decodeURIComponent(url.replace(/^\/vault-data(-cyberpunk)?\//, ''))
    // o teste roda com o catálogo cyberpunk sem trocar o mundo do tema — serve
    // os docs sempre do dataset cyberpunk, seja qual for o prefixo pedido
    const file = path.join(repoDir, 'vault-data-cyberpunk', rel)
    const ok = fs.existsSync(file)
    return {
      ok,
      status: ok ? 200 : 404,
      json: async () => JSON.parse(fs.readFileSync(file, 'utf8')),
    }
  }) as typeof fetch
})

beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
})
afterEach(cleanup)

describe('contagens dos cards excluem a folder-note (nota-índice)', () => {
  it('Contexto Histórico da POA: 10 notas datadas, não 11 (índice fora)', () => {
    const node = catalogCyber.folderByPath.get('Contexto/Histórias/Contexto Histórico')!
    // sanidade: a pasta TEM a folder-note homônima entre os docs
    expect(node.docs.some((d) => d.basename === node.name)).toBe(true)
    expect(visibleCount(node)).toBe(10)
  })

  it('contagem = mesma régua da listagem achatada (subtreeDocs), em vários nós', () => {
    for (const catalogo of [catalogCyber, catalogFant]) {
      for (const p of ['Contexto', 'Contexto/Histórias', 'Atlas']) {
        const node = catalogo.folderByPath.get(p)
        if (!node) continue
        expect(visibleCount(node), p).toBe(subtreeDocs(node).length)
      }
    }
  })
})

describe('seções "Contexto Oculto" são só do mestre', () => {
  it('stripContextoOculto corta a seção até o próximo heading de nível igual/maior', () => {
    const body = [
      '### Público',
      'prosa pública',
      '### 🧬 O Contexto Oculto – A Verdade',
      'segredo',
      '#### sub-segredo',
      'mais segredo',
      '### Outra pública',
      'fim',
    ].join('\n')
    const out = stripContextoOculto(body)
    expect(out).toContain('prosa pública')
    expect(out).toContain('Outra pública')
    expect(out).toContain('fim')
    expect(out).not.toContain('segredo')
    expect(out).not.toContain('Oculto')
  })

  function renderPassado(catalog = catalogCyber) {
    return render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter
          initialEntries={[compendiumFolderPath('Contexto/Histórias/Contexto Histórico')]}
        >
          <Routes>
            <Route path="/compendio/*" element={<FolderView />} />
          </Routes>
        </MemoryRouter>
      </CatalogProvider>,
    )
  }

  it('SEM modo mestre: o Contexto Oculto da Selênica não aparece na timeline', async () => {
    renderPassado()
    await waitFor(() => {
      expect(screen.getByText(/Descoberta do ET morto na Lua/)).toBeTruthy()
    })
    expect(screen.queryByText(/Contexto Oculto/)).toBeNull()
    expect(screen.queryByText(/simbionte consciente/)).toBeNull()
  })

  it('COM modo mestre: a seção aparece', async () => {
    window.localStorage.setItem('pleitost.settings.mestre', 'true')
    __resetSettingsForTests()
    renderPassado()
    await waitFor(() => {
      expect(screen.getByText(/Descoberta do ET morto na Lua/)).toBeTruthy()
    })
    expect(screen.getAllByText(/Contexto Oculto/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/simbionte consciente/).length).toBeGreaterThan(0)
  })
})
