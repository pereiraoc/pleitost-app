// @vitest-environment jsdom
// Report 2026-09-07: callouts da aventura "sem quebra de linha" — o Obsidian
// (sem Strict line breaks) mostra cada `\n` como quebra; o app colapsava em
// espaço. remarkSoftBreaks insere <br> mantendo o texto (textContent igual).
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { MarkdownBody } from '../src/markdown/MarkdownBody'
import type { VaultDoc } from '../src/data/types'

const catalog = buildCatalog({ vaultRoot: '', counts: {} as never, byType: {}, docs: [] })
const doc = (body: string): VaultDoc =>
  ({ id: 'x', path: 'x.md', basename: 'x', type: null, subtype: null, grupo: null, frontmatter: {}, inlineFields: {}, ruleElements: [], links: [], images: [], headings: [], body }) as VaultDoc

afterEach(cleanup)

describe('quebra de linha simples como no Obsidian', () => {
  it('callout de campos: uma linha por campo (<br> entre elas)', () => {
    const { container } = render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter>
          <MarkdownBody doc={doc('>[!info] O Malandro\n>**Público:** Sair com dinheiro.\n>**Secreto:** Vender algo.')} />
        </MemoryRouter>
      </CatalogProvider>,
    )
    const callout = container.querySelector('.callout-info') as HTMLElement
    expect(callout).toBeTruthy()
    expect(callout.querySelectorAll('br').length).toBe(2) // título→Público, Público→Secreto
    expect(callout.textContent).toContain('Público:')
    expect(callout.textContent).toContain('Secreto:')
  })
  it('prosa com quebra simples também quebra; parágrafos seguem parágrafos', () => {
    const { container } = render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter>
          <MarkdownBody doc={doc('Não explique demais.\nMostre:\n\nOutro parágrafo.')} />
        </MemoryRouter>
      </CatalogProvider>,
    )
    expect(container.querySelectorAll('br').length).toBe(1)
    expect(container.querySelectorAll('p').length).toBe(2)
  })
})
