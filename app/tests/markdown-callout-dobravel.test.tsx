// @vitest-environment jsdom
// Pedido 2026-09-12: as notas de Contexto Atual que viraram mecânica (Andar a
// Pé, Custo de Vida, Regalias de Classe, Mercado de Trabalho) precisam guardar
// as TABELAS num bloco colapsável, pra continuarem parecidas com as outras.
// O Obsidian dobra callout com sufixo `-`/`+` (`> [!note]- Título`); o app
// ignorava o sufixo e vazava o "-" como texto do callout. Raw HTML (<details>)
// não serve: o react-markdown do app roda SEM rehype-raw.
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

const renderBody = (body: string) =>
  render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter>
        <MarkdownBody doc={doc(body)} />
      </MemoryRouter>
    </CatalogProvider>,
  ).container

afterEach(cleanup)

describe('callout dobrável do Obsidian', () => {
  it('[!note]- vira <details> FECHADO, com a primeira linha de resumo', () => {
    const c = renderBody('> [!note]- Régua e tabelas\n> Conteúdo mecânico.')
    const det = c.querySelector('details.callout') as HTMLDetailsElement
    expect(det).toBeTruthy()
    expect(det.open).toBe(false)
    expect(det.querySelector('summary')?.textContent).toContain('Régua e tabelas')
    expect(det.textContent).toContain('Conteúdo mecânico.')
  })

  it('[!note]+ vira <details> ABERTO', () => {
    const c = renderBody('> [!note]+ Aberto por padrão\n> Corpo.')
    const det = c.querySelector('details.callout') as HTMLDetailsElement
    expect(det).toBeTruthy()
    expect(det.open).toBe(true)
  })

  it('o sufixo de dobra NÃO vaza como texto', () => {
    const c = renderBody('> [!info]- Título\n> Corpo.')
    const sum = c.querySelector('summary') as HTMLElement
    expect(sum.textContent?.trimStart().startsWith('-')).toBe(false)
    expect(sum.textContent).toContain('Título')
  })

  it('callout normal (sem sufixo) segue blockquote, não details', () => {
    const c = renderBody('> [!info] Sem dobra\n> Corpo.')
    expect(c.querySelector('details')).toBeNull()
    const bq = c.querySelector('blockquote.callout-info') as HTMLElement
    expect(bq).toBeTruthy()
    expect(bq.textContent).toContain('Sem dobra')
  })

  it('mantém a classe do tipo pra herdar o estilo do callout', () => {
    const c = renderBody('> [!tip]- Régua de bolso\n> Corpo.')
    expect(c.querySelector('details.callout-tip')).toBeTruthy()
  })

  it('tabela dentro do dobrável continua sendo tabela', () => {
    const c = renderBody('> [!note]- Tabelas\n> \n> | A | B |\n> | --- | --- |\n> | 1 | 2 |')
    const det = c.querySelector('details.callout') as HTMLDetailsElement
    expect(det).toBeTruthy()
    expect(det.querySelectorAll('table').length).toBe(1)
    expect(det.querySelectorAll('tbody tr').length).toBe(1)
  })
})
