// @vitest-environment jsdom
// Editor de Elementos de Regra no Modo Dev (#253, F9): validação viva pelo
// parser real + erro de sintaxe bloqueia salvar + salva em rascunho local.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { RuleElementsEditor } from '../src/components/compendium/RuleElementsEditor'
import { localDraftFor, __resetDraftsForTests } from '../src/data/local-draft-store'
import { __resetSettingsForTests } from '../src/settings'
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

function docWith(subtype: string | null, raws: string[]): VaultDoc {
  return {
    id: 'DOC/' + subtype,
    path: 'DOC.md',
    basename: 'Doc',
    type: 'Regra',
    subtype,
    grupo: null,
    frontmatter: {},
    inlineFields: {},
    ruleElements: raws.map((raw) => ({ raw, parsed: [] })),
    links: [],
    images: [],
    headings: [],
    body: '',
  } as unknown as VaultDoc
}

describe('RuleElementsEditor (#253, F9)', () => {
  it('mostra as linhas existentes e "sintaxe válida" quando tudo parseia', () => {
    render(<RuleElementsEditor doc={docWith('Classe', ['Nivel 1 Definir Vida.Vitalidade 15'])} />)
    const ta = screen.getByDisplayValue('Nivel 1 Definir Vida.Vitalidade 15')
    expect(ta).toBeTruthy()
    expect(screen.getByText('✓ sintaxe válida')).toBeTruthy()
  })

  it('linha inválida → status de erro por linha + Salvar bloqueado', () => {
    render(<RuleElementsEditor doc={docWith('Classe', ['Nivel 1 Definir Vida.Vitalidade 15'])} />)
    fireEvent.change(screen.getByDisplayValue('Nivel 1 Definir Vida.Vitalidade 15'), {
      target: { value: 'isso não é regra @#$' },
    })
    expect(screen.getByText(/com erro de sintaxe/)).toBeTruthy()
    expect((screen.getByText('Salvar rascunho') as HTMLButtonElement).disabled).toBe(true)
    expect(localDraftFor('DOC/Classe')).toBeUndefined()
  })

  it('edição VÁLIDA → salva no rascunho local com o elemento re-parseado', () => {
    render(<RuleElementsEditor doc={docWith('Classe', ['Nivel 1 Definir Vida.Vitalidade 15'])} />)
    fireEvent.change(screen.getByDisplayValue('Nivel 1 Definir Vida.Vitalidade 15'), {
      target: { value: 'Nivel 1 Definir Vida.Vitalidade 20' },
    })
    const save = screen.getByText('Salvar rascunho') as HTMLButtonElement
    expect(save.disabled).toBe(false)
    fireEvent.click(save)
    const draft = localDraftFor('DOC/Classe')
    expect(draft?.ruleElements?.[0].raw).toBe('Nivel 1 Definir Vida.Vitalidade 20')
    // re-parseado de verdade (não vazio → não é erro de sintaxe)
    expect((draft?.ruleElements?.[0].parsed as unknown[]).length).toBeGreaterThan(0)
  })

  it('doc de Condição valida pelo parser de condição (Escalavel → ok, salva com condition)', () => {
    render(<RuleElementsEditor doc={docWith('Condição', ['Escalavel 3'])} />)
    expect(screen.getByText('✓ sintaxe válida')).toBeTruthy()
    fireEvent.change(screen.getByDisplayValue('Escalavel 3'), { target: { value: 'Escalavel 5' } })
    fireEvent.click(screen.getByText('Salvar rascunho'))
    const draft = localDraftFor('DOC/Condição')
    expect((draft?.ruleElements?.[0] as { condition?: { scaleMax: number } }).condition?.scaleMax).toBe(5)
  })

  it('adicionar e remover linha', () => {
    render(<RuleElementsEditor doc={docWith('Classe', ['Nivel 1 Definir Vida.Vitalidade 15'])} />)
    fireEvent.click(screen.getByText('+ linha'))
    expect(screen.getAllByRole('textbox').length).toBe(2)
    fireEvent.click(within(screen.getByText('+ linha').closest('section')!).getAllByLabelText(/remover linha/)[0])
    expect(screen.getAllByRole('textbox').length).toBe(1)
  })
})
