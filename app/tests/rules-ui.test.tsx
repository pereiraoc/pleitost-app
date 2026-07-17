// @vitest-environment jsdom
// Fiação das issues de BIOGRAFIA/COMPETÊNCIAS nas telas (#2 #3 #4 #5 #7 #11):
// os campos do PERFIL e da sub-aba PERFIL de COMPETÊNCIAS consomem a projeção
// de regras (app/src/rules) e persistem NA HORA no overlay. Harness padrão do
// repo: fetch stubado lê vault-data do disco; expectativas dos VALORES vêm do
// JSON do herói e as das OPÇÕES vêm da MESMA projeção validada contra o
// golden em rules-golden.test.ts.
import { beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { FichaPage } from '../src/components/ficha/FichaPage'
import { heroPath } from '../src/paths'
import { __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

const CARLOS_ID = 'Sistema/Criaturas/Heróis/Carlos Facão de Andradas'
const STORE_KEY = `pleitost.heroEdits.${CARLOS_ID}`
const carlos = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, `${CARLOS_ID}.json`), 'utf8'),
) as VaultDoc
const fm = carlos.frontmatter as Record<string, any>

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
  globalThis.fetch = (async (input: unknown) => {
    const url = String(input)
    const rel = decodeURIComponent(url.replace(/^\/vault-data\//, ''))
    const file = path.join(vaultDataDir, rel)
    const ok = fs.existsSync(file)
    return {
      ok,
      status: ok ? 200 : 404,
      json: async () => JSON.parse(fs.readFileSync(file, 'utf8')),
    }
  }) as typeof fetch
})

beforeEach(() => {
  window.localStorage.clear()
  __resetHeroStoreMemoryForTests()
})
afterEach(cleanup)

function renderFicha(tab?: string) {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={[heroPath(CARLOS_ID, tab)]}>
        <Routes>
          <Route path="/heroi/*" element={<FichaPage />} />
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}

function overlaySalvo(): Record<string, any> {
  const raw = window.localStorage.getItem(STORE_KEY)
  expect(raw).toBeTruthy()
  return JSON.parse(raw!)
}

const optionValues = (sel: HTMLSelectElement) => [...sel.options].map((o) => o.value)

describe('PERFIL — NOME/APELIDO/SINTONIA (#2, #7)', () => {
  it('NOME é input editável com o valor real e persiste em FM nome', async () => {
    renderFicha()
    const nome = (await screen.findByLabelText('Nome')) as HTMLInputElement
    // espera o DADO renderizado (o input pode montar antes do doc/overlay
    // hidratarem) — sem isso o teste flakeia ~1/5
    await waitFor(() => expect(nome.value).toBe('Carlos Facão de Andradas'))
    fireEvent.change(nome, { target: { value: 'Carlão' } })
    expect(overlaySalvo().fm['nome']).toBe('Carlão')
    expect(nome.value).toBe('Carlão')
  })

  it('APELIDO é input com o MESMO estilo do NOME e persiste Biografia.Apelido', async () => {
    renderFicha()
    const nome = (await screen.findByLabelText('Nome')) as HTMLInputElement
    const apelido = (await screen.findByLabelText('Apelido')) as HTMLInputElement
    // #2: mesma largura/estilo (estilo inline idêntico ⇒ mesma largura no grid)
    expect(apelido.getAttribute('style')).toBe(nome.getAttribute('style'))
    fireEvent.change(apelido, { target: { value: 'Facão' } })
    expect(overlaySalvo().fm['Biografia.Apelido']).toBe('Facão')
    expect(apelido.value).toBe('Facão')
  })

  it('SINTONIA vira dropdown dos Traços Elementais reais e persiste (#7)', async () => {
    renderFicha()
    const sel = (await screen.findByLabelText('Sintonia')) as HTMLSelectElement
    // #255: as opções resolvem de forma assíncrona/incremental — esperar a
    // opção ALVO (Água), não só length>1, senão sob carga a leitura corre à
    // frente e vê só as primeiras opções populadas (ex.: só o Vento).
    await waitFor(() => expect(optionValues(sel)).toContain('[[Traço Elemental da Água|Água]]'))
    // valor atual casa com o FM ([[Traço Elemental do Vento]])
    expect(sel.value).toBe('[[Traço Elemental do Vento|Vento]]')
    fireEvent.change(sel, { target: { value: '[[Traço Elemental da Água|Água]]' } })
    expect(overlaySalvo().fm['Sintonia']).toBe('[[Traço Elemental da Água|Água]]')
  })
})

