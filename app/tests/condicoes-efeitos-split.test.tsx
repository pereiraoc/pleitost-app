// @vitest-environment jsdom
// Pedido do usuário (2026-07-21): na aba COMBATE, fileira 2 = Movimento/
// Percepção/Intuição; fileira 3 = Condições/Efeitos/Recuperação. O popover
// CONDIÇÕES fica SÓ com as condições básicas do sistema; EFEITOS recebe o que
// era efeito de habilidade/magia/grupo (Inspiração, Encantar Arma, Celeridade,
// "(de X)"). Emojis dos efeitos: visual.iconeLigado do bloco (convenção do
// plugin) → efeito de MAGIA usa o emoji DA MAGIA (magiaEmoji do doc) →
// fallback 🌟 (subcategoria.EfeitoInterativo). Carlos real como oráculo.
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
import { __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
import { magiaEmoji } from '../src/components/ficha/registry'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)
const CARLOS_ID = 'Sistema/Criaturas/Heróis/Carlos Facão de Andradas'

// Oráculo do emoji da magia: o doc real do Encantar Arma.
const encantarArma = JSON.parse(
  fs.readFileSync(
    path.join(
      vaultDataDir,
      'Sistema/Criação de Personagem/Magia/Magia Arcana/Magia Arcana Branca/Magia Branca Adepta/Encantar Arma.json',
    ),
    'utf8',
  ),
) as VaultDoc

function makeStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k) => (data.has(k) ? data.get(k)! : null),
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
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
  __resetHeroStoreMemoryForTests()
})
afterEach(cleanup)

function renderCombate() {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={[heroPath(CARLOS_ID, 'combate')]}>
        <Routes>
          <Route path="/heroi/*" element={<FichaPage />} />
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}

/** Chip do popover (container com clipPath polygon + botão de toggle). */
const chipDe = (nome: string): HTMLElement | undefined =>
  screen
    .queryAllByText(nome)
    .map((el) => el.parentElement as HTMLElement)
    .find((p) => p?.querySelector('button') && p.style.clipPath.includes('polygon'))

describe('split Condições × Efeitos (pedido 2026-07-21)', () => {
  it('CONDIÇÕES: só as básicas do sistema — Enfraquecido sim, Encantar Arma não', async () => {
    renderCombate()
    fireEvent.click(await screen.findByText('CONDIÇÕES'))
    expect(await screen.findByText('Enfraquecido')).toBeTruthy()
    expect(chipDe('Encantar Arma'), 'efeito de magia fora de CONDIÇÕES').toBeUndefined()
    expect(chipDe('Inspiração'), 'efeito de habilidade fora de CONDIÇÕES').toBeUndefined()
  }, 30000)

  it('EFEITOS: Inspiração com o iconeLigado (🎵) e Encantar Arma com o emoji DA MAGIA', async () => {
    renderCombate()
    fireEvent.click(await screen.findByText('EFEITOS'))
    const insp = chipDe('Inspiração')
    expect(insp, 'chip da Inspiração em EFEITOS').toBeTruthy()
    // visual.iconeLigado do bloco (Inspiração.md): 🎵
    expect(insp!.textContent).toContain('🎵')
    const enc = chipDe('Encantar Arma')
    expect(enc, 'chip do Encantar Arma em EFEITOS').toBeTruthy()
    // efeito de MAGIA usa o emoji da magia (registro elemento/escola do doc)
    expect(enc!.textContent).toContain(magiaEmoji(encantarArma.frontmatter as Record<string, unknown>))
    // e a condição do sistema NÃO vaza pra cá
    expect(chipDe('Enfraquecido')).toBeUndefined()
  }, 30000)
})
