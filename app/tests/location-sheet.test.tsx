// @vitest-environment jsdom
// Ficha de Localização no compêndio (issue #66) sobre Localizações REAIS da
// vault (Canto Alto = Capital com Recursos wikilink; Líciae = Grande Cidade com
// Recurso string simples). Fetch stubado lê os JSONs do disco, como o dev
// server. Um doc não-Localização (Adaga) segue no markdown — sem regressão.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { DocView } from '../src/components/compendium/DocPage'
import { addGroupHex, getGroupState, setGroupStateFull, __resetGroupStoreMemoryForTests } from '../src/data/group-store'
import { docPath } from '../src/paths'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

const readDoc = (id: string): VaultDoc =>
  JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${id}.json`), 'utf8')) as VaultDoc

const cantoAlto = readDoc('Atlas/Mundo Livre/Principado das Flores/Canto Alto')
const liciae = readDoc('Atlas/Mundo Livre/Federação Áurea/Campos do Provento/Líciae')
const adaga = readDoc(
  'Sistema/Equipamento/Armas/Armas Simples/Corpo-a-Corpo Simples/Adaga',
)
// Nota-raiz do Mundo Livre: única Localização que ANCORA um mapa de hexcrawl →
// a aba Hexploração fica HABILITADA (fora da sidebar).
const mundoLivre = readDoc('Atlas/Mundo Livre/Mundo Livre')

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

afterEach(() => {
  cleanup()
  __resetGroupStoreMemoryForTests()
  try {
    window.localStorage?.clear()
  } catch {
    /* sem storage */
  }
})

/** F7 (#347): o comércio agora é GATEADO pela parada atual do grupo — os
 *  testes de loja semeiam um grupo PARADO no local (jogador na cidade). */
function grupoParadoEm(docId: string) {
  addGroupHex('mesa-teste', { col: 1, row: 1, label: 'parada', localId: docId })
  const s = getGroupState('mesa-teste')
  setGroupStateFull('mesa-teste', { ...s, atualId: s.hexes[s.hexes.length - 1]!.id })
}

function renderDoc(doc: VaultDoc) {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter>
        <DocView doc={doc} />
      </MemoryRouter>
    </CatalogProvider>,
  )
}

describe('LocationSheet (Localização real)', () => {
  it('sanidade da fixture: Canto Alto/Líciae são Localização', () => {
    expect(cantoAlto.type).toBe('Localização')
    expect(cantoAlto.frontmatter['categoria']).toBe('Localização')
    expect(liciae.type).toBe('Localização')
  })

  it('renderiza ficha com as três abas; Hexploração desabilitada com nota', () => {
    renderDoc(cantoAlto)
    expect(screen.getByRole('heading', { level: 1, name: 'Canto Alto' })).toBeTruthy()
    for (const label of ['Detalhes', 'Comércio', 'Hexploração']) {
      expect(screen.getByRole('tab', { name: label })).toBeTruthy()
    }
    const detalhes = screen.getByRole('tab', { name: 'Detalhes' }) as HTMLButtonElement
    const comercio = screen.getByRole('tab', { name: 'Comércio' }) as HTMLButtonElement
    const hex = screen.getByRole('tab', { name: 'Hexploração' }) as HTMLButtonElement
    expect(detalhes.disabled).toBe(false)
    // F7 (#347): sem grupo PARADO no local (e sem Modo Mestre), comércio fecha.
    expect(comercio.disabled).toBe(true)
    // Hexploração: fundação do hexcrawl ainda sem mapa (issue #67) → disabled + nota
    expect(hex.disabled).toBe(true)
    expect(hex.getAttribute('title')).toMatch(/mapa de hexcrawl/i)
  })

  it('sidebar de Detalhes esconde a aba Hexploração (já estamos na exploração)', () => {
    // fora da sidebar: Mundo Livre TEM a aba (habilitada, ancora mapa)
    renderDoc(mundoLivre)
    expect(screen.getByRole('tab', { name: 'Hexploração' })).toBeTruthy()
    cleanup()
    // na sidebar: a aba some
    render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter>
          <DocView doc={mundoLivre} sidebar />
        </MemoryRouter>
      </CatalogProvider>,
    )
    expect(screen.queryByRole('tab', { name: 'Hexploração' })).toBeNull()
    expect(screen.getByRole('tab', { name: 'Detalhes' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Comércio' })).toBeTruthy()
  })

  // Feedback do mestre: Tipo virou o subtype no doc-type (topo); Geolocalização
  // virou o breadcrumb rotulado; Recursos viraram uma GRADE de mini-cards.
  it('Detalhes: subtype no topo, Recursos em cards e Geolocalização no breadcrumb', async () => {
    renderDoc(cantoAlto)
    // Tipo = subtype "Capital" no doc-type do topo (fora da tabela)
    expect(document.querySelector('.doc-type')?.textContent).toBe('Capital')
    // Recursos: grade de cards com o rótulo (alias "Armadura Leve" preservado)
    await waitFor(() => expect(screen.getByText(/\/\/ RECURSOS/)).toBeTruthy())
    expect(screen.getByText('Armadura Leve')).toBeTruthy()
    expect(screen.getByText('Adaga')).toBeTruthy()
    // Geolocalização = breadcrumb navegável (pai resolvido pelo índice do Atlas)
    const geoRes = catalog.resolve('Principado das Flores')
    expect(geoRes.kind).toBe('doc')
    const geoLink = await screen.findByRole('link', { name: 'Principado das Flores' })
    expect(geoLink.getAttribute('href')).toBe(docPath((geoRes as { id: string }).id))
  })

  it('Detalhes: campos ausentes do FM são omitidos (nunca inventados)', () => {
    renderDoc(cantoAlto)
    // Canto Alto tem Descrição/Contexto/Organizações/Acontecimento nulos → não aparecem
    expect(screen.queryByText('Descrição')).toBeNull()
    expect(screen.queryByText('Contexto')).toBeNull()
    expect(screen.queryByText('Organizações Influentes')).toBeNull()
    expect(screen.queryByText('Acontecimento Recente')).toBeNull()
  })

  it('Líciae: Recurso string simples ("Gado") vira card sem nota, não link', async () => {
    renderDoc(liciae)
    expect(document.querySelector('.doc-type')?.textContent).toBe('Grande Cidade') // Tipo
    await waitFor(() => expect(screen.getByText('Gado')).toBeTruthy())
    expect(screen.queryByRole('link', { name: 'Gado' })).toBeNull()
    // Geolocalização segue navegável (breadcrumb)
    expect(await screen.findByRole('link', { name: 'Campos do Provento' })).toBeTruthy()
  })

  it('aba Comércio: loja da localização (issue #72) — AUTO-ABRE ao entrar, sem Modo Mestre', async () => {
    // F7 (#347): jogador com o grupo PARADO em Canto Alto (o gate libera).
    grupoParadoEm(cantoAlto.id)
    renderDoc(cantoAlto)
    // Detalhes é o default — Canto Alto mostra a grade de Recursos
    await waitFor(() => expect(screen.getByText(/\/\/ RECURSOS/)).toBeTruthy())
    fireEvent.click(screen.getByRole('tab', { name: 'Comércio' }))
    // troca de aba desmonta o painel de Detalhes
    expect(screen.queryByText(/\/\/ RECURSOS/)).toBeNull()
    // Sem Modo Mestre a loja NÃO fica "fechada": ao carregar os Recursos a
    // rolagem roda sozinha (o comércio "que deveria aparecer" aparece).
    await waitFor(() => expect(screen.queryByText('// LOJA FECHADA')).toBeNull())
  })
})

describe('doc não-Localização não vira ficha de Localização (sem regressão)', () => {
  it('Adaga (Item) vira a carta de Item, não a ficha de Localização', () => {
    const { container } = renderDoc(adaga)
    expect(adaga.type).not.toBe('Localização')
    // sem abas da ficha de Localização
    expect(screen.queryByRole('tab', { name: 'Hexploração' })).toBeNull()
    // #245: Adaga agora abre a carta de Item (visualizador dedicado), não o
    // markdown genérico; o bloco %% (dano::) continua escondido
    expect(container.querySelector('.shc-card')).toBeTruthy()
    expect(within(container.querySelector('.shc-card')!).getByText('Adaga')).toBeTruthy()
    expect(screen.queryByText(/dano::/)).toBeNull()
  })
})
