// @vitest-environment jsdom
// Anotações PESSOAS (#178/#179) + agregação em Criaturas/Pessoas (#183 req 5)
// + ficha RESUMO nos DETALHES (#180): lista pessoal POR personagem no FM dele,
// nova pessoa e personagem EXISTENTE (com Alvo → resumo), membros de grupo
// automáticos, e as entradas visíveis em Criaturas/Pessoas.
import { beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { DetailProvider } from '../src/data/detail-context'
import { AnotacoesTab } from '../src/components/ficha/AnotacoesTab'
import { NpcsPage } from '../src/components/creatures/CreaturesPages'
import { RightSidebar } from '../src/components/layout/RightSidebar'
import { __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
import {
  __resetLocalStoreForTests,
  createLocalEntity,
  emptyHeroFrontmatter,
  getLocalDoc,
} from '../src/data/local-entities'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest
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
  __resetHeroStoreMemoryForTests()
  __resetLocalStoreForTests()
})
afterEach(cleanup)

function renderAnotacoes(heroId: string) {
  const doc = getLocalDoc(heroId)!
  return render(
    <CatalogProvider catalog={catalog}>
      <DetailProvider>
        <MemoryRouter>
          <AnotacoesTab doc={doc} />
          <RightSidebar drawerOpen onCloseDrawer={() => {}} />
        </MemoryRouter>
      </DetailProvider>
    </CatalogProvider>,
  )
}

