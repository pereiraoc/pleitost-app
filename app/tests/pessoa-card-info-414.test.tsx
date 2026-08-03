// @vitest-environment jsdom
// Sugestão #414 (report 90f0efb5): "ao invés de escrito Pessoas em baixo de
// cada pessoa, quero que apareça as informações de organização, etc (sem a
// parte de descrição mas tendo o resto)" — o subtítulo do card de Pessoa em
// Criaturas/Pessoas passa a compor Relação · Organização · Posição (pulando
// vazios; Detalhes fica de fora), com fallback no rótulo "Pessoa" quando não
// há nada preenchido.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { NpcsPage } from '../src/components/creatures/CreaturesPages'
import {
  __resetLocalStoreForTests,
  createLocalEntity,
  pessoaFrontmatter,
} from '../src/data/local-entities'
import { __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
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
  __resetLocalStoreForTests()
  __resetHeroStoreMemoryForTests()
})
afterEach(cleanup)

function renderNpcs() {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<NpcsPage />} />
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}

describe('#414 — subtítulo do card de Pessoa mostra as infos do #45', () => {
  it('Relação · Organização · Posição (sem Detalhes)', async () => {
    createLocalEntity(
      'Pessoa',
      'Fulana Teste',
      pessoaFrontmatter({
        Relação: 'Neutro',
        Organização: 'Guilda dos Remos',
        Posição: 'Chefe',
        Detalhes: 'Sempre no cais.',
      }),
    )
    renderNpcs()
    await screen.findByText('Fulana Teste')
    expect(screen.getByText('Neutro · Guilda dos Remos · Chefe')).toBeTruthy()
    expect(screen.queryByText('Sempre no cais.')).toBeNull() // descrição fica de fora
  })

  it('campos vazios são pulados; tudo vazio → fallback "Pessoa"', async () => {
    createLocalEntity(
      'Pessoa',
      'Beltrano Só Organização',
      pessoaFrontmatter({ Relação: '', Organização: 'Círculo do Sal', Posição: '', Detalhes: '' }),
    )
    createLocalEntity(
      'Pessoa',
      'Sicrana Vazia',
      pessoaFrontmatter({ Relação: '', Organização: '', Posição: '', Detalhes: '' }),
    )
    renderNpcs()
    await screen.findByText('Beltrano Só Organização')
    expect(screen.getByText('Círculo do Sal')).toBeTruthy()
    const vazia = screen.getByText('Sicrana Vazia')
    expect(vazia.parentElement!.textContent).toContain('Pessoa')
  })
})
