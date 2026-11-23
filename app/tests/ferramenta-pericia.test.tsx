// @vitest-environment jsdom
// Pedido do mestre (2026-11-23): "Ferramenta é atrelada a uma perícia (não tem
// de ofício). A chance de achar é o dobro de uma arma obra prima." + proposta
// aprovada: a loja lista UMA Ferramenta Obra-prima por perícia comum
// ("Ferramenta Obra-prima de Ladinagem"), ×1 fora da região (a Arma Obra-prima
// de arma de fora é ×½) e ×4 com `[[Ferramenta Obra-prima|Ladinagem]]` nos
// Recursos; na compra a perícia fica no nome do tesouro, e trocar a qualidade
// na ficha não a perde.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { buildShopCandidates } from '../src/data/commerce-candidates'
import { buyTreasure } from '../src/data/purchase'
import { __resetHeroStoreMemoryForTests, getHeroEdits } from '../src/data/hero-store'
import { FichaPage } from '../src/components/ficha/FichaPage'
import { parseItemAlias } from '../src/components/ficha/hero-model'
import { heroPath } from '../src/paths'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest
const catalog = buildCatalog(manifest)
const readDoc = (id: string): VaultDoc => JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${id}.json`), 'utf8')) as VaultDoc
const byName = (name: string): VaultDoc => {
  const r = catalog.resolve(name)
  if (r.kind !== 'doc') throw new Error(`não resolveu: ${name}`)
  return readDoc(r.id)
}
const CARLOS_ID = 'Sistema/Criaturas/Heróis/Carlos Facão de Andradas'
const STORE_KEY = `pleitost.heroEdits.${CARLOS_ID}`
const carlos = readDoc(CARLOS_ID).frontmatter as Record<string, any>

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
  if (!window.localStorage) Object.defineProperty(window, 'localStorage', { value: makeStorage(), configurable: true })
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

const QUALIDADES = ['Arma Obra-prima', 'Armadura Obra-prima', 'Broquel Obra-prima', 'Escudo Obra-prima', 'Ferramenta Obra-prima']
const montar = (recursos: string[]) =>
  buildShopCandidates({
    recursos,
    tesourosSimples: [],
    imbuicoes: [],
    armas: [byName('Espada Longa')],
    armaduras: [],
    escudos: [],
    qualidades: QUALIDADES.map(byName),
    pocoes: [],
  }).candidates

describe('loja: uma Ferramenta Obra-prima por perícia comum', () => {
  it('13 perícias, nenhuma de ofício; preço da ferramenta; o dobro da Arma Obra-prima', () => {
    const cands = montar([])
    const ferr = cands.filter((c) => c.nome === 'Ferramenta Obra-prima')
    expect(ferr.map((c) => c.label).sort()).toEqual(
      [
        'Acrobacia', 'Anima', 'Arcana', 'Atletismo', 'Diplomacia', 'Enganação', 'Furtividade',
        'Guerra', 'Intimidação', 'Ladinagem', 'Medicina', 'Sobrevivência', 'Sociedades',
      ].map((p) => `Ferramenta Obra-prima de ${p}`).sort(),
    )
    expect(ferr.some((c) => /Atuação|Ofício|Conhecimento/.test(c.label))).toBe(false)
    const arma = cands.find((c) => c.label === 'Espada Longa Obra-prima')!
    for (const c of ferr) {
      expect(c.mult).toBe(2 * arma.mult) // fora da região: ×1 (arma de fora ×½)
      expect(c.precoBase).toBe(20)
      expect(c.armaTarget).toBeUndefined()
    }
  })

  it('perícia nos Recursos ("[[Ferramenta Obra-prima|Ladinagem]]") → ×4; as outras seguem ×1', () => {
    const cands = montar(['[[Ferramenta Obra-prima|Ladinagem]]'])
    const de = (p: string) => cands.find((c) => c.label === `Ferramenta Obra-prima de ${p}`)!
    expect(de('Ladinagem').mult).toBe(4)
    expect(de('Medicina').mult).toBe(1)
  })
})

describe('compra e ficha: a perícia fica no nome do tesouro', () => {
  it('buyTreasure com rótulo grava o alvo da nota e o nome com a perícia', () => {
    const doc = { ...readDoc(CARLOS_ID), frontmatter: { Inventario: { Ouro: 100, Tesouros: [] } } } as VaultDoc
    expect(buyTreasure(doc.id, doc, 'Ferramenta Obra-prima', 'A', 20, 'Ferramenta Obra-prima de Ladinagem').ok).toBe(true)
    const tes = getHeroEdits(doc.id).fm['Inventario.Tesouros'] as string[]
    expect(tes).toEqual(['[[Ferramenta Obra-prima|Ferramenta Obra-prima de Ladinagem (Adepto)]]'])
    expect(parseItemAlias(tes[0])).toMatchObject({ nome: 'Ferramenta Obra-prima de Ladinagem', alvo: 'Ferramenta Obra-prima', tier: 'A' })
  })

  it('inventário: mostra o nome com a perícia e a figura da ferramenta; trocar a qualidade mantém os dois', async () => {
    const FERR = '[[Ferramenta Obra-prima|Ferramenta Obra-prima de Ladinagem (Adepto)]]'
    window.localStorage.setItem(
      STORE_KEY,
      JSON.stringify({ fm: { 'Inventario.Tesouros': [...carlos.Inventario.Tesouros.filter((t: string) => !/Foco da/.test(t)), FERR] }, session: {} }),
    )
    const { container } = render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter initialEntries={[heroPath(CARLOS_ID, 'inventario')]}>
          <Routes>
            <Route path="/heroi/*" element={<FichaPage />} />
          </Routes>
        </MemoryRouter>
      </CatalogProvider>,
    )
    const linha = () => container.querySelector<HTMLElement>('[data-tesouro="Ferramenta Obra-prima de Ladinagem"]')
    // figura pela NOTA (alvo do link), não pelo nome com a perícia
    await waitFor(
      () =>
        expect(linha()?.querySelector<HTMLElement>('span[style*="background-image"]')?.style.backgroundImage ?? '').toMatch(
          /Ferramenta%20Obra-prima%20Adepta/,
        ),
      { timeout: 10000 },
    )
    fireEvent.click(screen.getByRole('button', { name: '✎ Alterar' }))
    const l2 = linha()!
    const e = [...l2.querySelectorAll<HTMLElement>('span')].find((x) => x.textContent === 'E' && x.style.width === '22px')!
    fireEvent.click(e)
    await waitFor(() => {
      const salvo = JSON.parse(window.localStorage.getItem(STORE_KEY)!).fm['Inventario.Tesouros'] as string[]
      expect(salvo).toContain('[[Ferramenta Obra-prima|Ferramenta Obra-prima de Ladinagem (Experiente)]]')
    })
  })
})
