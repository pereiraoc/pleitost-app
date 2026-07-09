// @vitest-environment jsdom
// CONTADOR "EM" DA TOPBAR (bug 0/0 → cheio): o chip de Energia Mágica na topbar
// da aba COMBATE (TopbarFicha.chipsFor) deve ler o MODELO PROJETADO (derivedFm),
// igual ao MagiasPanel do Combate — não o FM salvo cru. Magias.EM vem da CLASSE
// via rule element (vive no derivedFm); numa ficha nova o FM salvo tem 0, então
// a topbar mostrava "0/0". E o EM corrente, quando AUSENTE de Recursos_Restantes,
// cai no máximo (fallback `?? emMax`) → ficha nova nasce CHEIA (cur === max).
//
// ORÁCULO (padrão de rules-cascade-combate.test.tsx): Carlos REAL, mas com o FM
// salvo forçado a `Magias.EM = 0` e SEM EM corrente em Recursos_Restantes —
// simula a ficha nova. A Classe do Carlos (Bardo/Trovador) re-deriva Magias.EM=4
// na cascata → topbar e Combate devem mostrar "4/4" (não "0/0" nem "0/4").
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { AppShell } from '../src/components/layout/AppShell'
import { FichaPage } from '../src/components/ficha/FichaPage'
import { heroPath } from '../src/paths'
import { projectHeroRules } from '../src/rules/useHeroRules'
import { __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

// Carlos é conjurador (Bardo/Trovador) → a classe concede EM por rule element.
const CARLOS_ID = 'Sistema/Criaturas/Heróis/Carlos Facão de Andradas'

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

/** Serve Carlos com o FM salvo de uma FICHA NOVA de conjurador: Magias.EM=0 e
 *  SEM EM corrente em Recursos_Restantes. A cascata de regras re-deriva o EM. */
function newCasterFm(fm: Record<string, any>): Record<string, any> {
  const inter = { ...(fm.Interativa ?? {}) } as Record<string, any>
  const rest = { ...(inter.Recursos_Restantes ?? {}) }
  delete rest.EM // ficha nova: EM corrente AUSENTE → cai no máximo (cheio)
  delete rest.EM_Secundaria
  return {
    ...fm,
    Magias: { ...(fm.Magias ?? {}), EM: 0 }, // FM salvo cru = 0 (vem da classe)
    Interativa: { ...inter, Recursos_Restantes: rest },
  }
}

beforeAll(() => {
  if (!window.localStorage) {
    Object.defineProperty(window, 'localStorage', { value: makeStorage(), configurable: true })
  }
  globalThis.fetch = (async (input: unknown) => {
    const url = String(input)
    const rel = decodeURIComponent(url.replace(/^\/vault-data\//, ''))
    const file = path.join(vaultDataDir, rel)
    const ok = fs.existsSync(file)
    return {
      ok,
      status: ok ? 200 : 404,
      json: async () => {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'))
        // Só o doc do Carlos sai "esvaziado" de EM; o resto (Classe/regras) real.
        if (rel === `${CARLOS_ID}.json`) data.frontmatter = newCasterFm(data.frontmatter)
        return data
      },
    }
  }) as typeof fetch
})

beforeEach(() => {
  window.localStorage.clear()
  __resetHeroStoreMemoryForTests()
})
afterEach(cleanup)

const load = async (id: string): Promise<VaultDoc> =>
  JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${id}.json`), 'utf8'))

function renderCombate() {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={[heroPath(CARLOS_ID, 'combate')]}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/heroi/*" element={<FichaPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}

describe('contador EM da topbar espelha o Combate (bug 0/0 → cheio)', () => {
  it('sanidade: a projeção re-deriva Magias.EM da classe mesmo com salvo=0', async () => {
    const carlos = await load(CARLOS_ID)
    const fm = newCasterFm(carlos.frontmatter as Record<string, any>)
    expect(fm.Magias.EM).toBe(0)
    expect(fm.Interativa.Recursos_Restantes).not.toHaveProperty('EM')
    const { projection } = await projectHeroRules(fm, catalog, load)
    // Oráculo: a classe concede EM > 0 no derivedFm — é o "máximo" que a topbar
    // e o Combate devem mostrar; se fosse 0, o teste abaixo (4/4) não provaria nada.
    expect((projection.derivedFm as any).Magias.EM).toBeGreaterThan(0)
  })

  it('topbar mostra "EM 4/4" (derivedFm, não 0/0) numa ficha nova cheia', async () => {
    renderCombate()
    // A topbar renderiza no AppShell; o chip de EM (🔷 4/4) aparece na aba combate.
    // Com o bug (FM cru) mostraria "0/0"; com a projeção, EM máximo da classe e
    // corrente ausente ⇒ cheio (cur === max).
    await waitFor(() => {
      expect(screen.getAllByText('4/4').length).toBeGreaterThan(0)
    })
    expect(screen.queryByText('0/0')).toBeNull()
    expect(screen.queryByText('0/4')).toBeNull()
  })

  it('o painel de Magias do Combate mostra "4 / 4" (cheio), coerente com a topbar', async () => {
    renderCombate()
    // MagiasPanel renderiza "{em} / {emMax}"; ficha nova cheia ⇒ 4 / 4.
    const em = await screen.findByText((_t, node) => node?.textContent?.trim() === '4 / 4', {
      exact: false,
    })
    expect(within(em).getByText('4 / 4', { exact: false })).toBeTruthy()
  })
})
