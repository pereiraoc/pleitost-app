// @vitest-environment jsdom
// #272: nota-da-pasta (folder note) com VIEW DEDICADA mostra o CONTEÚDO dela
// dentro do FolderView. O usuário entrava em Atlas/Mundo Livre e via só "o que
// tem dentro", nunca as infos da nota (uma Localização). Agora a Localização é
// renderizada embutida (LocationSheet) ACIMA da listagem — sem kicker/.page em
// dobro — e a listagem dos filhos continua. A nota-índice genérica (type null,
// corpo dataview) NÃO é embutida (só duplicaria a lista).
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { FolderView } from '../src/components/compendium/FolderView'
import { compendiumFolderPath } from '../src/paths'
import type { IndexManifest } from '../src/data/types'
import '../src/components/compendium/register-doc-views'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

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

describe('#272 — nota-da-pasta com view dedicada (Atlas/Mundo Livre)', () => {
  it('renderiza a Localização (infos da nota) embutida na pasta', async () => {
    const { container } = renderFolder('Atlas/Mundo Livre')
    // LocationSheet embutido mostra o tipo "Localização" (a nota, não só o título).
    await waitFor(() => {
      expect(screen.getByText(/^Localização/)).toBeTruthy()
    })
    // o título "Mundo Livre" vem do header do LocationSheet (h1)
    const h1 = container.querySelector('h1')
    expect(h1?.textContent).toContain('Mundo Livre')
  })

  it('a listagem dos filhos ("o que tem dentro") CONTINUA aparecendo', async () => {
    renderFolder('Atlas/Mundo Livre')
    // um dos lugares-filho da região (pasta com folder-note própria)
    await waitFor(() => {
      expect(screen.getAllByText(/Ilha das Cinzas/).length).toBeGreaterThan(0)
    })
  })

  it('não duplica o kicker nem aninha .page (modo embutido)', async () => {
    const { container } = renderFolder('Atlas/Mundo Livre')
    await waitFor(() => expect(screen.getByText(/^Localização/)).toBeTruthy())
    // um único kicker "Compêndio" (o do FolderView; o do LocationSheet some)
    const kickers = container.querySelectorAll('.kicker')
    expect(kickers.length).toBe(1)
    // a Localização embutida usa .doc-page SEM .page (o wrapper .page é o de fora)
    const embedded = container.querySelector('article.doc-page')
    expect(embedded).toBeTruthy()
    expect(embedded?.classList.contains('page')).toBe(false)
  })
})

describe('#270 — ícones lucide (svg) nos botões de navegação, não emoji', () => {
  it('/compendio: cada botão de seção renderiza um <svg> com paths', async () => {
    const { container } = renderFolder('')
    await waitFor(() => expect(container.querySelectorAll('.sec-card').length).toBeGreaterThan(0))
    const cards = [...container.querySelectorAll('.sec-card')]
    for (const card of cards) {
      const svg = card.querySelector('.sec-card-ic svg')
      expect(svg, 'ícone svg no botão de seção').toBeTruthy()
      // path/circle/line etc. de verdade dentro do svg (não vazio, bem-formado)
      expect(svg!.children.length).toBeGreaterThan(0)
      expect(svg!.getAttribute('stroke')).toBe('currentColor')
    }
  })
})

describe('#272 — nota-índice genérica NÃO é embutida (Atlas raiz)', () => {
  it('Atlas (folder-note type null) mostra o título + cards, sem LocationSheet', async () => {
    const { container } = renderFolder('Atlas')
    // os cards das regiões-filho aparecem
    await waitFor(() => {
      expect(screen.getAllByText(/Mundo Livre/).length).toBeGreaterThan(0)
    })
    // não há ficha de Localização embutida (nenhum "Localização ·" de tipo)
    expect(screen.queryByText(/^Localização/)).toBeNull()
    // o título linkável de sempre continua (h1 com link pra folder-note)
    const h1 = container.querySelector('h1')
    expect(within(h1 as HTMLElement).queryByRole('link')).toBeTruthy()
  })
})
