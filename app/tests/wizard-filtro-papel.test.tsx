// @vitest-environment jsdom
// FILTRO POR PAPEL no passo de Classe (2026-09-23): tocar num card de PAPEL NO
// GRUPO filtra as classes que podem ter ao menos ★ daquele papel, agrupadas
// por quantidade de estrelas (maior primeiro) e mostrando com QUAL subclasse
// ou sintonia chegam lá — a mesma classe pode aparecer em dois grupos
// (Guerreiro ★★★ com Arcos/Bestas e ★ com o resto). Tocar de novo tira o
// filtro e a lista volta ao normal. Sobre o dataset REAL.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { DetailProvider } from '../src/data/detail-context'
import { setActiveContexto } from '../src/data/reskin'
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
const CLASSES = ['Guerreiro', 'Caçador', 'Mago', 'Arcanista', 'Monge', 'Bardo'].map((c) => ({
  value: `[[${c}]]`,
  label: c,
}))

function renderPasso(fm: Record<string, unknown>, model: Record<string, unknown> = { set: () => {}, setMany: () => {} }) {
  const ctx = {
    fm,
    rules: {
      stale: false,
      sintoniaRuleLocked: false,
      sintonias: SINTONIAS,
      derivedFm: {},
      classes: CLASSES,
      subclassChoices: [],
    },
    doc: { id: 'local:Heroi:x', basename: 'Novo Herói' },
    model,
    refs: {},
  } as unknown as WizardCtx
  return render(
    <CatalogProvider catalog={catalog}>
      <DetailProvider>
        <MemoryRouter>
          <PassoClasse ctx={ctx} />
        </MemoryRouter>
      </DetailProvider>
    </CatalogProvider>,
  )
}

