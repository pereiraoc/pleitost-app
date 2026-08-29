// @vitest-environment jsdom
// Pedido 2026-08-29: o mundo CYBERPUNK fica BLOQUEADO por trás do modo
// desenvolvedor (senha 'poa1987', #519 C6) por ora:
//   - o seletor de Contexto do Config só aparece com o modo dev ativo;
//   - se o contexto salvo é cyberpunk e o modo dev NÃO está ativo, o app
//     volta pra fantasia sozinho (guard no AppShell — cobre boot e DESATIVAR).
import { beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ConfigPage } from '../src/components/config/ConfigPage'
import { AppShell } from '../src/components/layout/AppShell'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { getThemeSnapshot, __resetThemeForTests } from '../src/theme'
import { __resetSettingsForTests } from '../src/settings'
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
    const url = String(input)
    const rel = decodeURIComponent(url.replace(/^\/vault-data(-cyberpunk)?\//, ''))
    const file = path.join(vaultDataDir, rel)
    const ok = fs.existsSync(file)
    return {
      ok,
      status: ok ? 200 : 404,
      json: async () => JSON.parse(fs.readFileSync(file, 'utf8')),
    }
  }) as typeof fetch
})

beforeEach(() => {
  window.localStorage.clear()
  __resetThemeForTests()
  __resetSettingsForTests()
})
afterEach(cleanup)

// seta a flag E re-lê o snapshot (o estado de settings é cacheado por módulo)
const ligarDev = () => {
  window.localStorage.setItem('pleitost.settings.desenvolvedor', 'true')
  __resetSettingsForTests()
}
const salvarContextoCyberpunk = () =>
  window.localStorage.setItem(
    'pleitost.theme',
    JSON.stringify({ theme: 'ember', mode: 'dark', context: 'cyberpunk' }),
  )

describe('seletor de Contexto gated pelo modo desenvolvedor', () => {
  it('sem modo dev: a linha Contexto (e o pill CYBERPUNK) não aparece', () => {
    render(
      <MemoryRouter>
        <ConfigPage />
      </MemoryRouter>,
    )
    expect(screen.queryByText('CYBERPUNK')).toBeNull()
    expect(screen.queryByText('Contexto')).toBeNull()
  })

  it('com modo dev: pills FANTASIA/CYBERPUNK aparecem e trocam o contexto', () => {
    ligarDev()
    render(
      <MemoryRouter>
        <ConfigPage />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByText('CYBERPUNK'))
    expect(getThemeSnapshot().context).toBe('cyberpunk')
  })
})

describe('guard do AppShell: cyberpunk sem modo dev volta pra fantasia', () => {
  function renderShell() {
    return render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/" element={<div>home</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </CatalogProvider>,
    )
  }

  it('contexto salvo cyberpunk + dev OFF → reset pra fantasia no boot', async () => {
    salvarContextoCyberpunk()
    __resetThemeForTests()
    expect(getThemeSnapshot().context).toBe('cyberpunk')
    renderShell()
    await waitFor(() => expect(getThemeSnapshot().context).toBe('fantasia'))
  })

  it('contexto cyberpunk + dev ON → permanece cyberpunk', async () => {
    ligarDev()
    salvarContextoCyberpunk()
    __resetThemeForTests()
    renderShell()
    // dá tempo do effect rodar; o contexto NÃO pode ter sido resetado
    await new Promise((r) => setTimeout(r, 50))
    expect(getThemeSnapshot().context).toBe('cyberpunk')
  })
})
