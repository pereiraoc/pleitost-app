// @vitest-environment jsdom
// Círculo das Essências por nível no Planejamento (2026-10-25).
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
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
import {
  createLocalEntity,
  getLocalEntity,
  emptyHeroFrontmatter,
  setLocalEntityFm,
  __resetLocalStoreForTests,
} from '../src/data/local-entities'
import type { IndexManifest, VaultDoc } from '../src/data/types'

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
  __resetHeroStoreMemoryForTests()
  __resetLocalStoreForTests()
})
afterEach(cleanup)

const bardoFm = (nivel: number) => ({
  ...(emptyHeroFrontmatter() as Record<string, unknown>),
  Classe: '[[Bardo]]',
  'Nível': nivel,
  Atributos: { FOR: 1, AGI: 2, INT: 3, PRE: 4 },
})

function renderBiografia(id: string) {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={[heroPath(id, 'perfil')]}>
        <Routes>
          <Route path="/heroi/*" element={<FichaPage />} />
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}

async function abrirPlanejamento() {
  fireEvent.click(await screen.findByText('PLANEJAMENTO'))
  await waitFor(() => expect(document.querySelector('[data-nivel="1"]')).toBeTruthy(), {
    timeout: 20000,
  })
}


const regsDe = (id: string) =>
  ((((getLocalEntity(id)!.frontmatter as Record<string, unknown>)['Planejamento'] as Record<string, unknown>)?.['gastosSlots'] ??
    []) as Array<Record<string, unknown>>)
const habDe = (id: string) => JSON.stringify((getLocalEntity(id)!.frontmatter as Record<string, any>)['Habilidades']?.['Lista'] ?? [])

describe('Planejamento: Círculo das Essências no nível', () => {
  it('escolhe a essência no N2 pelo Círculo do card; sobe pro N2 e ela vira gasto real', { timeout: 60000 }, async () => {
    const id = createLocalEntity('Heroi', 'Animista Plano', {
      ...(emptyHeroFrontmatter() as Record<string, unknown>),
      Classe: '[[Animista]]',
      Sintonia: '[[Traço Elemental do Fogo]]',
      'Nível': 1,
      Atributos: { Principal: 'PRE', FOR: 0, AGI: 1, INT: 2, PRE: 3 },
    })
    renderBiografia(id)
    await abrirPlanejamento()
    const card2 = document.querySelector('[data-nivel="2"]') as HTMLElement
    const botao = [...card2.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes('MAGIAS'))
    expect(botao, 'botão de magias no N2').toBeTruthy()
    fireEvent.click(botao!)
    // o Círculo do N2: a pura acesa (de antes), 1 slot A do nível
    const no = (k: string) => document.querySelector(`[data-roda-essencias] [data-roda-no="${k}"]`)
    await waitFor(() => expect(no('A:Essência Flamejante')?.getAttribute('data-roda-estado')).toBe('tem'), { timeout: 15000 })
    expect(document.querySelector('[data-roda-contador="A"]')?.textContent).toContain('0/1')
    expect(no('A:Essência Explosiva')?.getAttribute('data-roda-estado')).toBe('livre')
    fireEvent.click(no('A:Essência Explosiva')!)
    await waitFor(() =>
      expect(regsDe(id)).toContainEqual(
        expect.objectContaining({ nivel: 2, tipo: 'magia', rank: 'A', alvo: '[[Essência Explosiva Adepta]]' }),
      ),
    )
    // nível futuro: só plano
    expect(habDe(id)).not.toContain('Essência Explosiva')
    await waitFor(() => expect(no('A:Essência Explosiva')?.getAttribute('data-roda-estado')).toBe('tem'))
    expect(document.querySelector('[data-roda-contador="A"]')?.textContent).toContain('1/1')
    fireEvent.click(screen.getByLabelText('Fechar editor'))
    // sobe pro N2: o sync materializa o gasto
    setLocalEntityFm(id, 'Nível', 2)
    await waitFor(() => expect(habDe(id)).toContain('{"[[Essência Explosiva Adepta]]":"Slot.A"}'), { timeout: 20000 })
  })

  it('desfaz a essência planejada clicando de novo no Círculo do nível', { timeout: 60000 }, async () => {
    const id = createLocalEntity('Heroi', 'Animista Plano 2', {
      ...(emptyHeroFrontmatter() as Record<string, unknown>),
      Classe: '[[Animista]]',
      Sintonia: '[[Traço Elemental do Fogo]]',
      'Nível': 1,
      Atributos: { Principal: 'PRE', FOR: 0, AGI: 1, INT: 2, PRE: 3 },
      Planejamento: {
        gastosSlots: [{ nivel: 3, tipo: 'magia', rank: 'A', alvo: '[[Essência Incendiária Adepta]]', contexto: 'Anima' }],
        nivelSincronizado: 1,
      },
    })
    renderBiografia(id)
    await abrirPlanejamento()
    const card3 = document.querySelector('[data-nivel="3"]') as HTMLElement
    fireEvent.click([...card3.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes('MAGIAS'))!)
    const no = (k: string) => document.querySelector(`[data-roda-essencias] [data-roda-no="${k}"]`)
    await waitFor(() => expect(no('A:Essência Incendiária')?.getAttribute('data-roda-estado')).toBe('tem'), { timeout: 15000 })
    fireEvent.click(no('A:Essência Incendiária')!)
    await waitFor(() => expect(regsDe(id).some((r) => String(r['alvo']).includes('Incendiária'))).toBe(false))
  })
})
