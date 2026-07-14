// @vitest-environment jsdom
// VISUALIZADOR DE ELEMENTOS DE REGRA + COBERTURA (#251, F7 do épico #243).
// Pedido AS-IS: "visualizador de elementos de regra... ver exatamente o que
// ele impacta... ver que tudo está coberto e não tem erros de sintaxe."
// A validação usa o parser REAL (via extractor): RAW sem regra = sintaxe;
// action.kind 'unknown' = não coberto.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { DocPage } from '../src/components/compendium/DocPage'
import {
  DocRuleElements,
  RuleElementsSection,
  elementIssues,
} from '../src/components/compendium/RuleElements'
import type { IndexManifest, RuleElement, VaultDoc } from '../src/data/types'
import { loadDoc } from '../src/data/useDoc'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

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
  // Modo Mestre: a seção de elementos de regra é gated por ele
  window.localStorage.setItem('pleitost.settings.mestre', 'true')
  globalThis.fetch = (async (input: unknown) => {
    const rel = decodeURIComponent(String(input).replace(/^\/vault-data\//, ''))
    const file = path.join(vaultDataDir, rel)
    const ok = fs.existsSync(file)
    return { ok, status: ok ? 200 : 404, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) }
  }) as typeof fetch
})
afterEach(cleanup)

const ANIMISTA = 'Sistema/Criação de Personagem/Classes/Animista'

function renderDoc(id: string) {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={[`/doc/${id}`]}>
        <Routes>
          <Route path="/doc/*" element={<DocPage />} />
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}

describe('validação de cobertura/sintaxe (#251)', () => {
  it('elementIssues: RAW sem regra parseada = erro de sintaxe', () => {
    const el: RuleElement = { raw: 'isso não é uma regra válida @#$', parsed: [] }
    expect(elementIssues(el).syntax).toBe(true)
  })

  it('elementIssues: action.kind unknown = não coberto', () => {
    const el: RuleElement = {
      raw: 'Nivel 1 Verbo Desconhecido X',
      parsed: [{ action: { kind: 'unknown' }, scope: [], condition: {}, conditionNegated: false }],
    }
    expect(elementIssues(el).unknown).toBe(1)
    expect(elementIssues(el).syntax).toBe(false)
  })

  it('elementIssues: regra válida (alias-compor) não tem problema', () => {
    const el: RuleElement = {
      raw: 'Nivel 1 Alias Classe Compor 0 "Animista"',
      parsed: [
        {
          action: { kind: 'alias-compor', targetRaw: 'Classe', order: 0, fragment: 'Animista' },
          scope: [{ kind: 'nivel-min', min: 1 }],
          condition: { kind: 'none' },
          conditionNegated: false,
        },
      ],
    }
    const it = elementIssues(el)
    expect(it.syntax).toBe(false)
    expect(it.unknown).toBe(0)
  })

  it('DocRuleElements: no-op (null) quando o doc não tem elementos de regra', () => {
    // wrapper self-gate: um doc sem elementos não renderiza a seção (garante que
    // pôr <DocRuleElements> no fim de TODA view é seguro — no-op quando vazio).
    const semRegras = { ruleElements: [] } as unknown as VaultDoc
    const { container } = render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter>
          <DocRuleElements doc={semRegras} />
        </MemoryRouter>
      </CatalogProvider>,
    )
    expect(container.querySelector('[data-rule-elements]')).toBeNull()
  })

  it('DocRuleElements: doc REAL com elementos (mestre) rende a seção com cobertura', async () => {
    const animista = (await loadDoc(ANIMISTA)) as VaultDoc
    expect(animista.ruleElements?.length).toBe(19)
    render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter>
          <DocRuleElements doc={animista} />
        </MemoryRouter>
      </CatalogProvider>,
    )
    const sec = document.querySelector('[data-rule-elements]') as HTMLElement
    expect(sec).toBeTruthy()
    expect(sec.querySelector('[data-coverage]')).toBeTruthy()
    expect(sec.querySelectorAll('[data-rule-element]').length).toBe(19)
  })

  it('na FICHA do Animista (mestre): seção presente com resumo de cobertura', async () => {
    renderDoc(ANIMISTA)
    const sec = await waitFor(() => {
      const el = document.querySelector('[data-rule-elements]') as HTMLElement
      expect(el).toBeTruthy()
      return el
    })
    // contagem dos elementos reais (19)
    expect(within(sec).getByText('19')).toBeTruthy()
    // resumo de cobertura (ok ou com problemas — determinístico pelos dados)
    const cov = sec.querySelector('[data-coverage]')
    expect(cov).toBeTruthy()
    // cada card de elemento tem o RAW
    expect(sec.querySelectorAll('[data-rule-element]').length).toBe(19)
  })

  it('cards com problema ganham marcador data-rule-issue', () => {
    // monta uma seção com 1 válido + 1 com erro de sintaxe + 1 não coberto
    render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter>
          <RuleElementsSection
            elements={[
              {
                raw: 'Nivel 1 Alias Classe Compor 0 "X"',
                parsed: [
                  {
                    action: { kind: 'alias-compor', targetRaw: 'Classe', order: 0, fragment: 'X' },
                    scope: [],
                    condition: { kind: 'none' },
                    conditionNegated: false,
                  },
                ],
              },
              { raw: 'lixo @#$ inválido', parsed: [] },
              {
                raw: 'Verbo Desconhecido',
                parsed: [{ action: { kind: 'unknown' }, scope: [], condition: {}, conditionNegated: false }],
              },
            ]}
          />
        </MemoryRouter>
      </CatalogProvider>,
    )
    expect(document.querySelectorAll('[data-rule-issue="syntax"]').length).toBe(1)
    expect(document.querySelectorAll('[data-rule-issue="unknown"]').length).toBe(1)
    // resumo: 2 com problemas
    expect(screen.getByText(/2 com problemas/)).toBeTruthy()
    // badges visíveis
    expect(screen.getByText(/ERRO DE SINTAXE/)).toBeTruthy()
    expect(screen.getByText(/NÃO COBERTO/)).toBeTruthy()
  })
})
