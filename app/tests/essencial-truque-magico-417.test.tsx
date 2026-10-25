// @vitest-environment jsdom
// Report #417 ("jogando de mago, ao escolher a especialidade de arcana,
// 'truque magico', aparecem apenas as magias negra e branca, não aparecendo as
// magias arcana essenciais básicas"): o app implementava a regra ANTIGA do
// plugin (#296: Essenciais no primário só pra classe Arcanista). O plugin
// atual gateia pela proficiência OCULTA ArcanaEssencial (view-model.ts:609-628,
// "não mais Arcanista") — concedida por Truque Mágico/Utensílio Mágico
// (especialização/maestria de Arcana, QUALQUER classe), pelas notas-base do
// Arcanista e, na secundária, pelo Treinamento de Arcanista. O Truque Mágico
// dava o slot B (Somar Magias.Slots.B 1) mas nada pra gastar nele.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { FichaPage } from '../src/components/ficha/FichaPage'
import { projectHeroRules } from '../src/rules/useHeroRules'
import {
  __resetLocalStoreForTests,
  createLocalEntity,
  emptyHeroFrontmatter,
} from '../src/data/local-entities'
import { __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
import { heroPath } from '../src/paths'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)
const loadFromDisk = async (id: string): Promise<VaultDoc> =>
  JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${id}.json`), 'utf8')) as VaultDoc

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

/** FM do cenário do report: Mago, Arcana E com Especialização Truque Mágico. */
function magoTruqueFm(): Record<string, unknown> {
  const fm = emptyHeroFrontmatter()
  fm['Classe'] = '[[Mago]]'
  fm['Nível'] = 3
  const per = fm['Pericias'] as { Lista: Record<string, unknown>[] }
  const arcana = per.Lista.find((r) => r['Nome'] === 'Arcana')!
  arcana['Proficiencia'] = 'E'
  arcana['Incrementos'] = [{ A: 'Slot.A' }, { E: 'Slot.E' }]
  arcana['Especializacao'] = '[[Truque Mágico]]'
  return fm
}

describe('#417 — projeção expõe a proficiência oculta ArcanaEssencial', () => {
  it('Mago + Truque Mágico → profEssencial A (e slot B da ESSENCIAL concedido)', async () => {
    const out = await projectHeroRules(magoTruqueFm(), catalog, loadFromDisk)
    expect(out.projection.profEssencial).toBe('A')
    // slot por escola (rules/slots-magia.ts): o B do Truque é da Essencial,
    // não do pool Arcana
    expect(out.projection.calculated['Magias.Lista.ArcanaEssencial.Slots.B']).toBe(1)
    const slots = (out.projection.derivedFm['Magias'] as { Slots: Record<string, number> }).Slots
    expect(slots['B'] ?? 0).toBe(0)
  })

  it('trap reverso: herói SEM concessão → profEssencial N', async () => {
    const fm = emptyHeroFrontmatter()
    fm['Classe'] = '[[Bardo]]'
    fm['Nível'] = 1
    const out = await projectHeroRules(fm, catalog, loadFromDisk)
    expect(out.projection.profEssencial).toBe('N')
  })
})

describe('#417 — painel de Magias oferece as Essenciais pelo gate ArcanaEssencial', () => {
  it('Mago + Truque Mágico: Essenciais BÁSICAS aparecem; Experientes não (prof A)', async () => {
    const id = createLocalEntity('Heroi', 'Mago Truqueiro', magoTruqueFm())
    render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter initialEntries={[heroPath(id, 'habilidades')]}>
          <Routes>
            <Route path="/heroi/*" element={<FichaPage />} />
          </Routes>
        </MemoryRouter>
      </CatalogProvider>,
    )
    const heading = await screen.findByText('Magias')
    fireEvent.click(within(heading.parentElement!).getByText('✎ Alterar'))
    // Essenciais Básicas oferecidas (o report: só Negra/Branca apareciam)
    await waitFor(() => expect(screen.getByText('Mão Mágica')).toBeTruthy(), { timeout: 8000 })
    expect(screen.getByText('Bússola Mágica')).toBeTruthy()
    // o slot B do Truque é SÓ da Essencial: Negra Básica não entra (o Mago
    // N3 não tem slot B Arcana)
    expect(screen.queryByText('Aturdir')).toBeNull()
    // trap por RANK: essencial EXPERIENTE fica fora com prof A
    expect(screen.queryByText('Visor Arcano')).toBeNull()
    expect(screen.queryByText('Compreender Idiomas')).toBeNull()
  })
})

// SLOTS POR ESCOLA (2026-10-25, report do Simões): Druida com Truque Mágico —
// o slot B é da Essencial: as Essenciais Básicas aparecem (na Arcana Branca,
// destino #417, mesmo sem proficiência própria) e nenhuma Anima avulsa.
describe('slots por escola — Druida + Truque Mágico', () => {
  it('oferece Essenciais Básicas, nenhuma magia Anima avulsa', async () => {
    const fm = magoTruqueFm()
    fm['Classe'] = '[[Druida|Druida Xamã]]'
    fm['Sintonia'] = '[[Traço Elemental do Fogo]]'
    fm['Atributos'] = { Principal: 'INT', FOR: 0, AGI: 1, INT: 3, PRE: 2 }
    fm['Habilidades'] = {
      Lista: [
        { '[[Círculo do Sol (Fogo e Terra)]]': 'Escolha.[[Círculo Druídico]]' },
        { '[[Tradição Druídica (Xamã)]]': 'Escolha.[[Tradição Druídica]]' },
      ],
      Especiais: [],
    }
    const id = createLocalEntity('Heroi', 'Druida Truqueiro', fm)
    render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter initialEntries={[heroPath(id, 'habilidades')]}>
          <Routes>
            <Route path="/heroi/*" element={<FichaPage />} />
          </Routes>
        </MemoryRouter>
      </CatalogProvider>,
    )
    const heading = await screen.findByText('Magias')
    fireEvent.click(within(heading.parentElement!).getByText('✎ Alterar'))
    await waitFor(() => expect(screen.getByLabelText('Aprender Mão Mágica')).toBeTruthy(), { timeout: 8000 })
    expect(screen.queryByLabelText('Aprender Raio Flamejante')).toBeNull()
    expect(screen.queryByLabelText('Aprender Aturdir')).toBeNull()
  }, 30000)
})
