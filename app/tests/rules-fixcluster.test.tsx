// @vitest-environment jsdom
// CLUSTER #58/#59/#60/#61/#62/#64: aplicar as regras da classe AO VIVO no
// derivedFm e as abas lerem o derivedFm numa ficha NOVA (emptyHero + Classe
// Bardo). Harness padrão do repo: catálogo dos dados REAIS da vault, fetch
// stubado do disco, entidade LOCAL criada no store. Expectativas vêm dos rule
// elements REAIS do Bardo (Sistema/Criação de Personagem/Classes/Bardo.md):
//   Definir Vida.Vitalidade 12 / Vida.Moral 24; Definir+Escolher
//   Atributos.Principal PRE; Somar Pericias.Slots.A 3; Definir
//   Oficios.Lista.Atuacao.Proficiencia A; habilidades → Arcana Negra prof A + slots.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { FichaPage } from '../src/components/ficha/FichaPage'
import { projectHeroRules } from '../src/rules/useHeroRules'
import { applyPericiaRankEdit } from '../src/rules/apply-pericia-rank-edit'
import { addMagiaToEscola, removeMagiaFromEscola } from '../src/rules/apply-magia-edit'
import {
  __resetLocalStoreForTests,
  createLocalEntity,
  emptyHeroFrontmatter,
  getLocalDoc,
} from '../src/data/local-entities'
import { __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
import { heroPath } from '../src/paths'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest
const catalog = buildCatalog(manifest)
const loadFromDisk = async (id: string): Promise<VaultDoc> =>
  JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${id}.json`), 'utf8')) as VaultDoc

function makeStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() { return data.size },
    clear: () => data.clear(),
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    key: (i: number) => [...data.keys()][i] ?? null,
    removeItem: (k: string) => void data.delete(k),
    setItem: (k: string, v: string) => void data.set(k, String(v)),
  }
}

beforeAll(() => {
  if (!window.localStorage) Object.defineProperty(window, 'localStorage', { value: makeStorage(), configurable: true })
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

function makeBardo(nivel = 1): string {
  const fm = emptyHeroFrontmatter()
  fm['Classe'] = '[[Bardo]]'
  fm['Nível'] = nivel
  return createLocalEntity('Heroi', 'Bardo Teste', fm)
}
function bardoFm(nivel = 1): Record<string, unknown> {
  const fm = emptyHeroFrontmatter()
  fm['Classe'] = '[[Bardo]]'
  fm['Nível'] = nivel
  return fm
}
function renderFicha(id: string, tab?: string) {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={[heroPath(id, tab)]}>
        <Routes><Route path="/heroi/*" element={<FichaPage />} /></Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}
const optionValues = (s: HTMLSelectElement) => [...s.options].map((o) => o.value)

// ─────────────────────────── #58 Atributo Principal ───────────────────────────

describe('#58 — Atributo Principal (Bardo → PRE) ao vivo no derivedFm', () => {
  it('projeção: derivedFm.Atributos.Principal = PRE e o rank 3 é PRE (principal)', async () => {
    const { projection } = await projectHeroRules(bardoFm(), catalog, loadFromDisk)
    const dfm = projection.derivedFm as Record<string, any>
    expect(dfm.Atributos.Principal).toBe('PRE')
    expect(dfm.Atributos.PRE).toBe(3)
    const cell3 = projection.atributos.find((c) => c.rank === 3)!
    expect(cell3.current).toBe('PRE')
    expect(cell3.isPrincipal).toBe(true)
    expect(cell3.options).toEqual(['PRE']) // restrição do Escolher → só PRE
  })

  it('render: rank 3 mostra PRE (sem select, é display); rank 2 é editável', async () => {
    const id = makeBardo()
    renderFicha(id, 'habilidades')
    const rank2 = (await screen.findByLabelText('Atributo rank 2')) as HTMLSelectElement
    await waitFor(() => expect(rank2.options.length).toBeGreaterThanOrEqual(2))
    // rank 3 (PRE) é display fixo — não vira select
    expect(screen.queryByLabelText('Atributo rank 3')).toBeNull()
    // a célula do principal renderiza "PRE"
    expect(screen.getAllByText('PRE').length).toBeGreaterThan(0)
  })
})

// ─────────────────────────── #64 Vida no COMBATE ───────────────────────────

describe('#64 — Vida da classe no COMBATE (max do derivedFm)', () => {
  it('projeção: derivedFm.Vida = 12/24 (Definir Vida.* do Bardo)', async () => {
    const { projection } = await projectHeroRules(bardoFm(), catalog, loadFromDisk)
    const dfm = projection.derivedFm as Record<string, any>
    expect(dfm.Vida.Vitalidade).toBe(12)
    expect(dfm.Vida.Moral).toBe(24)
  })

  it('render: a barra de vida mostra os máximos 12 e 24 (não 0)', async () => {
    const id = makeBardo()
    renderFicha(id, 'combate')
    await waitFor(() => expect(screen.getAllByText('VITALIDADE').length).toBeGreaterThan(0))
    await waitFor(() => {
      const txt = document.body.textContent ?? ''
      expect(/VITALIDADE\s*\d+\s*\/\s*12/.test(txt)).toBe(true)
      expect(/MORAL\s*\d+\s*\/\s*24/.test(txt)).toBe(true)
    })
  })
})

// ─────────────────────────── #60 Ofício do Passado ───────────────────────────

describe('#60 — Ofício do Passado segura a seleção (biografia e competências)', () => {
  it.each(['perfil', 'habilidades'])('em %s: pick Oficio persiste como {A: Passado}', async (tab) => {
    const id = makeBardo()
    renderFicha(id, tab)
    const sel = (await screen.findByLabelText('OFÍCIO')) as HTMLSelectElement
    await waitFor(() => expect(sel.options.length).toBeGreaterThan(1))
    // Atuacao é coberto por regra (Bardo: Definir Oficios.Lista.Atuacao.Proficiencia A)
    // → só 'Oficio' é ofertado (coveredOficios bloqueia Atuacao).
    expect(optionValues(sel)).toEqual(['', 'Oficio'])
    fireEvent.change(sel, { target: { value: 'Oficio' } })
    const oficio = ((getLocalDoc(id)?.frontmatter as any)?.Oficios?.Lista as any[]).find((r) => r.Nome === 'Oficio')
    expect(oficio.Incrementos).toContainEqual({ A: 'Passado' })
    const selAfter = (await screen.findByLabelText('OFÍCIO')) as HTMLSelectElement
    expect(selAfter.value).toBe('Oficio')
  })
})

// ─────────────────────────── #61 Perícias: gastar slot ───────────────────────────

describe('#61 — Perícias: gastar Slot pra subir rank (semântica de piso)', () => {
  it('unit: sobe rank gastando Slot; respeita o piso de regra e desce até ele', () => {
    const saved = [{ Nome: 'Atletismo', Atributo: 'FOR', Proficiencia: 'N', Incrementos: [] as any[] }]
    // sem piso (nenhuma regra): clicar A → {A: Slot.A}, prof A
    let out = applyPericiaRankEdit(saved, [], 'Atletismo', 'A')
    expect(out[0].Incrementos).toEqual([{ A: 'Slot.A' }])
    expect(out[0].Proficiencia).toBe('A')
    // clicar N remove o slot → volta a N
    out = applyPericiaRankEdit(out, [], 'Atletismo', 'N')
    expect(out[0].Incrementos).toEqual([])
    expect(out[0].Proficiencia).toBe('N')
    // com piso de REGRA em A (derivada tem {A: Regra.[[X]]}): clicar E gasta só Slot.E
    out = applyPericiaRankEdit(saved, [{ A: 'Regra.[[X]]' }], 'Atletismo', 'E')
    expect(out[0].Incrementos).toEqual([{ E: 'Slot.E' }])
    expect(out[0].Proficiencia).toBe('E')
    // clicar N NÃO desce abaixo do piso A (nada de slot pra remover), fica N no salvo
    // (o derivado reapõe o A da regra); e clicar A não gasta slot (já é o piso)
    const out2 = applyPericiaRankEdit(out, [{ A: 'Regra.[[X]]' }], 'Atletismo', 'A')
    expect(out2[0].Incrementos).toEqual([]) // remove Slot.E (> alvo A); A vem da regra
  })

  it('render: clicar o botão de rank A gasta um Slot.A e sobe a perícia', async () => {
    const id = makeBardo()
    renderFicha(id, 'habilidades')
    // abre edição do painel Perícias
    const heading = await screen.findByText('Perícias')
    fireEvent.click(within(heading.parentElement!).getByText('✎ Alterar'))
    // os botões de rank editáveis das PERÍCIAS têm aria-label "Rank X"
    const aButtons = await screen.findAllByLabelText('Rank A')
    expect(aButtons.length).toBeGreaterThan(0)
    // Atletismo é a 1ª perícia (rank N). Antes: sem incremento.
    const before = ((getLocalDoc(id)?.frontmatter as any)?.Pericias?.Lista as any[]).find((r) => r.Nome === 'Atletismo')
    expect((before?.Incrementos ?? []).length).toBe(0)
    fireEvent.click(aButtons[0])
    await waitFor(() => {
      const row = ((getLocalDoc(id)?.frontmatter as any)?.Pericias?.Lista as any[]).find((r) => r.Nome === 'Atletismo')
      expect(row.Incrementos).toContainEqual({ A: 'Slot.A' })
      expect(row.Proficiencia).toBe('A')
    })
  })
})

// ─────────────────────────── #62 Magias: selector + persistência ───────────────────────────

describe('#62 — Magias: selector por escola×rank com slot livre e persiste', () => {
  it('unit: add/remove por escola preserva Regra e escreve Slot.<rank>', () => {
    const escolas = [{ Nome: 'Arcana Negra', Proficiencia: 'A', Lista: [{ '[[Praga|Praga]]': 'Regra.[[Bardo]]' }] as any[] }]
    const added = addMagiaToEscola(escolas, 'Arcana Negra', '[[Choque Mental]]', 'B')
    expect(added[0].Lista).toContainEqual({ '[[Choque Mental]]': 'Slot.B' })
    // idempotente: não duplica
    expect(addMagiaToEscola(added, 'Arcana Negra', '[[Choque Mental]]', 'B')[0].Lista).toHaveLength(2)
    // remove tira a slot-learned mas preserva a rule-granted
    const removed = removeMagiaFromEscola(added, 'Arcana Negra', '[[Choque Mental]]')
    expect(removed[0].Lista).toEqual([{ '[[Praga|Praga]]': 'Regra.[[Bardo]]' }])
  })

  it('projeção: derivedFm tem escola Arcana Negra proficiente (A) e slots de magia', async () => {
    const { projection } = await projectHeroRules(bardoFm(), catalog, loadFromDisk)
    const dfm = projection.derivedFm as Record<string, any>
    const negra = (dfm.Magias.Lista as any[]).find((e) => e.Nome === 'Arcana Negra')
    expect(negra.Proficiencia).toBe('A')
    expect(dfm.Magias.Slots.A).toBeGreaterThan(0)
  })

  it('render: o painel "Não Aprendidas" oferece magias e "+" persiste com fonte Slot', async () => {
    const id = makeBardo()
    renderFicha(id, 'habilidades')
    const heading = await screen.findByText('Magias')
    fireEvent.click(within(heading.parentElement!).getByText('✎ Alterar'))
    // com escola proficiente + slot livre, aparecem botões "Aprender <magia>"
    const addButtons = await screen.findAllByLabelText(/^Aprender /)
    expect(addButtons.length).toBeGreaterThan(0)
    fireEvent.click(addButtons[0])
    await waitFor(() => {
      const escolas = ((getLocalDoc(id)?.frontmatter as any)?.Magias?.Lista as any[]) ?? []
      const learned = escolas.flatMap((e) => (Array.isArray(e.Lista) ? e.Lista : []))
      // ao menos uma magia aprendida por slot
      expect(learned.some((entry: any) => String(Object.values(entry)[0]).startsWith('Slot.'))).toBe(true)
    })
  })
})

// ─────────────────────────── #59 Flicker ───────────────────────────

describe('#59 — sem flicker: a projeção anterior segura durante a re-extração', () => {
  it('mudar um atributo (re-extrai) NÃO some com o select de subclasse', async () => {
    const id = makeBardo()
    renderFicha(id, 'habilidades')
    const sub = (await screen.findByLabelText('MÉTODO ARTÍSTICO')) as HTMLSelectElement
    await waitFor(() => expect(sub.options.length).toBe(2))
    const rank2 = (await screen.findByLabelText('Atributo rank 2')) as HTMLSelectElement
    // Troca de atributo → RulesModel muda → ruleKey novo → re-extração pendente.
    // SÍNCRONO após o fireEvent (antes do microtask do resolver): a projeção
    // ANTERIOR deve segurar — o select de subclasse não pode sumir/colapsar.
    fireEvent.change(rank2, { target: { value: rank2.value === 'AGI' ? 'INT' : 'AGI' } })
    const subNow = screen.queryByLabelText('MÉTODO ARTÍSTICO') as HTMLSelectElement | null
    expect(subNow).toBeTruthy()
    expect(subNow!.options.length).toBe(2)
  })
})
