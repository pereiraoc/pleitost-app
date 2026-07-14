// @vitest-environment jsdom
// TDD do render de MARKDOWN de doc: escrito ANTES do pipeline de markdown, sobre
// o body REAL da Adaga (%%-block, `= this.x`, tabela GFM, wikilinks, fences).
// Renderiza o MarkdownBody direto (o componente sob teste) — desde a #245 a
// Adaga como DOC vira a carta de Item (ItemView), mas o pipeline de markdown
// segue sendo exercitado aqui pelo body dela.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { MarkdownBody } from '../src/markdown/MarkdownBody'
import { docPath } from '../src/paths'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

const adaga = JSON.parse(
  fs.readFileSync(
    path.join(
      vaultDataDir,
      'Sistema/Equipamento/Armas/Armas Simples/Corpo-a-Corpo Simples/Adaga.json',
    ),
    'utf8',
  ),
) as VaultDoc

beforeAll(() => {
  // serve /vault-data/** do disco (a fence dataview agora avalia de verdade)
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

function renderDoc(doc: VaultDoc) {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter>
        <MarkdownBody doc={doc} />
      </MemoryRouter>
    </CatalogProvider>,
  )
}

afterEach(cleanup)

describe('MarkdownBody (body real da Adaga)', () => {
  it('esconde o bloco %% ... %% (inline fields não vazam como texto cru)', () => {
    renderDoc(adaga)
    expect(screen.queryByText(/dano::/)).toBeNull()
    expect(screen.queryByText(/%%/)).toBeNull()
  })

  it('avalia `= this.file.name` no heading a partir do doc', () => {
    renderDoc(adaga)
    expect(screen.getByRole('heading', { level: 2, name: 'Adaga' })).toBeTruthy()
  })

  it('avalia `= this.<campo>` nas células da tabela via inlineFields', () => {
    renderDoc(adaga)
    // dano:: "d4+2" → string literal sem aspas; tipo:: perfuração
    expect(screen.getAllByText('d4+2').length).toBeGreaterThan(0)
    expect(screen.getAllByText('perfuração').length).toBeGreaterThan(0)
  })

  it('wikilinks navegam pro doc resolvido (propriedades → Precisa)', () => {
    renderDoc(adaga)
    const res = catalog.resolve('Precisa')
    expect(res.kind).toBe('doc')
    const links = screen.getAllByRole('link', { name: 'Precisa' })
    expect(links.length).toBeGreaterThan(0)
    for (const link of links) {
      expect(link.getAttribute('href')).toBe(docPath((res as { id: string }).id))
    }
    // alias renderiza o alias, não o alvo
    expect(screen.getAllByRole('link', { name: 'Arremesso 3' }).length).toBeGreaterThan(0)
  })

  it('fence dataview avalia a query real (Local Típico → Canto Alto)', async () => {
    renderDoc(adaga)
    // a query da Adaga busca localizações do Atlas com [[Adaga]] em Recursos
    expect(await screen.findByRole('columnheader', { name: 'Local Típico' })).toBeTruthy()
    expect(await screen.findByRole('link', { name: 'Canto Alto' })).toBeTruthy()
    // nada de fallback colapsado quando a query é suportada
    expect(document.querySelector('details.fence-dataview')).toBeNull()
  })

  it('fence sem renderer registrado cai no <pre> com o conteúdo cru', () => {
    renderDoc(adaga)
    const pre = document.querySelector('pre.fence-carta-item')
    expect(pre, 'pre.fence-carta-item').toBeTruthy()
    expect(pre!.textContent).toContain('tipo: armas-marciais-simples')
  })
})
