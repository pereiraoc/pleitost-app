// @vitest-environment jsdom
// Report #380: "Os tiers dos monstros no bestiário estão agrupados errados,
// porque deveria ser tier 3, 2, 1, 0 não ABC." — o agrupamento reusava as
// LETRAS de tier de herói (rankLetter S/A/B/C, convenção do NVL) pra
// monstros, que usam FM `Tier` NUMÉRICO (badge "TIER n" verbatim do plugin,
// header-monstro.ts). Agora o bestiário agrupa por número, decrescente
// (3→0), com a cor do monsterTierColor; sem Tier vai pro fim ("—").
// Companheiros (nível → S/A/B/C) ficam como estavam — trap reverso.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { NpcsPage } from '../src/components/creatures/CreaturesPages'
import { __resetLocalStoreForTests } from '../src/data/local-entities'
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
      <MemoryRouter initialEntries={['/npcs']}>
        <Routes>
          <Route path="/npcs" element={<NpcsPage />} />
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}

/** Kickers "// TIER x" DO PAINEL que contém `anchorText` (o PanelTrack mantém
 *  todas as abas no DOM — escopar evita ler os kickers das outras). */
function kickersDoPainel(anchorText: string): string[] {
  const anchor = screen.queryByText(anchorText)
  const panel = anchor?.closest('.npc-panel-inner')
  if (!panel) return []
  return [...panel.querySelectorAll('.kicker')]
    .map((k) => k.textContent?.replace(/\s+/g, ' ').trim() ?? '')
    .filter((t) => t.startsWith('// TIER'))
}

describe('#380 — bestiário agrupa por Tier NUMÉRICO decrescente', () => {
  it('kickers são números (2, 1, 0), maiores primeiro; sem letras de herói', async () => {
    renderNpcs()
    fireEvent.click(await screen.findByText('BESTIÁRIO'))
    // vault atual: monstros de Tier 2, 1 e 0 (e 1 sem Tier → "—" no fim)
    await waitFor(() => {
      const ks = kickersDoPainel('Goblin Batedor')
      expect(ks.length).toBeGreaterThanOrEqual(3)
      expect(ks[0]).toBe('// TIER 2')
      expect(ks[1]).toBe('// TIER 1')
      expect(ks[2]).toBe('// TIER 0')
    })
    // nenhum kicker com letra de tier heroico no bestiário
    for (const k of kickersDoPainel('Goblin Batedor')) {
      expect(k).not.toMatch(/\/\/ TIER [SABC]$/)
    }
  }, 30000)

  it('COMPANHEIROS seguem agrupados por letra (S/A/B/C — trap reverso)', async () => {
    renderNpcs()
    fireEvent.click(await screen.findByText('COMPANHEIROS ANIMAIS'))
    await waitFor(() => {
      const ks = kickersDoPainel('Metis, a Graxaim')
      expect(ks.length).toBeGreaterThanOrEqual(1)
      expect(ks.every((k) => /\/\/ TIER [SABC]$/.test(k))).toBe(true)
    })
  }, 30000)
})
