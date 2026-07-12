// @vitest-environment jsdom
// ECONOMIA DE SLOTS (#73/#74/#75): espelha o pleitost-autosheet no app.
//   #73 Perícias — o rank-up só gasta os slots disponíveis (Pericias.Slots por
//       rank, com fungibilidade); sem slot livre o NAEM trava acima do teto.
//   #74 Técnicas — dá pra adicionar técnica quando há slot (Tecnicas.Slots);
//       nível 2 concede 1 técnica (Adepta) via Evolução Básica.
//   #75 Slots vazios — magias E técnicas mostram os slots VAZIOS por rank.
// Harness padrão do repo (rules-fixcluster.test.tsx): catálogo dos dados REAIS
// da vault, fetch stubado do disco, herói LOCAL (emptyHero + Classe Bardo).
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
import {
  computePericiaMaxReachable,
  pisoLetterFromIncrementos,
  ranksOutsideRange,
  applyPericiaRankEdit,
} from '../src/rules/apply-pericia-rank-edit'
import { addTecnicaToLista, removeTecnicaFromLista } from '../src/rules/apply-tecnica-edit'
import {
  computeSlotsView,
  computeMagiaSlotsView,
  canAddOne,
  magiaCanAddOne,
  slotsFeasible,
} from '../src/rules/slot-accounting'
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
const ariaDisabled = (el: Element) => el.getAttribute('aria-disabled') === 'true'

// ═══════════════════════════ UNIT — slot accounting ═══════════════════════════

describe('#73/#74 slot-accounting — fungibilidade descendente (M cobre E cobre A)', () => {
  it('slotsFeasible: E cobre A quando falta A', () => {
    // 1 slot A pedido, orçamento A=0 E=1 → o E cobre.
    expect(slotsFeasible(1, 0, 0, 0, 1, 0)).toBe(true)
    // 2 pedidos A com só 1 slot (A=0 E=1) → estoura.
    expect(slotsFeasible(2, 0, 0, 0, 1, 0)).toBe(false)
    // M cobre E que cobre A.
    expect(slotsFeasible(1, 1, 0, 0, 0, 2)).toBe(true)
  })
  it('canAddOne: só com slot livre (com fungibilidade)', () => {
    const full = computeSlotsView({ total: { A: 1, E: 0, M: 0 }, used: { A: 1, E: 0, M: 0 } })
    expect(canAddOne(full, 'A')).toBe(false)
    const free = computeSlotsView({ total: { A: 1, E: 0, M: 0 }, used: { A: 0, E: 0, M: 0 } })
    expect(canAddOne(free, 'A')).toBe(true)
    // E livre cobre um A adicional.
    const eCovers = computeSlotsView({ total: { A: 0, E: 1, M: 0 }, used: { A: 0, E: 0, M: 0 } })
    expect(canAddOne(eCovers, 'A')).toBe(true)
  })
  it('magiaCanAddOne: SEM fungibilidade — cada rank com seu orçamento', () => {
    const v = computeMagiaSlotsView({ total: { B: 0, A: 1, E: 0, M: 0 }, used: { B: 0, A: 1, E: 0, M: 0 } })
    expect(magiaCanAddOne(v, 'A')).toBe(false) // A esgotado
    expect(magiaCanAddOne(v, 'B')).toBe(false) // B não tem slot; A não cobre B
    const v2 = computeMagiaSlotsView({ total: { B: 1, A: 0, E: 0, M: 0 }, used: { B: 0, A: 0, E: 0, M: 0 } })
    expect(magiaCanAddOne(v2, 'B')).toBe(true)
  })
})

