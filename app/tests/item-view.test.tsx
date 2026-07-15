// @vitest-environment jsdom
// Visualizador de Item no compêndio (#245, F1 do épico #243) sobre Items REAIS
// da vault. Fetch stubado lê os JSONs + assets do disco, como o dev server.
// Cobre: (1) /doc/<Adaga> mostra a CARTA (não o markdown), com nome/dano/imagem
// e a prosa do body; (2) navegar numa pasta de Armas mostra a GRADE de cartas
// (não a DocTable de texto); (3) "Items" ACHATA as 7 categorias pedidas.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { DocView } from '../src/components/compendium/DocPage'
import { FolderView } from '../src/components/compendium/FolderView'
import { registeredDocViewIds } from '../src/components/compendium/doc-view-registry'
import { registeredLeafViewTypes } from '../src/components/compendium/leaf-view-registry'
import { isItem } from '../src/components/compendium/ItemView'
import { compendiumFolderPath, docPath } from '../src/paths'
import type { IndexManifest, VaultDoc } from '../src/data/types'
// side-effect: garante o registro do doc-view 'item' e do leaf-view 'Item'
import '../src/components/compendium/register-doc-views'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

const readDoc = (id: string): VaultDoc =>
  JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${id}.json`), 'utf8')) as VaultDoc

const ADAGA_ID = 'Sistema/Equipamento/Armas/Armas Simples/Corpo-a-Corpo Simples/Adaga'
const CAC_SIMPLES = 'Sistema/Equipamento/Armas/Armas Simples/Corpo-a-Corpo Simples'
const adaga = readDoc(ADAGA_ID)

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

afterEach(cleanup)

function renderDoc(doc: VaultDoc) {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter>
        <DocView doc={doc} />
      </MemoryRouter>
    </CatalogProvider>,
  )
}

const folderRoutes = (
  <>
    <Route path="/compendio" element={<FolderView />} />
    <Route path="/compendio/*" element={<FolderView />} />
  </>
)

function renderFolder(initialPath: string) {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>{folderRoutes}</Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}

describe('registro do visualizador de Item', () => {
  it('o barrel registra o doc-view "item" e o leaf-view "Item"', () => {
    expect(registeredDocViewIds()).toContain('item')
    expect(registeredLeafViewTypes()).toContain('Item')
  })
  it('isItem casa pela categoria (type === "Item")', () => {
    expect(adaga.type).toBe('Item') // sanidade da fixture
    expect(isItem(adaga)).toBe(true)
  })
})

describe('página de um Item: a CARTA (não o markdown genérico)', () => {
  it('/doc/Adaga mostra a carta com nome, dano e a prosa — SEM a tabela de inline fields', async () => {
    const { container } = renderDoc(adaga)
    // a carta reusada do tooltip (.shc-card), não o <h1> do markdown genérico
    const card = container.querySelector<HTMLElement>('.shc-card')
    expect(card, 'carta do item').toBeTruthy()
    expect(within(card!).getByText('Adaga')).toBeTruthy()
    // stats do FM renderizam (Dano d4+2)
    expect(within(card!).getByText('Dano')).toBeTruthy()
    expect(within(card!).getByText('d4+2')).toBeTruthy()
    // o markdown genérico (InlineFieldsTable / dv fields crus) NÃO aparece
    expect(container.querySelector('table.inline-fields')).toBeNull()
    expect(screen.queryByText(/dano::/)).toBeNull()
    // imagem da arma (Figura/Armas/Adaga.png) resolvida pelo índice de assets
    // (o índice carrega async → a carta é re-renderizada com a <img>; re-query
    // no container, pois o innerHTML troca o nó .shc-card).
    await waitFor(
      () => {
        const img = container.querySelector<HTMLImageElement>('.shc-card img.shc-img')
        expect(img, 'figura da arma').toBeTruthy()
        expect(decodeURIComponent(img!.getAttribute('src') ?? '')).toContain('Adaga.png')
      },
      { timeout: 3000 },
    )
  })

  it('a prosa de descrição do body aparece na carta (como no tooltip)', () => {
    const espada = readDoc(
      'Sistema/Equipamento/Armas/Armas Marciais/Corpo-a-Corpo Marcial/Espada Curva',
    )
    const { container } = renderDoc(espada)
    const card = container.querySelector<HTMLElement>('.shc-card')!
    // Espada Curva tem prosa de descrição no body ("Cimitarra") — a carta a mostra
    expect(within(card).getByText(/Cimitarra/)).toBeTruthy()
  })

  it('um Tesouro (Imbuição) também vira carta, com a qualidade no nome', () => {
    const imb = readDoc(
      'Sistema/Equipamento/Tesouros/Imbuições e Qualidade/Imbuições/Imbuição Relampejante',
    )
    expect(imb.subtype).toBe('Tesouro') // sanidade
    const { container } = renderDoc(imb)
    const card = container.querySelector<HTMLElement>('.shc-card')!
    expect(within(card).getByText('Imbuição Relampejante')).toBeTruthy()
    // Tesouro mostra a qualidade (showTier) — span "(Adepto)"
    expect(card.querySelector('.shc-tier')).toBeTruthy()
  })
})

describe('folha de uma pasta de Items: GRADE de cartas (não a DocTable)', () => {
  it('a pasta de Armas mostra a Adaga como CARTA linkada, não uma linha de tabela', async () => {
    const { container } = renderFolder(compendiumFolderPath(CAC_SIMPLES))
    // não é mais a DocTable de texto do compêndio
    expect(container.querySelector('table.doc-table')).toBeNull()
    // é a grade de cartas
    expect(container.querySelector('.item-grid')).toBeTruthy()
    // cada card carrega async; a carta da Adaga aparece linkando pro doc
    await waitFor(() => {
      const cell = [...container.querySelectorAll<HTMLElement>('.item-grid-cell')].find((c) =>
        within(c).queryByText('Adaga'),
      )
      expect(cell, 'célula da Adaga').toBeTruthy()
      expect(cell!.getAttribute('href')).toBe(docPath(ADAGA_ID))
      expect(cell!.querySelector('.shc-card')).toBeTruthy()
      // dano do FM na carta da grade
      expect(within(cell!).getByText('d4+2')).toBeTruthy()
    })
  })

  it('a pasta de Consumíveis (Tesouros) também vira grade de cartas', async () => {
    const { container } = renderFolder(
      compendiumFolderPath('Sistema/Equipamento/Tesouros/Consumíveis'),
    )
    expect(container.querySelector('table.doc-table')).toBeNull()
    expect(container.querySelector('.item-grid')).toBeTruthy()
    await waitFor(() =>
      expect(container.querySelectorAll('.item-grid-cell .shc-card').length).toBeGreaterThan(0),
    )
  })
})

describe('#267 — folha AGRUPADA por categoria/grupo/subgrupo + barra de filtro', () => {
  const ARMAS = 'Sistema/Equipamento/Armas'
  const IMB = 'Sistema/Equipamento/Tesouros/Imbuições e Qualidade'

  it('a pasta Armas (sem docs diretos) ACHATA a subárvore e agrupa por grupo de arma', async () => {
    const { container } = renderFolder(compendiumFolderPath(ARMAS))
    // o contêiner agrupado + a barra de filtro aparecem
    expect(container.querySelector('.item-grouped')).toBeTruthy()
    expect(container.querySelector('.item-filterbar')).toBeTruthy()
    // seções de grupo de arma (data-grupo do agrupamento)
    await waitFor(() => {
      const grupos = [...container.querySelectorAll<HTMLElement>('.item-grp')].map(
        (g) => g.getAttribute('data-grupo'),
      )
      expect(grupos).toContain('cac-simples')
      expect(grupos).toContain('cac-marcial')
      expect(grupos).toContain('natural')
    })
    // as cartas continuam sendo .shc-card, agora sob as seções
    await waitFor(() =>
      expect(container.querySelectorAll('.item-grid-cell .shc-card').length).toBeGreaterThan(20),
    )
    // armas naturais têm subgrupo por tipo (data-subgrupo, ex.: "Garras")
    await waitFor(() => {
      const subs = [...container.querySelectorAll<HTMLElement>('.item-sub')].map(
        (s) => s.getAttribute('data-subgrupo'),
      )
      expect(subs).toContain('Garras')
      expect(subs).toContain('Cauda')
    })
  })

  it('a barra de filtro tem chips de GRUPO — clicar filtra as seções', async () => {
    const { container } = renderFolder(compendiumFolderPath(ARMAS))
    // linha de filtro por grupo existe
    const grupoRow = await waitFor(() => {
      const row = container.querySelector<HTMLElement>('.item-filter-row[data-facet="grupo"]')
      expect(row).toBeTruthy()
      return row!
    })
    // clica no chip "Armas Naturais" → só o grupo natural fica visível
    const natBtn = within(grupoRow).getByText('Armas Naturais')
    natBtn.click()
    await waitFor(() => {
      const grupos = [...container.querySelectorAll<HTMLElement>('.item-grp')].map(
        (g) => g.getAttribute('data-grupo'),
      )
      expect(grupos).toEqual(['natural'])
    })
  })

  it('Imbuições e Qualidade: 2 categorias na mesma folha + filtro de qualidade (tesouro)', async () => {
    const { container } = renderFolder(compendiumFolderPath(IMB))
    await waitFor(() => {
      const cats = [...container.querySelectorAll<HTMLElement>('.item-cat')].map(
        (c) => c.getAttribute('data-categoria'),
      )
      expect(cats).toContain('imbuicao')
      expect(cats).toContain('qualidade')
    })
    // família tesouro → barra de qualidade (Adepto/Experiente/Mestre) presente
    const qRow = container.querySelector<HTMLElement>('.item-filter-row[data-facet="qualidade"]')
    expect(qRow).toBeTruthy()
    expect(within(qRow!).getByText('Adepto')).toBeTruthy()
    expect(within(qRow!).getByText('Mestre')).toBeTruthy()
  })
})

describe('"Items" ACHATA as 7 categorias (flatten de Tesouros)', () => {
  it('Sistema/Equipamento mostra as 7 categorias como botões de navegação', () => {
    renderFolder(compendiumFolderPath('Sistema/Equipamento'))
    for (const name of [
      'Armaduras',
      'Armas',
      'Escudos',
      'Consumíveis',
      'Equipamentos',
      'Imbuições e Qualidade',
      'Implementos',
    ]) {
      expect(screen.getByText(name), name).toBeTruthy()
    }
    // "Tesouros" some como nível intermediário — as subpastas dele subiram
    expect(screen.queryByText('Tesouros')).toBeNull()
  })
})
