// @vitest-environment jsdom
// WIZARD DE CRIAÇÃO DE HERÓI (#452, issues #453-#459):
//  - herói criado com o marcador Wizard → a FichaPage renderiza o wizard (não
//    as abas) e o rodapé começa com AVANÇAR bloqueado (passo 1 incompleto);
//  - concluir (remover o marcador) devolve a ficha padrão;
//  - resetOnClasseChange compõe classChangeResets + equipamento (nenhuma
//    seleção órfã ao trocar de classe — pedido explícito do usuário);
//  - gates puros dos passos (atributos/personalidade/equipamento/magias).
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { DetailProvider } from '../src/data/detail-context'
import { FichaPage } from '../src/components/ficha/FichaPage'
import { heroPath } from '../src/paths'
import {
  __resetLocalStoreForTests,
  classChangeResets,
  createLocalEntity,
  emptyHeroFrontmatter,
  getLocalDoc,
  setLocalEntityFm,
} from '../src/data/local-entities'
import { __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
import { resetOnClasseChange, equipamentoResets } from '../src/components/wizard/reset'
import { atributosCompletos } from '../src/components/wizard/steps/PassoAtributos'
import { personalidadeCompleta } from '../src/components/wizard/steps/PassoPersonalidade'
import { equipamentoCompleto } from '../src/components/wizard/steps/PassoEquipamento'
import { temMagias } from '../src/components/wizard/steps/PassoMagias'
import { wizardAtivo, wizardPasso } from '../src/components/wizard/wizard-mode'
import type { WizardCtx } from '../src/components/wizard/steps'
import type { IndexManifest } from '../src/data/types'
import type { HeroModel } from '../src/data/useHeroModel'

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
    getItem: (k) => (data.has(k) ? data.get(k)! : null),
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  }
}

