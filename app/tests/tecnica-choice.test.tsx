// @vitest-environment jsdom
// Bug #1: a técnica "Treinamento de Classe Secundária" tem uma Escolha_Habilidades
// (Complementar Habilidades.Lista Selecionar([[Treinamento de Animista]], …)) cujo
// sourceNote é a PRÓPRIA técnica. Só o painel de Habilidades renderizava escolhas,
// então essa ficava órfã — o usuário via a técnica "lockada" em Animista sem
// dropdown pra trocar. Agora o painel de Técnicas renderiza a escolha sob a técnica.
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
const TEC = 'Treinamento de Classe Secundária'

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
  // Zuko multiclass: injeta a técnica multidisciplinar cuja regra abre a escolha.
  window.localStorage.setItem(
    STORE_KEY,
    JSON.stringify({
      fm: {
        'Tecnicas.Lista': [{ '[[Expandir Magia]]': 'Slot.A' }, { [`[[${TEC}]]`]: 'Slot.A' }],
      },
    }),
  )
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

/** Entra no Alterar do painel "Técnicas". */
async function abrirTecnicas() {
  const heading = await screen.findByText('Técnicas')
  fireEvent.click(within(heading.parentElement!).getByText('✎ Alterar'))
}

describe('escolha de técnica: Treinamento de Classe Secundária (Zuko multiclass)', () => {
  it('a técnica aparece na lista de técnicas do herói', async () => {
    renderZuko()
    expect(await screen.findByText(TEC)).toBeTruthy()
  })

  it('ao Alterar, o dropdown "Classe Secundária" aparece SOB a técnica com as 10 opções', async () => {
    renderZuko()
    await abrirTecnicas()
    const dd = (await screen.findByLabelText('Classe Secundária')) as HTMLSelectElement
    expect(dd.tagName).toBe('SELECT')
    const labels = [...dd.options].map((o) => o.textContent)
    // as 10 classes selecionáveis (+ possivelmente um placeholder vazio)
    expect(labels).toContain('Treinamento de Guerreiro')
    expect(labels).toContain('Treinamento de Animista')
    expect(labels.filter((l) => l && l.startsWith('Treinamento de')).length).toBeGreaterThanOrEqual(10)
  })

  it('escolher uma classe grava o pick com fonte Escolha.[[Treinamento de Classe Secundária]]', async () => {
    renderZuko()
    await abrirTecnicas()
    const dd = (await screen.findByLabelText('Classe Secundária')) as HTMLSelectElement
    const guerreiro = [...dd.options].find((o) => o.textContent === 'Treinamento de Guerreiro')!
    fireEvent.change(dd, { target: { value: guerreiro.value } })
    await waitFor(() => {
      const lista = JSON.stringify(overlaySalvo().fm['Habilidades.Lista'] ?? [])
      expect(lista).toContain('[[Treinamento de Guerreiro]]')
      // fonte referencia a técnica-pai (indexada ou não)
      expect(lista).toMatch(/Escolha\.(\d+\.)?\[\[Treinamento de Classe Secundária\]\]/)
    })
  })
})
