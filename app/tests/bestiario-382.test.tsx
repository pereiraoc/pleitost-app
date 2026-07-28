// @vitest-environment jsdom
// #382: "A parte de criação de monstros ainda tá muito errada. Não tô
// conseguindo selecionar se é competente, elite ou solo (olha no
// pleitost-autosheet). Não tô conseguindo ver a lista completa de magias
// quando tô tentando editar tipo nas não aprendidas. Não tá aparecendo parte
// de escudo e armadura."
//
// Três entregas (paridade com o plugin pleitost-autosheet):
//  1. Seletor de MODIFICADOR (Normal/Competente/Elite/Solo) na ficha do
//     Monstro — pills do perfil do Monstro no plugin (render/groups/
//     perfil-card.ts:174-199). Opções vêm das NOTAS da vault
//     (Sistema/Regras/Bestiário/Modificadores/) filtradas pelo vocabulário
//     do parseModificador (frontmatter-helpers.ts:195 do plugin) — "Evolução
//     Básica de Monstro" fica de fora por não ser um valor selecionável.
//     O select SÓ grava o FM: a cascata (collectSeeds já semeia o
//     Modificador + Competente implícito) aplica as regras das notas.
//  2. Magias NÃO APRENDIDAS completas pro Monstro — o plugin dá slots
//     ILIMITADOS ao monstro (tabs/monstro/tab-completa.ts:281
//     "unlimitedSlots: true"; view-model.ts:657-668: canAdd = proficiência
//     da escola cobre o rank, sem gate de slot). O app gateava por
//     `Magias.Slots` > 0 — monstro tem tudo 0 → lista vazia.
//  3. Seção de ARMADURA e ESCUDO na ficha do Monstro — o plugin renderiza
//     Armas+Escudo editáveis no card de Combate do Monstro (tabs/monstro/
//     tab-completa.ts:234-254, inventarioCard variant "combate-equip") e
//     trata Heroi/Monstro igual nas categorias de armadura (interativa/
//     panel/sections/defesa.ts:56-64). O caps escondia os pickers.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { FichaPage } from '../src/components/ficha/FichaPage'
import { heroPath } from '../src/paths'
import { FICHA_FAMILIA } from '../src/data/familia'
import { __resetLocalStoreForTests } from '../src/data/local-entities'
import { __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
import { projectHeroRules } from '../src/rules/useHeroRules'
import { loadDoc } from '../src/data/useDoc'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

// Batedor Tier 0 (classe define Vida.Vitalidade 21) — base da entrega 1/3.
const GOBLIN_ID = 'Sistema/Criaturas/Bestiário/Goblin Batedor'
// Piromante: Anima prof A + Magias.Slots tudo 0 — o cenário exato do report
// na entrega 2 (a lista de não-aprendidas vinha vazia).
const PIROMANTE_ID = 'Sistema/Criaturas/Bestiário/Goblin Piromante'
const goblin = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, `${GOBLIN_ID}.json`), 'utf8'),
) as VaultDoc

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

function renderFicha(id: string, tab?: string) {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={[heroPath(id, tab)]}>
        <Routes>
          <Route path="/heroi/*" element={<FichaPage />} />
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}

describe('#382 (1) — seletor de Modificador (Competente/Elite/Solo/Normal)', () => {
  it('caps: só a família Monstro tem o seletor (delta central, não vaza)', () => {
    expect(FICHA_FAMILIA.Monstro.modificador).toBe(true)
    expect(FICHA_FAMILIA.Heroi.modificador).toBe(false)
    expect(FICHA_FAMILIA.CompanheiroAnimal.modificador).toBe(false)
  })

  it('projeção do Monstro oferece os Modificadores das NOTAS da vault (sem "Evolução Básica de Monstro")', async () => {
    const { projection } = await projectHeroRules(
      goblin.frontmatter as never,
      catalog,
      loadDoc,
    )
    // Fonte de verdade: vault-data/Sistema/Regras/Bestiário/Modificadores/
    // ∩ vocabulário aceito pelo parseModificador (paridade com o plugin).
    expect(projection.modificadores.map((o) => o.label).sort()).toEqual([
      'Competente',
      'Elite',
      'Solo',
    ])
    expect(projection.modificadores.map((o) => o.label)).not.toContain(
      'Evolução Básica de Monstro',
    )
  }, 30000)

  it('FM com Modificador Elite: a CASCATA das notas aplica (Vitalidade ×2 + Competente implícito) — nada reimplementado', async () => {
    const fmElite = { ...(goblin.frontmatter as Record<string, unknown>), Modificador: 'Elite' }
    const { projection } = await projectHeroRules(fmElite as never, catalog, loadDoc)
    // Batedor Tier 0 define Vida.Vitalidade 21 (nota da classe); Elite
    // "Multiplicar Vida.Vitalidade 2" (nota do Modificador) → 42 no derivado.
    const vida = (projection.derivedFm['Vida'] ?? {}) as Record<string, unknown>
    expect(Number(vida['Vitalidade'])).toBe(42)
    // Elite implica Competente (Complementar Habilidades.Lista [[Competente]]).
    const habs = JSON.stringify(projection.calculated['Habilidades.Lista'] ?? [])
    expect(habs).toContain('[[Competente]]')
  }, 30000)

  // #394: o modificador é escolhido por BOTÕES/pills (paridade com as pills
  // COMPETENTE/ELITE/SOLO do perfil-card.ts:174-199 do plugin), não por select.
  it('ficha do monstro: BOTÕES de Modificador (Competente/Elite/Solo) togglam e gravam o FM', async () => {
    renderFicha(GOBLIN_ID)
    fireEvent.click(await screen.findByTitle('Classe e subclasses'))
    // três pills, uma por modificador (fonte: notas da vault via projeção)
    const btnCompetente = await screen.findByRole('button', { name: 'Competente' }, { timeout: 20000 })
    const btnElite = screen.getByRole('button', { name: 'Elite' })
    const btnSolo = screen.getByRole('button', { name: 'Solo' })
    expect(btnCompetente).toBeTruthy()
    expect(btnElite).toBeTruthy()
    expect(btnSolo).toBeTruthy()
    // NENHUM ativo de início (monstro sem Modificador = Normal)
    expect(btnElite.getAttribute('aria-pressed')).toBe('false')
    // clicar em Elite ativa (aria-pressed) e grava o FM
    fireEvent.click(btnElite)
    await waitFor(() => expect(btnElite.getAttribute('aria-pressed')).toBe('true'))
    // toggle: clicar de novo no ATIVO desliga (volta a Normal/null)
    fireEvent.click(btnElite)
    await waitFor(() => expect(btnElite.getAttribute('aria-pressed')).toBe('false'))
  }, 30000)
})

