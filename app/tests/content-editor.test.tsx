// @vitest-environment jsdom
// Editor de TEXTO no Modo Dev (#253, F9): edita o corpo → rascunho local, com
// preview ao vivo pelo MarkdownBody das views.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DocContentEditor } from '../src/components/compendium/DocContentEditor'
import { CatalogProvider } from '../src/data/CatalogContext'
import { buildCatalog } from '../src/data/catalog'
import { localDraftFor, __resetDraftsForTests } from '../src/data/local-draft-store'
import { __resetSettingsForTests } from '../src/settings'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const catalog = buildCatalog({ generatedAt: '', counts: {}, docs: [] } as unknown as IndexManifest)

function makeStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    key: (i: number) => [...data.keys()][i] ?? null,
    removeItem: (k: string) => void data.delete(k),
    setItem: (k: string, v: string) => void data.set(k, String(v)),
  }
}
beforeAll(() => {
  if (!window.localStorage) {
    Object.defineProperty(window, 'localStorage', { value: makeStorage(), configurable: true })
  }
})
beforeEach(() => {
  localStorage.setItem('pleitost.settings.desenvolvedor', 'true')
  __resetSettingsForTests()
})
afterEach(() => {
  cleanup()
  __resetDraftsForTests()
  __resetSettingsForTests()
  localStorage.clear()
})

function doc(body: string): VaultDoc {
  return {
    id: 'Atlas/Nota',
    path: 'Atlas/Nota.md',
    basename: 'Nota',
    type: 'Localização',
    subtype: null,
    grupo: null,
    frontmatter: {},
    inlineFields: {},
    ruleElements: [],
    links: [],
    images: [],
    headings: [],
    body,
  } as unknown as VaultDoc
}

function renderEditor(d: VaultDoc) {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter>
        <DocContentEditor doc={d} />
      </MemoryRouter>
    </CatalogProvider>,
  )
}

describe('DocContentEditor (#253, F9)', () => {
  it('preview ao vivo reflete o texto digitado', () => {
    renderEditor(doc('Texto original.'))
    const ta = screen.getByDisplayValue('Texto original.')
    fireEvent.change(ta, { target: { value: 'Texto **editado** ao vivo.' } })
    const preview = document.querySelector('[data-content-preview]')!
    expect(preview.textContent).toContain('editado')
  })

  it('Salvar texto grava patch.body no rascunho local; disabled sem mudança', () => {
    renderEditor(doc('base'))
    const save = screen.getByText('Salvar texto') as HTMLButtonElement
    expect(save.disabled).toBe(true) // nada mudou
    fireEvent.change(screen.getByDisplayValue('base'), { target: { value: 'novo texto' } })
    expect(save.disabled).toBe(false)
    fireEvent.click(save)
    expect(localDraftFor('Atlas/Nota')?.body).toBe('novo texto')
  })
})
