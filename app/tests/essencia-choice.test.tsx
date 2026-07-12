// @vitest-environment jsdom
// Bug: várias escolhas do MESMO pai (5 "Essência Elemental Adepta" da Magias
// Anima do Animista) colidiam — mudar uma mudava todas — porque o onChoiceChange
// gravava a tag NÃO-indexada `Escolha.[[pai]]` e apagava as irmãs. A projeção
// resolve por ocorrência (`Escolha.NN.[[pai]]`); o Zuko (animista real) já tem
// Escolha.01..04 com essências DISTINTAS. Este teste guarda a independência.
import { beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { FichaPage } from '../src/components/ficha/FichaPage'
import { heroPath } from '../src/paths'
import { __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest
const catalog = buildCatalog(manifest)
const ZUKO_ID = 'Sistema/Criaturas/Heróis/Zuko'
const STORE_KEY = `pleitost.heroEdits.${ZUKO_ID}`
const zuko = JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${ZUKO_ID}.json`), 'utf8')) as VaultDoc

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

function renderZuko() {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={[heroPath(ZUKO_ID, 'habilidades')]}>
        <Routes>
          <Route path="/heroi/*" element={<FichaPage />} />
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}
function overlaySalvo(): Record<string, any> {
  const raw = window.localStorage.getItem(STORE_KEY)
  expect(raw).toBeTruthy()
  return JSON.parse(raw!)
}

/** Entra no Alterar do painel "Habilidades" (não o de Especialidades/Magias). */
async function abrirHabilidades() {
  const heading = await screen.findByText('Habilidades')
  fireEvent.click(within(heading.parentElement!).getByText('✎ Alterar'))
}

describe('escolhas por ocorrência: essências do Animista (Zuko)', () => {
  it('sanidade: Zuko tem Escolha.01..04 com essências distintas no FM', () => {
    const hab = JSON.stringify(zuko.frontmatter.Habilidades ?? {})
    expect(hab).toContain('Escolha.01.[[Magias Anima]]')
    expect(hab).toContain('Escolha.02.[[Magias Anima]]')
  })

  it('o pick de essência NÃO duplica (aparece 1×, não como escolha + filho na árvore)', async () => {
    renderZuko() // modo leitura (sem Alterar): a escolha mostra o pick sutil
    // Essência Incendiária Adepta é um dos picks do Zuko (Escolha.01). Antes
    // aparecia 2× (pick da escolha + filho ↳ na árvore); agora só 1×.
    await screen.findAllByText('Essência Incendiária Adepta')
    await waitFor(() =>
      expect(screen.getAllByText('Essência Incendiária Adepta').length).toBe(1),
    )
  })

  it('os dropdowns de essência mostram valores DISTINTOS (resolução por Escolha.NN)', async () => {
    renderZuko()
    await abrirHabilidades()
    const dds = (await screen.findAllByLabelText(/Essência Elemental/i)) as HTMLSelectElement[]
    expect(dds.length).toBeGreaterThanOrEqual(2)
    const vals = dds.map((d) => d.value).filter(Boolean)
    // o bug fazia todos iguais; agora cada ocorrência resolve o seu
    expect(new Set(vals).size).toBe(vals.length)
  })

  it('mudar UMA essência preserva as irmãs (grava Escolha.NN indexado)', async () => {
    renderZuko()
    await abrirHabilidades()
    const dds = (await screen.findAllByLabelText(/Essência Elemental/i)) as HTMLSelectElement[]
    const before = dds.map((d) => d.value)
    // opção diferente da atual pro 1º dropdown
    const nova = [...dds[0].options].map((o) => o.value).find((v) => v && v !== before[0])!
    fireEvent.change(dds[0], { target: { value: nova } })
    await waitFor(() => {
      const now = (screen.getAllByLabelText(/Essência Elemental/i) as HTMLSelectElement[]).map((d) => d.value)
      expect(now[0]).toBe(nova) // a 1ª mudou
      expect(now[1]).toBe(before[1]) // a irmã NÃO mudou (antes: virava igual)
    })
    // no FM salvo, as tags ficam indexadas e independentes
    const lista = JSON.stringify(overlaySalvo().fm['Habilidades.Lista'] ?? [])
    expect(lista).toContain('Escolha.01.[[Magias Anima]]')
  })
})
