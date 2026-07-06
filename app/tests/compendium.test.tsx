// @vitest-environment jsdom
// Navegação por pastas + heróis/NPCs renderizando sobre o índice REAL da
// vault; fetch stubado lê os JSONs do disco (mesma fonte do dev server).
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { FolderView } from '../src/components/compendium/FolderView'
import { HeroisPage, NpcsPage } from '../src/components/creatures/CreaturesPages'
import { COMPENDIUM_SECTIONS, visibleCount } from '../src/components/compendium/sections'
import { compendiumFolderPath } from '../src/paths'
import { groupMembers } from '../src/grupo/party'
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
  it('raiz mostra as seções registradas com contagens visíveis', () => {
    renderAt('/compendio', folderRoutes)
    for (const section of COMPENDIUM_SECTIONS) {
      const node = catalog.folderByPath.get(section)!
      const card = screen
        .getAllByRole('link')
        .find((c) => within(c).queryByText(section))
      expect(card, `card da seção ${section}`).toBeDefined()
      expect(within(card!).getByText(String(visibleCount(node)))).toBeTruthy()
    }
  })

  it('Sistema mostra subpastas mas esconde Criaturas', () => {
    renderAt(compendiumFolderPath('Sistema'), folderRoutes)
    for (const name of ['Criação de Personagem', 'Equipamento', 'Regras']) {
      expect(screen.getByText(name)).toBeTruthy()
    }
    expect(screen.queryByText('Criaturas')).toBeNull()
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

  it('pasta oculta responde como não encontrada', () => {
    renderAt(compendiumFolderPath('Sistema/Criaturas'), folderRoutes)
    expect(screen.getByText(/não encontrada/)).toBeTruthy()
  })
})

describe('Heróis e NPCs (telas do design com dados reais)', () => {
  it('HERÓIS: um card desenhado por herói, com Classe do frontmatter', async () => {
    renderAt('/herois', <Route path="/herois" element={<HeroisPage />} />)
    const herois = catalog.folderByPath
      .get('Sistema/Criaturas/Heróis')!
      .docs.filter((d) => d.basename !== 'Heróis')
    for (const entry of herois) {
      // card do design é um button com nome + classe + NVL
      expect(
        screen.getAllByRole('button', { name: new RegExp(entry.basename!.slice(0, 6)) }).length,
        entry.id,
      ).toBeGreaterThan(0)
    }
    // classe alias do FM real (Adriann → Mago) aparece após o load
    expect(await screen.findAllByText('Mago')).toBeTruthy()
    expect(screen.getAllByText('NVL').length).toBe(herois.length)
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
    const { container } = renderAt('/herois', <Route path="/herois" element={<HeroisPage />} />)
    await screen.findAllByText('Mago') // docs carregados
    for (const entry of docsOfFolder('Sistema/Criaturas/Heróis')) {
      const nivel = Number(readDoc(entry.id).frontmatter['Nível'])
      if (!Number.isFinite(nivel)) continue
      const card = [...container.querySelectorAll<HTMLElement>('.hero-card')].find((c) =>
        within(c).queryByText(entry.basename!),
      )!
      expect(card, entry.id).toBeTruthy()
      const cor = hexRgb(TIER_COLOR[tierOfLevel(nivel)])
      const badge = card.querySelector<HTMLElement>('.hero-nvl')!
      const num = card.querySelector<HTMLElement>('.hero-nvl-num')!
      await waitFor(() => expect(num.textContent).toBe(String(nivel)))
      expect(num.style.color, entry.id).toBe(cor)
      expect(badge.style.borderColor, entry.id).toBe(cor)
    }
  })

  it('#16: card de grupo com imagem (Retratos/<grupo>) e rank box do registro', async () => {
    const { container } = renderAt('/herois', <Route path="/herois" element={<HeroisPage />} />)
    fireEvent.click(screen.getByRole('button', { name: 'GRUPOS' }))
    const groups = docsOfFolder('Sistema/Criaturas/Grupos de Criaturas')
    expect(groups.length).toBeGreaterThan(0)
    for (const group of groups) {
      // expectativa independente: rank do FM cru, senão do tier máximo
      const gfm = readDoc(group.id).frontmatter as Record<string, unknown>
      const tiers = groupMembers(catalog, group.id).map((m) => {
        const n = Number(readDoc(m.id).frontmatter['Nível']) || 1
        return tierOfLevel(n)
      })
      const maxTier = tiers.length ? Math.max(...tiers) : 1
      const raw = gfm['rank'] ?? gfm['Rank'] ?? gfm['classe'] ?? gfm['Classe']
      const m = raw != null && raw !== '' ? /[SABCD]/.exec(String(raw).trim().toUpperCase()) : null
      const letter = m
        ? m[0]
        : maxTier >= 4
          ? 'S'
          : maxTier === 3
            ? 'A'
            : maxTier === 2
              ? 'B'
              : 'C'
      const card = [...container.querySelectorAll<HTMLElement>('.hero-card')].find((c) =>
        within(c).queryByText(group.basename!),
      )!
      expect(card, group.id).toBeTruthy()
      const rankBox = card.querySelector<HTMLElement>('.grupo-rank')!
      await waitFor(() => expect(rankBox.textContent).toBe(letter))
      expect(rankBox.style.color, group.id).toBe(hexRgb(RANK_COLOR[letter]))
      expect(rankBox.style.borderColor, group.id).toBe(hexRgb(RANK_COLOR[letter]))
      expect(rankBox.getAttribute('style'), group.id).toContain('box-shadow: 0 2px 8px')
      // imagem: Retratos/<basename do grupo> quando existe; senão ⚔️
      const portrait = card.querySelector<HTMLElement>('.hero-portrait')
      if (group.basename === 'Carlos, Dante, Mera, Pind, Thoren') {
        await waitFor(() => expect(card.querySelector('.hero-portrait')).toBeTruthy())
        expect(
          decodeURIComponent(card.querySelector<HTMLElement>('.hero-portrait')!.style.backgroundImage),
        ).toContain(`Retratos/${group.basename}.png`)
      } else if (group.basename === 'Baitaca, Carlos, Drauzio') {
        expect(portrait).toBeNull()
        expect(within(card).getByText('⚔️')).toBeTruthy()
      }
    }
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
    const { container } = renderAt('/herois', <Route path="/herois" element={<HeroisPage />} />)
    await screen.findAllByText('Mago') // docs carregados → agrupamento ligado
    const expected = expectedGroups('Sistema/Criaturas/Heróis', (fm) =>
      tierOfLevel(Number(fm['Nível']) || 1),
    )
    // sanidade da fixture: mais de um grupo e nenhum vazio
    expect(expected.length).toBeGreaterThan(1)
    for (const g of expected) expect(g.names.length).toBeGreaterThan(0)
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
