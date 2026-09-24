// @vitest-environment jsdom
// CHAMADAS do wizard (2026-09-23): texto-resumo curto pra quem está
// escolhendo Sintonia e Classe pela primeira vez.
//  - Sintonia: as TENDÊNCIAS (FM `Tendencias` do Traço) viram tags sempre
//    visíveis no card, uma ao lado da outra — sem precisar clicar;
//  - Classe: a CHAMADA (FM `Chamada` da nota) aparece discreta dentro da barra
//    da classe SELECIONADA; as opções de subclasse e as sintonias informativas
//    (Monge/Animista, FM `Chamada_Sintonia`) mostram a sua sempre;
//  - mundo com `reskin.chamadas` sobrescreve o texto (mesmo idioma do
//    `descricoes`, #538); sem override, o FM canônico passa pelo reskinText.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { DetailProvider } from '../src/data/detail-context'
import { setActiveContexto } from '../src/data/reskin'
import type { ContextoDef } from '../src/data/context-def'
import { PassoSintonia } from '../src/components/wizard/steps/PassoSintonia'
import { PassoClasse } from '../src/components/wizard/steps/PassoClasse'
import type { WizardCtx } from '../src/components/wizard/steps'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

beforeAll(() => {
  globalThis.fetch = (async (input: unknown) => {
    const rel = decodeURIComponent(String(input).replace(/^\/vault-data\//, ''))
    const file = path.join(vaultDataDir, rel)
    const ok = fs.existsSync(file)
    return { ok, status: ok ? 200 : 404, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) }
  }) as typeof fetch
})
beforeEach(() => setActiveContexto(null))
afterEach(() => {
  cleanup()
  setActiveContexto(null)
})

const SINTONIAS = [
  { value: '[[Traço Elemental da Água|Água]]', label: 'Água' },
  { value: '[[Traço Elemental da Terra|Terra]]', label: 'Terra' },
  { value: '[[Traço Elemental do Fogo|Fogo]]', label: 'Fogo' },
  { value: '[[Traço Elemental do Vento|Vento]]', label: 'Vento' },
]

function ctxDe(fm: Record<string, unknown>, rules: Record<string, unknown>): WizardCtx {
  return {
    fm,
    rules: { stale: false, sintoniaRuleLocked: false, sintonias: SINTONIAS, derivedFm: {}, ...rules },
    doc: { id: 'local:Heroi:x', basename: 'Novo Herói' },
    model: { set: () => {} },
    refs: {},
  } as unknown as WizardCtx
}

function renderPasso(el: React.ReactNode, cat: typeof catalog = catalog) {
  return render(
    <CatalogProvider catalog={cat}>
      <DetailProvider>
        <MemoryRouter>{el}</MemoryRouter>
      </DetailProvider>
    </CatalogProvider>,
  )
}

/** Def mínimo de mundo com override de chamada (sem depender do dataset cyberpunk). */
function defComChamadas(reskin: Partial<ContextoDef['reskin']>): ContextoDef {
  return {
    id: 'poa-1987',
    nome: 'Porto Alegre 1987',
    fonte: 'x',
    moeda: { simbolo: 'Cz$', nome: 'Cruzado' },
    atlas: { raiz: 'Atlas', mapa: null },
    pericias: {},
    reskin: { notas: {}, notasFuturas: {}, termos: {}, excecoes: [], ...reskin },
    disponibilidade: { padrao: 'disponivel', indisponiveis: [], restritos: {} },
    base: { sempreDisponiveis: [] },
  }
}

describe('passo SINTONIA — tendências como tags', () => {
  it('as 4 tendências de cada Traço aparecem no card SEM clicar', async () => {
    renderPasso(<PassoSintonia ctx={ctxDe({}, {})} />)
    // Água: Flexível, Sábio, Resiliente, Insensível (FM Tendencias do Traço)
    await waitFor(() => expect(screen.getByText('Flexível')).toBeTruthy(), { timeout: 15000 })
    for (const t of ['Sábio', 'Resiliente', 'Insensível', 'Teimoso', 'Impulsivo', 'Avoado']) {
      expect(screen.getByText(t)).toBeTruthy()
    }
    // as tags vivem DENTRO do card (option) da sintonia certa
    const cardAgua = screen.getByText('Flexível').closest('[role="option"]')
    expect(cardAgua?.textContent).toContain('Água')
    expect(cardAgua?.textContent).not.toContain('Teimoso')
  }, 30000)
})

describe('passo CLASSE — chamada discreta', () => {
  it('a classe SELECIONADA mostra a chamada; as outras não', async () => {
    renderPasso(
      <PassoClasse
        ctx={ctxDe(
          { Classe: '[[Arcanista]]', Sintonia: '[[Traço Elemental da Água|Água]]' },
          {
            classes: [
              { value: '[[Arcanista]]', label: 'Arcanista' },
              { value: '[[Bardo]]', label: 'Bardo' },
            ],
            subclassChoices: [],
          },
        )}
      />,
    )
    await waitFor(
      () => expect(screen.getByText(/Utilize seus estudos para impactar o combate/)).toBeTruthy(),
      { timeout: 15000 },
    )
    expect(screen.queryByText(/Utilize atos e performances artísticas/)).toBeNull()
  }, 30000)

  it('opções de subclasse mostram a própria chamada (Estudos do Vazio × Aplicações da Luz)', async () => {
    renderPasso(
      <PassoClasse
        ctx={ctxDe(
          { Classe: '[[Arcanista]]' },
          {
            classes: [{ value: '[[Arcanista]]', label: 'Arcanista' }],
            subclassChoices: [
              {
                choiceKey: 'k',
                parent: 'Escola Arcana',
                options: [
                  { value: '[[Escola Arcana (Estudos do Vazio)|Estudos do Vazio]]', label: 'Estudos do Vazio' },
                  { value: '[[Escola Arcana (Aplicações da Luz)|Aplicações da Luz]]', label: 'Aplicações da Luz' },
                ],
                pick: null,
                pickSource: 'fm',
              },
            ],
          },
        )}
      />,
    )
    await waitFor(
      () => expect(screen.getByText(/Conjure magias negras poderosas para desestabilizar/)).toBeTruthy(),
      { timeout: 15000 },
    )
    expect(screen.getByText(/Conjure magias brancas poderosas para empoderar/)).toBeTruthy()
  }, 30000)

  it('Monge: cada sintonia informativa traz a chamada por elemento (Chamada_Sintonia)', async () => {
    renderPasso(
      <PassoClasse
        ctx={ctxDe(
          { Classe: '[[Monge]]', Sintonia: '[[Traço Elemental da Água|Água]]' },
          { classes: [{ value: '[[Monge]]', label: 'Monge' }], subclassChoices: [] },
        )}
      />,
    )
    await waitFor(() => expect(screen.getByText(/Transforme seu corpo em uma arma letal/)).toBeTruthy(), {
      timeout: 15000,
    })
    expect(screen.getByText(/Realize manobras com agilidade/)).toBeTruthy()
    expect(screen.getByText(/Transforme o templo de seu corpo em um forte/)).toBeTruthy()
    expect(screen.getByText(/Traduza sua fúria em ataques devastadores/)).toBeTruthy()
    expect(screen.getByText(/múltiplos golpes rápidos sequenciais/)).toBeTruthy()
  }, 30000)

  it('mundo com reskin.chamadas sobrescreve o texto da classe e da sintonia', async () => {
    const def = defComChamadas({
      chamadas: { Monge: 'O corpo como técnica: academias de kung-fu dos anos 80.' },
      chamadasSintonia: { Monge: { Água: 'Ginga de capoeira: controle com mobilidade.' } },
    })
    renderPasso(
      <PassoClasse
        ctx={ctxDe(
          { Classe: '[[Monge]]', Sintonia: '[[Traço Elemental da Água|Água]]' },
          { classes: [{ value: '[[Monge]]', label: 'Monge' }], subclassChoices: [] },
        )}
      />,
      { ...catalog, contextoDef: def },
    )
    await waitFor(() => expect(screen.getByText(/academias de kung-fu dos anos 80/)).toBeTruthy(), {
      timeout: 15000,
    })
    expect(screen.queryByText(/Transforme seu corpo em uma arma letal/)).toBeNull()
    expect(screen.getByText(/Ginga de capoeira/)).toBeTruthy()
    expect(screen.queryByText(/Realize manobras com agilidade/)).toBeNull()
    // elementos SEM override caem no canônico
    expect(screen.getByText(/Transforme o templo de seu corpo em um forte/)).toBeTruthy()
  }, 30000)
})
