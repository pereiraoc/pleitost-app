// @vitest-environment jsdom
// #498 — enquanto as rules carregam, o fallback do painel de classe só pode
// mostrar entradas cujo PAI é Subclasse: no Druida (Leonel) as essências
// (Escolha.NN.[[Círculo do Oceano]]) apareciam como selects de subclasse no
// lugar de Círculo/Tradição Druídica (report 2026-08-25, competências/perfil).
import { beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { FichaPage } from '../src/components/ficha/FichaPage'
import { heroPath } from '../src/paths'
import { __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
import { createLocalEntity, emptyHeroFrontmatter, __resetLocalStoreForTests } from '../src/data/local-entities'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

beforeAll(() => {
  globalThis.fetch = (async (input: unknown) => {
    const rel = decodeURIComponent(String(input).replace(/^\/vault-data\//, ''))
    const file = path.join(vaultDataDir, rel)
    const ok = fs.existsSync(file)
    return { ok, status: ok ? 200 : 404, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) }
  }) as typeof fetch
})
beforeEach(() => {
  window.localStorage?.clear?.()
  __resetHeroStoreMemoryForTests()
  __resetLocalStoreForTests()
})
afterEach(cleanup)

describe('painel de classe do Druida', () => {
  it('fallback não mostra essências; rules carregadas mostram as DUAS subclasses', async () => {
    const fm = JSON.parse(
      fs.readFileSync(path.join(appDir, 'tests/fixtures/heroes/Leonel Bravolla.json'), 'utf8'),
    ).frontmatter as Record<string, unknown>
    const id = createLocalEntity('Heroi', 'Leonel Painel', {
      ...(emptyHeroFrontmatter() as Record<string, unknown>),
      ...fm,
    })
    render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter initialEntries={[heroPath(id, 'perfil')]}>
          <Routes>
            <Route path="/heroi/*" element={<FichaPage />} />
          </Routes>
        </MemoryRouter>
      </CatalogProvider>,
    )
    const toggle = await screen.findByTitle('Classe e subclasses')
    fireEvent.click(toggle)
    // SÍNCRONO pós-clique: rules ainda não resolveram → fallback na tela.
    // Essência NÃO pode aparecer como select de subclasse.
    const texto = () => document.body.textContent ?? ''
    expect(texto()).not.toContain('CÍRCULO DO OCEANO')
    expect(texto()).not.toContain('Essência Torrencial')
    // rules carregadas: as DUAS subclasses do Druida, sem essências
    await waitFor(
      () => {
        expect(texto()).toContain('CÍRCULO DRUÍDICO')
        expect(texto()).toContain('TRADIÇÃO DRUÍDICA')
      },
      { timeout: 30000 },
    )
    expect(texto()).not.toContain('CÍRCULO DO OCEANO')
    expect(texto()).not.toContain('Essência Torrencial')
  }, 60000)
})
