// @vitest-environment jsdom
// WIZARD DE CRIAÇÃO DE HERÓI (#452, issues #453-#459):
//  - herói criado com o marcador Wizard → a FichaPage renderiza o wizard (não
//    as abas) e o rodapé começa com AVANÇAR bloqueado (passo 1 incompleto);
//  - concluir (remover o marcador) devolve a ficha padrão;
//  - resetOnClasseChange compõe classChangeResets + equipamento (nenhuma
//    seleção órfã ao trocar de classe — pedido explícito do usuário);
//  - gates puros dos passos (atributos/personalidade/equipamento/magias).
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, cleanup, render, screen, waitFor } from '@testing-library/react'
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

/** Herói recém-criado pelo botão "Criar Herói" (espelho do criarHeroi #452 —
 *  atributos já nascem distribuídos pelo skeleton, #463 item 10). */
function criarHeroiWizard(): string {
  return createLocalEntity('Heroi', 'Novo Herói', {
    ...emptyHeroFrontmatter(),
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
    // passo 1 agora é SINTONIA (#461 item 1); gate segura o avanço
    expect(await screen.findByText('// ESCOLHA SUA SINTONIA APARENTE')).toBeTruthy()
    const avancar = screen.getByText('Avançar →') as HTMLButtonElement
    expect(avancar.disabled).toBe(true)
    // as SINTONIAS da projeção aparecem como cards
    await waitFor(() => expect(screen.getAllByRole('option').length).toBeGreaterThan(0), {
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

  it('classe escolhida → PAPÉIS NO GRUPO com as estrelas da cascata (Somar Papel.X)', async () => {
    // Guerreiro tem `Somar Papel.Abatedor 1` nos elementos de regra — a MESMA
    // lógica da aba Papéis do grupo (papelValuesFromFm sobre o FM derivado).
    const id = createLocalEntity('Heroi', 'Novo Herói', {
      ...emptyHeroFrontmatter(),
      Sintonia: '[[Traço Elemental do Fogo]]',
      Classe: '[[Guerreiro]]',
      Wizard: { passo: 2 }, // passo 2 = Classe (Sintonia veio antes, #461)
    })
    renderFicha(id)
    await screen.findByText('// PAPEL NO GRUPO', undefined, { timeout: 15000 })
    // os 4 papéis do registro aparecem (cores/descrições do ROLE_META)
    for (const nome of ['LÍDER', 'CONTROLADOR', 'ABATEDOR', 'VANGUARDA']) {
      expect(screen.getByText(nome)).toBeTruthy()
    }
    // a cascata entrega ao menos 1 estrela CHEIA no Abatedor (opacity 1)
    await waitFor(
      () => {
        const chipAbatedor = screen.getByText('ABATEDOR').closest('div[style]')?.parentElement
        const cheias = [...(chipAbatedor?.querySelectorAll('span') ?? [])].filter(
          (s) => s.textContent === '★' && s.style.opacity === '1',
        )
        expect(cheias.length).toBeGreaterThanOrEqual(1)
      },
      { timeout: 15000 },
    )
  }, 30000)

  it('wizardPasso lê o ponteiro salvo (default 1; inválido → 1)', () => {
    expect(wizardPasso({ Wizard: { passo: 4 } })).toBe(4)
    expect(wizardPasso({ Wizard: {} })).toBe(1)
    expect(wizardPasso({})).toBe(1)
  })
})

describe('passo PASSADO — campos de texto (bug do espaço + placeholders)', () => {
  function heroiNoPassado(): string {
    return createLocalEntity('Heroi', 'Novo Herói', {
      ...emptyHeroFrontmatter(),
      Wizard: { passo: 3 }, // registro: passado = idx 2
    })
  }

  it('motivação ACEITA espaço no fim (o trim engolia o caractere recém-digitado)', async () => {
    renderFicha(heroiNoPassado())
    const campo = (await screen.findByLabelText(/por que você decidiu virar aventureiro/i)) as HTMLInputElement
    fireEvent.change(campo, { target: { value: 'Fugir da guerra ' } })
    expect(campo.value).toBe('Fugir da guerra ')
    fireEvent.change(campo, { target: { value: 'Fugir da guerra e ' } })
    expect(campo.value).toBe('Fugir da guerra e ')
  })

  it('caixa PASSADO tem exemplos no placeholder', async () => {
    renderFicha(heroiNoPassado())
    const campo = (await screen.findByLabelText('PASSADO')) as HTMLInputElement
    expect(campo.placeholder).toBe('Poeta Garçom, Cuidador de Ovelhas, etc')
  })

  it('TEXTO DO OFÍCIO: placeholder por seleção — Ofício e Atuação', async () => {
    renderFicha(heroiNoPassado())
    const texto = (await screen.findByLabelText('TEXTO DO OFÍCIO')) as HTMLInputElement
    expect(texto.placeholder).toBe('') // sem ofício escolhido, sem exemplo
    const seletor = (await screen.findByLabelText('OFÍCIO')) as HTMLSelectElement
    // opções vêm da projeção de regras (async) — espera o Ofício aparecer
    await waitFor(() => {
      expect([...seletor.options].some((o) => o.value === 'Oficio')).toBe(true)
    })
    fireEvent.change(seletor, { target: { value: 'Oficio' } })
    await waitFor(() => expect(texto.placeholder).toBe('Pecuária, Ferreiro, etc'))
    fireEvent.change(seletor, { target: { value: 'Atuacao' } })
    await waitFor(() => expect(texto.placeholder).toBe('Poesia, Chula, Viola, etc'))
  })
})

describe('class-roles-preview (#452 r4) — somas e highlight', () => {
  const BUILDS: [string, Record<string, number>][] = [
    ['Arte Mágica Inspirador', { Líder: 3 }],
    ['Arte Mágica Manipulador', { Líder: 2, Controlador: 1 }],
    ['Luta Artística Inspirador', { Líder: 2, Abatedor: 1 }],
    ['Luta Artística Manipulador', { Líder: 1, Abatedor: 1, Controlador: 1 }],
  ]

  it('somaPapeis: parse do `Somar Papel.X N` (classe base + opção)', async () => {
    const { somaPapeis } = await import('../src/components/wizard/class-roles-preview')
    expect(somaPapeis(['- Nivel 1 Definir Vida.Vitalidade 10', 'Somar Papel.Lider 1'])).toEqual({
      Líder: 1,
    })
    expect(somaPapeis(['Somar Papel.Controlador 1', 'Somar Papel.Vanguarda 2'])).toEqual({
      Controlador: 1,
      Vanguarda: 2,
    })
    expect(somaPapeis(undefined)).toEqual({})
  })

  it('somaPapeisPorSintonia: condicionais do doc da classe viram +★ por sintonia (Monge, #452 r9)', async () => {
    const { somaPapeisPorSintonia } = await import('../src/components/wizard/class-roles-preview')
    const monge = [
      'Somar Papel.Vanguarda 2',
      'Condicional Sintonia,[[Traço Elemental do Fogo]] Somar Papel.Vanguarda 1',
      'Condicional Sintonia,[[Traço Elemental do Vento]] Somar Papel.Abatedor 1',
      'Condicional Sintonia,[[Traço Elemental da Água]] Somar Papel.Controlador 1',
    ]
    const porSintonia = somaPapeisPorSintonia(monge)
    expect(porSintonia.get('Traço Elemental da Água')).toEqual({ Controlador: 1 })
    expect(porSintonia.get('Traço Elemental do Vento')).toEqual({ Abatedor: 1 })
    // o incondicional NÃO entra (é o +★ da própria classe)
    expect(porSintonia.size).toBe(3)
    // Mago (só incondicionais) → vazio: a seção SINTONIA nem aparece
    expect(somaPapeisPorSintonia(['Somar Papel.Abatedor 2']).size).toBe(0)
  })

  it('indicesDoBuildAtual: pick único casa 2 variantes; os 2 picks cravam UMA (fim do bug das 4★)', async () => {
    const { indicesDoBuildAtual } = await import('../src/components/wizard/class-roles-preview')
    // só "Manipulador" definido → destaca as 2 possibilidades compatíveis
    expect(indicesDoBuildAtual(BUILDS as never, [['Manipulador']])).toEqual([1, 3])
    // Manipulador + Luta Artística → exatamente "Luta Artística Manipulador"
    expect(indicesDoBuildAtual(BUILDS as never, [['Manipulador'], ['Luta Artística']])).toEqual([3])
    // nada definido → nada destacado
    expect(indicesDoBuildAtual(BUILDS as never, [])).toEqual([])
    // sintonia do Monge casa o build combinado "Fogo/Terra"
    expect(
      indicesDoBuildAtual(
        [
          ['Monge (Água)', { Vanguarda: 2, Controlador: 1 }],
          ['Monge (Fogo/Terra)', { Vanguarda: 3 }],
        ] as never,
        [['Fogo']],
      ),
    ).toEqual([1])
  })
})

describe('reset de dependentes ao trocar de CLASSE (#454)', () => {
  it('resetOnClasseChange = classChangeResets (menos Sintonia, #461) + equipamento do wizard', () => {
    const aplicados: Array<[string, unknown]> = []
    const model = { set: (p: string, v: unknown) => aplicados.push([p, v]) } as unknown as HeroModel
    resetOnClasseChange(model)
    const paths = aplicados.map(([p]) => p)
    // os resets centrais da ficha (magias/subclasse/técnicas/escolhas)…
    // EXCETO a Sintonia: no wizard ela é escolhida ANTES da classe (#461 item 1)
    // e trocar de classe não descarta essa escolha explícita.
    for (const [p] of classChangeResets().filter(([x]) => x !== 'Sintonia')) {
      expect(paths).toContain(p)
    }
    expect(paths).not.toContain('Sintonia')
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

  it('passado: exige naturalidade+contexto+perícia+ofício; identidade/motivação são OPCIONAIS', async () => {
    const { passadoCompleto } = await import('../src/components/wizard/steps/PassoPassado')
    const fm = { Biografia: { Naturalidade: '[[Lilá]]', Passado: 'Artesão' } }
    const rules = { passadoPericiaPick: '[[Atletismo]]', passadoOficioPick: 'Oficio' }
    // completo SEM gênero/idade/altura/peso/motivação (preenche depois na Biografia)
    expect(passadoCompleto(ctxDe(fm, rules as never))).toBe(true)
    // mas o núcleo do passado continua obrigatório
    expect(passadoCompleto(ctxDe({ Biografia: { Passado: 'Artesão' } }, rules as never))).toBe(false)
    expect(
      passadoCompleto(ctxDe(fm, { passadoPericiaPick: null, passadoOficioPick: 'Oficio' } as never)),
    ).toBe(false)
  })

  it('personalidade é OPCIONAL (decisão do usuário) — gate sempre livre', () => {
    // O editor mantém o pareamento estrutural, mas dá pra pular e preencher
    // depois na Biografia.
    expect(personalidadeCompleta()).toBe(true)
  })

  it('equipamento: só a armadura é obrigatória (mãos podem seguir DESARMADAS)', () => {
    // #464 item 15: Ataque Desarmado é o default válido das mãos.
    expect(
      equipamentoCompleto(ctxDe({ Inventario: { Armas: { Lista: [] }, Armadura: { Nome: '[[Sem Armadura]]' } } })),
    ).toBe(true)
    expect(equipamentoCompleto(ctxDe({ Inventario: { Armas: { Lista: [] }, Armadura: { Nome: '' } } }))).toBe(false)
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
