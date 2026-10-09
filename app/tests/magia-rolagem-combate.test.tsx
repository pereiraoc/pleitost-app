// @vitest-environment jsdom
// Report 93ddfa12 (2026-10-08, @thallesagm): "As magias não estão aparecendo
// o dano que eu devo rodar na aba de combate." O dano calculado (#466) só
// existia no HOVER da magia — no celular, sem hover, ninguém via. Agora a
// linha da magia no COMBATE mostra o que rolar, com o mesmo cálculo.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { FichaPage } from '../src/components/ficha/FichaPage'
import { heroPath } from '../src/paths'
import { rolagensDaMagia } from '../src/interativa/formula-ctx'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest
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
  if (!window.localStorage) Object.defineProperty(window, 'localStorage', { value: makeStorage(), configurable: true })
  globalThis.fetch = (async (input: unknown) => {
    const rel = decodeURIComponent(String(input).replace(/^\/vault-data\//, ''))
    const file = path.join(vaultDataDir, rel)
    const ok = fs.existsSync(file)
    return { ok, status: ok ? 200 : 404, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) }
  }) as typeof fetch
})
afterEach(cleanup)

describe('rolagensDaMagia (report 93ddfa12)', () => {
  it('Hidrovitalizar com potência 8 e MOD 3 → 8d6+12', () => {
    expect(rolagensDaMagia('Cura [1d6+(MOD/2)]×potência EH, alcance 6q.', { potencia: 8, mod: 3 }).map((r) => r.calc)).toEqual([
      '8d6+12',
    ])
  })
  it('sem fórmula ou sem contexto → nada', () => {
    expect(rolagensDaMagia('Você fica invisível.', { potencia: 8, mod: 3 })).toEqual([])
    expect(rolagensDaMagia('1d6×potência', undefined)).toEqual([])
  })
})

describe('linha da magia no COMBATE mostra o que rolar', () => {
  it('herói da vault com magia de dano: chip de rolagem na linha', async () => {
    const heroi = manifest.docs.find((d) => d.id === 'Sistema/Criaturas/Heróis/Carlos Facão de Andradas')!
    render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter initialEntries={[heroPath(heroi.id, 'combate')]}>
          <Routes>
            <Route path="/heroi/*" element={<FichaPage />} />
          </Routes>
        </MemoryRouter>
      </CatalogProvider>,
    )
    fireEvent.click(await screen.findByText('MAGIAS', undefined, { timeout: 10000 }))
    await waitFor(() => expect(document.querySelectorAll('[data-magia-rolagem]').length).toBeGreaterThan(0), {
      timeout: 10000,
    })
    const txt = document.querySelector('[data-magia-rolagem]')!.textContent ?? ''
    expect(txt).toMatch(/^\d+(d\d+)?([+-]\d+)?/)
  }, 30000)
})
