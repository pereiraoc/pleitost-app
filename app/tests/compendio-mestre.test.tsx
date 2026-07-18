// @vitest-environment jsdom
// Trilha C do plano-mestre — visão de Mestre no compêndio, sobre dados REAIS
// da vault (fetch stubado lê os JSONs do disco, expectativas comparadas com o
// frontmatter cru dos mesmos JSONs):
//   #193 — DocPage mostra a seção "// ELEMENTOS DE REGRA" (raw + resumo do
//          parsed que o extractor já entrega) SÓ com o Modo Mestre ligado;
//   #192 — FolderView ganha o toggle "⊞ TABELA" que agrupa a lista por tipo
//          numa tabela com colunas do tipo, ordenáveis por clique.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { DocView } from '../src/components/compendium/DocPage'
import { FolderView } from '../src/components/compendium/FolderView'
import { compendiumFolderPath } from '../src/paths'
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
    // #feedback: os elementos de regra ficam COLAPSADOS — expande pelo botão
    fireEvent.click(screen.getByText(/ELEMENTOS DE REGRA ·/))
    expect(screen.getByText(/\/\/ ELEMENTOS DE REGRA/)).toBeTruthy()
    // todo raw do JSON aparece verbatim na tela (bloco mono)
    for (const raw of new Set(magiasAnima.ruleElements.map((el) => el.raw))) {
      expect(screen.getAllByText(raw).length, raw).toBeGreaterThan(0)
    }
  })

  it('mestre ON: resumo do parsed mostra ação/alvo/escopo que o JSON traz', () => {
    mestreOn()
    renderDoc(magiasAnima)
    fireEvent.click(screen.getByText(/ELEMENTOS DE REGRA ·/)) // expande o colapsado
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

// ──────────────────────────────────────────────────────────────────────────
// #192 — visão TABELA por tipo no FolderView
// ──────────────────────────────────────────────────────────────────────────

const ARMAS = 'Sistema/Equipamento/Armas/Armas Simples/Corpo-a-Corpo Simples'
const TESOUROS = 'Sistema/Equipamento/Tesouros/Consumíveis'

const folderRoutes = (
  <>
    <Route path="/compendio" element={<FolderView />} />
    <Route path="/compendio/*" element={<FolderView />} />
  </>
)

function renderFolder(folder: string) {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={[compendiumFolderPath(folder)]}>
        <Routes>{folderRoutes}</Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}

/** Docs diretos da pasta, sem a folder note (mesma regra do FolderView). */
function docsOfFolder(folder: string) {
  const node = catalog.folderByPath.get(folder)!
  return node.docs.filter((d) => d.basename !== node.name)
}

/** Nomes das linhas na ordem renderizada da tabela do Mestre. */
function rowNames(): string[] {
  const table = document.querySelector<HTMLElement>('table[data-mestre-tabela]')!
  return [...table.querySelectorAll('tbody a')].map((a) => a.textContent!)
}

// mesma regra de ordenação exposta na UI (numeric: "d4+2" < "d12+6")
const collator = new Intl.Collator('pt', { numeric: true })

/** Expectativa independente: basenames ordenados pelo campo do FM cru. */
function sortedByField(folder: string, field: string, dir: 1 | -1): string[] {
  const value = (id: string) => String(readDoc(id).frontmatter[field] ?? '')
  return [...docsOfFolder(folder)]
    .sort((a, b) => dir * collator.compare(value(a.id), value(b.id)))
    .map((e) => e.basename!)
}

describe('#192: visão TABELA por tipo pro Mestre', () => {
  it('mestre OFF: o toggle não é oferecido', () => {
    renderFolder(ARMAS)
    expect(screen.queryByRole('button', { name: '⊞ TABELA' })).toBeNull()
  })

  it('pasta de Armas: colunas de Item/Arma com valores do FM real; célula vazia = —', async () => {
    mestreOn()
    renderFolder(ARMAS)
    // antes do toggle: lista padrão (sem coluna preço do registro do Mestre)
    expect(screen.queryByRole('columnheader', { name: 'preço' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '⊞ TABELA' }))

    for (const col of ['dano', 'tipo', 'mãos', 'preço']) {
      expect(screen.getByRole('columnheader', { name: col }), col).toBeTruthy()
    }
    await screen.findAllByText('d4+2') // docs carregados

    // agrupou pelo tipo real (categoria/subcategoria do frontmatter)
    const table = document.querySelector<HTMLElement>('table[data-mestre-tabela]')!
    expect(table.getAttribute('data-mestre-tabela')).toBe('Item · Arma')

    // cada linha espelha o frontmatter cru do doc; vazio vira '—', nunca inventado
    for (const entry of docsOfFolder(ARMAS)) {
      const fm = readDoc(entry.id).frontmatter
      const row = within(table).getByRole('link', { name: entry.basename! }).closest('tr')!
      const [, dano, tipo, maos, preco] = [...row.querySelectorAll('td')].map(
        (td) => td.textContent,
      )
      expect(dano, `dano de ${entry.basename}`).toBe(String(fm['dano']))
      expect(tipo, `tipo de ${entry.basename}`).toBe(String(fm['tipo']))
      expect(maos, `mãos de ${entry.basename}`).toBe(String(fm['mãos']))
      // dado real: nenhuma arma tem preço no FM → coluna inteira honesta em '—'
      expect(preco, `preço de ${entry.basename}`).toBe(fm['preço'] ? String(fm['preço']) : '—')
    }
  })

  it('ordenar por coluna reordena as linhas (asc/desc) pelos valores reais', async () => {
    mestreOn()
    renderFolder(ARMAS)
    fireEvent.click(screen.getByRole('button', { name: '⊞ TABELA' }))
    await screen.findAllByText('d4+2')

    const inicial = rowNames()
    // nas Armas o preço do FM é vazio em todas (célula '—'): ordenar por ele
    // não pode mudar nada — a ordenação real é exercida pelo dano
    fireEvent.click(screen.getByRole('button', { name: 'preço' }))
    expect(rowNames()).toEqual(inicial)

    const danoBtn = screen.getByRole('button', { name: 'dano' })
    fireEvent.click(danoBtn) // asc
    expect(rowNames()).toEqual(sortedByField(ARMAS, 'dano', 1))
    expect(rowNames()).not.toEqual(inicial)
    fireEvent.click(danoBtn) // desc
    expect(rowNames()).toEqual(sortedByField(ARMAS, 'dano', -1))
  })

  it('pasta de Tesouros: colunas tier/preço; ordenar por preço muda a ordem', async () => {
    mestreOn()
    renderFolder(TESOUROS)
    fireEvent.click(screen.getByRole('button', { name: '⊞ TABELA' }))
    await screen.findAllByText('5 PO')

    const table = document.querySelector<HTMLElement>('table[data-mestre-tabela]')!
    expect(table.getAttribute('data-mestre-tabela')).toBe('Item · Tesouro')
    expect(screen.getByRole('columnheader', { name: 'tier' })).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: 'preço' })).toBeTruthy()

    // preços reais na tela ("5 PO"/"10 PO"); tier não existe no FM → '—'
    for (const entry of docsOfFolder(TESOUROS)) {
      const fm = readDoc(entry.id).frontmatter
      const row = within(table).getByRole('link', { name: entry.basename! }).closest('tr')!
      const [, tier, preco] = [...row.querySelectorAll('td')].map((td) => td.textContent)
      expect(tier, `tier de ${entry.basename}`).toBe(fm['tier'] ? String(fm['tier']) : '—')
      expect(preco, `preço de ${entry.basename}`).toBe(String(fm['preço']))
    }

    const inicial = rowNames()
    const precoBtn = screen.getByRole('button', { name: 'preço' })
    fireEvent.click(precoBtn) // asc (empata com a ordem do índice: 5,5,10,10)
    fireEvent.click(precoBtn) // desc → 10 PO primeiro
    expect(rowNames()).toEqual(sortedByField(TESOUROS, 'preço', -1))
    expect(rowNames()).not.toEqual(inicial)
  })
})
