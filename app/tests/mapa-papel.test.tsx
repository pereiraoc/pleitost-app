// @vitest-environment jsdom
// MAPAS EM PAPEL (report 2026-09-08): "imprimir mapas" leva os MAPAS DE MESA
// declarados nos Locais (`**Mapas de mesa:**`), um por página — não o mapa da
// cidade. Aventura sem mapa de mesa (fantasia) segue no mapa da cidade com os
// markers numerados. Aventura trancada não imprime.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseFrontmatter } from '../../extractor/parse-frontmatter.mjs'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { MapaPapelPage } from '../src/print/MapaPapelPage'
import type { IndexDocEntry, IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const ID = 'Campanhas/Aventuras/Pós Grenal'
const raw = fs.readFileSync(path.join(appDir, 'tests', 'fixtures', 'aventuras', 'Pós Grenal.md'), 'utf8')
const { frontmatter, body } = parseFrontmatter(raw) as { frontmatter: Record<string, unknown>; body: string }

/** Doc ABERTO (o papel só existe destravado) — aqui sem cifra, o que importa é o formato. */
const doc = {
  id: ID,
  path: `${ID}.md`,
  basename: 'Pós Grenal',
  type: 'Aventura',
  subtype: null,
  grupo: null,
  frontmatter,
  inlineFields: {},
  ruleElements: [],
  links: [],
  images: [],
  headings: [],
  body,
} as unknown as VaultDoc

const entry: IndexDocEntry = { id: ID, path: `${ID}.md`, kind: 'content', basename: 'Pós Grenal', type: 'Aventura', subtype: null }
const catalog = buildCatalog({ vaultRoot: '.', counts: {}, byType: {}, docs: [entry] } as unknown as IndexManifest)

beforeAll(() => {
  globalThis.fetch = (async (input: unknown) => {
    const rel = decodeURIComponent(String(input).replace(/^\/vault-data\//, '').replace(/\?.*$/, ''))
    if (rel === `${ID}.json`) return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(doc)) }
    if (rel === 'assets.json') return { ok: true, status: 200, json: async () => ({ counts: {}, assets: [], missing: [] }) }
    return { ok: false, status: 404, json: async () => ({}) }
  }) as typeof fetch
})
afterEach(() => cleanup())

function renderPapel(id: string = ID) {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={[`/papel/mapa/${id}`]}>
        <Routes>
          <Route path="/papel/mapa/*" element={<MapaPapelPage />} />
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}

describe('imprimir mapas da aventura', () => {
  it('uma página por mapa de mesa, com o local no cabeçalho; sem página do mapa da cidade', async () => {
    const { container } = renderPapel()
    await waitFor(() => expect(container.querySelectorAll('[data-mapa-papel="mesa"]').length).toBeGreaterThan(0))
    const pgs = [...container.querySelectorAll('[data-mapa-papel="mesa"]')]
    expect(pgs).toHaveLength(10)
    expect(pgs.map((p) => p.getAttribute('data-mapa-mesa'))).toEqual([
      '01 — Beira-Rio — orientação sem spoilers.png',
      '02 — Rampa sul — barracas e estacionamento.png',
      '06 — Quiosque de primeiros socorros — interior.png',
      '09 — Gasômetro — sala de caldeiras.png',
      '03 — Galerias dos diques — trecho de exploração.png',
      '04 — Estação Férrea de Belas — plataforma.png',
      '05 — Casa da Drenagem — interior.png',
      '07 — Retífica Sertório — térreo.png',
      '08 — Retífica Sertório — vagão e passarela.png',
      '10 — Boteco da Rua Sertório — interior.png',
    ])
    expect(pgs[7]!.textContent).toContain('Retífica Sertório — térreo')
    expect(pgs[7]!.textContent).toContain('Pós Grenal')
    // o mapa da cidade (Atlas) NÃO vai pro papel quando há mapa de mesa
    expect(container.querySelector('[data-mapa-papel="mapa"]')).toBeNull()
    expect(container.querySelector('[data-mapa-papel="legenda"]')).toBeTruthy()
  })

  it('sem mapa de mesa declarado, o papel volta pro mapa da cidade com markers numerados', async () => {
    const ID3 = 'Campanhas/Aventuras/Sem mesa'
    // mesma nota SEM o campo declarado (é o caso das aventuras da fantasia)
    const semMesa = body
      .split('\n')
      .filter((l) => !/^> \*\*Mapas de mesa:\*\*$/.test(l) && !/^> - !\[\[/.test(l))
      .join('\n')
    const outra = { ...doc, id: ID3, path: `${ID3}.md`, body: semMesa } as unknown as VaultDoc
    const antes = globalThis.fetch
    globalThis.fetch = (async (input: unknown) => {
      const rel = decodeURIComponent(String(input).replace(/^\/vault-data\//, '').replace(/\?.*$/, ''))
      if (rel === `${ID3}.json`) return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(outra)) }
      return antes(input as RequestInfo)
    }) as typeof fetch
    const { container } = renderPapel(ID3)
    await waitFor(() => expect(container.querySelector('[data-mapa-papel="mapa"]')).toBeTruthy())
    expect(container.querySelector('[data-mapa-papel="mesa"]')).toBeNull()
    globalThis.fetch = antes
  })

  it('aventura trancada não imprime — manda destravar', async () => {
    // id próprio: o cache de docs do useDoc é por id e vive no módulo
    const ID2 = 'Campanhas/Aventuras/Trancada'
    const trancada = { ...doc, id: ID2, path: `${ID2}.md`, body: '', protegido: { v: 1 } } as unknown as VaultDoc
    const antes = globalThis.fetch
    globalThis.fetch = (async (input: unknown) => {
      const rel = decodeURIComponent(String(input).replace(/^\/vault-data\//, '').replace(/\?.*$/, ''))
      if (rel === `${ID2}.json`) return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(trancada)) }
      return antes(input as RequestInfo)
    }) as typeof fetch
    renderPapel(ID2)
    expect((await screen.findByRole('alert')).textContent).toContain('trancada')
  })
})
