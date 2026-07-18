// @vitest-environment jsdom
// TELA CONFIG + MODO MESTRE (issue #35): tela desenhada (§CONFIG do design)
// ligada ao tema real (theme.ts) e à setting app-level pleitost.settings.mestre
// (useSettings); com Mestre OFF a aba BESTIÁRIO dos NPCs fica bloqueada pra
// clique (convenção :disabled), e ligar em CONFIG reflete sem reload.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { AppShell } from '../src/components/layout/AppShell'
import { ConfigPage } from '../src/components/config/ConfigPage'
import { NpcsPage } from '../src/components/creatures/CreaturesPages'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'))
const catalog = buildCatalog(manifest)

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

/** vitest 4 + jsdom delega ao webstorage EXPERIMENTAL do Node (indisponível
 *  sem --localstorage-file) → window.localStorage vem undefined no teste.
 *  Polyfill fiel da API de Storage só no ambiente de teste; no navegador o
 *  localStorage real é usado (mesmo shim dos demais testes de persistência). */
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
})

afterEach(cleanup)

function renderApp(initial: string) {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/npcs" element={<NpcsPage />} />
            <Route path="/config" element={<ConfigPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}

const bestiarioBtn = () =>
  screen.getByRole('button', { name: 'BESTIÁRIO' }) as HTMLButtonElement

describe('tela CONFIG (issue #35)', () => {
  it('rota habilitada na sidebar e tela desenhada: kicker, linhas e rodapé', async () => {
    renderApp('/config')
    // CONFIG agora é NavLink (rota implementada), não botão disabled
    expect(screen.getByRole('link', { name: 'CONFIG' })).toBeTruthy()
    expect(await screen.findByText('// CONFIGURAÇÕES DO SISTEMA')).toBeTruthy()
    expect(screen.getByText('Tema')).toBeTruthy()
    expect(screen.getByText('Modo de Exibição')).toBeTruthy()
    expect(screen.getByText('Contexto')).toBeTruthy()
    expect(screen.getByText('Cor de Destaque')).toBeTruthy()
    expect(screen.getByText('Modo Mestre')).toBeTruthy()
    // #191: a versão do rodapé é a REAL do app (package.json via define). #285: o
    // formato agora é `v<semver>+<git-sha>` (build distinguível no bug report) —
    // casa o prefixo do semver, tolerando o sufixo do SHA.
    expect(screen.getByText(/^PLEITOST COMPANION\/\/OS · v0\.1\.0/)).toBeTruthy()
    // Tema/Cor de Destaque compartilham os 6 nomes (AÇO SOLAR aparece nos DOIS) →
    // getAllByRole. Contexto tem rótulos únicos (FANTASIA/CYBERPUNK).
    expect(screen.getAllByRole('button', { name: /AÇO SOLAR/ }).length).toBeGreaterThanOrEqual(2)
    expect(screen.getByRole('button', { name: /FANTASIA/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /CYBERPUNK/ })).toBeTruthy()
    expect(screen.getByText('PERSONALIZADA')).toBeTruthy() // <label> do input de cor
  })

  it('seletor de TEMA ligado ao theme.ts real: data-theme aplicado e persistido', async () => {
    renderApp('/config')
    await screen.findAllByRole('button', { name: /AÇO SOLAR/ })
    // Tema e Cor de Destaque têm os mesmos rótulos; a pill do TEMA vem 1º no DOM.
    const acoSolarTema = screen.getAllByRole('button', { name: /AÇO SOLAR/ })[0]
    const ferroFrioTema = screen.getAllByRole('button', { name: /FERRO FRIO/ })[0]
    expect(acoSolarTema.style.getPropertyValue('--on')).toBe('1') // default aco-solar
    expect(ferroFrioTema.style.getPropertyValue('--on')).toBe('0')
    expect(document.documentElement.dataset.theme).toBe('aco-solar')

    // trocar de TEMA NÃO mexe no modo (eixo independente): fica no claro default
    fireEvent.click(ferroFrioTema)
    expect(document.documentElement.dataset.theme).toBe('ferro-frio')
    expect(document.documentElement.dataset.mode).toBe('light') // modo inalterado
    expect(JSON.parse(localStorage.getItem('pleitost.theme')!).theme).toBe('ferro-frio')

    // Contexto é ortogonal: clicar CYBERPUNK muda data-context, não o tema/modo
    fireEvent.click(screen.getByRole('button', { name: /CYBERPUNK/ }))
    expect(document.documentElement.dataset.context).toBe('cyberpunk')
    expect(document.documentElement.dataset.theme).toBe('ferro-frio')

    // #307: o atalho da topbar saiu; o MODO agora troca só pela linha "Modo de
    // Exibição" do CONFIG (pill ESCURO) — muda o modo sem mexer no tema.
    fireEvent.click(screen.getByRole('button', { name: /ESCURO/ }))
    expect(document.documentElement.dataset.mode).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('ferro-frio') // tema mantido
  })

  it('Modo Mestre persiste em pleitost.settings.mestre', async () => {
    renderApp('/config')
    // #303: "Ícones nos Links" também usa ATIVADO/DESATIVADO — escopa à linha do
    // Modo Mestre pra não ambiguar. \b evita casar o sufixo de "DESATIVADO".
    await screen.findByText('Modo Mestre')
    const linha = () => within(screen.getByText('Modo Mestre').parentElement as HTMLElement)
    expect(linha().getByRole('button', { name: /DESATIVADO/ }).style.getPropertyValue('--on')).toBe('1')
    fireEvent.click(linha().getByRole('button', { name: /\bATIVADO$/ }))
    expect(localStorage.getItem('pleitost.settings.mestre')).toBe('true')
    expect(linha().getByRole('button', { name: /\bATIVADO$/ }).style.getPropertyValue('--on')).toBe('1')
    fireEvent.click(linha().getByRole('button', { name: /DESATIVADO/ }))
    expect(localStorage.getItem('pleitost.settings.mestre')).toBe('false')
  })
})

describe('gating do BESTIÁRIO pelo Modo Mestre (issue #35)', () => {
  it('Mestre OFF: aba bloqueada pra clique; ligar em CONFIG libera sem reload', async () => {
    renderApp('/npcs')
    // estado inicial deste describe: OFF (teste anterior desligou)
    await waitFor(() => expect(bestiarioBtn().disabled).toBe(true))
    // clicar não seleciona (segue sem a classe .on)
    fireEvent.click(bestiarioBtn())
    expect(bestiarioBtn().className).not.toContain('on')

    // liga o Modo Mestre na tela CONFIG (mesma árvore, sem reload)
    fireEvent.click(screen.getByRole('link', { name: 'CONFIG' }))
    await screen.findByText('Modo Mestre')
    fireEvent.click(
      within(screen.getByText('Modo Mestre').parentElement as HTMLElement).getByRole('button', {
        name: /\bATIVADO$/,
      }),
    )

    // volta pros NPCS: aba disponível e clicável
    fireEvent.click(screen.getByRole('link', { name: 'CRIATURAS' }))
    await waitFor(() => expect(bestiarioBtn().disabled).toBe(false))
    fireEvent.click(bestiarioBtn())
    expect(bestiarioBtn().className).toContain('on')
    // monstro real da vault renderizado na aba liberada
    expect((await screen.findAllByText('Goblin Batedor')).length).toBeGreaterThan(0)
  })

  it('Mestre ON→OFF: seleção ativa recua e a aba volta a bloquear', async () => {
    // continua ON do teste anterior
    renderApp('/npcs')
    await waitFor(() => expect(bestiarioBtn().disabled).toBe(false))
    fireEvent.click(bestiarioBtn())
    expect(bestiarioBtn().className).toContain('on')

    fireEvent.click(screen.getByRole('link', { name: 'CONFIG' }))
    await screen.findByText('Modo Mestre')
    fireEvent.click(
      within(screen.getByText('Modo Mestre').parentElement as HTMLElement).getByRole('button', {
        name: /DESATIVADO/,
      }),
    )
    fireEvent.click(screen.getByRole('link', { name: 'CRIATURAS' }))
    await waitFor(() => expect(bestiarioBtn().disabled).toBe(true))
    // seleção recuou pra primeira aba (PESSOAS)
    expect(screen.getByRole('button', { name: 'PESSOAS' }).className).toContain('on')
  })
})