describe('#73 computePericiaMaxReachable + ranksOutsideRange (gate do NAEM)', () => {
  const view = (A: number, E: number, M: number, uA = 0, uE = 0, uM = 0) =>
    computeSlotsView({ total: { A, E, M }, used: { A: uA, E: uE, M: uM } })

  it('só 1 slot A: de N alcança A, mas E/M ficam fora do intervalo', () => {
    const teto = computePericiaMaxReachable('N', [], view(1, 0, 0))
    expect(teto).toBe('A')
    expect(ranksOutsideRange(pisoLetterFromIncrementos([]), teto)).toEqual(['E', 'M'])
  })
  it('sem slot: de N não alcança nada acima de N (A/E/M travados)', () => {
    const teto = computePericiaMaxReachable('N', [], view(0, 0, 0))
    expect(teto).toBe('N')
    expect(ranksOutsideRange('N', teto)).toEqual(['A', 'E', 'M'])
  })
  it('slot A esgotado (used=total): outra perícia não sobe de N', () => {
    const teto = computePericiaMaxReachable('N', [], view(1, 0, 0, 1, 0, 0))
    expect(teto).toBe('N')
  })
  it('piso de regra A: N fica travado (não rebaixa); A é o piso', () => {
    const floor = [{ A: 'Regra.[[Bardo]]' }]
    const teto = computePericiaMaxReachable('A', floor, view(0, 0, 0))
    // rank atual A é sempre alcançável; sem slot E/M o teto é A.
    expect(teto).toBe('A')
    const piso = pisoLetterFromIncrementos(floor)
    expect(piso).toBe('A')
    // N (abaixo do piso) e E/M (acima do teto) ficam desabilitados.
    expect(ranksOutsideRange(piso, teto)).toEqual(['N', 'E', 'M'])
  })
})

describe('#74 addTecnicaToLista / removeTecnicaFromLista', () => {
  it('add escreve Slot.<rank>; idempotente por alvo do wikilink', () => {
    const out = addTecnicaToLista([], '[[Entrada Dramática]]', 'A')
    expect(out).toEqual([{ '[[Entrada Dramática]]': 'Slot.A' }])
    // idempotente (mesmo alvo, mesmo com apelido) → no-op
    expect(addTecnicaToLista(out, '[[Entrada Dramática|Entrada]]', 'A')).toHaveLength(1)
  })
  it('remove tira a slot-learned mas preserva a rule-granted', () => {
    const lista = [
      { '[[Aparar]]': 'Regra.[[Guerreiro]]' },
      { '[[Entrada Dramática]]': 'Slot.A' },
    ]
    const out = removeTecnicaFromLista(lista, '[[Entrada Dramática]]')
    expect(out).toEqual([{ '[[Aparar]]': 'Regra.[[Guerreiro]]' }])
    // rule-granted não é removível
    expect(removeTecnicaFromLista(out, '[[Aparar]]')).toEqual(out)
  })
})

// ═══════════════════════════ PROJEÇÃO ═══════════════════════════

describe('#74 projeção — Evolução Básica concede 1 técnica Adepta no nível 2', () => {
  it('derivedFm.Tecnicas.Slots.A = 1 no nível 2 (0 no nível 1)', async () => {
    const n1 = await projectHeroRules(bardoFm(1), catalog, loadFromDisk)
    expect((n1.projection.derivedFm as any).Tecnicas?.Slots?.A ?? 0).toBe(0)
    const n2 = await projectHeroRules(bardoFm(2), catalog, loadFromDisk)
    expect((n2.projection.derivedFm as any).Tecnicas.Slots.A).toBe(1)
  })
})

// ═══════════════════════════ RENDER — #73 Perícias ═══════════════════════════

describe('#73 render — só sobe perícia com slot livre', () => {
  it('sem slot E/M (Bardo nível 1), os ranks E e M ficam desabilitados; A sobe', async () => {
    const id = makeBardo(1)
    renderFicha(id, 'habilidades')
    const heading = await screen.findByText('Perícias')
    fireEvent.click(within(heading.parentElement!).getByText('✎ Alterar'))

    // Bardo nível 1 concede só slots de perícia A (E=0, M=0). Todos os degraus
    // E e M devem ficar travados (aria-disabled) — sem slot pra alcançá-los.
    const mBtns = await screen.findAllByLabelText('Rank M')
    expect(mBtns.length).toBeGreaterThan(0)
    expect(mBtns.every(ariaDisabled)).toBe(true)
    const eBtns = await screen.findAllByLabelText('Rank E')
    expect(eBtns.every(ariaDisabled)).toBe(true)
    // A tem slot → clicável.
    const aBtns = await screen.findAllByLabelText('Rank A')
    expect(ariaDisabled(aBtns[0])).toBe(false)

    // Clicar num M travado NÃO altera a perícia (Atletismo continua N).
    fireEvent.click(mBtns[0])
    const atletismo = () =>
      ((getLocalDoc(id)?.frontmatter as any)?.Pericias?.Lista as any[])?.find((r) => r.Nome === 'Atletismo')
    expect((atletismo()?.Incrementos ?? []).length).toBe(0)

    // Clicar em A gasta um Slot.A e sobe.
    fireEvent.click(aBtns[0])
    await waitFor(() => {
      const row = atletismo()
      expect(row.Incrementos).toContainEqual({ A: 'Slot.A' })
      expect(row.Proficiencia).toBe('A')
    })
  })
})

