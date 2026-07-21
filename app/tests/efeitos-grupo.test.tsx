// @vitest-environment jsdom
// F2 do plano #347 — efeitos COMPARTILHADOS pelos aliados de grupo viram
// condições ativáveis (reports f66e9b95 Inspiração, 22052006 Celeridade,
// 7f85e7d3 Ato Inspirador). Raiz no app: condChipDefs descartava sharedFrom e
// só aceitava tipo Condição (Ato Inspirador é AçãoLocal); e não havia
// agregação de aliados (useSharedAllyDescriptors). Integração sobre heróis
// REAIS: Carlos (bardo com Inspiração/Ato Inspirador em Acoes.Lista, grupo
// "Carlos, Dante, Mera, Pind, Thoren") e Mera (mesmo grupo, sabe Celeridade).
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { FichaPage } from '../src/components/ficha/FichaPage'
import { heroPath } from '../src/paths'
import { getHeroEdits, __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

const CARLOS_ID = 'Sistema/Criaturas/Heróis/Carlos Facão de Andradas'
const MERA_ID = 'Sistema/Criaturas/Heróis/Mera'

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
    return {
      ok,
      status: ok ? 200 : 404,
      json: async () => {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'))
        if (rel === `${MERA_ID}.json`) {
          // A vault REAL da Mera já tem 'Inspiração::Carlos…' ativa (o plugin
          // gravou na mesa). Zera pra o teste exercitar a ATIVAÇÃO.
          data.frontmatter.Interativa = { ...(data.frontmatter.Interativa ?? {}), Condicoes_Ativas: {} }
        }
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

function renderCombate(heroId: string) {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={[heroPath(heroId, 'combate')]}>
        <Routes>
          <Route path="/heroi/*" element={<FichaPage />} />
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}

async function abrirCondicoes() {
  fireEvent.click(await screen.findByText('CONDIÇÕES'))
}

describe('F2 — efeitos de grupo/magia como condições (#347)', () => {
  it('Mera vê Inspiração (condições) e Ato Inspirador (ataques) DO CARLOS', async () => {
    renderCombate(MERA_ID)
    // AçãoLocal compartilhada vive no RAIL de chips do painel Ataques (a Lista
    // de Efeitos do plugin) — visível sem abrir popover (sub-aba default).
    expect(await screen.findByText('Ato Inspirador (de Carlos Facão de Andradas)')).toBeTruthy()
    await abrirCondicoes()
    // Condição compartilhada no popover CONDIÇÕES ("Efeitos do Grupo" do plugin).
    expect(await screen.findByText('Inspiração (de Carlos Facão de Andradas)')).toBeTruthy()
  }, 30000)

  it('ativar a Inspiração compartilhada grava a chave COMPOSTA label::aliado', async () => {
    renderCombate(MERA_ID)
    await abrirCondicoes()
    // O toggle é o BOTÃO dentro do chip (o span do nome não é clicável) —
    // quando desligado é o único button do chip.
    const label = await screen.findByText('Inspiração (de Carlos Facão de Andradas)')
    const chip = label.parentElement as HTMLElement
    fireEvent.click(chip.querySelector('button')!)
    // Estado do HERÓI que ativa, com a chave composta (plugin composeStateKey).
    const cond = getHeroEdits(MERA_ID).fm['Interativa.Condicoes_Ativas'] as Record<string, unknown>
    expect(cond).toBeTruthy()
    expect(Object.keys(cond)).toContain('Inspiração::Carlos Facão de Andradas')
  }, 30000)

  it('Carlos (dono) vê o próprio Ato Inspirador (rail de ataques) e a Celeridade DA MERA', async () => {
    renderCombate(CARLOS_ID)
    // Chip PRÓPRIO de AçãoLocal no rail de ataques (botão togglável); o texto
    // também pode existir em listas — o chip é o <button>.
    const els = await screen.findAllByText('Ato Inspirador')
    const chipEl = els.find((el) => el.closest('button'))
    expect(chipEl, 'chip próprio de AçãoLocal no rail de ataques').toBeTruthy()
    await abrirCondicoes()
    // Magia compartilhável de aliada (Celeridade da Mera, compartilharGrupo).
    expect(await screen.findByText('Celeridade (de Mera)')).toBeTruthy()
  }, 30000)
})
