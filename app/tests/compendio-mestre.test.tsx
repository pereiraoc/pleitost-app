// @vitest-environment jsdom
// Trilha C do plano-mestre — visão de Mestre no compêndio, sobre dados REAIS
// da vault (fetch stubado lê os JSONs do disco, expectativas comparadas com o
// frontmatter cru dos mesmos JSONs):
//   #193 — DocPage mostra a seção "// ELEMENTOS DE REGRA" (raw + resumo do
//          parsed que o extractor já entrega) SÓ com o Modo Mestre ligado;
//   #192 — FolderView ganha o toggle "⊞ TABELA" que agrupa a lista por tipo
//          numa tabela com colunas do tipo, ordenáveis por clique.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { DocView } from '../src/components/compendium/DocPage'
import { __resetSettingsForTests } from '../src/settings'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

const readDoc = (id: string): VaultDoc =>
  JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${id}.json`), 'utf8')) as VaultDoc

// jsdom deste setup não traz localStorage — mesmo stub do commerce-ui.test
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
  // serve /vault-data/** do disco, como o dev server faz
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

// default de cada teste: Mestre OFF; ligar é explícito via mestreOn()
beforeEach(() => {
  window.localStorage.removeItem('pleitost.settings.mestre')
  __resetSettingsForTests()
})
afterEach(cleanup)

function mestreOn() {
  window.localStorage.setItem('pleitost.settings.mestre', 'true')
  __resetSettingsForTests()
}

// ──────────────────────────────────────────────────────────────────────────
// #193 — Elementos de Regra no DocPage
// ──────────────────────────────────────────────────────────────────────────

// Nota real com 9 Elementos_de_Regra no frontmatter (raw + AST do parser)
const MAGIAS_ANIMA = 'Sistema/Criação de Personagem/Habilidades/Animista/Magias Anima'
const magiasAnima = readDoc(MAGIAS_ANIMA)

function renderDoc(doc: VaultDoc) {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter>
        <DocView doc={doc} />
      </MemoryRouter>
    </CatalogProvider>,
  )
}

describe('#193: Elementos de Regra no DocPage (Magias Anima real)', () => {
  it('mestre ON: seção // ELEMENTOS DE REGRA com o RAW de cada elemento', () => {
    expect(magiasAnima.ruleElements.length).toBeGreaterThan(0) // sanidade da fixture
    mestreOn()
    renderDoc(magiasAnima)
    expect(screen.getByText(/\/\/ ELEMENTOS DE REGRA/)).toBeTruthy()
    // todo raw do JSON aparece verbatim na tela (bloco mono)
    for (const raw of new Set(magiasAnima.ruleElements.map((el) => el.raw))) {
      expect(screen.getAllByText(raw).length, raw).toBeGreaterThan(0)
    }
  })

  it('mestre ON: resumo do parsed mostra ação/alvo/escopo que o JSON traz', () => {
    mestreOn()
    renderDoc(magiasAnima)
    // "Definir Magias.Potencia 4" → verbo Definir + alvo Magias.Potencia
    expect(screen.getAllByText('Definir').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Magias.Potencia').length).toBeGreaterThan(0)
    // escopo do parsed: "Nivel 2 Escolha_Habilidades ..." → badges Nível 2 e
    // escolha: <label> (valores vindos da AST, não re-parseados)
    expect(screen.getByText('Nível 2')).toBeTruthy()
    expect(screen.getAllByText('escolha: Essência Elemental Adepta').length).toBeGreaterThan(0)
  })

  it('mestre OFF: nem a seção nem os raws aparecem', () => {
    renderDoc(magiasAnima)
    expect(screen.queryByText(/\/\/ ELEMENTOS DE REGRA/)).toBeNull()
    expect(screen.queryByText('Definir Magias.Potencia 4')).toBeNull()
    expect(document.querySelector('[data-rule-elements]')).toBeNull()
  })
})
