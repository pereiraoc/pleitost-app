// @vitest-environment jsdom
// Render do card "Magias Secundárias" (#150 / bug #4b): aparece SOB o card de
// Magias quando a Secundária tem conteúdo (prof ≠ N / magia / slot / EM ≥ 1 —
// hasMagiasContent do plugin, tab-magias.ts:83-88) e some sem conteúdo. As
// magias das essências MENORES (via Treinamento de Animista) aparecem nele.
import { beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
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

function renderZuko(tab = 'habilidades') {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={[heroPath(ZUKO_ID, tab)]}>
        <Routes>
          <Route path="/heroi/*" element={<FichaPage />} />
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}

const OVERLAY_MULTICLASS = {
  fm: {
    'Tecnicas.Lista': [
      { '[[Expandir Magia]]': 'Slot.A' },
      { '[[Treinamento de Classe Secundária]]': 'Slot.A' },
    ],
    'Habilidades.Lista': [
      { '[[Treinamento de Animista]]': 'Escolha.01.[[Treinamento de Classe Secundária]]' },
      { '[[Essência Flamejante Menor]]': 'Escolha.01.[[Treinamento de Animista]]' },
    ],
  },
}

describe('card Magias Secundárias', () => {
  it('sem conteúdo secundário (Zuko puro), o card NÃO aparece', async () => {
    renderZuko()
    // espera o card primário assentar (rules resolvidas)…
    await screen.findByText('Magias')
    await waitFor(() => expect(screen.getAllByText('Raio Flamejante').length).toBeGreaterThan(0))
    // …e o secundário continua ausente (gate hasMagiasContent).
    expect(screen.queryByText('Magias Secundárias')).toBeNull()
  })

  it('multiclass (Treinamento de Animista + essência Menor): card aparece com as magias', async () => {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(OVERLAY_MULTICLASS))
    renderZuko()
    expect(await screen.findByText('Magias Secundárias')).toBeTruthy()
    // Raio Flamejante da essência Menor: aparece também no card secundário
    // (Zuko já tem 1 no primário via Essência Flamejante Adepta assada).
    await waitFor(() => expect(screen.getAllByText('Raio Flamejante').length).toBeGreaterThanOrEqual(2))
  })

  it('as escolhas de essência do Treinamento (pick da técnica) rendem na árvore de Habilidades', async () => {
    // O dedup #170 pulava TODO entry com fonte Escolha cujo pai tem escolha —
    // mas o Treinamento de Animista (pick da escolha da TÉCNICA) tem escolhas
    // PRÓPRIAS (essências Menores); sem o entry na árvore, os dropdowns dele
    // ficavam órfãos e o usuário não conseguia escolher/trocar a essência.
    window.localStorage.setItem(STORE_KEY, JSON.stringify(OVERLAY_MULTICLASS))
    renderZuko()
    const heading = await screen.findByText('Habilidades')
    const { fireEvent, within } = await import('@testing-library/react')
    fireEvent.click(within(heading.parentElement!).getByText('✎ Alterar'))
    // dropdown da escolha do Treinamento de Animista ("Essência Elemental
    // Adepta" é o label da rule) com o pick atual
    await waitFor(() => {
      const dds = screen.getAllByLabelText(/Essência Elemental/i) as HTMLSelectElement[]
      expect(dds.some((d) => d.value.includes('Essência Flamejante Menor'))).toBe(true)
    })
  })

  // COMBATE/magias: "não ta mostrando separado o EM nem a lista de magias" —
  // barra "ENERGIA MÁGICA SECUNDÁRIA" (volátil EM_Secundaria) + lista das
  // magias secundárias abaixo da primária (espelho do plugin, recursos
  // separados que NUNCA se misturam).
  it('COMBATE: multiclass mostra EM Secundária separado + lista de magias secundárias', async () => {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(OVERLAY_MULTICLASS))
    renderZuko('combate')
    expect(await screen.findByText('ENERGIA MÁGICA SECUNDÁRIA', undefined, { timeout: 8000 })).toBeTruthy()
    // Raio Flamejante: 1× na lista primária (assado do Zuko) + 1× na secundária
    await waitFor(() => expect(screen.getAllByText('Raio Flamejante').length).toBeGreaterThanOrEqual(2))
  })

  it('COMBATE: sem conteúdo secundário, a barra EM Secundária NÃO aparece', async () => {
    renderZuko('combate')
    await screen.findByText('ENERGIA MÁGICA')
    await waitFor(() => expect(screen.getAllByText('Raio Flamejante').length).toBeGreaterThan(0))
    expect(screen.queryByText('ENERGIA MÁGICA SECUNDÁRIA')).toBeNull()
  })

  it('COMBATE: custo de EM das Básicas é 0×emoji, não "grátis"', async () => {
    renderZuko('combate')
    await waitFor(() => expect(screen.getAllByText('Raio Flamejante').length).toBeGreaterThan(0))
    expect(screen.queryByText(/grátis/i)).toBeNull()
    expect(screen.getAllByText(/^0×/).length).toBeGreaterThan(0)
  })

  // Barra completa (pedido do usuário): "Magia <Escola> +N | Potência Mágica X
  // | Energia Mágica ◆◆ Y/Z" — tipo+mod (title de somatório), Potência com
  // fonte no valor e nota do compêndio no rótulo.
  it('COMBATE: barra mostra tipo de magia + modificador e Potência Mágica', async () => {
    renderZuko('combate')
    // Zuko: escola Anima proficiente (A) → "Magia Anima" com mod assinado
    const tipo = await screen.findByText('Magia Anima', undefined, { timeout: 8000 })
    expect(tipo).toBeTruthy()
    // modificador assinado com a prof, e title com o somatório (Ataque Mágico)
    const mod = tipo.parentElement!.querySelector('span:last-child')!
    expect(mod.textContent).toMatch(/^[+-]\d+ \(A\)$/)
    expect(tipo.parentElement!.getAttribute('title')).toContain('Ataque Mágico')
    // Potência Mágica com o valor derivado (Zuko: 4)
    expect(screen.getByText('POTÊNCIA MÁGICA')).toBeTruthy()
  })
})
