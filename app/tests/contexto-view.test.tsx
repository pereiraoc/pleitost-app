// @vitest-environment jsdom
// Visualizadores de CONTEXTO no compêndio (issue #247, F3 do épico #243) sobre
// docs REAIS da vault:
//   - Organizações (Ordem Bestial): type "Organização" → OrgView (leitura
//     bonita das infos; sem o template Dataview cru vazando).
//   - Contexto Histórico (Guerra dos 100 Anos): type "Contexto" → HistoriaView
//     (corpo em coluna de leitura; prosa + wikilinks navegáveis).
//   - Contexto Atual (Economia): type "Contexto" → HistoriaView (corpo com
//     headings e tabelas de dados).
// Fetch stubado lê os JSONs do disco, como o dev server.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
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

const ordemBestial = readDoc('Contexto/Organizações/Ordem Bestial')
const guerra = readDoc(
  'Contexto/Histórias/Contexto Histórico/História da Federação Áurea e a Guerra dos 100 Anos contra a Magna Pátria',
)
const economia = readDoc('Contexto/Histórias/Contexto Atual/Economia')
// controle: um doc não-Contexto/Organização segue no markdown genérico
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

describe('sanidade das fixtures (como o extractor marca)', () => {
  it('Organização: type/categoria "Organização"', () => {
    expect(ordemBestial.type).toBe('Organização')
    expect(ordemBestial.frontmatter['categoria']).toBe('Organização')
  })
  it('Contexto Histórico: type "Contexto", subcategoria "Passado"', () => {
    expect(guerra.type).toBe('Contexto')
    expect(guerra.frontmatter['categoria']).toBe('Contexto')
    expect(guerra.subtype).toBe('Passado')
  })
  it('Contexto Atual: type "Contexto", subcategoria "Dados"', () => {
    expect(economia.type).toBe('Contexto')
    expect(economia.subtype).toBe('Dados')
  })
})

describe('OrgView (Organização real)', () => {
  it('mostra título e tipo da organização, sem o template Dataview cru', () => {
    renderDoc(ordemBestial)
    expect(screen.getByRole('heading', { level: 1, name: 'Ordem Bestial' })).toBeTruthy()
    // rótulo do tipo (declarado no schema da view, não inventado)
    expect(screen.getByText('Organização')).toBeTruthy()
    // o corpo é um template Dataview (`= this.Resumo` etc.) — a view BONITA o
    // substitui, então nada do template cru vaza como texto
    expect(screen.queryByText(/= this\./)).toBeNull()
    expect(screen.queryByText(/Objetivo de Longo Prazo:/)).toBeNull()
  })

  it('sem campos preenchidos, mostra o empty state honesto (não inventa dados)', () => {
    renderDoc(ordemBestial)
    // as infos do FM da Ordem Bestial são todas nulas na vault → empty state
    expect(screen.getByText('// ORGANIZAÇÃO SEM INFORMAÇÕES REGISTRADAS')).toBeTruthy()
  })
})

describe('OrgView (campos preenchidos → cards, sintéticos sobre a categoria real)', () => {
  it('renderiza Resumo em destaque e cada campo do FM como card', () => {
    // mesma categoria/type real da vault; só populo o FM p/ exercitar os cards
    // (a vault é read-only; a estrutura da view é a mesma).
    const org: VaultDoc = {
      ...ordemBestial,
      frontmatter: {
        ...ordemBestial.frontmatter,
        Resumo: 'Culto que venera as feras primais.',
        Líder: 'Matriarca Vharn',
        Objetivo_de_Longo_Prazo: 'Despertar o Grande Predador.',
        Influência: 'Alta nas terras selvagens.',
      },
    }
    renderDoc(org)
    expect(screen.getByText('Culto que venera as feras primais.')).toBeTruthy()
    // rótulos dos cards (fonte de verdade no schema da view)
    expect(screen.getByText('Líder')).toBeTruthy()
    expect(screen.getByText('Matriarca Vharn')).toBeTruthy()
    expect(screen.getByText('Objetivo de Longo Prazo')).toBeTruthy()
    expect(screen.getByText('Despertar o Grande Predador.')).toBeTruthy()
    expect(screen.getByText('Influência')).toBeTruthy()
    // sem empty state quando há dados
    expect(screen.queryByText('// ORGANIZAÇÃO SEM INFORMAÇÕES REGISTRADAS')).toBeNull()
  })
})

describe('HistoriaView (Contexto Histórico real)', () => {
  it('renderiza o TEXTO do corpo em coluna de leitura, com wikilinks navegáveis', () => {
    renderDoc(guerra)
    // título no cabeçalho da view
    const header = document.querySelector<HTMLElement>('.doc-header')!
    expect(within(header).getByRole('heading', { level: 1 })).toBeTruthy()
    // wrapper de leitura presente com o corpo
    const readingBody = document.querySelector<HTMLElement>('.doc-reading-body')!
    expect(readingBody).toBeTruthy()
    // trecho REAL da prosa da história aparece no corpo
    expect(
      within(readingBody).getByText(/A união em face da adversidade pode levar/i),
    ).toBeTruthy()
    // wikilink [[Federação Áurea]] vira link navegável pro doc resolvido
    const res = catalog.resolve('Federação Áurea')
    if (res.kind === 'doc') {
      const links = screen.getAllByRole('link', { name: 'Federação Áurea' })
      expect(links.length).toBeGreaterThan(0)
      expect(links[0].getAttribute('href')).toBe(docPath(res.id))
    }
  })
})

describe('HistoriaView (Contexto Atual real)', () => {
  it('renderiza headings e tabelas de dados do corpo (Economia)', () => {
    renderDoc(economia)
    // título no cabeçalho da view
    const header = document.querySelector<HTMLElement>('.doc-header')!
    expect(within(header).getByRole('heading', { level: 1, name: 'Economia' })).toBeTruthy()
    // corpo em coluna de leitura
    const readingBody = document.querySelector<HTMLElement>('.doc-reading-body')!
    // headings de seção do corpo
    expect(within(readingBody).getByRole('heading', { level: 2, name: 'População' })).toBeTruthy()
    // conteúdo real da tabela (cargo e valor)
    expect(within(readingBody).getAllByText('Mercador').length).toBeGreaterThan(0)
    // tabela renderizada
    expect(readingBody.querySelector('table')).toBeTruthy()
  })
})

describe('doc não-Contexto/Organização segue no markdown (sem regressão)', () => {
  it('Adaga não vira OrgView nem HistoriaView', () => {
    renderDoc(adaga)
    expect(adaga.type).not.toBe('Organização')
    expect(adaga.type).not.toBe('Contexto')
    // Adaga não é História (sem coluna de leitura) nem Organização (sem o
    // empty state). #245: a Adaga é um ITEM (carta), não markdown genérico —
    // por isso o controle checa AUSÊNCIA das views de Contexto, não a
    // presença do markdown cru.
    expect(document.querySelector('.doc-reading-body')).toBeNull()
    expect(screen.queryByText('// ORGANIZAÇÃO SEM INFORMAÇÕES REGISTRADAS')).toBeNull()
  })
})
