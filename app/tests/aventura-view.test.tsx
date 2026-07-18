// @vitest-environment jsdom
// F4 (#248) — visualização de AVENTURAS no compêndio. Pedido AS-IS: "uma
// visualização tipo como tenho em pleitost-autosheet para cada aventura" +
// "criar aventuras novas se eu estiver no modo Mestre". Verificado sobre
// aventuras REAIS da vault (fetch fake sobre ../vault-data) + criação local.
import { useEffect } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { DocPage } from '../src/components/compendium/DocPage'
import { FolderView } from '../src/components/compendium/FolderView'
import { compendiumFolderPath } from '../src/paths'
import { __resetSettingsForTests, useSettings } from '../src/settings'
import {
  __resetLocalStoreForTests,
  createLocalEntity,
} from '../src/data/local-entities'
import { aventuraFrontmatter } from '../src/components/mestre/criador-aventura-doc'
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
beforeEach(() => {
  __resetLocalStoreForTests()
  __resetSettingsForTests()
})
afterEach(cleanup)

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

function renderFolder(pathStr: string) {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={[compendiumFolderPath(pathStr)]}>
        <Routes>
          <Route path="/compendio/*" element={<FolderView />} />
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}

const NEUTRALIZACAO = 'Campanhas/Aventuras/Neutralização da Fenda Negra'
const RESGATE = 'Campanhas/Aventuras/Resgate dos Filhos de Eli Cohen (Mina Dracônica em Pencas)'
const PROTECAO = 'Campanhas/Aventuras/Proteção de Carregamento de Esmeraldas (Lilá - Safira)'

describe('AventuraView — carta de bounty do doc (#248)', () => {
  it('mostra título/rank/subcat + recompensa (Marcas/Ouro faixa) + objetivo + disponível', async () => {
    renderDoc(NEUTRALIZACAO)
    // título (do bloco bounty, não o basename)
    expect(await screen.findByText('Neutralização de Fenda Negra')).toBeTruthy()
    // rank do FM (B) na badge
    const rank = document.querySelector('.bounty-rank') as HTMLElement
    expect(rank.textContent).toBe('B')
    // subcategoria (subtype) no chip
    expect(document.querySelector('.bounty-subcat')?.textContent).toContain('Neutralização')
    // recompensa: Marcas 20–25 e Ouro 60–80 (faixa min–max via fmtAmount)
    const rec = document.querySelector('.bounty-recompensa') as HTMLElement
    expect(rec.textContent).toContain('Marcas')
    expect(within(rec).getByText('20 – 25')).toBeTruthy()
    expect(within(rec).getByText('60 – 80')).toBeTruthy()
    // objetivo parseado do bloco
    const obj = document.querySelector('.bounty-objetivo') as HTMLElement
    expect(obj.textContent).toMatch(/neutralizar o foco de energia negativa/)
    // disponível (FM.disponivel) → Canto Alto, com wikilink navegável
    const disp = document.querySelector('.aventura-disponivel') as HTMLElement
    expect(disp).toBeTruthy()
    const res = catalog.resolve('Canto Alto')
    expect(res.kind).toBe('doc')
    expect(within(disp).getAllByRole('link', { name: 'Canto Alto' }).length).toBeGreaterThan(0)
  })

  it('Marcas escalar (número único) renderiza sem faixa', async () => {
    renderDoc(RESGATE)
    expect(await screen.findByText('Resgate dos Filhos de Eli Cohen')).toBeTruthy()
    const rec = document.querySelector('.bounty-recompensa') as HTMLElement
    // Marcas: 6 (escalar) — mostra "6", não uma faixa
    expect(within(rec).getByText('6')).toBeTruthy()
    // Ouro: {min:50,max:100}
    expect(within(rec).getByText('50 – 100')).toBeTruthy()
    // rank C
    expect((document.querySelector('.bounty-rank') as HTMLElement).textContent).toBe('C')
  })

  it('cada subtipo pinta subcat própria (Proteção de Transporte)', async () => {
    renderDoc(PROTECAO)
    expect(await screen.findByText('Proteção de Carregamento de Esmeraldas')).toBeTruthy()
    expect(document.querySelector('.bounty-subcat')?.textContent).toContain('Proteção de Transporte')
  })

  it('Aventura SEM bounty (Encontro) mostra o corpo real, não uma carta vazia', async () => {
    // Emboscada de Goblins: type Aventura, subcategoria Encontro, corpo
    // instrucional + ```combat-marker``` (não é bounty). Não pode virar
    // "Aventura sem título" nem esconder o corpo.
    renderDoc('Campanhas/Aventuras/Emboscada de Goblins (Exemplo Sync)')
    expect(await screen.findByRole('heading', { name: 'Emboscada de Goblins' })).toBeTruthy()
    // corpo real presente
    expect(screen.getByText(/Combate exemplo pra exercitar o fluxo/)).toBeTruthy()
    // NÃO renderiza a carta de bounty vazia
    expect(document.querySelector('.bounty-card')).toBeNull()
    expect(screen.queryByText('Aventura sem título')).toBeNull()
  })
})

