// @vitest-environment jsdom
// Report 2026-08-21 (Gaspar): a "Especialização Menor em Arma" não aparecia em
// Competências — o pick 'Treinamento de Guerreiro' (mostrado pelo dropdown da
// escolha) era PULADO da árvore, mas ele é PAI de outra entrada da lista: o
// galho inteiro (filho + dropdown da variante pendurado nele) sumia. Pick com
// FILHOS agora ancora o galho. E o clique no SelectBox divide: TEXTO abre os
// DETALHES do doc escolhido; a zona da seta segue abrindo o dropdown.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { habTree, SelectBox } from '../src/components/ficha/HabilidadesTab'
import { DetailProvider } from '../src/data/detail-context'
import type { ListaEntry } from '../src/components/ficha/hero-model'
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
beforeEach(() => window.localStorage.clear())
afterEach(cleanup)

const ent = (raw: string, fonteKind: string, fonteTarget: string): ListaEntry => ({
  raw: `[[${raw}]]`,
  label: raw,
  target: raw,
  fonte: { kind: fonteKind, target: fonteTarget } as ListaEntry['fonte'],
})
const CHOICE = {
  choiceKey: 'k1',
  label: 'Escolha',
  options: ['[[X]]'],
  pick: null,
  kind: 'complementar-sel' as const,
}

describe('habTree — pick com FILHOS ancora o galho (Gaspar 2026-08-21)', () => {
  it('Treinamento de Guerreiro fica na árvore e a Especialização (com escolha) aparece', () => {
    const entries = [
      // pick da escolha da técnica (o dropdown vive na técnica, fora desta lista)
      ent('Treinamento de Guerreiro', 'Escolha', 'Treinamento de Classe Secundária'),
      // concedida PELO pick — sem o pai na árvore ela ficava órfã e sumia
      ent('Especialização Menor em Arma', 'Regra', 'Treinamento de Guerreiro'),
    ]
    const choices = new Map([
      ['Treinamento de Classe Secundária', [CHOICE]],
      ['Especialização Menor em Arma', [CHOICE]],
    ])
    const tree = habTree(entries, () => undefined, true, choices)
    const itens = [...tree.values()].flat()
    expect(itens.map((i) => i.target)).toContain('Treinamento de Guerreiro')
    const esp = itens.find((i) => i.target === 'Especialização Menor em Arma')
    expect(esp).toBeTruthy()
    expect(esp!.choices.length).toBe(1) // o dropdown da variante pendura aqui
  })

  it('pick SEM filhos e sem escolhas próprias segue fora (dedup do Animista, #nc)', () => {
    const entries = [ent('Essência Flamejante', 'Escolha', 'Magias Anima')]
    const choices = new Map([['Magias Anima', [CHOICE]]])
    const tree = habTree(entries, () => undefined, true, choices)
    expect([...tree.values()].flat()).toHaveLength(0)
  })
})

describe('SelectBox — dropdown inteiro clicável + ℹ️ abre os detalhes (r2)', () => {
  const opts = [{ value: '[[X]]', label: 'X' }]
  it('com doc do pick: ℹ️ presente e NENHUM overlay rouba o clique do select', () => {
    render(
      <DetailProvider>
        <SelectBox value="[[X]]" options={opts} ariaLabel="Escolha" infoDocId={'Sistema/X' as VaultDoc['id']} />
      </DetailProvider>,
    )
    // r2: o overlay texto→detalhes atrapalhava abrir o dropdown — não existe mais
    expect(document.querySelector('[data-select-text-detalhes]')).toBeNull()
    expect(document.querySelector('[aria-label="Ver detalhes de Escolha"]')).toBeTruthy()
  })
  it('sem doc (escolha vazia) não há ℹ️', () => {
    render(
      <DetailProvider>
        <SelectBox value="" options={opts} ariaLabel="Escolha" infoDocId={null} />
      </DetailProvider>,
    )
    expect(document.querySelector('[aria-label="Ver detalhes de Escolha"]')).toBeNull()
  })
})