describe('Anotações PESSOAS (#178/#179) + resumo (#180)', () => {
  it('nova pessoa: entra na lista pessoal (FM do herói) com os campos', async () => {
    const id = createLocalEntity('Heroi', 'Meu Herói', emptyHeroFrontmatter())
    renderAnotacoes(id)
    fireEvent.click(await screen.findByText('PESSOAS'))
    fireEvent.click(await screen.findByText('+ Nova Pessoa'))
    const dialog = await screen.findByRole('dialog', { name: 'Adicionar Pessoa' })
    fireEvent.change(within(dialog).getByLabelText('Nome'), { target: { value: 'Zeca do Bar' } })
    fireEvent.change(within(dialog).getByLabelText('Organização'), { target: { value: 'Taverna' } })
    fireEvent.click(within(dialog).getByText(/Adicionar|Salvar|Criar/))
    await waitFor(() => expect(screen.getByText('Zeca do Bar')).toBeTruthy())
    // persistiu no FM do herói (lista PESSOAL — req 1)
    const fm = getLocalDoc(id)!.frontmatter as Record<string, unknown>
    const pessoas = fm['Pessoas'] as Array<Record<string, string>>
    expect(pessoas.length).toBe(1)
    expect(pessoas[0]['Nome']).toBe('Zeca do Bar')
    expect(pessoas[0]['Organização']).toBe('Taverna')
  })

  it('OR-set (2026-08-18): criar carimba addedAt; deletar grava tombstone em PessoasRemovidas', async () => {
    const id = createLocalEntity('Heroi', 'Meu Herói', emptyHeroFrontmatter())
    renderAnotacoes(id)
    fireEvent.click(await screen.findByText('PESSOAS'))
    fireEvent.click(await screen.findByText('+ Nova Pessoa'))
    const dialog = await screen.findByRole('dialog', { name: 'Adicionar Pessoa' })
    fireEvent.change(within(dialog).getByLabelText('Nome'), { target: { value: 'Barba' } })
    fireEvent.click(within(dialog).getByText(/Adicionar|Salvar|Criar/))
    await waitFor(() => expect(screen.getByText('Barba')).toBeTruthy())
    const fm = () => getLocalDoc(id)!.frontmatter as Record<string, unknown>
    const pessoas = fm()['Pessoas'] as Array<Record<string, string>>
    // carimbo de criação — é ele que protege a pessoa no merge entre devices
    expect(typeof pessoas[0]!['addedAt']).toBe('string')
    expect(Number.isFinite(Date.parse(pessoas[0]!['addedAt']!))).toBe(true)
    // deletar → some da lista E deixa tombstone (deleção propaga no merge)
    fireEvent.click(screen.getByLabelText('Remover Barba'))
    await waitFor(() => expect((fm()['Pessoas'] as unknown[]).length).toBe(0))
    const rem = fm()['PessoasRemovidas'] as Record<string, string>
    expect(typeof rem['nome:Barba']).toBe('string')
  })

  it('existente: picker escolhe herói do usuário; clique no nome abre a ficha RESUMO nos detalhes', async () => {
    const id = createLocalEntity('Heroi', 'Meu Herói', emptyHeroFrontmatter())
    createLocalEntity('Heroi', 'Aliado Conhecido', { ...emptyHeroFrontmatter(), Classe: '[[Bardo]]' })
    renderAnotacoes(id)
    fireEvent.click(await screen.findByText('PESSOAS'))
    fireEvent.click(await screen.findByText('+ Existente'))
    const sel = (await screen.findByLabelText('Personagem existente')) as HTMLSelectElement
    const opt = [...sel.options].find((o) => o.textContent === 'Aliado Conhecido')!
    fireEvent.change(sel, { target: { value: opt.value } })
    fireEvent.click(screen.getByText('Continuar →'))
    // campos pessoais com Nome travado
    const dialog = await screen.findByRole('dialog', { name: 'Adicionar Pessoa' })
    const nomeInput = within(dialog).getByDisplayValue('Aliado Conhecido') as HTMLInputElement
    expect(nomeInput.disabled).toBe(true)
    fireEvent.click(within(dialog).getByText(/Adicionar|Salvar|Criar/))
    // badge = a relação da linha (default Neutro), não mais "CONHECIDO";
    // clicar no nome abre o RESUMO na sidebar
    await waitFor(() => expect(screen.getByText('NEUTRO')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Aliado Conhecido' }))
    await waitFor(() => {
      expect(screen.getByText('// VIDA')).toBeTruthy()
      expect(screen.getByText('// DEFESAS · SENTIDOS · MOVIMENTO')).toBeTruthy()
    })
  })

  it('#444 o PRÓPRIO herói não aparece em Pessoas (nem duplicado por estar em 2 grupos)', async () => {
    // Carlos está em 2 grupos que o contêm; sem o fix apareceria 2x (o membro
    // é o doc da vault, o herói atual é local: ids diferentes, mesmo nome).
    const id = createLocalEntity('Heroi', 'Carlos Facão de Andradas', {
      ...emptyHeroFrontmatter(),
      grupo: ['[[Carlos, Dante, Mera, Pind, Thoren]]', '[[Baitaca, Carlos, Drauzio]]'],
    } as never)
    const { container } = renderAnotacoes(id)
    fireEvent.click(await screen.findByText('PESSOAS'))
    await screen.findByText('Dante') // o grupo resolveu (membros aparecem)
    const grupo = container.querySelector('[data-pessoa-grupo="Grupo"]') as HTMLElement
    // o próprio Carlos NÃO aparece (0x) e ninguém está duplicado
    expect(within(grupo).queryByText('Carlos Facão de Andradas')).toBeNull()
    expect(within(grupo).getAllByText('Dante')).toHaveLength(1)
  })

  it('#445 agrupa por relação na ordem Grupo→Família→…→Inimigos, com cabeçalhos', async () => {
    const id = createLocalEntity('Heroi', 'Dono', {
      ...emptyHeroFrontmatter(),
      Pessoas: [
        { Nome: 'Rival', Relação: 'Inimigo' },
        { Nome: 'Mãe', Relação: 'Família' },
        { Nome: 'Colega', Relação: 'Amigo' },
      ],
    } as never)
    const { container } = renderAnotacoes(id)
    fireEvent.click(await screen.findByText('PESSOAS'))
    await screen.findByText('Mãe')
    // cabeçalhos por relação (plural onde o mestre pediu)
    const grupos = [...container.querySelectorAll('[data-pessoa-grupo]')].map((g) =>
      g.getAttribute('data-pessoa-grupo'),
    )
    // ordem: Família antes de Amigos antes de Inimigos
    expect(grupos).toEqual(['Família', 'Amigos', 'Inimigos'])
    // cada card sob o cabeçalho certo
    const familia = container.querySelector('[data-pessoa-grupo="Família"]') as HTMLElement
    expect(within(familia).getByText('Mãe')).toBeTruthy()
  })

  it('#443 clicar numa Pessoa abre um resumo COERENTE (Relação/Organização), não VIDA/atributos', async () => {
    const pid = createLocalEntity('Pessoa', 'Zeca do Bar', {
      Relação: 'Amigo',
      Organização: 'Taverna do Cão',
      Posição: 'Dono',
      Detalhes: 'Sabe de tudo que rola na cidade.',
    })
    const id = createLocalEntity('Heroi', 'Dono', {
      ...emptyHeroFrontmatter(),
      Pessoas: [{ Nome: 'Zeca do Bar', Relação: 'Amigo', Alvo: pid }],
    } as never)
    renderAnotacoes(id)
    fireEvent.click(await screen.findByText('PESSOAS'))
    fireEvent.click(await screen.findByRole('button', { name: 'Zeca do Bar' }))
    await waitFor(() => expect(document.querySelector('[data-pessoa-resumo]')).toBeTruthy())
    // mostra os campos de PESSOA…
    expect(screen.getByText('// PESSOA')).toBeTruthy()
    expect(screen.getByText('Taverna do Cão')).toBeTruthy()
    expect(screen.getByText('Sabe de tudo que rola na cidade.')).toBeTruthy()
    // …e NÃO o resumo de criatura (VIDA/atributos)
    expect(screen.queryByText('// VIDA')).toBeNull()
    expect(screen.queryByText('// ATRIBUTOS')).toBeNull()
  })

  it('#442 picker: só entidades do usuário — Pessoas cadastradas, sem o próprio herói, sem bestiário da vault', async () => {
    const id = createLocalEntity('Heroi', 'Meu Herói', emptyHeroFrontmatter())
    createLocalEntity('Heroi', 'Aliado Conhecido', emptyHeroFrontmatter())
    createLocalEntity('Pessoa', 'Zeca Local', {})
    renderAnotacoes(id)
    fireEvent.click(await screen.findByText('PESSOAS'))
    fireEvent.click(await screen.findByText('+ Existente'))
    const sel = (await screen.findByLabelText('Personagem existente')) as HTMLSelectElement
    const opts = [...sel.options].map((o) => o.textContent)
    expect(opts).toContain('Aliado Conhecido') // outro herói do usuário
    expect(opts).toContain('Zeca Local') // Pessoa cadastrada por ele
    expect(opts).not.toContain('Meu Herói') // o próprio herói NÃO aparece
    // nada do BESTIÁRIO da vault (era spoiler pros jogadores)
    expect(opts.some((o) => /Goblin|Orc|Lagart/i.test(o ?? ''))).toBe(false)
  })

  it('Criaturas/Pessoas agrega as pessoas das anotações dos heróis do usuário', async () => {
    const id = createLocalEntity('Heroi', 'Meu Herói', emptyHeroFrontmatter())
    renderAnotacoes(id)
    fireEvent.click(await screen.findByText('PESSOAS'))
    fireEvent.click(await screen.findByText('+ Nova Pessoa'))
    const dialog = await screen.findByRole('dialog', { name: 'Adicionar Pessoa' })
    fireEvent.change(within(dialog).getByLabelText('Nome'), { target: { value: 'Zeca do Bar' } })
    fireEvent.click(within(dialog).getByText(/Adicionar|Salvar|Criar/))
    cleanup()
    render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter>
          <Routes>
            <Route path="/" element={<NpcsPage />} />
          </Routes>
        </MemoryRouter>
      </CatalogProvider>,
    )
    // card agregado com o herói de origem
    expect(await screen.findByText('Zeca do Bar')).toBeTruthy()
    expect(screen.getByText(/conhecido de Meu Herói/)).toBeTruthy()
  })
})
