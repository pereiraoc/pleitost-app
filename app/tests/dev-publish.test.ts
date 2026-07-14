// @vitest-environment jsdom
// Round-trip app→Obsidian (#47): reconstruir o .md de um doc a partir do base +
// patch. As edições de ruleElements voltam pro FM Elementos_de_Regra.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { parse as parseYaml } from 'yaml'
import { reconstructMarkdown, editedDocCount } from '../src/data/dev-publish'
import { setLocalDraft, __resetDraftsForTests } from '../src/data/local-draft-store'
import { __setPublishedForTests, __resetPublishedForTests } from '../src/data/published-overlay-store'
import type { VaultDoc } from '../src/data/types'

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
afterEach(() => {
  __resetDraftsForTests()
  __resetPublishedForTests()
  localStorage.clear()
})

function base(): VaultDoc {
  return {
    id: 'Sistema/Regras/Condições/Agarrado',
    path: 'Sistema/Regras/Condições/Agarrado.md',
    basename: 'Agarrado',
    type: 'Regra',
    subtype: 'Condição',
    grupo: null,
    frontmatter: { categoria: 'Regra', subcategoria: 'Condição', Elementos_de_Regra: ['Escalavel 3'] },
    inlineFields: {},
    ruleElements: [{ raw: 'Escalavel 3', parsed: [] }],
    links: [],
    images: [],
    headings: [],
    body: '## Agarrado\nCorpo original.',
  } as unknown as VaultDoc
}

describe('reconstructMarkdown (#47)', () => {
  it('body editado + ruleElements → FM Elementos_de_Regra reescrito', () => {
    const md = reconstructMarkdown(base(), {
      body: '## Agarrado\nCorpo NOVO.',
      ruleElements: [
        { raw: 'Escalavel 5', parsed: [] },
        { raw: 'Derivar Condicao Preso', parsed: [] },
      ],
    })
    // separa frontmatter e corpo
    const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(md)
    expect(m).toBeTruthy()
    const fm = parseYaml(m![1]) as Record<string, unknown>
    expect(fm.Elementos_de_Regra).toEqual(['Escalavel 5', 'Derivar Condicao Preso'])
    expect(fm.subcategoria).toBe('Condição')
    expect(m![2]).toBe('## Agarrado\nCorpo NOVO.')
  })

  it('sem patch de corpo → mantém o body base', () => {
    const md = reconstructMarkdown(base(), { ruleElements: [{ raw: 'Escalavel 2', parsed: [] }] })
    expect(md).toContain('Corpo original.')
  })
})

describe('editedDocCount (#47)', () => {
  it('conta a UNIÃO de local + publicado', () => {
    __setPublishedForTests({ A: { body: 'p' } })
    setLocalDraft('B', { body: 'l' })
    setLocalDraft('A', { body: 'l2' }) // mesmo doc: conta 1x
    expect(editedDocCount()).toBe(2)
  })
})
