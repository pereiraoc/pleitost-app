// @vitest-environment jsdom
// Navegação por pastas + heróis/NPCs renderizando sobre o índice REAL da
// vault; fetch stubado lê os JSONs do disco (mesma fonte do dev server).
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { FolderView } from '../src/components/compendium/FolderView'
import { HeroisPage, NpcsPage } from '../src/components/creatures/CreaturesPages'
import { COMPENDIUM_SECTIONS } from '../src/components/compendium/sections'
import { compendiumFolderPath } from '../src/paths'
import { groupMembers } from '../src/grupo/party'
import {
  __resetLocalStoreForTests,
  createLocalEntity,
  emptyHeroFrontmatter,
  setGroupMember,
} from '../src/data/local-entities'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

const readDoc = (id: string): VaultDoc =>
  JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${id}.json`), 'utf8')) as VaultDoc

// Cores por tier — registro partyTierBar dos tokens gerados (expectativa
// escrita por extenso: 1-3 bronze, 4-6 prata, 7-9 ouro, 10+ cristal).
const TIER_COLOR = ['', '#cd7f32', '#94a3b8', '#d4af37', '#8fd3ff']
const tierOfLevel = (n: number) => (n <= 3 ? 1 : n <= 6 ? 2 : n <= 9 ? 3 : 4)

beforeEach(() => __resetLocalStoreForTests())

// req 4 (#181): o painel Heróis lista SÓ personagens DO USUÁRIO (locais).
// Semeia um elenco local com níveis cobrindo os 4 tiers (S/A/B/C).
const ELENCO = [
  { nome: 'Alda', nivel: 10, classe: 'Mago' },
  { nome: 'Bento', nivel: 8, classe: 'Bardo' },
  { nome: 'Cora', nivel: 5, classe: 'Guerreiro' },
  { nome: 'Davi', nivel: 2, classe: 'Animista' },
]
function seedHeroisLocais() {
  for (const h of ELENCO) {
    createLocalEntity('Heroi', h.nome, {
      ...emptyHeroFrontmatter(),
      'Nível': h.nivel,
      Classe: `[[${h.classe}]]`,
    })
  }
}
// '#d4af37' → 'rgb(212, 175, 55)' (forma normalizada do jsdom).
const hexRgb = (hex: string) =>
  `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)})`

beforeAll(() => {
  // serve /vault-data/** do disco, como o dev server faz (objeto plain em vez
  // de Response — o ambiente jsdom não garante o global do node)
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

afterEach(cleanup)

function renderAt(initialPath: string, routes: React.ReactElement) {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>{routes}</Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}

const folderRoutes = (
  <>
    <Route path="/compendio" element={<FolderView />} />
    <Route path="/compendio/*" element={<FolderView />} />
  </>
)

describe('FolderView', () => {
  it('#244: raiz mostra as 4 seções como BOTÕES GRANDES (link cada)', () => {
    renderAt('/compendio', folderRoutes)
    for (const section of COMPENDIUM_SECTIONS) {
      const card = screen
        .getAllByRole('link')
        .find((c) => within(c).queryByText(section) && c.className.includes('sec-card'))
      expect(card, `botão grande da seção ${section}`).toBeDefined()
    }
    // Campanhas/Contexto/Sistema são nós de navegação → "N seções"
    const campanhas = screen
      .getAllByRole('link')
      .find((c) => within(c).queryByText('Campanhas'))!
    expect(within(campanhas).getByText(/2 seções/)).toBeTruthy()
  })

  it('#244: Sistema mostra Criação/Items/Regras; SEM Criaturas na navegação', () => {
    renderAt(compendiumFolderPath('Sistema'), folderRoutes)
    for (const name of ['Criação de Personagem', 'Items', 'Regras']) {
      expect(screen.getByText(name)).toBeTruthy()
    }
    // "Equipamento" é rotulado "Items"; Criaturas não é botão de navegação
    expect(screen.queryByText('Equipamento')).toBeNull()
    expect(screen.queryByText('Criaturas')).toBeNull()
  })

  it('#244: Campanhas e Contexto abrem os filhos como botões grandes', () => {
    renderAt(compendiumFolderPath('Campanhas'), folderRoutes)
    expect(screen.getByText('Aventuras')).toBeTruthy()
    expect(screen.getByText('Combates')).toBeTruthy()
    cleanup()
    renderAt(compendiumFolderPath('Contexto'), folderRoutes)
    expect(screen.getByText('Organizações')).toBeTruthy()
    expect(screen.getByText('Histórias')).toBeTruthy()
  })

  it('#244: Contexto/Histórias mostra Atual e Histórico; Diários oculto', () => {
    renderAt(compendiumFolderPath('Contexto/Histórias'), folderRoutes)
    expect(screen.getByText('Contexto Atual')).toBeTruthy()
    expect(screen.getByText('Contexto Histórico')).toBeTruthy()
    expect(screen.queryByText('Diários')).toBeNull()
  })

  it('portal Criaturas: só Grupos de Criaturas navegável; demais famílias ocultas (#213)', () => {
    renderAt(compendiumFolderPath('Sistema/Criaturas'), folderRoutes)
    expect(screen.getByText('Grupos de Criaturas')).toBeTruthy()
    for (const oculta of ['Heróis', 'Pessoas', 'Bestiário', 'Companheiros Animais']) {
      expect(screen.queryByText(oculta), oculta).toBeNull()
    }
  })

  it('exemplos: pasta Grupos de Criaturas lista os grupos da vault (#213)', () => {
    renderAt(compendiumFolderPath('Sistema/Criaturas/Grupos de Criaturas'), folderRoutes)
    expect(screen.getByRole('link', { name: 'Baitaca, Carlos, Drauzio' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Carlos, Dante, Mera, Pind, Thoren' })).toBeTruthy()
  })

  it('pasta homogênea de Itens vira tabela com colunas dos inline fields', async () => {
    renderAt(
      compendiumFolderPath('Sistema/Equipamento/Armas/Armas Simples/Corpo-a-Corpo Simples'),
      folderRoutes,
    )
    expect(screen.getByRole('columnheader', { name: 'dano' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Adaga' })).toBeTruthy()
    expect((await screen.findAllByText('d4+2')).length).toBeGreaterThan(0)
  })

  it('pasta oculta (sem exceção dentro) responde como não encontrada', () => {
    renderAt(compendiumFolderPath('Sistema/Criaturas/Heróis'), folderRoutes)
    expect(screen.getByText(/não encontrada/)).toBeTruthy()
  })
})

describe('Heróis e NPCs (telas do design com dados reais)', () => {
  it('HERÓIS: um card por herói DO USUÁRIO (locais); vault fica de fora (req 4)', async () => {
    seedHeroisLocais()
    renderAt('/herois', <Route path="/herois" element={<HeroisPage />} />)
    for (const h of ELENCO) {
      expect(screen.getAllByRole('button', { name: new RegExp(h.nome) }).length, h.nome).toBeGreaterThan(0)
    }
    // classe do FM local renderiza
    expect(await screen.findAllByText('Mago')).toBeTruthy()
    // 1 badge NVL por herói local — e NENHUM herói da vault na lista
    expect(screen.getAllByText('NVL').length).toBe(ELENCO.length)
    expect(screen.queryByText(/Carlos Facão/)).toBeNull()
  })

  it('NPCS: abas do design; bestiário com cards; PESSOAS vazio com o texto desenhado', async () => {
    renderAt('/npcs', <Route path="/npcs" element={<NpcsPage />} />)
    for (const label of ['PESSOAS', 'COMPANHEIROS ANIMAIS', 'BESTIÁRIO']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy()
    }
    // cards do bestiário (subtítulo composto de Raça/Classe reais)
    expect(await screen.findAllByText(/Goblin \(Pequeno\)/)).toBeTruthy()
    // aba sem pasta na vault mostra o empty state verbatim do design
    expect(screen.getByText('// NENHUM REGISTRO NESTA CATEGORIA')).toBeTruthy()
    // heróis não aparecem em NPCS
    expect(screen.queryByText('Adriann')).toBeNull()
  })
})

// ── Issues #16-#19: cores por tier/rank nos cards (registros dos tokens) ──

// Cores do rank — registro partyBountyRank (expectativa por extenso:
// C/T1 bronze, B/T2 prata, A/T3 ouro, S/T4 cristal, D cinza).
const RANK_COLOR: Record<string, string> = {
  S: '#8fd3ff',
  A: '#d4af37',
  B: '#94a3b8',
  C: '#cd7f32',
  D: '#6b7280',
}

const docsOfFolder = (folder: string) => {
  const node = catalog.folderByPath.get(folder)!
  return node.docs.filter((d) => d.basename !== node.name)
}

describe('cores por tier/rank nos cards (dados reais)', () => {
  it('#17: badge NVL do herói colorida pelo tier do nível', async () => {
    seedHeroisLocais()
    const { container } = renderAt('/herois', <Route path="/herois" element={<HeroisPage />} />)
    await screen.findAllByText('Mago') // docs carregados
    for (const h of ELENCO) {
      const card = [...container.querySelectorAll<HTMLElement>('.hero-card')].find((c) =>
        within(c).queryByText(h.nome),
      )!
      expect(card, h.nome).toBeTruthy()
      const cor = hexRgb(TIER_COLOR[tierOfLevel(h.nivel)])
      const badge = card.querySelector<HTMLElement>('.hero-nvl')!
      const num = card.querySelector<HTMLElement>('.hero-nvl-num')!
      await waitFor(() => expect(num.textContent).toBe(String(h.nivel)))
      expect(num.style.color, h.nome).toBe(cor)
      expect(badge.style.borderColor, h.nome).toBe(cor)
    }
  })

  it('#16/#213: GRUPOS lista só grupos do usuário; card local com rank/imagem do registro', async () => {
    // #213: grupos da vault são EXEMPLOS do compêndio e NÃO entram na aba
    // GRUPOS; o card (rank box + imagem por Retratos/<nome>) é validado num
    // grupo LOCAL — o grupo homônimo herda o retrato real da vault.
    const gid = createLocalEntity('Grupo', 'Carlos, Dante, Mera, Pind, Thoren', {
      categoria: 'Grupo',
      subcategoria: 'Aventureiros',
    })
    // integrantes reais da vault via membership (mesma API do editor do grupo)
    setGroupMember(gid, 'Sistema/Criaturas/Heróis/Carlos Facão de Andradas', true, [])
    setGroupMember(gid, 'Sistema/Criaturas/Heróis/Mera', true, [])
    createLocalEntity('Grupo', 'Sem Retrato', { categoria: 'Grupo', subcategoria: 'Aventureiros' })

    const { container } = renderAt('/herois', <Route path="/herois" element={<HeroisPage />} />)
    fireEvent.click(screen.getByRole('button', { name: 'GRUPOS' }))

    // nenhum grupo da vault na lista
    for (const group of docsOfFolder('Sistema/Criaturas/Grupos de Criaturas')) {
      if (group.basename === 'Carlos, Dante, Mera, Pind, Thoren') continue // homônimo local
      expect(screen.queryByText(group.basename!), group.id).toBeNull()
    }

    // card do grupo local: rank pelo tier máximo dos integrantes (Mera nv 7 → A)
    const card = [...container.querySelectorAll<HTMLElement>('.hero-card')].find((c) =>
      within(c).queryByText('Carlos, Dante, Mera, Pind, Thoren'),
    )!
    expect(card).toBeTruthy()
    const rankBox = card.querySelector<HTMLElement>('.grupo-rank')!
    await waitFor(() => expect(rankBox.textContent).toBe('A'))
    expect(rankBox.style.color).toBe(hexRgb(RANK_COLOR['A']))
    expect(rankBox.getAttribute('style')).toContain('box-shadow: 0 2px 8px')
    // imagem por Retratos/<basename> (asset real da vault, mesmo p/ grupo local)
    await waitFor(() => expect(card.querySelector('.hero-portrait')).toBeTruthy())
    expect(
      decodeURIComponent(card.querySelector<HTMLElement>('.hero-portrait')!.style.backgroundImage),
    ).toContain('Retratos/Carlos, Dante, Mera, Pind, Thoren.png')
    // sem retrato → fallback ⚔️
    const semRetrato = [...container.querySelectorAll<HTMLElement>('.hero-card')].find((c) =>
      within(c).queryByText('Sem Retrato'),
    )!
    expect(within(semRetrato).getByText('⚔️')).toBeTruthy()
  })

  it('#19: bestiário mostra TIER do FM (não nível) com a cor do registro', async () => {
    const { container } = renderAt('/npcs', <Route path="/npcs" element={<NpcsPage />} />)
    await screen.findAllByText(/Goblin \(Pequeno\)/)
    const bestPanel = container.querySelectorAll<HTMLElement>('[data-panel]')[2]
    // nenhum losango NVL na aba — todos viram TIER
    expect(within(bestPanel).queryByText('NVL')).toBeNull()
    for (const entry of docsOfFolder('Sistema/Criaturas/Bestiário')) {
      const tier = Number(readDoc(entry.id).frontmatter['Tier'])
      const card = [...bestPanel.querySelectorAll<HTMLElement>('.npc-card')].find((c) =>
        within(c).queryByText(entry.basename!),
      )!
      expect(card, entry.id).toBeTruthy()
      expect(within(card).getByText('TIER')).toBeTruthy()
      const num = card.querySelector<HTMLElement>('.npc-nvl-num')!
      expect(num.textContent, entry.id).toBe(String(tier))
      // Tier 0 usa o registro tier.Zero do plugin; 1+ segue partyTierBar
      const cor = hexRgb(tier <= 0 ? '#111111' : TIER_COLOR[tier])
      expect(num.style.color, entry.id).toBe(cor)
      expect(card.querySelector<HTMLElement>('.npc-nvl-diamond')!.style.borderColor).toBe(cor)
    }
  })

  it('#18: companheiro animal usa NVL com a cor do tier (como heróis)', async () => {
    const { container } = renderAt('/npcs', <Route path="/npcs" element={<NpcsPage />} />)
    await screen.findAllByText(/Goblin \(Pequeno\)/)
    const caPanel = container.querySelectorAll<HTMLElement>('[data-panel]')[1]
    for (const entry of docsOfFolder('Sistema/Criaturas/Companheiros Animais')) {
      const nivel = Number(readDoc(entry.id).frontmatter['Nível'])
      const card = [...caPanel.querySelectorAll<HTMLElement>('.npc-card')].find((c) =>
        within(c).queryByText(entry.basename!),
      )!
      expect(card, entry.id).toBeTruthy()
      expect(within(card).getByText('NVL')).toBeTruthy()
      const num = card.querySelector<HTMLElement>('.npc-nvl-num')!
      await waitFor(() => expect(num.textContent).toBe(String(nivel)))
      const cor = hexRgb(TIER_COLOR[tierOfLevel(nivel)])
      expect(num.style.color, entry.id).toBe(cor)
      expect(card.querySelector<HTMLElement>('.npc-nvl-diamond')!.style.borderColor).toBe(cor)
    }
  })
})

// ── Issue #31: listas agrupadas por tier decrescente (S→C), alfabético dentro ──

// Letra do grupo escrita por extenso (fallbackRankLetterFromTier do plugin,
// tiers-display.ts: 4+ → S, 3 → A, 2 → B, resto → C).
const letterOfTier = (t: number) => (t >= 4 ? 'S' : t === 3 ? 'A' : t === 2 ? 'B' : 'C')
const GROUP_ORDER = ['S', 'A', 'B', 'C']
const ptAlpha = new Intl.Collator('pt')

/** Expectativa independente varrendo os FMs crus da pasta: grupos em ordem
 *  decrescente, nomes alfabéticos (pt) dentro, sem grupo vazio. */
function expectedGroups(folder: string, tierOfFm: (fm: Record<string, unknown>) => number) {
  const byLetter = new Map<string, string[]>()
  for (const entry of docsOfFolder(folder)) {
    const letter = letterOfTier(tierOfFm(readDoc(entry.id).frontmatter))
    byLetter.set(letter, [...(byLetter.get(letter) ?? []), entry.basename!])
  }
  return GROUP_ORDER.filter((l) => byLetter.has(l)).map((letter) => ({
    letter,
    names: byLetter.get(letter)!.sort((a, b) => ptAlpha.compare(a, b)),
  }))
}

/** Lê os grupos renderizados em ordem de documento: cada kicker `// TIER X`
 *  abre um grupo; os cards seguintes pertencem a ele. */
