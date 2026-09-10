// @vitest-environment jsdom
// MAPAS EM PAPEL (report 2026-09-08): "imprimir mapas" leva os MAPAS DE MESA
// declarados nos Locais (`**Mapas de mesa:**`), um por página — não o mapa da
// cidade. Aventura sem mapa de mesa (fantasia) segue no mapa da cidade com os
// markers numerados. Aventura trancada não imprime. Tudo em A3 paisagem; mapa
// com versão GRID sai no tamanho físico do PNG (1 quadrado = 25 mm), com a
// chave com/sem grid na barra (2026-09-10).
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { resolveObjectURL } from 'node:buffer'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseFrontmatter } from '../../extractor/parse-frontmatter.mjs'
import { cifrarBytes, cifrarDoc, nomeCifrado } from '../../extractor/cifra-doc.mjs'
import { __resetDocLocksForTests, unlockWithSenha } from '../src/data/doc-lock'
import { __resetArquivosCifradosForTests } from '../src/data/arquivos-cifrados'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { MapaPapelPage } from '../src/print/MapaPapelPage'
import type { IndexDocEntry, IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const ID = 'Campanhas/Aventuras/Pós Grenal'
const raw = fs.readFileSync(path.join(appDir, 'tests', 'fixtures', 'aventuras', 'Pós Grenal.md'), 'utf8')
const { frontmatter, body } = parseFrontmatter(raw) as { frontmatter: Record<string, unknown>; body: string }

const TERREO = '07 — Retífica Sertório — térreo.png'
const TERREO_GRID = '07 — Retífica Sertório — térreo — grid 25 mm.png'

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
    const url = String(input)
    // figura decifrada vira blob: (Node tem createObjectURL) ou data: (sem
    // ele) — o papel relê os bytes pra achar a escala física (pHYs)
    if (url.startsWith('blob:')) {
      const b = resolveObjectURL(url)
      if (!b) return { ok: false, status: 404 }
      const buf = await b.arrayBuffer()
      return { ok: true, status: 200, arrayBuffer: async () => buf }
    }
    if (url.startsWith('data:')) {
      const bytes = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64')
      return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length) }
    }
    const rel = decodeURIComponent(url.replace(/^\/vault-data\//, '').replace(/\?.*$/, ''))
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

/** PNG mínimo com IHDR + pHYs (pixels por metro), CRC zerado. */
function pngComEscala(w: number, h: number, ppm: number): Uint8Array {
  const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
  const chunk = (tipo: string, dados: number[]) => [...u32(dados.length), ...[...tipo].map((c) => c.charCodeAt(0)), ...dados, 0, 0, 0, 0]
  return new Uint8Array([
    137, 80, 78, 71, 13, 10, 26, 10,
    ...chunk('IHDR', [...u32(w), ...u32(h), 8, 2, 0, 0, 0]),
    ...chunk('pHYs', [...u32(ppm), ...u32(ppm), 1]),
    ...chunk('IDAT', []),
    ...chunk('IEND', []),
  ])
}

describe('imprimir mapas da aventura', () => {
  it('uma página A3 por mapa de mesa, com o local no cabeçalho; sem página do mapa da cidade', async () => {
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
      TERREO,
      '08 — Retífica Sertório — vagão e passarela.png',
      '10 — Boteco da Rua Sertório — interior.png',
    ])
    expect(pgs[7]!.textContent).toContain('Retífica Sertório — térreo')
    expect(pgs[7]!.textContent).toContain('Pós Grenal')
    // o mapa da cidade (Atlas) NÃO vai pro papel quando há mapa de mesa
    expect(container.querySelector('[data-mapa-papel="mapa"]')).toBeNull()
    expect(container.querySelector('[data-mapa-papel="legenda"]')).toBeTruthy()
    // tudo em A3 paisagem (mapas e legenda)
    const css = [...container.querySelectorAll('style')].map((s) => s.textContent).join('\n')
    expect(css).toMatch(/@page\s*{\s*size:\s*A3 landscape/)
    expect(css.lastIndexOf('size: A3 landscape')).toBeGreaterThan(css.lastIndexOf('size: A4 landscape'))
  })

  it('mapa com grid: começa COM grid no papel; a chave troca pro mapa sem grid; quem não tem grid não muda', async () => {
    const { container } = renderPapel()
    await waitFor(() => expect(container.querySelectorAll('[data-mapa-papel="mesa"]').length).toBe(10))
    const pg = (alvo: string) => container.querySelector(`[data-mapa-mesa="${alvo}"]`)!
    expect(pg(TERREO).getAttribute('data-mapa-grid')).toBe('com')
    expect(pg(TERREO).querySelector('[data-mapa-img]')!.getAttribute('data-mapa-img')).toBe(TERREO_GRID)
    expect(pg(TERREO).textContent).toContain('grid 25 mm') // legenda do link na nota
    const boteco = pg('10 — Boteco da Rua Sertório — interior.png')
    expect(boteco.hasAttribute('data-mapa-grid')).toBe(false)
    expect(boteco.querySelector('[data-mapa-img]')!.getAttribute('data-mapa-img')).toBe('10 — Boteco da Rua Sertório — interior.png')

    const chave = container.querySelector('[data-mapa-grid-chave]') as HTMLButtonElement
    expect(chave).toBeTruthy()
    fireEvent.click(chave)
    expect(pg(TERREO).getAttribute('data-mapa-grid')).toBe('sem')
    expect(pg(TERREO).querySelector('[data-mapa-img]')!.getAttribute('data-mapa-img')).toBe(TERREO)
    expect(pg(TERREO).textContent).not.toContain('grid 25 mm')
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
    // sem mapa com grid, sem chave de grid
    expect(container.querySelector('[data-mapa-grid-chave]')).toBeNull()
    globalThis.fetch = antes
  })

  it('destravada: as figuras cifradas chegam ao papel sem rolar e o grid sai no tamanho físico do PNG', async () => {
    // caminho REAL: a aventura sai cifrada do extract e o papel só existe
    // depois de destravar; as figuras carregam eager (a página 7 vai pro
    // papel mesmo sem ninguém ter rolado até ela).
    const ID4 = 'Campanhas/Aventuras/Cifrada'
    const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 9, 9])
    const GRID = pngComEscala(1513, 1040, 4035) // 102,49 dpi → 1 quadrado de 100,87 px = 25 mm
    const K = Buffer.alloc(32, 5)
    const arq = (alvo: string) => ({ target: alvo, path: `Mapas/${alvo}`, copiedTo: `assets-cifrados/${nomeCifrado(ID4, `Mapas/${alvo}`)}.enc` })
    const arquivos = [arq(TERREO), arq(TERREO_GRID)]
    const blobs = new Map([
      [arquivos[0]!.copiedTo, new Uint8Array(cifrarBytes(K, Buffer.from(PNG)))],
      [arquivos[1]!.copiedTo, new Uint8Array(cifrarBytes(K, Buffer.from(GRID)))],
    ])
    const cifrada = cifrarDoc(
      { ...doc, id: ID4, path: `${ID4}.md`, frontmatter: { ...frontmatter, Senha: 'abre' }, images: [], inlineFields: {}, ruleElements: [], links: [], headings: [] },
      { camposPublicos: ['Chamada'], senhaDev: null, chave: K, privadoExtra: { arquivos } },
    ) as unknown as VaultDoc
    const antes = globalThis.fetch
    globalThis.fetch = (async (input: unknown) => {
      const rel = decodeURIComponent(String(input).replace(/^\/vault-data\//, '').replace(/\?.*$/, ''))
      if (rel === `${ID4}.json`) return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(cifrada)) }
      const b = blobs.get(rel)
      if (b) return { ok: true, status: 200, arrayBuffer: async () => b.buffer.slice(0) }
      return antes(input as RequestInfo)
    }) as typeof fetch
    __resetDocLocksForTests()
    __resetArquivosCifradosForTests()
    expect(await unlockWithSenha(cifrada, 'abre', false)).toBe(true)
    const { container } = renderPapel(ID4)
    await waitFor(() => expect(container.querySelectorAll('[data-mapa-papel="mesa"]').length).toBe(10))
    const pg = () => container.querySelector(`[data-mapa-mesa="${TERREO}"]`)!
    // COM grid: a imagem é a do grid, no tamanho físico que o PNG declara
    await waitFor(() => expect(pg().querySelector('img')?.getAttribute('alt')).toBe(TERREO_GRID))
    await waitFor(() => expect(pg().querySelector('[data-escala-mm]')?.getAttribute('data-escala-mm')).toBe('375.0x257.7'))
    const escala = pg().querySelector('[data-escala-mm]') as HTMLElement
    expect(escala.style.width).toMatch(/^374\.96\d*mm$/)
    // SEM grid: o mapa limpo, na MESMA escala (as duas versões têm os mesmos pixels)
    fireEvent.click(container.querySelector('[data-mapa-grid-chave]')!)
    await waitFor(() => expect(pg().querySelector('img')?.getAttribute('alt')).toBe(TERREO))
    expect(pg().querySelector('[data-escala-mm]')?.getAttribute('data-escala-mm')).toBe('375.0x257.7')
    // só o térreo existe cifrado aqui: os outros mapas ficam sem imagem
    expect(container.querySelectorAll('img').length).toBe(1)
    globalThis.fetch = antes
    __resetDocLocksForTests()
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
