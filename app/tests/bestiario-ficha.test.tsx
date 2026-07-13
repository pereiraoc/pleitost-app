// @vitest-environment jsdom
// #229 (a): "não consigo ver ficha de criatura do bestiario" — o card de
// monstro da VAULT na aba BESTIÁRIO navegava pra rota de doc do compêndio
// (/doc/...), que pra monstro renderiza só o título + o fence autosheet-yaml
// cru ("Modo: Resumo") — nenhum stat, nenhuma ficha utilizável. O monstro
// LOCAL já abre a ficha formato herói (#47); a MESMA ficha abre o doc da
// vault (FichaPage carrega qualquer id via useDoc — o Carlos da vault já
// abre assim), com as edições indo pro overlay local (a vault nunca é
// escrita — não existe caminho de escrita pra vault-data no app).
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { NpcsPage } from '../src/components/creatures/CreaturesPages'
import { FichaPage } from '../src/components/ficha/FichaPage'
import { heroPath } from '../src/paths'
import { __resetLocalStoreForTests } from '../src/data/local-entities'
import { __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

const GOBLIN_ID = 'Sistema/Criaturas/Bestiário/Goblin Batedor'
const goblin = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, `${GOBLIN_ID}.json`), 'utf8'),
) as VaultDoc
const gfm = goblin.frontmatter as Record<string, any>

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
    const rel = decodeURIComponent(String(input).replace(/^\/vault-data\//, ''))
    const file = path.join(vaultDataDir, rel)
    const ok = fs.existsSync(file)
    return { ok, status: ok ? 200 : 404, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) }
  }) as typeof fetch
})

beforeEach(() => {
  window.localStorage.clear()
  __resetLocalStoreForTests()
  __resetHeroStoreMemoryForTests()
  // aba BESTIÁRIO é mestre-gated (issue #35)
  window.localStorage.setItem('pleitost.settings.mestre', 'true')
})
afterEach(cleanup)

let currentPath = ''
function LocationProbe() {
  currentPath = useLocation().pathname
  return null
}

function renderNpcsComFicha() {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={['/npcs']}>
        <LocationProbe />
        <Routes>
          <Route path="/npcs" element={<NpcsPage />} />
          <Route path="/heroi/*" element={<FichaPage />} />
          <Route path="/doc/*" element={<div>DOC-DO-COMPENDIO</div>} />
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}

/** O nome no CARD do bestiário (o CriadorCombate montado na mesma página tem
 *  um <option> com o mesmo texto — o card é o .npc-nome). */
async function findGoblinCard(): Promise<HTMLElement> {
  const nomes = await screen.findAllByText('Goblin Batedor')
  const nome = nomes.find((el) => el.classList.contains('npc-nome'))
  expect(nome).toBeTruthy()
  return nome!.closest('.npc-card') as HTMLElement
}

describe('#229 (a): monstro da vault no BESTIÁRIO abre a ficha formato herói', () => {
  it('card do Goblin Batedor mostra o TIER real e o clique abre a FICHA (não o doc)', async () => {
    renderNpcsComFicha()
    fireEvent.click(screen.getByRole('button', { name: 'BESTIÁRIO' }))
    // card da vault com o badge TIER do FM real (conteúdo do card intacto)
    const card = await findGoblinCard()
    fireEvent.click(card)
    // ANTES (#229): ia pra /doc/... que só mostra o fence autosheet-yaml cru.
    expect(screen.queryByText('DOC-DO-COMPENDIO')).toBeNull()
    expect(currentPath).toBe(heroPath(GOBLIN_ID))
    // FICHA utilizável: nome real no campo NOME do PERFIL
    expect((await screen.findAllByDisplayValue('Goblin Batedor')).length).toBeGreaterThan(0)
  })

  it('a ficha do monstro da vault mostra vida real (COMBATE) sem editar a vault', async () => {
    const antes = fs.readFileSync(path.join(vaultDataDir, `${GOBLIN_ID}.json`), 'utf8')
    render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter initialEntries={[heroPath(GOBLIN_ID, 'combate')]}>
          <Routes>
            <Route path="/heroi/*" element={<FichaPage />} />
          </Routes>
        </MemoryRouter>
      </CatalogProvider>,
    )
    // vida real do FM do bestiário (Vida.Vitalidade = 21, sem Interativa → cheia)
    const vitMax = Number(gfm.Vida.Vitalidade)
    expect(await screen.findByText(`${vitMax} / ${vitMax}`)).toBeTruthy()
    expect(screen.getByText('VITALIDADE')).toBeTruthy()
    // a vault segue intocada (ler a ficha nunca escreve o JSON)
    expect(fs.readFileSync(path.join(vaultDataDir, `${GOBLIN_ID}.json`), 'utf8')).toBe(antes)
  })

  it('monstro da vault tem TIER real no badge do card (dado do FM, não inventado)', async () => {
    renderNpcsComFicha()
    fireEvent.click(screen.getByRole('button', { name: 'BESTIÁRIO' }))
    const card = await findGoblinCard()
    expect(card.textContent).toContain('TIER')
    expect(card.textContent).toContain(String(gfm.Tier))
  })
})