// ═══════════════════════════ RENDER — #74/#75 Técnicas ═══════════════════════════

describe('#74/#75 render — adicionar técnica no nível 2 e slots vazios', () => {
  it('nível 2: 1 slot Adepta → mostra Vazio, adiciona 1 técnica, depois trava', async () => {
    const id = makeBardo(2)
    renderFicha(id, 'habilidades')
    const heading = await screen.findByText('Técnicas')
    fireEvent.click(within(heading.parentElement!).getByText('✎ Alterar'))

    // #75: com 1 slot Adepta livre e 0 técnicas, aparece 1 slot "Vazio".
    await waitFor(() => expect(screen.getAllByText('Vazio').length).toBeGreaterThanOrEqual(1))

    // #74: técnicas Adeptas da classe são ofertadas com "+" habilitado.
    const addButtons = await screen.findAllByLabelText(/^Aprender /)
    expect(addButtons.length).toBeGreaterThan(0)
    expect((addButtons[0] as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(addButtons[0])

    // Persiste com fonte Slot.A na lista SALVA.
    await waitFor(() => {
      const lista = ((getLocalDoc(id)?.frontmatter as any)?.Tecnicas?.Lista as any[]) ?? []
      expect(lista.some((e) => String(Object.values(e)[0]) === 'Slot.A')).toBe(true)
    })

    // Gastou o único slot Adepta → os "+" restantes desabilitam (sem slot livre).
    await waitFor(() => {
      const rest = screen.queryAllByLabelText(/^Aprender /) as HTMLButtonElement[]
      expect(rest.length > 0 && rest.every((b) => b.disabled)).toBe(true)
    })
    // E o slot de TÉCNICA deixou de estar "Vazio" — escopado ao painel de
    // Técnicas: os slots livres de MAGIA agora aparecem também em leitura
    // (pedido do usuário), então o doc pode ter outros "Vazio".
    expect(within(heading.parentElement!.parentElement!).queryByText('Vazio')).toBeNull()
  })
})

// ══════════════════ RENDER — slots livres no modo LEITURA ══════════════════

describe('slots livres visíveis SEM Alterar (pedido do usuário)', () => {
  it('nível 2 com slot Adepta livre: "Vazio" aparece já no modo leitura', async () => {
    const id = makeBardo(2)
    renderFicha(id, 'habilidades')
    await screen.findByText('Técnicas')
    // SEM clicar em ✎ Alterar: os slots livres (técnicas e magias) já aparecem.
    await waitFor(() => expect(screen.getAllByText('Vazio').length).toBeGreaterThanOrEqual(1))
  })
})

// ═══════════════════════════ RENDER — #75 Magias ═══════════════════════════

describe('#75 render — slots vazios de magia por rank', () => {
  it('escola proficiente com slot livre mostra "Vazio" no painel Aprendidas', async () => {
    const id = makeBardo(1)
    renderFicha(id, 'habilidades')
    const heading = await screen.findByText('Magias')
    fireEvent.click(within(heading.parentElement!).getByText('✎ Alterar'))
    // Bardo nível 1: escola proficiente (Arcana Negra) + slot de magia livre,
    // 0 aprendidas → o rank correspondente mostra slot(s) "Vazio".
    await waitFor(() => expect(screen.getAllByText('Vazio').length).toBeGreaterThanOrEqual(1))
  })
})