beforeAll(() => {
  if (!window.localStorage) {
    Object.defineProperty(window, 'localStorage', { value: makeStorage(), configurable: true })
  }
  globalThis.fetch = (async (input: unknown) => {
    const rel = decodeURIComponent(String(input).replace(/^\/vault-data\//, ''))
    const file = path.join(vaultDataDir, rel)
    const ok = fs.existsSync(file)
    return { ok, status: ok ? 200 : 404, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) }
  }) as typeof fetch
})
beforeEach(() => {
  window.localStorage.clear()
  __resetLocalStoreForTests()
  __resetHeroStoreMemoryForTests()
})
afterEach(cleanup)

/** Herói recém-criado pelo botão "Criar Herói" (espelho do criarHeroi #452). */
function criarHeroiWizard(): string {
  return createLocalEntity('Heroi', 'Novo Herói', {
    ...emptyHeroFrontmatter(),
    Atributos: { FOR: 0, AGI: 0, INT: 0, PRE: 0, Principal: '' },
    Wizard: { passo: 1 },
  })
}

function renderFicha(id: string) {
  return render(
    <CatalogProvider catalog={catalog}>
      <DetailProvider>
        <MemoryRouter initialEntries={[heroPath(id)]}>
          <Routes>
            <Route path="/heroi/*" element={<FichaPage />} />
          </Routes>
        </MemoryRouter>
      </DetailProvider>
    </CatalogProvider>,
  )
}

/** ctx sintético pros GATES puros (só fm/rules importam). */
const ctxDe = (fm: Record<string, unknown>, rules?: Partial<WizardCtx['rules']>): WizardCtx =>
  ({ fm, rules: rules as WizardCtx['rules'], doc: { id: 'local:Heroi:x' } }) as unknown as WizardCtx

describe('modo wizard na FichaPage (#453)', () => {
  it('herói com marcador Wizard abre a CRIAÇÃO (não as abas) com AVANÇAR bloqueado', async () => {
    const id = criarHeroiWizard()
    renderFicha(id)
    // casca do wizard no lugar do PERFIL
    expect(await screen.findByText('// CRIAÇÃO DE HERÓI')).toBeTruthy()
    expect(screen.getByText('✕ Descartar criação')).toBeTruthy()
    // passo 1 (Classe) ativo; gate segura o avanço
    expect(await screen.findByText('// ESCOLHA SUA CLASSE')).toBeTruthy()
    const avancar = screen.getByText('Avançar →') as HTMLButtonElement
    expect(avancar.disabled).toBe(true)
    // as CLASSES da projeção aparecem como cards (fonte: vault scan)
    await waitFor(() => expect(screen.getByRole('option', { name: /Guerreiro/ })).toBeTruthy(), {
      timeout: 15000,
    })
  }, 30000)

  it('concluir (marcador removido) devolve a ficha padrão', async () => {
    const id = criarHeroiWizard()
    const { rerender } = renderFicha(id)
    await screen.findByText('// CRIAÇÃO DE HERÓI')
    // o passo final remove o marcador via model.set('Wizard', undefined)
    setLocalEntityFm(id, 'Wizard', undefined)
    rerender(
      <CatalogProvider catalog={catalog}>
        <DetailProvider>
          <MemoryRouter initialEntries={[heroPath(id)]}>
            <Routes>
              <Route path="/heroi/*" element={<FichaPage />} />
            </Routes>
          </MemoryRouter>
        </DetailProvider>
      </CatalogProvider>,
    )
    await waitFor(() => expect(screen.queryByText('// CRIAÇÃO DE HERÓI')).toBeNull())
    expect(wizardAtivo(getLocalDoc(id))).toBe(false)
  }, 30000)

  it('wizardPasso lê o ponteiro salvo (default 1; inválido → 1)', () => {
    expect(wizardPasso({ Wizard: { passo: 4 } })).toBe(4)
    expect(wizardPasso({ Wizard: {} })).toBe(1)
    expect(wizardPasso({})).toBe(1)
  })
})

describe('reset de dependentes ao trocar de CLASSE (#454)', () => {
  it('resetOnClasseChange = classChangeResets (fonte única da ficha) + equipamento do wizard', () => {
    const aplicados: Array<[string, unknown]> = []
    const model = { set: (p: string, v: unknown) => aplicados.push([p, v]) } as unknown as HeroModel
    resetOnClasseChange(model)
    const paths = aplicados.map(([p]) => p)
    // os resets centrais da ficha (magias/subclasse/técnicas/escolhas)…
    for (const [p] of classChangeResets()) expect(paths).toContain(p)
    // …mais o equipamento inicial (conceito do wizard)
    for (const [p] of equipamentoResets()) expect(paths).toContain(p)
    // e o equipamento volta ao estado de nascença
    const armadura = aplicados.find(([p]) => p === 'Inventario.Armadura.Nome')
    expect(armadura?.[1]).toBe('[[Sem Armadura]]')
    const armas = aplicados.find(([p]) => p === 'Inventario.Armas.Lista')
    expect(armas?.[1]).toEqual([])
  })
})

describe('gates puros dos passos', () => {
  const fmAtributos = (v: Record<string, unknown>) => ({ Atributos: v })

  it('atributos: exige 3/2/1/0 únicos + Principal no atributo 3', () => {
    expect(
      atributosCompletos(
        ctxDe(fmAtributos({ FOR: 3, AGI: 2, INT: 1, PRE: 0, Principal: 'FOR' }), { principalAllowed: null }),
      ),
    ).toBe(true)
    // distribuição repetida
    expect(
      atributosCompletos(ctxDe(fmAtributos({ FOR: 3, AGI: 3, INT: 1, PRE: 0, Principal: 'FOR' }), { principalAllowed: null })),
    ).toBe(false)
    // Principal fora do valor 3
    expect(
      atributosCompletos(ctxDe(fmAtributos({ FOR: 3, AGI: 2, INT: 1, PRE: 0, Principal: 'AGI' }), { principalAllowed: null })),
    ).toBe(false)
    // zerado (estado de nascença do wizard) não passa
    expect(
      atributosCompletos(ctxDe(fmAtributos({ FOR: 0, AGI: 0, INT: 0, PRE: 0, Principal: '' }), { principalAllowed: null })),
    ).toBe(false)
  })

  it('atributos: restrição de Principal dos elementos de regra REVALIDA (trocar de classe)', () => {
    const fm = fmAtributos({ FOR: 3, AGI: 2, INT: 1, PRE: 0, Principal: 'FOR' })
    expect(atributosCompletos(ctxDe(fm, { principalAllowed: ['FOR', 'AGI'] }))).toBe(true)
    // a nova classe só permite INT/PRE → o FOR salvo deixa de valer
    expect(atributosCompletos(ctxDe(fm, { principalAllowed: ['INT', 'PRE'] }))).toBe(false)
  })

  it('personalidade: pares com MESMO número (ideais↔desprezos, qualidades↔defeitos)', () => {
    const ok = {
      Biografia: {
        Ideais: ['Liberdade'],
        Desprezos: ['Tirania'],
        Qualidades: ['Confiante', 'Honesto'],
        Defeitos: ['Orgulhoso', 'Tapado'],
      },
    }
    expect(personalidadeCompleta(ctxDe(ok))).toBe(true)
    const desigual = {
      Biografia: { Ideais: ['A', 'B'], Desprezos: ['X'], Qualidades: ['Q'], Defeitos: ['D'] },
    }
    expect(personalidadeCompleta(ctxDe(desigual))).toBe(false)
    expect(personalidadeCompleta(ctxDe({ Biografia: {} }))).toBe(false)
  })

  it('equipamento: mão principal + armadura', () => {
    const ok = {
      Inventario: { Armas: { Lista: [{ Nome: '[[Adaga]]' }] }, Armadura: { Nome: '[[Sem Armadura]]' } },
    }
    expect(equipamentoCompleto(ctxDe(ok))).toBe(true)
    expect(
      equipamentoCompleto(ctxDe({ Inventario: { Armas: { Lista: [] }, Armadura: { Nome: '[[Sem Armadura]]' } } })),
    ).toBe(false)
  })

  it('magias: passo só existe com escola proficiente/aprendida (primária ou secundária)', () => {
    const sem = { Magias: { Lista: [{ Nome: 'Arcana Negra', Proficiencia: 'N', Lista: [] }] } }
    expect(temMagias(ctxDe(sem))).toBe(false)
    const prof = { Magias: { Lista: [{ Nome: 'Arcana Negra', Proficiencia: 'A', Lista: [] }] } }
    expect(temMagias(ctxDe(prof))).toBe(true)
    const concedida = { Magias: { Lista: [{ Nome: 'Anima', Proficiencia: 'N', Lista: ['[[Cura]]'] }] } }
    expect(temMagias(ctxDe(concedida))).toBe(true)
    const secundaria = {
      Magias: {
        Lista: [],
        Secundaria: { Lista: [{ Nome: 'Anima', Proficiencia: 'A', Lista: [] }] },
      },
    }
    expect(temMagias(ctxDe(secundaria))).toBe(true)
    // Tesouros nunca conta (exclusiva)
    const tesouros = { Magias: { Lista: [{ Nome: 'Tesouros', Proficiencia: 'A', Lista: [] }] } }
    expect(temMagias(ctxDe(tesouros))).toBe(false)
  })
})
