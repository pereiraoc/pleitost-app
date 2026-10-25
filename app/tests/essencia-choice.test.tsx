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

/** Entra no Alterar do painel "Magias" (onde mora o Círculo das Essências). */
async function abrirMagias() {
  await waitFor(() => {
    const h = screen.getAllByText('Magias').find((el) => el.parentElement && within(el.parentElement).queryByText('✎ Alterar'))
    expect(h).toBeTruthy()
    fireEvent.click(within(h!.parentElement!).getByText('✎ Alterar'))
  }, { timeout: 15000 })
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

  // 2026-10-25: essências na RODA (data-roda-no) em vez de dropdowns.
  it('a roda mostra as essências DISTINTAS do Zuko (escolhas antigas migradas pra slot)', async () => {
    renderZuko()
    await abrirMagias()
    await waitFor(() => expect(document.querySelectorAll('[data-roda-estado="tem"]').length).toBeGreaterThanOrEqual(4))
    const tem = [...document.querySelectorAll('[data-roda-estado="tem"]')].map((n) => n.getAttribute('data-roda-no'))
    expect(new Set(tem).size).toBe(tem.length)
    expect(tem).toContain('A:Essência Incendiária')
  })

  it('desfazer UMA essência preserva as irmãs (o slot liberado compra outra)', async () => {
    renderZuko()
    await abrirMagias()
    const no = (k: string) => document.querySelector(`[data-roda-no="${k}"]`)
    await waitFor(() => expect(no('A:Essência Ciclonal')?.getAttribute('data-roda-estado')).toBe('tem'))
    fireEvent.click(no('A:Essência Ciclonal')!) // desfaz
    await waitFor(() => expect(no('A:Essência Ciclonal')?.getAttribute('data-roda-estado')).not.toBe('tem'))
    expect(no('A:Essência Incendiária')?.getAttribute('data-roda-estado')).toBe('tem') // irmã intacta
    // a vaga liberada aceita a vizinha (Relampejante, ao lado da Incendiária)
    await waitFor(() => expect(no('A:Essência Relampejante')?.getAttribute('data-roda-estado')).toBe('livre'))
    fireEvent.click(no('A:Essência Relampejante')!)
    await waitFor(() => expect(no('A:Essência Relampejante')?.getAttribute('data-roda-estado')).toBe('tem'))
    const lista = JSON.stringify(overlaySalvo().fm['Habilidades.Lista'] ?? [])
    // ESSÊNCIAS POR SLOT (2026-10-25): as escolhas antigas do Zuko regravam
    // migradas, e a nova sai como gasto de slot
    expect(lista).toContain('{"[[Essência Relampejante Adepta]]":"Slot.A"}')
    expect(lista).not.toContain('[[Magias Anima]]"}')
    expect(lista).toContain('Essência Incendiária Adepta')
  })

  it('Círculo: botão Alterar próprio, centro Destruição × Criação e a Ciclonal do Zuko marcada inválida', async () => {
    renderZuko()
    const circulo = await waitFor(() => {
      const el = document.querySelector('[data-roda-essencias]') as HTMLElement
      expect(el).toBeTruthy()
      return el
    }, { timeout: 15000 })
    expect(within(circulo).getByText('✎ Alterar')).toBeTruthy()
    expect(circulo.querySelector('[data-roda-metade="destruicao"]')).toBeTruthy()
    expect(circulo.querySelector('[data-roda-metade="criacao"]')).toBeTruthy()
    await waitFor(() => expect(circulo.querySelector('[data-roda-invalidas]')?.textContent).toMatch(/Ciclonal/))
    expect(circulo.querySelector('[data-roda-no="E:Essência de Criação"]')).toBeNull() // sem Criação Experiente
    // o botão próprio liga a edição: a Ciclonal inválida pode ser desfeita
    fireEvent.click(within(circulo).getByText('✎ Alterar'))
    fireEvent.click(circulo.querySelector('[data-roda-no="A:Essência Ciclonal"]')!)
    await waitFor(() => expect(circulo.querySelector('[data-roda-no="A:Essência Ciclonal"]')?.getAttribute('data-roda-estado')).not.toBe('tem'))
  })
})