describe('PERFIL — cluster Passado (#3, #4)', () => {
  it('PERÍCIA do Passado lista todas as opções elegíveis e troca persiste o incremento', async () => {
    renderFicha()
    const sel = (await screen.findByLabelText('PERÍCIA')) as HTMLSelectElement
    await waitFor(() => expect(sel.options.length).toBeGreaterThan(2))
    // pick atual do FM (Enganação tem incremento "A: Passado")
    expect(sel.value).toBe('Enganacao')
    // Diplomacia é coberta por regra (Método Artístico (Inspirador)) → fora
    expect(optionValues(sel)).not.toContain('Diplomacia')
    expect(optionValues(sel)).toContain('Atletismo')

    fireEvent.change(sel, { target: { value: 'Atletismo' } })
    const lista = overlaySalvo().fm['Pericias.Lista'] as Record<string, any>[]
    const atletismo = lista.find((r) => r.Nome === 'Atletismo')!
    expect(atletismo.Incrementos).toContainEqual({ A: 'Passado' })
    expect(atletismo.Proficiencia).toBe('A')
    const enganacao = lista.find((r) => r.Nome === 'Enganação')!
    expect(enganacao.Incrementos).not.toContainEqual({ A: 'Passado' })
    // Enganação mantém os slots E/M (recompute = max rank dos incrementos)
    expect(enganacao.Proficiencia).toBe('M')
  })

  it('OFÍCIO do Passado lista as alternativas reais e troca persiste (#4)', async () => {
    renderFicha()
    const sel = (await screen.findByLabelText('OFÍCIO')) as HTMLSelectElement
    await waitFor(() => expect(sel.options.length).toBeGreaterThan(2))
    expect(optionValues(sel)).toEqual(['', 'Oficio', 'Atuacao'])
    expect(sel.value).toBe('Oficio')

    fireEvent.change(sel, { target: { value: 'Atuacao' } })
    const lista = overlaySalvo().fm['Oficios.Lista'] as Record<string, any>[]
    const atuacao = lista.find((r) => r.Nome === 'Atuacao')!
    expect(atuacao.Incrementos).toContainEqual({ A: 'Passado' })
    const oficio = lista.find((r) => r.Nome === 'Oficio')!
    expect(oficio.Incrementos).not.toContainEqual({ A: 'Passado' })
    expect(oficio.Proficiencia).toBe('N')
  })
})

describe('criação: classe nasce SEM nada selecionado', () => {
  it('o dropdown de Classe Inicial tem opção em branco (— Nenhuma —) com value ""', async () => {
    renderFicha('habilidades')
    const blank = (await screen.findByRole('option', { name: '— Nenhuma —' })) as HTMLOptionElement
    expect(blank.value).toBe('')
  })
})

describe('#165 magias agrupadas por subcategoria (Arcana/Anima), não por escola', () => {
  it('cabeçalho é "Magias Arcana" (Negra+Branca juntas), não "Magias Arcana Branca"', async () => {
    renderFicha('habilidades')
    expect(await screen.findByText('Magias Arcana')).toBeTruthy()
    expect(screen.queryByText('Magias Arcana Branca')).toBeNull()
    expect(screen.queryByText('Magias Arcana Negra')).toBeNull()
  })

  it('#143: a escola de magia mostra o modificador de ataque mágico (mod + prof)', async () => {
    renderFicha('habilidades')
    await screen.findByText('Magias Arcana')
    // Arcana Branca do Carlos é prof E → modificador assinado seguido de "(E)"
    const mod = await screen.findByText(/^[+-]\d+ \(E\)$/)
    expect(mod).toBeTruthy()
  })
})

