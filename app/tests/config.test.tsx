// @vitest-environment jsdom
// TELA CONFIG + MODO MESTRE (issue #35): tela desenhada (§CONFIG do design)
// ligada ao tema real (theme.ts) e à setting app-level pleitost.settings.mestre
// (useSettings); com Mestre OFF a aba BESTIÁRIO dos NPCs fica bloqueada pra
// clique (convenção :disabled), e ligar em CONFIG reflete sem reload.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
    expect(screen.getByText('Tema da Interface')).toBeTruthy()
    expect(screen.getByText('Modo de Exibição')).toBeTruthy()
    expect(screen.getByText('Modo Mestre')).toBeTruthy()
    expect(screen.getByText('PLEITOST COMPANION//OS · v0.1')).toBeTruthy()
    // opções verbatim do themeOpts/modeOpts do design
    expect(screen.getByRole('button', { name: /CYBERPUNK RED/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /MEDIEVAL/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /ESCURO/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /CLARO/ })).toBeTruthy()
  })

  it('themeOpts ligadas ao theme.ts real: aesthetic e mode aplicados e persistidos', async () => {
    renderApp('/config')
    const medieval = await screen.findByRole('button', { name: /MEDIEVAL/ })
    const cyber = screen.getByRole('button', { name: /CYBERPUNK RED/ })
    // default do design: medieval + light (padrão --on marca a atual)
    expect(medieval.style.getPropertyValue('--on')).toBe('1')
    expect(cyber.style.getPropertyValue('--on')).toBe('0')
    expect(document.documentElement.dataset.aesthetic).toBe('medieval')

    fireEvent.click(cyber)
    expect(document.documentElement.dataset.aesthetic).toBe('cyberpunk')
    expect(screen.getByRole('button', { name: /CYBERPUNK RED/ }).style.getPropertyValue('--on')).toBe('1')
    expect(JSON.parse(localStorage.getItem('pleitost-theme')!).aesthetic).toBe('cyberpunk')

    fireEvent.click(screen.getByRole('button', { name: /ESCURO/ }))
    expect(document.documentElement.dataset.mode).toBe('dark')
    expect(JSON.parse(localStorage.getItem('pleitost-theme')!).mode).toBe('dark')
    // o toggle da topbar compartilha a MESMA fonte (sem reload): 🌙 = dark
    expect(screen.getByTitle('Alternar modo claro/escuro').textContent).toBe('🌙')
    fireEvent.click(screen.getByRole('button', { name: /CLARO/ }))
    expect(document.documentElement.dataset.mode).toBe('light')
  })

  it('Modo Mestre persiste em pleitost.settings.mestre', async () => {
    renderApp('/config')
    // \b evita casar o sufixo de "DESATIVADO"
    const ativado = await screen.findByRole('button', { name: /\bATIVADO$/ })
    const desativado = screen.getByRole('button', { name: /DESATIVADO/ })
    // default: OFF
    expect(desativado.style.getPropertyValue('--on')).toBe('1')
    fireEvent.click(ativado)
    expect(localStorage.getItem('pleitost.settings.mestre')).toBe('true')
    expect(screen.getByRole('button', { name: /\bATIVADO$/ }).style.getPropertyValue('--on')).toBe('1')
    fireEvent.click(screen.getByRole('button', { name: /DESATIVADO/ }))
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
    fireEvent.click(await screen.findByRole('button', { name: /\bATIVADO$/ }))

    // volta pros NPCS: aba disponível e clicável
    fireEvent.click(screen.getByRole('link', { name: 'NPCS' }))
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
    fireEvent.click(await screen.findByRole('button', { name: /DESATIVADO/ }))
    fireEvent.click(screen.getByRole('link', { name: 'NPCS' }))
    await waitFor(() => expect(bestiarioBtn().disabled).toBe(true))
    // seleção recuou pra primeira aba (PESSOAS)
    expect(screen.getByRole('button', { name: 'PESSOAS' }).className).toContain('on')
  })
})
