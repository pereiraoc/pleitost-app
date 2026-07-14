// @vitest-environment jsdom
// Camada de overlay do compêndio (#252, F8): fusão pura + gate do rascunho
// local pelo Modo Desenvolvedor ("até publicar fica tudo realmente local").
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { applyOverlay, applyPatch, patchChangesBase } from '../src/data/overlay'
import { effectiveDoc } from '../src/data/effective-doc'
import {
  setLocalDraft,
  clearLocalDraft,
  clearLocalDraftField,
  localDraftFor,
  hasLocalDrafts,
  __resetDraftsForTests,
} from '../src/data/local-draft-store'
import {
  __setPublishedForTests,
  __resetPublishedForTests,
} from '../src/data/published-overlay-store'
import { __resetSettingsForTests } from '../src/settings'
import type { VaultDoc } from '../src/data/types'

function baseDoc(): VaultDoc {
  return {
    id: 'X',
    path: 'X.md',
    basename: 'X',
    type: 'Regra',
    subtype: null,
    grupo: null,
    frontmatter: { a: 1 },
    inlineFields: {},
    ruleElements: [{ raw: 'orig', parsed: [] }],
    links: [],
    images: [],
    headings: [],
    body: 'corpo',
  } as unknown as VaultDoc
}

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

function devOn() {
  localStorage.setItem('pleitost.settings.desenvolvedor', 'true')
  __resetSettingsForTests()
}

afterEach(() => {
  __resetDraftsForTests()
  __resetPublishedForTests()
  __resetSettingsForTests()
  localStorage.clear()
})

describe('applyPatch / applyOverlay (puro)', () => {
  it('sem patch → mesma referência (no-op)', () => {
    const b = baseDoc()
    expect(applyPatch(b, undefined)).toBe(b)
  })

  it('patch sobrescreve body e ruleElements, base fica intacto', () => {
    const b = baseDoc()
    const m = applyPatch(b, { body: 'novo', ruleElements: [{ raw: 'x', parsed: [1] }] })
    expect(m.body).toBe('novo')
    expect(m.ruleElements).toEqual([{ raw: 'x', parsed: [1] }])
    expect(b.body).toBe('corpo') // imutável
    expect(b.ruleElements[0].raw).toBe('orig')
  })

  it('precedência: o último patch vence', () => {
    const m = applyOverlay(baseDoc(), { body: 'a' }, { body: 'b' })
    expect(m.body).toBe('b')
  })

  it('patchChangesBase distingue mudança de no-op', () => {
    const b = baseDoc()
    expect(patchChangesBase(b, { body: 'diferente' })).toBe(true)
    expect(patchChangesBase(b, { body: 'corpo' })).toBe(false)
  })
})

describe('effectiveDoc — rascunho local gated pelo Modo Dev', () => {
  it('Modo Dev OFF → ignora o rascunho local', () => {
    setLocalDraft('X', { body: 'editado' })
    expect(effectiveDoc(baseDoc()).body).toBe('corpo')
  })

  it('Modo Dev ON → aplica o rascunho local', () => {
    devOn()
    setLocalDraft('X', { body: 'editado', ruleElements: [{ raw: 'nova', parsed: [] }] })
    const eff = effectiveDoc(baseDoc())
    expect(eff.body).toBe('editado')
    expect(eff.ruleElements[0].raw).toBe('nova')
  })

  it('clear remove o rascunho e volta ao base', () => {
    devOn()
    setLocalDraft('X', { body: 'e' })
    expect(hasLocalDrafts()).toBe(true)
    clearLocalDraft('X')
    expect(localDraftFor('X')).toBeUndefined()
    expect(effectiveDoc(baseDoc()).body).toBe('corpo')
  })

  it('overlay PUBLICADO aplica pra TODOS (mesmo com Modo Dev OFF)', () => {
    __setPublishedForTests({ X: { body: 'publicado' } })
    expect(effectiveDoc(baseDoc()).body).toBe('publicado')
  })

  it('rascunho local VENCE o publicado (no Modo Dev)', () => {
    devOn()
    __setPublishedForTests({ X: { body: 'publicado' } })
    setLocalDraft('X', { body: 'local' })
    expect(effectiveDoc(baseDoc()).body).toBe('local')
  })

  it('setLocalDraft FUNDE campos: body não apaga ruleElements do mesmo doc', () => {
    setLocalDraft('X', { ruleElements: [{ raw: 'r', parsed: [] }] })
    setLocalDraft('X', { body: 'novo corpo' })
    const d = localDraftFor('X')
    expect(d?.ruleElements?.[0].raw).toBe('r')
    expect(d?.body).toBe('novo corpo')
  })

  it('clearLocalDraftField reverte só um campo; mantém o resto', () => {
    setLocalDraft('X', { ruleElements: [{ raw: 'r', parsed: [] }], body: 'b' })
    clearLocalDraftField('X', 'body')
    expect(localDraftFor('X')?.body).toBeUndefined()
    expect(localDraftFor('X')?.ruleElements?.[0].raw).toBe('r')
    // some de vez quando fica vazio
    clearLocalDraftField('X', 'ruleElements')
    expect(localDraftFor('X')).toBeUndefined()
  })
})