describe('COMPETÊNCIAS/PERÍCIAS — escolhas de ESPECIALIZAÇÕES (#26)', () => {
  /** Abre o modo edição do painel Especialidades e Maestrias (pelo cabeçalho). */
  async function abrirEdicao() {
    renderFicha('habilidades')
    const heading = await screen.findByText('Especialidades e Maestrias')
    const header = heading.parentElement!
    fireEvent.click(within(header).getByText('✎ Alterar'))
  }

  it('painel tem as duas colunas: Especialidades e Maestrias (#136/#163)', async () => {
    renderFicha('habilidades')
    expect(await screen.findByText('Especialidades e Maestrias')).toBeTruthy()
    expect(screen.getByText('Especialidades')).toBeTruthy()
    expect(screen.getByText('Maestrias')).toBeTruthy()
  })

  it('modo edição lista os grupos elegíveis (rank ≥ E) com as opções reais da vault', async () => {
    await abrirEdicao()
    // grupos e opções do golden editavel__tab-habilidades (Carlos):
    // Acrobacia/Diplomacia/Enganação (E), 2 opções cada, ordem pt-BR
    const radio = await screen.findByLabelText('Acrobacia (E): Estabilidade')
    expect(radio).toBeTruthy()
    expect(screen.getByLabelText('Acrobacia (E): Mobilidade')).toBeTruthy()
    expect(screen.getByLabelText('Diplomacia (E): Encorajamento')).toBeTruthy()
    expect(screen.getByLabelText('Enganação (E): Influência')).toBeTruthy()
    // Atletismo (N) e Furtividade (A) não são elegíveis
    expect(screen.queryByText('Atletismo (E)')).toBeNull()
    expect(screen.queryByText('Furtividade (E)')).toBeNull()
    // pick salvo marcado ([[Estabilidade]] na Acrobacia)
    expect(radio.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByLabelText('Acrobacia (E): Mobilidade').getAttribute('aria-pressed')).toBe(
      'false',
    )
  })

  it('escolher persiste na linha da perícia e re-clicar desmarca (toggle do plugin)', async () => {
    await abrirEdicao()
    const mobilidade = await screen.findByLabelText('Acrobacia (E): Mobilidade')
    fireEvent.click(mobilidade)
    let lista = overlaySalvo().fm['Pericias.Lista'] as Record<string, any>[]
    expect(lista.find((r) => r.Nome === 'Acrobacia')!.Especializacao).toBe('[[Mobilidade]]')
    // as outras linhas ficam intactas
    expect(lista.find((r) => r.Nome === 'Diplomacia')!.Especializacao).toBe('[[Negociação]]')

    // re-clicar no marcado desmarca (null → '' como o plugin serializa)
    await waitFor(() =>
      expect(
        screen.getByLabelText('Acrobacia (E): Mobilidade').getAttribute('aria-pressed'),
      ).toBe('true'),
    )
    fireEvent.click(screen.getByLabelText('Acrobacia (E): Mobilidade'))
    lista = overlaySalvo().fm['Pericias.Lista'] as Record<string, any>[]
    expect(lista.find((r) => r.Nome === 'Acrobacia')!.Especializacao).toBe('')
  })
})

describe('PERFIL — Naturalidade (#5)', () => {
  it('dropdown traz as localidades do Atlas e salva wikilink no overlay', async () => {
    renderFicha()
    const sel = (await screen.findByLabelText('Naturalidade')) as HTMLSelectElement
    await waitFor(() => expect(sel.options.length).toBeGreaterThan(2))
    // valor atual = FM ([[Canto Alto]]); headers desabilitados presentes
    expect(sel.value).toBe('[[Canto Alto]]')
    const opts = [...sel.options]
    expect(opts.some((o) => o.disabled)).toBe(true)
    expect(optionValues(sel)).toContain('[[Iluminada]]')

    fireEvent.change(sel, { target: { value: '[[Iluminada]]' } })
    expect(overlaySalvo().fm['Biografia.Naturalidade']).toBe('[[Iluminada]]')
  })

  it('opção "Outro" abre texto livre e o blur salva string sem wikilink', async () => {
    renderFicha()
    const sel = (await screen.findByLabelText('Naturalidade')) as HTMLSelectElement
    await waitFor(() => expect(sel.options.length).toBeGreaterThan(2))
    fireEvent.change(sel, { target: { value: '__outro__' } })
    const input = (await screen.findByLabelText('Naturalidade (texto livre)')) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Vila Perdida' } })
    fireEvent.blur(input)
    expect(overlaySalvo().fm['Biografia.Naturalidade']).toBe('Vila Perdida')
  })
})