describe('folha Campanhas/Aventuras — grade de cartas (#248)', () => {
  it('lista as aventuras da vault como cartas de bounty', async () => {
    renderFolder('Campanhas/Aventuras')
    // a grade dedicada (leaf view), não a DocTable genérica
    await waitFor(() => expect(document.querySelector('.aventura-grid')).toBeTruthy())
    // cartas com os títulos dos bounties reais
    expect(await screen.findByText('Neutralização de Fenda Negra')).toBeTruthy()
    expect(await screen.findByText('Resgate dos Filhos de Eli Cohen')).toBeTruthy()
    // cada carta linka pro /doc
    const cells = document.querySelectorAll('a.aventura-grid-cell')
    expect(cells.length).toBeGreaterThan(1)
  })

  it('não vaza o botão QuickAdd / dataview / headings da nota-índice — só a lista', async () => {
    const { container } = renderFolder('Campanhas/Aventuras')
    await waitFor(() => expect(document.querySelector('.aventura-grid')).toBeTruthy())
    const txt = container.textContent ?? ''
    expect(txt).not.toContain('QuickAdd') // action do botão (fence ```button``` suprimido)
    expect(txt).not.toContain('button-criar-nova-aventura') // âncora de bloco ^id
    expect(txt).not.toContain('TABLE WITHOUT ID') // query dataview
    expect(txt).not.toContain('Aventureiros Classe C') // heading solto da nota-índice
  })
})

// ── criação de aventura no Modo Mestre (#248 + #195) ──

function MestreOn() {
  const { setMestre } = useSettings()
  // setMestre no efeito (uma vez) — chamá-lo no render entra em loop (cada
  // setMestre notifica e re-renderiza; o store não deduplica valores iguais).
  useEffect(() => setMestre(true), [setMestre])
  return null
}

describe('criar aventura no Modo Mestre (#248)', () => {
  it('aventura local (FM) abre como a MESMA carta de bounty', async () => {
    const id = createLocalEntity(
      'Aventura',
      'Caça ao Basilisco',
      aventuraFrontmatter({
        rank: 'A',
        subcategoria: 'Neutralização',
        Titulo: 'Caça ao Basilisco',
        Recompensa: { Marcas: { min: 30, max: 40 }, Ouro: 120 },
        Objetivo: ['Abater o basilisco na caverna de [[Pencas]].'],
        Local: '[[Pencas]]',
        Contato: 'Guilda dos Caçadores',
        disponivel: ['[[Pencas]]'],
      }),
    )
    renderDoc(id)
    expect(await screen.findByText('Caça ao Basilisco')).toBeTruthy()
    expect((document.querySelector('.bounty-rank') as HTMLElement).textContent).toBe('A')
    const rec = document.querySelector('.bounty-recompensa') as HTMLElement
    expect(within(rec).getByText('30 – 40')).toBeTruthy()
    expect(within(rec).getByText('120')).toBeTruthy()
    expect((document.querySelector('.bounty-objetivo') as HTMLElement).textContent).toMatch(/basilisco/)
  })

  it('aventura local aparece na grade da folha junto das da vault (Modo Mestre)', async () => {
    createLocalEntity(
      'Aventura',
      'Caça ao Basilisco',
      aventuraFrontmatter({
        rank: 'A',
        subcategoria: 'Neutralização',
        Titulo: 'Caça ao Basilisco',
        Recompensa: { Ouro: 120 },
        Objetivo: ['Abater o basilisco.'],
      }),
    )
    render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter initialEntries={[compendiumFolderPath('Campanhas/Aventuras')]}>
          <MestreOn />
          <Routes>
            <Route path="/compendio/*" element={<FolderView />} />
          </Routes>
        </MemoryRouter>
      </CatalogProvider>,
    )
    await waitFor(() => expect(document.querySelector('.aventura-grid')).toBeTruthy())
    // a criação local aparece na listagem junto das da vault
    expect(await screen.findByText('Caça ao Basilisco')).toBeTruthy()
    expect(await screen.findByText('Neutralização de Fenda Negra')).toBeTruthy()
  })

  it('botão CRIAR AVENTURA só aparece no Modo Mestre e cria uma aventura local', async () => {
    render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter initialEntries={[compendiumFolderPath('Campanhas/Aventuras')]}>
          <MestreOn />
          <Routes>
            <Route path="/compendio/*" element={<FolderView />} />
          </Routes>
        </MemoryRouter>
      </CatalogProvider>,
    )
    const btn = await screen.findByRole('button', { name: /criar aventura/i })
    fireEvent.click(btn)
    // formulário: título + rank + objetivo
    const titulo = await screen.findByLabelText(/título/i)
    fireEvent.change(titulo, { target: { value: 'Expedição ao Norte' } })
    fireEvent.click(screen.getByRole('button', { name: /^salvar$/i }))
    // a nova aventura entra na grade
    expect(await screen.findByText('Expedição ao Norte')).toBeTruthy()
  })
})
