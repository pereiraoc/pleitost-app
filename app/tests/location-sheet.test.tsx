// @vitest-environment jsdom
// Ficha de Localização no compêndio (issue #66) sobre Localizações REAIS da
// vault (Canto Alto = Capital com Recursos wikilink; Líciae = Grande Cidade com
// Recurso string simples). Fetch stubado lê os JSONs do disco, como o dev
// server. Um doc não-Localização (Adaga) segue no markdown — sem regressão.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { DocView } from '../src/components/compendium/DocPage'
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
    expect(comercio.disabled).toBe(false)
    // Hexploração: fundação do hexcrawl ainda sem mapa (issue #67) → disabled + nota
    expect(hex.disabled).toBe(true)
    expect(hex.getAttribute('title')).toMatch(/mapa de hexcrawl/i)
  })

  it('Detalhes: Tipo (subcategoria), Recursos wikilink e Geolocalização navegáveis', async () => {
    renderDoc(cantoAlto)
    // Tipo = subcategoria "Capital" (rótulo declarado no schema da ficha)
    const table = document.querySelector<HTMLElement>('table.inline-fields')!
    expect(within(table).getByText('Tipo')).toBeTruthy()
    expect(within(table).getByText('Capital')).toBeTruthy()

    // Recursos: cada item é wikilink navegável (via resolver do catálogo)
    const adagaRes = catalog.resolve('Adaga')
    expect(adagaRes.kind).toBe('doc')
    const adagaLink = within(table).getByRole('link', { name: 'Adaga' })
    expect(adagaLink.getAttribute('href')).toBe(docPath((adagaRes as { id: string }).id))
    // alias do Recurso preserva o rótulo (Armadura Obra-prima|Armadura Leve)
    expect(within(table).getByRole('link', { name: 'Armadura Leve' })).toBeTruthy()

    // Geolocalização = wikilink navegável
    const geoRes = catalog.resolve('Principado das Flores')
    expect(geoRes.kind).toBe('doc')
    const geoLink = within(table).getByRole('link', { name: 'Principado das Flores' })
    expect(geoLink.getAttribute('href')).toBe(docPath((geoRes as { id: string }).id))

    // imagem da região no topo (embed do body → asset resolvido)
    expect(await screen.findByAltText('Canto Alto.png')).toBeTruthy()
  })

  it('Detalhes: campos ausentes do FM são omitidos (nunca inventados)', () => {
    renderDoc(cantoAlto)
    // Canto Alto tem Descrição/Contexto/Organizações/Acontecimento nulos
    const table = document.querySelector<HTMLElement>('table.inline-fields')!
    expect(within(table).queryByText('Descrição')).toBeNull()
    expect(within(table).queryByText('Contexto')).toBeNull()
    expect(within(table).queryByText('Organizações Influentes')).toBeNull()
    expect(within(table).queryByText('Acontecimento Recente')).toBeNull()
  })

  it('Líciae: Recurso string simples ("Gado") vira texto, não link', () => {
    renderDoc(liciae)
    const table = document.querySelector<HTMLElement>('table.inline-fields')!
    expect(within(table).getByText('Grande Cidade')).toBeTruthy() // Tipo
    expect(within(table).getByText('Gado')).toBeTruthy()
    expect(within(table).queryByRole('link', { name: 'Gado' })).toBeNull()
    // Geolocalização segue navegável
    expect(within(table).getByRole('link', { name: 'Campos do Provento' })).toBeTruthy()
  })

  it('aba Comércio: placeholder sóbrio (scaffold da issue #72)', () => {
    renderDoc(cantoAlto)
    // Detalhes é o default
    expect(document.querySelector('table.inline-fields')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'Comércio' }))
    expect(screen.getByText('// COMÉRCIO')).toBeTruthy()
    // troca de aba desmonta o painel de Detalhes
    expect(document.querySelector('table.inline-fields')).toBeNull()
  })
})

describe('doc não-Localização segue no markdown (sem regressão)', () => {
  it('Adaga não vira ficha de Localização', () => {
    renderDoc(adaga)
    expect(adaga.type).not.toBe('Localização')
    // sem abas da ficha de Localização
    expect(screen.queryByRole('tab', { name: 'Hexploração' })).toBeNull()
    // markdown genérico preservado: heading do body + bloco %% escondido
    expect(screen.getByRole('heading', { level: 2, name: 'Adaga' })).toBeTruthy()
    expect(screen.queryByText(/dano::/)).toBeNull()
  })
})