describe('filtro por papel no passo CLASSE', () => {
  it('ABATEDOR: grupos ★★★/★★/★, Guerreiro em dois grupos, Arcanista some; toque de novo desfaz', async () => {
    renderPasso({ Classe: '[[Guerreiro]]', Sintonia: '[[Traço Elemental da Água|Água]]' })
    // sem filtro: as três subcategorias e o Arcanista na lista
    await waitFor(() => expect(screen.getByText('Arcanista')).toBeTruthy(), { timeout: 15000 })
    expect(screen.getByText('CONJURADOR')).toBeTruthy()
    // a dica de uso fica acima dos cards
    expect(screen.getByText(/toque de novo pra tirar o filtro/i)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /filtrar por abatedor/i }))
    // grupos por estrelas, maior primeiro (Guerreiro ★★★ com Arcos/Bestas,
    // Caçador/Mago ★★, Guerreiro ★ com o resto)
    await waitFor(() => expect(screen.getAllByText('ABATEDORES').length).toBe(3), { timeout: 15000 })
    const estrelas = screen.getAllByTestId('filtro-estrelas').map((el) => el.textContent)
    expect(estrelas).toEqual(['★★★', '★★', '★'])
    expect(screen.getAllByText('Guerreiro')).toHaveLength(2)
    expect(screen.getByText('Arcos')).toBeTruthy()
    expect(screen.getByText('Bestas')).toBeTruthy()
    expect(screen.getByText('Lâminas')).toBeTruthy()
    expect(screen.getByText('Mago')).toBeTruthy()
    // Monge só chega a Abatedor ★ pelo Vento; Arcanista não tem Abatedor
    expect(screen.getByText('Monge')).toBeTruthy()
    expect(screen.queryByText('Arcanista')).toBeNull()
    expect(screen.queryByText('CONJURADOR')).toBeNull()
    // com o filtro, TODAS as barras de classe mostram a faixa de possibilidades
    expect(screen.getAllByTestId('possibilidades').length).toBeGreaterThanOrEqual(4)

    // toque de novo: filtro sai, lista volta ao normal
    fireEvent.click(screen.getByRole('button', { name: /filtrar por abatedor/i }))
    await waitFor(() => expect(screen.queryByText('ABATEDORES')).toBeNull())
    expect(screen.getByText('Arcanista')).toBeTruthy()
    expect(screen.getByText('CONJURADOR')).toBeTruthy()
    expect(screen.getAllByText('Guerreiro')).toHaveLength(1)
  }, 30000)

  it('LÍDER: Bardo ★★★ só com Inspirador + Arte Mágica; Guerreiro some', async () => {
    renderPasso({ Classe: '', Sintonia: '' })
    await waitFor(() => expect(screen.getByText('Bardo')).toBeTruthy(), { timeout: 15000 })
    fireEvent.click(screen.getByRole('button', { name: /filtrar por líder/i }))
    // as opções chegam em dois saltos de docs — espera o Bardo aparecer nos
    // três grupos (★★★, ★★ e ★), não só o header
    await waitFor(() => expect(screen.getAllByText('Bardo')).toHaveLength(3), { timeout: 15000 })
    expect(screen.getAllByText('LÍDERES')).toHaveLength(3)
    expect(screen.queryByText('Guerreiro')).toBeNull()
    // a entrada de ★★★ só com Inspirador e Arte Mágica
    const [grupoTres, grupoDois] = screen.getAllByTestId('filtro-grupo')
    expect(grupoTres!.textContent).toContain('Inspirador')
    expect(grupoTres!.textContent).toContain('Arte Mágica')
    expect(grupoTres!.textContent).not.toContain('Manipulador')
    expect(grupoTres!.textContent).not.toContain('Luta Artística')
    // ★★: a segunda escolha ANINHADA sob a primeira, só as combinações reais
    // (Manipulador → Arte Mágica; Inspirador → Luta Artística) — nunca as
    // quatro opções soltas como se qualquer par valesse
    const opcoesDois = [...grupoDois!.querySelectorAll('[role="option"]')].map((el) => ({
      nome: el.getAttribute('aria-label'),
      nivel: Math.round(parseFloat((el as HTMLElement).style.marginLeft || '0') / 26),
    }))
    // (ordem = a do Selecionar da nota: Manipulador vem antes de Inspirador)
    expect(opcoesDois).toEqual([
      { nome: 'Bardo', nivel: 0 },
      { nome: 'Manipulador', nivel: 1 },
      { nome: 'Arte Mágica', nivel: 2 },
      { nome: 'Inspirador', nivel: 1 },
      { nome: 'Luta Artística', nivel: 2 },
    ])
  }, 30000)

  it('tocar numa opção sob classe NÃO selecionada escolhe a classe junto, numa escrita só', async () => {
    const chamadas: Array<[string, unknown]>[] = []
    renderPasso(
      { Classe: '[[Guerreiro]]', Sintonia: '[[Traço Elemental da Água|Água]]' },
      { set: () => {}, setMany: (pares: Array<[string, unknown]>) => chamadas.push(pares) },
    )
    await waitFor(() => expect(screen.getByText('Bardo')).toBeTruthy(), { timeout: 15000 })
    fireEvent.click(screen.getByRole('button', { name: /filtrar por líder/i }))
    await waitFor(() => expect(screen.getAllByText('Bardo')).toHaveLength(3), { timeout: 15000 })
    // ★★★ do Bardo: Inspirador → Arte Mágica (nível 2) — clicar na aninhada
    // grava classe + os DOIS picks do caminho
    const grupoTres = screen.getAllByTestId('filtro-grupo')[0]!
    const arteMagica = [...grupoTres.querySelectorAll('[role="option"]')].find(
      (el) => el.getAttribute('aria-label') === 'Arte Mágica',
    ) as HTMLElement
    expect(arteMagica.hasAttribute('disabled')).toBe(false)
    fireEvent.click(arteMagica)
    expect(chamadas).toHaveLength(1)
    const pares = new Map(chamadas[0]!)
    expect(pares.get('Classe')).toBe('[[Bardo]]')
    expect(pares.get('Habilidades.Lista')).toEqual([
      { '[[Método Artístico (Inspirador)]]': 'Escolha.[[Método Artístico]]' },
      { '[[Estilo de Combate (Arte Mágica)]]': 'Escolha.[[Estilo de Combate]]' },
    ])
    // resets centrais vêm junto (Sintonia preservada — escolhida antes)
    expect(pares.has('Magias')).toBe(true)
    expect(pares.has('Sintonia')).toBe(false)
  }, 30000)
})