function renderedGroups(panel: HTMLElement, cardSel: string, nameSel: string) {
  const groups: { letter: string; names: string[] }[] = []
  for (const el of panel.querySelectorAll<HTMLElement>(`.kicker, ${cardSel}`)) {
    if (el.classList.contains('kicker')) {
      const m = /^\/\/ TIER ([SABC])$/.exec(el.textContent ?? '')
      expect(m, `kicker fora do formato: "${el.textContent}"`).toBeTruthy()
      // letra do kicker colorida pelo registro partyBountyRank
      const span = el.querySelector<HTMLElement>('span')!
      expect(span.style.color).toBe(hexRgb(RANK_COLOR[m![1]]))
      groups.push({ letter: m![1], names: [] })
    } else {
      expect(groups.length, 'card antes do primeiro kicker').toBeGreaterThan(0)
      groups[groups.length - 1].names.push(el.querySelector<HTMLElement>(nameSel)!.textContent!)
    }
  }
  return groups
}

describe('#31: agrupamento por tier decrescente nas listas', () => {
  it('HERÓIS: grupos S→C do Nível (tierFromLevel), alfabético pt dentro', async () => {
    seedHeroisLocais()
    const { container } = renderAt('/herois', <Route path="/herois" element={<HeroisPage />} />)
    await screen.findAllByText('Mago') // docs carregados → agrupamento ligado
    // elenco local cobre os 4 tiers: 10→S, 8→A, 5→B, 2→C (1 nome cada)
    const LETTER: Record<number, string> = { 4: 'S', 3: 'A', 2: 'B', 1: 'C' }
    const expected = [...ELENCO]
      .sort((a, b) => tierOfLevel(b.nivel) - tierOfLevel(a.nivel))
      .map((h) => ({ letter: LETTER[tierOfLevel(h.nivel)], names: [h.nome] }))
    const panel = container.querySelector<HTMLElement>('.herois-page')!
    expect(renderedGroups(panel, '.hero-card', '.hero-nome')).toEqual(expected)
  })

  it('COMPANHEIROS ANIMAIS: grupos pelo tier do Nível, como heróis', async () => {
    const { container } = renderAt('/npcs', <Route path="/npcs" element={<NpcsPage />} />)
    const caPanel = container.querySelectorAll<HTMLElement>('[data-panel]')[1]
    await waitFor(() => expect(caPanel.querySelector('.kicker')).toBeTruthy())
    const expected = expectedGroups('Sistema/Criaturas/Companheiros Animais', (fm) =>
      tierOfLevel(Number(fm['Nível']) || 1),
    )
    expect(renderedGroups(caPanel, '.npc-card', '.npc-nome')).toEqual(expected)
  })

  it('BESTIÁRIO: grupos pelo FM Tier direto (não nível), decrescente', async () => {
    const { container } = renderAt('/npcs', <Route path="/npcs" element={<NpcsPage />} />)
    await screen.findAllByText(/Goblin \(Pequeno\)/)
    const bestPanel = container.querySelectorAll<HTMLElement>('[data-panel]')[2]
    const expected = expectedGroups('Sistema/Criaturas/Bestiário', (fm) => Number(fm['Tier']))
    // sanidade da fixture: mais de um grupo (Tier 2 → B; Tier 0/1 → C)
    expect(expected.length).toBeGreaterThan(1)
    expect(renderedGroups(bestPanel, '.npc-card', '.npc-nome')).toEqual(expected)
  })

  it('PESSOAS (fora da issue) segue sem kicker, com o empty state desenhado', async () => {
    const { container } = renderAt('/npcs', <Route path="/npcs" element={<NpcsPage />} />)
    await screen.findAllByText(/Goblin \(Pequeno\)/)
    const pessoasPanel = container.querySelectorAll<HTMLElement>('[data-panel]')[0]
    expect(pessoasPanel.querySelector('.kicker')).toBeNull()
    expect(within(pessoasPanel).getByText('// NENHUM REGISTRO NESTA CATEGORIA')).toBeTruthy()
  })
})
