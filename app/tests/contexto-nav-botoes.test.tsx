// @vitest-environment jsdom
// Report 2026-08-29 (mundo cyberpunk, seção Contexto):
//   - abrir uma seção mostrava o "índice" como TABELA → deve ser BOTÕES;
//   - o título principal da pasta era CLICÁVEL e abria a nota-índice inteira
//     (transclusões em parede de texto) → título vira texto puro quando a
//     folder-note é índice puro (sem corpo útil);
//   - a nota aberta mostrava DOIS títulos repetidos (h1 da view + heading
//     `= this.file.name` do corpo) → o markdown genérico esconde o título
//     repetido como as views dedicadas já faziam;
//   - "Passado" deve ser LINHA DO TEMPO: datas visíveis, conteúdo inline,
//     ordenado por Data.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { FolderView } from '../src/components/compendium/FolderView'
import { DocView } from '../src/components/compendium/DocPage'
import { compendiumFolderPath } from '../src/paths'
import type { IndexManifest, VaultDoc } from '../src/data/types'
import '../src/components/compendium/register-doc-views'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const cyberDir = path.join(path.dirname(appDir), 'vault-data-cyberpunk')
const manifest = JSON.parse(
  fs.readFileSync(path.join(cyberDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

const readDoc = (id: string): VaultDoc =>
  JSON.parse(fs.readFileSync(path.join(cyberDir, `${id}.json`), 'utf8')) as VaultDoc

beforeAll(() => {
  globalThis.fetch = (async (input: unknown) => {
    const url = String(input)
    const rel = decodeURIComponent(url.replace(/^\/vault-data(-cyberpunk)?\//, ''))
    const file = path.join(cyberDir, rel)
    const ok = fs.existsSync(file)
    return {
      ok,
      status: ok ? 200 : 404,
      json: async () => JSON.parse(fs.readFileSync(file, 'utf8')),
    }
  }) as typeof fetch
})

afterEach(cleanup)

function renderFolder(folderPath: string) {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={[compendiumFolderPath(folderPath)]}>
        <Routes>
          <Route path="/compendio/*" element={<FolderView />} />
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
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

describe('pasta-índice de Contexto (Contexto Atual)', () => {
  it('título NÃO é clicável (folder-note índice puro) e as seções são cards', async () => {
    const { container } = renderFolder('Contexto/Histórias/Contexto Atual')
    await waitFor(() => {
      expect(screen.getAllByText('Tecnologia e Conectividade').length).toBeGreaterThan(0)
    })
    const h1 = container.querySelector('h1')!
    expect(h1.textContent).toContain('Contexto Atual')
    expect(within(h1).queryByRole('link')).toBeNull()
    // seções são CARDS (botões), e o corpo-índice não vaza hrs soltos
    expect(container.querySelector('.type-card')).toBeTruthy()
    expect(container.querySelector('hr')).toBeNull()
  })
})

describe('seção com notas (Tecnologia e Conectividade)', () => {
  it('filhos aparecem como BOTÕES pro doc, não tabela', async () => {
    const { container } = renderFolder(
      'Contexto/Histórias/Contexto Atual/Tecnologia e Conectividade',
    )
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Acesso a Tecnologia/ })).toBeTruthy()
    })
    expect(container.querySelector('table')).toBeNull()
    const h1 = container.querySelector('h1')!
    expect(within(h1).queryByRole('link')).toBeNull()
  })
})

describe('Contexto Histórico (Passado da POA) — linha do tempo', () => {
  it('estrutura de linha+bolinhas, sem o template da vault vazando', async () => {
    const { container } = renderFolder('Contexto/Histórias/Contexto Histórico')
    await waitFor(() => {
      expect(screen.getByText('01/04/1964')).toBeTruthy()
    })
    // uma bolinha (item) por nota da pasta
    const itens = container.querySelectorAll('.ctx-tl-item')
    expect(itens.length).toBe(10)
    expect(container.querySelector('.ctx-timeline')).toBeTruthy()
    // o CALLOUT-TEMPLATE das notas ("Contexto Histórico: …/📅Data/ℹ️Descrição")
    // não vaza — a data/título já são o frame da entrada
    expect(container.textContent).not.toContain('Descrição:')
    expect(container.textContent).not.toContain('Contexto Histórico:')
    expect(container.textContent).not.toContain('this.file.name')
    // a tag #Contexto da vault não vira heading "Contexto" repetido
    const headingsContexto = [...container.querySelectorAll('h1,h2,h3')].filter(
      (h) => h.textContent?.trim() === 'Contexto',
    )
    expect(headingsContexto.length).toBe(0)
  })

  it('nota só-template mostra a Descrição do FM como acontecimento', async () => {
    renderFolder('Contexto/Histórias/Contexto Histórico')
    // PIRA: corpo é só o template; a prosa vive no FM Descrição
    await waitFor(() => {
      expect(screen.getByText(/Programa com grande adesão promete 10 anos/)).toBeTruthy()
    })
    // Descoberta de Selênica TEM prosa real no corpo — é ela que aparece
    expect(screen.getByText(/Descoberta do ET morto na Lua/)).toBeTruthy()
  })

  it('ícone do Contexto Histórico na navegação é SVG do registro, não emoji', async () => {
    const { navIconPath } = await import('../src/components/compendium/compendio-registry')
    expect(navIconPath('Contexto/Histórias/Contexto Histórico')).toBeTruthy()
  })

  it('mostra datas, conteúdo inline e ordena por Data', async () => {
    const { container } = renderFolder('Contexto/Histórias/Contexto Histórico')
    // datas do FM visíveis (Instauração da Ditadura 1964-04-01, AI-5 1968-12-13)
    await waitFor(() => {
      expect(screen.getByText('01/04/1964')).toBeTruthy()
    })
    expect(screen.getByText('13/12/1968')).toBeTruthy()
    // conteúdo da nota INLINE (prosa do corpo, não só o título)
    const selenica = readDoc('Contexto/Histórias/Contexto Histórico/Descoberta de Selênica')
    expect(selenica.body.length).toBeGreaterThan(0)
    // um trecho de texto do corpo aparece na página
    const trecho = /Selênica|selênic/i
    expect(screen.getAllByText(trecho).length).toBeGreaterThan(0)
    // ordenação: Ditadura (1964) vem antes de Chernobyl (1986)
    const texto = container.textContent!
    expect(texto.indexOf('Instauração da Ditadura no Brasil')).toBeLessThan(
      texto.indexOf('Acidente de Chernobyl'),
    )
    // sem tabela-índice
    expect(container.querySelector('table')).toBeNull()
  })
})

describe('nota-índice genérica não duplica o título', () => {
  it('DocView de "Tecnologia e Conectividade": um único heading com o nome', () => {
    const doc = readDoc(
      'Contexto/Histórias/Contexto Atual/Tecnologia e Conectividade/Tecnologia e Conectividade',
    )
    const { container } = renderDoc(doc)
    const headings = [...container.querySelectorAll('h1,h2,h3')].filter(
      (h) => h.textContent?.trim() === 'Tecnologia e Conectividade',
    )
    expect(headings.length).toBe(1)
    expect(container.textContent).not.toContain('this.file.name')
  })
})
