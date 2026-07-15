// @vitest-environment jsdom
// #275: folder-note GENÉRICA (type null, ex.: Armaduras/Armas/Escudos) mostra o
// CORPO da nota (prosa + transclusões) ANTES da listagem. O 1º heading-título
// não duplica, os fences `dataview` são suprimidos (a listagem já é a grade), e
// transclusões de nota `![[Alvo#…]]` renderizam o CONTEÚDO do Alvo, não o texto
// cru. A listagem dos itens da pasta segue abaixo.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
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

describe('#275 — Armaduras (prosa + transclusões antes da lista)', () => {
  it('mostra a PROSA do corpo da folder-note', async () => {
    renderFolder('Sistema/Equipamento/Armaduras')
    await waitFor(() => {
      expect(screen.getByText(/aventureiros se preocupam/)).toBeTruthy()
    })
  })

  it('NÃO duplica o título "Armaduras" (só o do topo, não um 2º heading do corpo)', async () => {
    const { container } = renderFolder('Sistema/Equipamento/Armaduras')
    await waitFor(() => expect(screen.getByText(/aventureiros se preocupam/)).toBeTruthy())
    const headings = [...container.querySelectorAll('h1, h2, h3')].filter(
      (h) => h.textContent?.trim() === 'Armaduras',
    )
    expect(headings.length).toBe(1)
  })

  it('#282: as transclusões NÃO viram preview embutido (a nota-alvo já é card abaixo)', async () => {
    const { container } = renderFolder('Sistema/Equipamento/Armaduras')
    await waitFor(() => expect(screen.getByText(/aventureiros se preocupam/)).toBeTruthy())
    // no contexto folder-note o preview embutido (.note-embed) NÃO é renderizado —
    // a info já está na prática nos cards de armadura da listagem.
    expect(container.querySelector('.note-embed')).toBeNull()
  })

  it('NÃO vaza o texto cru da transclusão (![[Sem Armadura...]])', async () => {
    const { container } = renderFolder('Sistema/Equipamento/Armaduras')
    await waitFor(() => expect(screen.getByText(/aventureiros se preocupam/)).toBeTruthy())
    expect(container.textContent).not.toContain('![[')
    expect(container.textContent).not.toContain('this.file.name')
  })

  it('a listagem dos itens da pasta CONTINUA aparecendo', async () => {
    renderFolder('Sistema/Equipamento/Armaduras')
    await waitFor(() => {
      // os itens da pasta viram cartas na grade (Sem/Leve/Pesada)
      expect(screen.getAllByText(/Sem Armadura/).length).toBeGreaterThan(0)
    })
  })
})

describe('#275 — Armas/Escudos (prosa + dataview suprimido)', () => {
  it('Armas: mostra a prosa e NÃO renderiza o dataview como tabela/pre extra', async () => {
    const { container } = renderFolder('Sistema/Equipamento/Armas')
    await waitFor(() => {
      expect(screen.getByText(/categorias que representam os tipos de arma/)).toBeTruthy()
    })
    // o fence dataview da folder-note NÃO deve virar um <pre> cru nem vazar a query
    expect(container.textContent).not.toContain('TABLE WITHOUT ID')
    expect(container.textContent).not.toContain('FROM "Sistema/Equipamento/Armas"')
  })

  it('Escudos: mostra a prosa e suprime o dataview', async () => {
    const { container } = renderFolder('Sistema/Equipamento/Escudos')
    await waitFor(() => {
      expect(screen.getByText(/Existem dois tipos de escudo/)).toBeTruthy()
    })
    expect(container.textContent).not.toContain('TABLE WITHOUT ID')
    expect(container.textContent).not.toContain('bonus-defesa')
  })
})

describe('#275 — regressão: view dedicada (#272) intacta', () => {
  it('Atlas/Mundo Livre continua com a Localização embutida', async () => {
    renderFolder('Atlas/Mundo Livre')
    await waitFor(() => {
      expect(screen.getByText(/^Localização/)).toBeTruthy()
    })
  })
})