describe('COMPETÊNCIAS/PERFIL — classe, subclasses, atributos (#11)', () => {
  it('CLASSE INICIAL (#23) lista as 10 classes reais e persiste o wikilink escolhido', async () => {
    renderFicha('habilidades')
    // #23: diretriz do usuário — o rótulo do seletor é "Classe Inicial"
    const sel = (await screen.findByLabelText('CLASSE INICIAL')) as HTMLSelectElement
    await waitFor(() => expect(sel.options.length).toBeGreaterThan(1))
    expect(optionValues(sel)).toContain('[[Animista]]')
    expect(optionValues(sel)).toContain('[[Monge]]')
    expect(sel.value).toBe('[[Bardo]]')
    fireEvent.change(sel, { target: { value: '[[Mago]]' } })
    // #255: o persist do overlay é ASSÍNCRONO — espera o store refletir a troca
    // (ler síncrono logo após o change corria e falhava sob carga paralela).
    await waitFor(() => expect(overlaySalvo().fm['Classe']).toBe('[[Mago]]'))
  })

  it('subclasse usa o ícone 📕 do registro categoria.Habilidade (#24)', async () => {
    renderFicha('habilidades')
    // o doc da subclasse é categoria Habilidade (golden: data-link-categoria=
    // "Habilidade") → 📕 do registro central, não o 📘 de perfil.Subclasse
    await screen.findByLabelText('MÉTODO ARTÍSTICO')
    await waitFor(() => expect(screen.getByText(/MÉTODO ARTÍSTICO/).textContent).toContain('📕'))
  })

  it('subclasses aparecem como escolhas reais e a troca regrava o pick na lista', async () => {
    renderFicha('habilidades')
    const sel = (await screen.findByLabelText('MÉTODO ARTÍSTICO')) as HTMLSelectElement
    await waitFor(() => expect(sel.options.length).toBe(2))
    expect(optionValues(sel)).toEqual([
      '[[Método Artístico (Manipulador)|Manipulador]]',
      '[[Método Artístico (Inspirador)|Inspirador]]',
    ])
    expect(sel.value).toBe('[[Método Artístico (Inspirador)|Inspirador]]')

    fireEvent.change(sel, { target: { value: '[[Método Artístico (Manipulador)|Manipulador]]' } })
    const lista = overlaySalvo().fm['Habilidades.Lista'] as Record<string, string>[]
    const pickRow = lista.find((row) => Object.values(row)[0] === 'Escolha.[[Método Artístico]]')!
    expect(Object.keys(pickRow)[0]).toBe('[[Método Artístico (Manipulador)]]')
    // a outra escolha (Estilo de Combate) fica intacta
    expect(
      lista.some(
        (row) =>
          Object.keys(row)[0] === '[[Estilo de Combate (Luta Artística)]]' &&
          Object.values(row)[0] === 'Escolha.[[Estilo de Combate]]',
      ),
    ).toBe(true)
  })

  it('tooltips do PERFIL (#21/#22): Fonte no Atributo Principal e breakdown nas Defesas', async () => {
    renderFicha('habilidades')
    // célula do PRINCIPAL: "Regra · Regra.[[Bardo]]" (duplo prefixo REAL do
    // plugin, golden editavel__tab-perfil) chega no atributo data-breakdown-html
    await waitFor(() => {
      const tips = [...document.querySelectorAll('[data-breakdown-html]')].map(
        (el) => el.getAttribute('data-breakdown-html') ?? '',
      )
      expect(tips.some((t) => t.includes('Regra · Regra.[[Bardo]]'))).toBe(true)
      // VALOR das Defesas: breakdown do modelo salvo (Base 10 + linhas)
      expect(tips.some((t) => t.includes('Base (10)'))).toBe(true)
      // medalha de rank com fonte granular por regra (defesas rule-driven)
      expect(tips.some((t) => t.includes('Fonte'))).toBe(true)
    })
  })

  it('tooltips de PERÍCIAS/OFÍCIOS (#25): breakdown do modificador e fontes por rank', async () => {
    renderFicha('habilidades')
    // o PanelTrack monta todas as colunas; a sub-aba PERÍCIAS já está no DOM
    await waitFor(() => {
      const tips = [...document.querySelectorAll('[data-breakdown-html]')].map(
        (el) => el.getAttribute('data-breakdown-html') ?? '',
      )
      // breakdown de perícia: título slugado com atributo (modelo salvo)
      expect(tips.some((t) => t.includes('Enganacao (PRE)'))).toBe(true)
      // breakdown de ofício: Atuacao (PRE)
      expect(tips.some((t) => t.includes('Atuacao (PRE)'))).toBe(true)
      // medalha da Enganação (M): fonte do rank atual = Slot.M
      expect(tips.some((t) => t.includes('Slot.M'))).toBe(true)
    })
  })

  it('ATRIBUTOS: rank 3 fica travado em PRE (Escolher do Bardo); rank 2 troca com swap', async () => {
    renderFicha('habilidades')
    // rank 2 e rank 1 são selects; rank 3 (principal PRE) e rank 0 são fixos
    const rank2 = (await screen.findByLabelText('Atributo rank 2')) as HTMLSelectElement
    expect(screen.queryByLabelText('Atributo rank 3')).toBeNull()
    expect(screen.queryByLabelText('Atributo rank 0')).toBeNull()
    expect(optionValues(rank2)).toEqual(['FOR', 'AGI', 'INT'])
    expect(rank2.value).toBe('AGI')

    // swap determinístico: INT (rank 1) sobe pra 2, AGI desce pra 1
    fireEvent.change(rank2, { target: { value: 'INT' } })
    expect(overlaySalvo().fm['Atributos']).toEqual({
      Principal: 'PRE',
      FOR: Number(fm.Atributos.FOR),
      AGI: 1,
      INT: 2,
      PRE: Number(fm.Atributos.PRE),
    })
  })
})
