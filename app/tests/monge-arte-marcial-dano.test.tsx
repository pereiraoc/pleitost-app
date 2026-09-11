// @vitest-environment jsdom
// ARTE MARCIAL SEM DANO (report 2026-09-10: "ataques de monge não aparecendo
// dano"). Os golpes da Arte Marcial entram na ficha por regra (Complementar
// Ataques.Lista) e resolvem os stats pela NOTA da arma — mas o carregador de
// notas da ficha (useHeroRefs) não olhava Ataques.Lista. Só a Garra de Tigre
// tinha dano, porque o Kenji também carrega uma no inventário. Vale nos dois
// mundos.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { aplicarContextoAosDocs, buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { FichaPage } from '../src/components/ficha/FichaPage'
import { heroPath } from '../src/paths'
import { setActiveContexto } from '../src/data/reskin'
import { __resetLocalStoreForTests } from '../src/data/local-entities'
import { __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
import type { ContextoDef } from '../src/data/context-def'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const cybContexto = path.join(path.dirname(appDir), 'vault-data-cyberpunk', 'contexto.json')
const temMundo = fs.existsSync(cybContexto) && fs.existsSync(path.join(vaultDataDir, 'index.json'))

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

const KENJI = 'Sistema/Criaturas/Heróis/Kenji'
const GOLPES = ['Pontos de Pressão', 'Garra de Tigre', 'Presas de Lobo', 'Cauda de Dragão']

describe.skipIf(!temMundo)('Arte Marcial: todo golpe mostra o dano', () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
  ) as IndexManifest
  const def = JSON.parse(fs.readFileSync(cybContexto, 'utf8')) as ContextoDef
  const poa = {
    ...buildCatalog({ ...manifest, docs: aplicarContextoAosDocs(manifest.docs, def) }),
    contextoDef: def,
  }
  const fantasia = buildCatalog(manifest)

  beforeAll(() => {
    if (!window.localStorage) {
      Object.defineProperty(window, 'localStorage', { value: makeStorage(), configurable: true })
    }
    globalThis.fetch = (async (input: unknown) => {
      const rel = decodeURIComponent(String(input).replace(/^\/vault-data\//, ''))
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
    __resetLocalStoreForTests()
    __resetHeroStoreMemoryForTests()
  })
  afterEach(() => {
    cleanup()
    setActiveContexto(null)
  })

  for (const [mundo, catalog] of [
    ['POA 1987', poa],
    ['fantasia', fantasia],
  ] as const) {
    it(`${mundo}: cada golpe da Arte Marcial tem linha de dano (⚔️)`, async () => {
      render(
        <CatalogProvider catalog={catalog}>
          <MemoryRouter initialEntries={[heroPath(KENJI, 'combate')]}>
            <Routes>
              <Route path="/heroi/*" element={<FichaPage />} />
            </Routes>
          </MemoryRouter>
        </CatalogProvider>,
      )
      await screen.findAllByText(/⚔️/, undefined, { timeout: 20000 })
      // o texto da lista de ataques: "Nome+bônus⚔️ NdX+Y…" — o golpe sem nota
      // carregada fica só "Nome+bônus" e o próximo nome vem colado
      await waitFor(
        () => {
          const txt = document.body.textContent ?? ''
          const semDano = GOLPES.filter((g) => {
            const reskin = mundo === 'POA 1987' && g === 'Cauda de Dragão' ? 'Rabo de Arraia' : g
            const re = new RegExp(`${reskin}\\+\\d+⚔️ \\d+d\\d+`)
            return !re.test(txt)
          })
          // o trecho ao redor de cada golpe faltante diz se é nome errado
          // (fantasia no POA) ou golpe sem dano
          expect(
            semDano.map((g) => {
              const i = txt.indexOf(g)
              return `${g}: ${i < 0 ? '(nome ausente)' : txt.slice(i, i + 60)}`
            }).join(' | '),
          ).toBe('')
        },
        { timeout: 20000 },
      )
    }, 40000)
  }
})
