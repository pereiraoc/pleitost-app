// @vitest-environment jsdom
// SELETOR RÁPIDO DA TOPBAR (issue #34): avatar do herói atual junto do
// apelido; clicar abre popover na linguagem dos dropdowns (vida/moedas)
// listando Heróis + Companheiros Animais REAIS da vault — 3 itens visíveis
// (scroll pro resto), ordenados como as listas (tier desc + alfabético pt),
// item atual destacado (--on) e navegação pra ficha ao clicar.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { AppShell } from '../src/components/layout/AppShell'
import { FichaPage } from '../src/components/ficha/FichaPage'
import { heroPath } from '../src/paths'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

const CARLOS_ID = 'Sistema/Criaturas/Heróis/Carlos Facão de Andradas'
const METIS_ID = 'Sistema/Criaturas/Companheiros Animais/Metis, a Graxaim'

// Universo REAL das listas do seletor: pastas Heróis e Companheiros Animais
// (sem folder notes), como nas telas HERÓIS e NPCS › COMPANHEIROS ANIMAIS.
const heroisDir = path.join(vaultDataDir, 'Sistema/Criaturas/Heróis')
const casDir = path.join(vaultDataDir, 'Sistema/Criaturas/Companheiros Animais')
const listNames = (dir: string, folderNote: string) =>
  fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json') && f !== `${folderNote}.json`)
    .map((f) => f.slice(0, -5))
const universo = [...listNames(heroisDir, 'Heróis'), ...listNames(casDir, 'Companheiros Animais')]

// Ordenação esperada recomputada AQUI (independente do código): tier
// decrescente pelo FM Nível (T1=1-3, T2=4-6, T3=7-9, T4=10+), alfabético pt.
const nivelOf = new Map(
  universo.map((nome) => {
    const dir = fs.existsSync(path.join(heroisDir, `${nome}.json`)) ? heroisDir : casDir
    const doc = JSON.parse(fs.readFileSync(path.join(dir, `${nome}.json`), 'utf8'))
    return [nome, Number(doc.frontmatter['Nível']) || 1]
  }),
)
const tierOf = (nome: string) => {
  const n = Math.max(1, Math.floor(nivelOf.get(nome)!))
  return n <= 3 ? 1 : n <= 6 ? 2 : n <= 9 ? 3 : 4
}
const ptAlpha = new Intl.Collator('pt')
const ordemEsperada = [...universo].sort((a, b) =>
  tierOf(a) !== tierOf(b) ? tierOf(b) - tierOf(a) : ptAlpha.compare(a, b),
)

beforeAll(() => {
  globalThis.fetch = (async (input: unknown) => {
    const url = String(input)
    const rel = decodeURIComponent(url.replace(/^\/vault-data\//, ''))
    const file = path.join(vaultDataDir, rel)
    const ok = fs.existsSync(file)
    return {
      ok,
      status: ok ? 200 : 404,
      json: async () => JSON.parse(fs.readFileSync(file, 'utf8')),
    }
  }) as typeof fetch
})

afterEach(cleanup)

function renderApp(initial = heroPath(CARLOS_ID)) {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/heroi/*" element={<FichaPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}

describe('avatar + seletor rápido na topbar da ficha (issue #34)', () => {
  it('avatar do herói atual pela hierarquia de imagem (FM Imagem do Carlos)', async () => {
    renderApp()
    const avatar = await screen.findByTestId('topbar-avatar')
    // Carlos: FM Imagem = "Carlos Facão de Andrade.png" (asset real da vault)
    await waitFor(() => {
      const slot = avatar.querySelector('span:last-child') as HTMLElement
      expect(slot.style.backgroundImage).toContain('Carlos%20Fac%C3%A3o%20de%20Andrade.png')
    })
    // slot do apelido continua no gatilho (vw jsdom 1024 >= 720)
    expect(screen.getByTestId('topbar-apelido')).toBeTruthy()
  })

  it('popover na linguagem dos dropdowns: 3 itens visíveis, scroll fino, ordem das listas', async () => {
    renderApp()
    fireEvent.click(await screen.findByTestId('topbar-avatar'))
    const list = screen.getByTestId('switcher-list')
    // 3 itens visíveis (46px cada + 2 gaps de 6) e scroll pro resto
    expect(list.style.maxHeight).toBe('150px')
    expect(list.style.overflowY).toBe('auto')
    expect(list.className).toContain('switcher-list')
    // lista completa: TODOS os heróis + companheiros animais reais
    await waitFor(() => {
      expect(within(list).getAllByRole('button').length).toBe(universo.length)
    })
    // ordem = tier desc + alfabético pt (recomputada do FM Nível real)
    await waitFor(() => {
      const nomes = within(list)
        .getAllByRole('button')
        .map((b) => b.textContent)
      expect(nomes).toEqual(ordemEsperada)
    })
    // Metis (CA) na lista com o retrato real da vault
    const metisRow = within(list).getByRole('button', { name: /Metis, a Graxaim/ })
    await waitFor(() => {
      const slot = metisRow.querySelector('span') as HTMLElement
      expect(slot.style.backgroundImage).toContain('Metis%2C%20a%20Graxaim.png')
    })
  })

  it('item atual destacado com o padrão --on do design', async () => {
    renderApp()
    fireEvent.click(await screen.findByTestId('topbar-avatar'))
    const list = screen.getByTestId('switcher-list')
    const carlosRow = await within(list).findByRole('button', {
      name: /Carlos Facão de Andradas/,
    })
    expect(carlosRow.style.getPropertyValue('--on')).toBe('1')
    const outraRow = within(list).getByRole('button', { name: /Thoren/ })
    expect(outraRow.style.getPropertyValue('--on')).toBe('0')
  })

  it('clicar no apelido também abre; clicar num CA navega pra ficha dele', async () => {
    renderApp()
    // o apelido faz parte do gatilho — clicar nele abre o popover
    await screen.findByTestId('topbar-avatar')
    fireEvent.click(screen.getByTestId('topbar-apelido'))
    const list = screen.getByTestId('switcher-list')
    fireEvent.click(await within(list).findByRole('button', { name: /Metis, a Graxaim/ }))
    // navegou como o card: ficha do Metis aberta (nome real no PERFIL)
    expect((await screen.findAllByDisplayValue('Metis, a Graxaim')).length).toBeGreaterThan(0)
    // popover fechou e a topbar remontou pro novo herói (avatar = retrato do Metis)
    expect(screen.queryByTestId('switcher-list')).toBeNull()
    const avatar = await screen.findByTestId('topbar-avatar')
    await waitFor(() => {
      const slot = avatar.querySelector('span:last-child') as HTMLElement
      expect(slot.style.backgroundImage).toContain('Metis%2C%20a%20Graxaim.png')
    })
  })

  it('herói da lista navega pra própria ficha (como o card de herói)', async () => {
    renderApp(heroPath(METIS_ID))
    fireEvent.click(await screen.findByTestId('topbar-avatar'))
    const list = screen.getByTestId('switcher-list')
    fireEvent.click(await within(list).findByRole('button', { name: /^Thoren/ }))
    expect((await screen.findAllByDisplayValue('Thoren')).length).toBeGreaterThan(0)
  })
})
