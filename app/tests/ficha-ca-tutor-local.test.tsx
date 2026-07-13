// @vitest-environment jsdom
// TUTOR LOCAL (#206) — follow-up do #201: o nível satélite do CA precisa
// resolver tutor que seja herói LOCAL (criado no app). O resolver central
// (catalogDocResolver) ganha fallback pras entidades locais (vault primeiro,
// pra homônimo local nunca sombrear doc de regra), e a ficha re-extrai quando
// o NÍVEL do tutor local muda (dep cirúrgica — não fura o gate do #57).
// DoD da issue: herói local nível N + CA local com Tutor nele → ficha do CA
// mostra NVL N; subir o nível do tutor reflete no CA.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { FichaPage } from '../src/components/ficha/FichaPage'
import { projectHeroRules } from '../src/rules/useHeroRules'
import { heroPath } from '../src/paths'
import {
  createLocalEntity,
  emptyCompanheiroFrontmatter,
  emptyHeroFrontmatter,
  setLocalEntityFm,
  __resetLocalStoreForTests,
} from '../src/data/local-entities'
import { __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
import { loadDoc } from '../src/data/useDoc'
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

/** Herói local nível 5 + CA local com Tutor apontando pra ele. */
function seedTutorECa() {
  const tutorId = createLocalEntity('Heroi', 'Mestre Local', {
    ...emptyHeroFrontmatter(),
    Nível: 5,
  })
  const caId = createLocalEntity('CompanheiroAnimal', 'Rex', {
    ...emptyCompanheiroFrontmatter('Rex'),
    Tutor: '[[Mestre Local]]',
  })
  return { tutorId, caId }
}

function renderFicha(caId: string) {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={[heroPath(caId)]}>
        <Routes>
          <Route path="/heroi/*" element={<FichaPage />} />
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}

describe('CA satélite de tutor LOCAL (#206)', () => {
  it('rules: resolver acha o herói local e o derivedFm["Nível"] segue o tutor', async () => {
    seedTutorECa()
    const { projection } = await projectHeroRules(
      { ...emptyCompanheiroFrontmatter('Rex'), Tutor: '[[Mestre Local]]' },
      catalog,
      loadDoc,
    )
    expect(projection.derivedFm['Nível']).toBe(5)
  })

  it('PERFIL do CA local: NVL mostra o nível do tutor local, não o FM salvo (1)', async () => {
    const { caId } = seedTutorECa()
    renderFicha(caId)
    expect(await screen.findByText('NVL 5')).toBeTruthy()
    expect(screen.queryByText('NVL 1')).toBeNull()
  })

  it('subir o nível do tutor reflete na ficha do CA sem reload', async () => {
    const { tutorId, caId } = seedTutorECa()
    renderFicha(caId)
    await screen.findByText('NVL 5')
    act(() => {
      setLocalEntityFm(tutorId, 'Nível', 7)
    })
    expect(await screen.findByText('NVL 7')).toBeTruthy()
    expect(screen.queryByText('NVL 5')).toBeNull()
  })

  it('vault primeiro: tutor homônimo de doc da vault resolve pro doc da vault', async () => {
    // herói local com o MESMO basename de um herói real da vault (Mera, nível
    // 7): o resolver precisa preferir a vault — regra anti-sombreamento.
    createLocalEntity('Heroi', 'Mera', { ...emptyHeroFrontmatter(), Nível: 2 })
    const { projection } = await projectHeroRules(
      { ...emptyCompanheiroFrontmatter('Rex'), Tutor: '[[Mera]]' },
      catalog,
      loadDoc,
    )
    expect(projection.derivedFm['Nível']).toBe(7)
  })
})