describe('#382 (2) — lista COMPLETA de magias nas não aprendidas do Monstro', () => {
  it('caps: Monstro tem magias ilimitadas (unlimitedSlots do plugin); Heroi/CA não', () => {
    expect(FICHA_FAMILIA.Monstro.magiasIlimitadas).toBe(true)
    expect(FICHA_FAMILIA.Heroi.magiasIlimitadas).toBe(false)
    expect(FICHA_FAMILIA.CompanheiroAnimal.magiasIlimitadas).toBe(false)
  })

  it('Piromante (Anima A, Slots 0): não-aprendidas oferece TODAS as Anima até o rank da proficiência', async () => {
    renderFicha(PIROMANTE_ID, 'habilidades')
    // Card "Magias" (primário) → Alterar abre o painel de não-aprendidas.
    const aprendidasHdr = await screen.findByText('📖 Magias Aprendidas', undefined, {
      timeout: 20000,
    })
    let panel: HTMLElement | null = aprendidasHdr.parentElement
    while (panel && !within(panel).queryByText('✎ Alterar')) panel = panel.parentElement
    expect(panel).toBeTruthy()
    fireEvent.click(within(panel!).getByText('✎ Alterar'))
    await screen.findByText('📚 Magias Não Aprendidas')
    // Básica (Corte de Vento) e Adepta (Barreira de Pedra) aparecem e o +
    // está HABILITADO (slots ilimitados do Monstro) — antes a lista vinha
    // VAZIA porque Magias.Slots é tudo 0 no monstro.
    const addBasica = (await screen.findByLabelText('Aprender Corte de Vento', undefined, {
      timeout: 20000,
    })) as HTMLButtonElement
    expect(addBasica.disabled).toBe(false)
    const addAdepta = screen.getByLabelText('Aprender Barreira de Pedra') as HTMLButtonElement
    expect(addAdepta.disabled).toBe(false)
    // Proficiência A NÃO cobre Experiente — o gate por rank da escola segue
    // (isAllowed do view-model.ts:619-634 do plugin).
    expect(screen.queryByLabelText('Aprender Bola de Fogo')).toBeNull()
  }, 40000)

  it('aprender grava na lista salva (source Slot.<rank>, paridade com apply-magias-edit do plugin)', async () => {
    renderFicha(PIROMANTE_ID, 'habilidades')
    const aprendidasHdr = await screen.findByText('📖 Magias Aprendidas', undefined, {
      timeout: 20000,
    })
    let panel: HTMLElement | null = aprendidasHdr.parentElement
    while (panel && !within(panel).queryByText('✎ Alterar')) panel = panel.parentElement
    fireEvent.click(within(panel!).getByText('✎ Alterar'))
    const add = (await screen.findByLabelText('Aprender Corte de Vento', undefined, {
      timeout: 20000,
    })) as HTMLButtonElement
    fireEvent.click(add)
    // A magia sai das não-aprendidas (agora consta na lista salva)…
    await waitFor(() => expect(screen.queryByLabelText('Aprender Corte de Vento')).toBeNull())
    // …e pode ser removida (− só nas slot-learned) — prova que entrou com
    // fonte Slot.<rank>, não Regra.
    expect(screen.getByLabelText('Remover Corte de Vento')).toBeTruthy()
  }, 40000)
})

describe('#382 (3) — seção de ESCUDO e ARMADURA na ficha do Monstro', () => {
  it('caps: Monstro ganha os pickers de armadura/escudo; card de proficiências segue só no Heroi', () => {
    expect(FICHA_FAMILIA.Monstro.equipamentos).toBe(true)
    expect(FICHA_FAMILIA.Heroi.equipamentos).toBe(true)
    expect(FICHA_FAMILIA.CompanheiroAnimal.equipamentos).toBe(false)
    expect(FICHA_FAMILIA.Heroi.profEquipamentos).toBe(true)
    expect(FICHA_FAMILIA.Monstro.profEquipamentos).toBe(false)
    expect(FICHA_FAMILIA.CompanheiroAnimal.profEquipamentos).toBe(false)
  })

  it('inventário do monstro mostra ARMADURA e ESCUDO editáveis (bases reais da vault)', async () => {
    renderFicha(GOBLIN_ID, 'inventario')
    const armadura = (await screen.findByLabelText('ARMADURA')) as HTMLSelectElement
    const escudo = screen.getByLabelText('ESCUDO') as HTMLSelectElement
    // Bases reais (armaduraBases/escudoBases — docs da vault, nunca hardcode).
    expect(armadura.options.length).toBeGreaterThan(1)
    expect(escudo.options.length).toBeGreaterThan(1)
  }, 30000)
})
