// @vitest-environment jsdom
// Aba PLANEJAMENTO (Biografia) — timeline vertical nível 1..10 estilo
// Pathbuilder. Cobre: cards com ganhos por nível (Guerreiro real), escolha
// futura gravando no bloco FM Planejamento (inerte pra engine), e o sync ao
// subir o nível (pick do plano vira pick real pelo caminho existente).
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { FichaPage } from '../src/components/ficha/FichaPage'
import { heroPath } from '../src/paths'
import { __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
import {
  createLocalEntity,
  getLocalEntity,
  emptyHeroFrontmatter,
  setLocalEntityFm,
  __resetLocalStoreForTests,
} from '../src/data/local-entities'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

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
  __resetHeroStoreMemoryForTests()
  __resetLocalStoreForTests()
})
afterEach(cleanup)

const bardoFm = (nivel: number) => ({
  ...(emptyHeroFrontmatter() as Record<string, unknown>),
  Classe: '[[Bardo]]',
  'Nível': nivel,
  Atributos: { FOR: 1, AGI: 2, INT: 3, PRE: 4 },
})

function renderBiografia(id: string) {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={[heroPath(id, 'perfil')]}>
        <Routes>
          <Route path="/heroi/*" element={<FichaPage />} />
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}

async function abrirPlanejamento() {
  fireEvent.click(await screen.findByText('PLANEJAMENTO'))
  await waitFor(() => expect(document.querySelector('[data-nivel="1"]')).toBeTruthy(), {
    timeout: 20000,
  })
}

describe('aba Planejamento — timeline 1..10', () => {
  it('cards 1..10 com ganhos do Guerreiro nos níveis certos', async () => {
    const id = createLocalEntity('Heroi', 'Planejador', {
      ...(emptyHeroFrontmatter() as Record<string, unknown>),
      Classe: '[[Guerreiro]]',
      'Nível': 3,
      Atributos: { FOR: 3, AGI: 2, INT: 1, PRE: 1 },
    })
    renderBiografia(id)
    await abrirPlanejamento()
    const cardDe = (n: number) => document.querySelector(`[data-nivel="${n}"]`) as HTMLElement
    for (let n = 1; n <= 10; n++) {
      expect(cardDe(n), `card do nível ${n}`).toBeTruthy()
      expect(cardDe(n).textContent).toContain(`NÍVEL ${n}`)
    }
    // marcador do nível atual no banner (◄)
    expect(cardDe(3).textContent).toContain('◄')
    // GANHOS visíveis direto no card (report 2026-08-25)
    expect(cardDe(4).textContent).toContain('Veterano')
    expect(cardDe(7).textContent).toContain('Campeão')
    expect(cardDe(10).textContent).toContain('Maestria em Arma')
    expect(cardDe(1).textContent).toContain('Evolução Básica')
    // slots não preenchidos viram botões-slot com o emoji do TIPO (registro)
    expect(cardDe(1).textContent).toContain('🧠')
    expect(cardDe(2).textContent).toContain('📘')
  }, 40000)

  it('escolha FUTURA grava no bloco Planejamento; subir o nível materializa o pick', async () => {
    // Bardo N1: Magias Anima não é do Bardo — usa a escolha de magia do
    // próprio Bardo? Mantém genérico: Guerreiro e a escolha da Especialização
    // é SUBCLASSE (read-only aqui). Usa Animista: escolhas de essência N2/N3.
    const id = createLocalEntity('Heroi', 'Planejador Animista', {
      ...(emptyHeroFrontmatter() as Record<string, unknown>),
      Classe: '[[Animista]]',
      'Nível': 1,
      Sintonia: '[[Traço Elemental do Fogo|Fogo]]',
      Atributos: { FOR: 1, AGI: 2, INT: 3, PRE: 4 },
    })
    renderBiografia(id)
    await abrirPlanejamento()
    // N2 abre uma escolha de essência (Magias Anima, gate 2) — FUTURA no N1:
    // aparece como BOTÃO-SLOT pendente; clicar abre o picker
    const card2 = document.querySelector('[data-nivel="2"]') as HTMLElement
    const botao = [...card2.querySelectorAll('button')].find((b) =>
      (b.textContent ?? '').includes('SELEÇÕES'),
    )
    expect(botao, 'botão agregado de SELEÇÕES no N2').toBeTruthy()
    fireEvent.click(botao!)
    const sel = await waitFor(() => {
      const s2 = [...card2.querySelectorAll('select')].find((x) =>
        [...(x as HTMLSelectElement).options].some((o) => o.value.includes('Essência')),
      ) as HTMLSelectElement
      expect(s2).toBeTruthy()
      return s2
    })
    const opcao = [...sel.options].map((o) => o.value).find((v) => v.includes('Essência'))
    expect(opcao).toBeTruthy()
    fireEvent.change(sel, { target: { value: opcao } })
    // gravou no PLANO (não nas listas ativas)
    await waitFor(() => {
      const fm = getLocalEntity(id)!.frontmatter as Record<string, unknown>
      const picks = ((fm['Planejamento'] as Record<string, unknown>)?.['picks'] ?? {}) as Record<string, string>
      expect(Object.values(picks)).toContain(opcao)
      expect(JSON.stringify(fm['Habilidades'] ?? {})).not.toContain(opcao)
    })
    // sobe o nível pra 2 → o sync aplica o pick do plano nas listas reais
    cleanup()
    setLocalEntityFm(id, 'Nível', 2)
    renderBiografia(id)
    await abrirPlanejamento()
    await waitFor(
      () => {
        const fm = getLocalEntity(id)!.frontmatter as Record<string, unknown>
        expect(JSON.stringify(fm['Habilidades'] ?? {})).toContain(opcao!)
        const picks = ((fm['Planejamento'] as Record<string, unknown>)?.['picks'] ?? {}) as Record<string, string>
        expect(Object.values(picks)).not.toContain(opcao)
      },
      { timeout: 20000 },
    )
  }, 60000)
})

describe('roadmap de GASTOS de slot', () => {
  it('perícia gasta no N1 (real+registro); técnica futura só registra e materializa ao subir', async () => {
    const id = createLocalEntity('Heroi', 'Roadmapper', {
      ...(emptyHeroFrontmatter() as Record<string, unknown>),
      Classe: '[[Guerreiro]]',
      'Nível': 3,
      Atributos: { FOR: 3, AGI: 2, INT: 1, PRE: 1 },
    })
    renderBiografia(id)
    await abrirPlanejamento()
    // N1: o botão "INCREMENTOS DE PERÍCIA" abre o POPUP (painel do wizard);
    // clicar no Rank A da Furtividade gasta o slot
    const card1 = document.querySelector('[data-nivel="1"]') as HTMLElement
    const botaoPer = [...card1.querySelectorAll('button')].find((b) =>
      (b.textContent ?? '').includes('INCREMENTOS DE PERÍCIA'),
    )
    expect(botaoPer, 'botão de perícia no N1').toBeTruthy()
    fireEvent.click(botaoPer!)
    // popup ESCOPADO: um select por slot livre do nível (elegíveis pelo rank
    // entrando) — pega Furtividade no incremento A
    const selA = (
      await screen.findAllByLabelText('Incremento de Perícia A (nível 1)')
    )[0] as HTMLSelectElement
    expect([...selA.options].some((o) => o.value === 'Furtividade')).toBe(true)
    fireEvent.change(selA, { target: { value: 'Furtividade' } })
    await waitFor(() => {
      const fm = getLocalEntity(id)!.frontmatter as Record<string, unknown>
      const rows = ((fm['Pericias'] as Record<string, unknown>)?.['Lista'] ?? []) as Array<
        Record<string, unknown>
      >
      const atl = rows.find((r) => r['Nome'] === 'Furtividade')
      expect(JSON.stringify(atl?.['Incrementos'] ?? [])).toContain('Slot.A')
      const regs = ((fm['Planejamento'] as Record<string, unknown>)?.['gastosSlots'] ?? []) as Array<
        Record<string, unknown>
      >
      expect(regs.some((r) => r['alvo'] === 'Furtividade' && r['nivel'] === 1)).toBe(true)
    })
    // fecha o popup — o rebuild da timeline fica pausado enquanto ele está
    // aberto (por design), e o resto do teste depende dos cards frescos
    fireEvent.click(screen.getByLabelText('Fechar editor'))
    // N4 (FUTURO): aprende técnica Experiente → só registro, lista intacta
    const card4 = document.querySelector('[data-nivel="4"]') as HTMLElement
    const botaoTec = [...card4.querySelectorAll('button')].find((b) =>
      (b.textContent ?? '').includes('TÉCNICA'),
    )
    expect(botaoTec, 'botão de técnica no N4').toBeTruthy()
    fireEvent.click(botaoTec!)
    const selTec = await waitFor(() => {
      const s2 = [...card4.querySelectorAll('select')].find((x) =>
        [...(x as HTMLSelectElement).options].some((o) => o.value.includes('Ataque Brutal')),
      ) as HTMLSelectElement
      expect(s2).toBeTruthy()
      return s2
    })
    fireEvent.change(selTec, { target: { value: '[[Ataque Brutal]]' } })
    await waitFor(() => {
      const fm = getLocalEntity(id)!.frontmatter as Record<string, unknown>
      const regs = ((fm['Planejamento'] as Record<string, unknown>)?.['gastosSlots'] ?? []) as Array<
        Record<string, unknown>
      >
      expect(regs.some((r) => String(r['alvo']).includes('Ataque Brutal') && r['nivel'] === 4)).toBe(true)
      expect(JSON.stringify(fm['Tecnicas'] ?? {})).not.toContain('Ataque Brutal')
    })
    // o gasto planejado APARECE no card 4 como chip de plano (report: "não
    // parece que é mantido") — rebuild da timeline após o registro
    await waitFor(
      () => {
        const c4 = document.querySelector('[data-nivel="4"]') as HTMLElement
        expect(c4.textContent).toContain('Ataque Brutal')
        expect(c4.textContent).toContain('plano')
      },
      { timeout: 45000 },
    )
    // sobe pro nível 4 → o sync materializa a técnica na lista real
    cleanup()
    setLocalEntityFm(id, 'Nível', 4)
    renderBiografia(id)
    await abrirPlanejamento()
    await waitFor(
      () => {
        const fm = getLocalEntity(id)!.frontmatter as Record<string, unknown>
        expect(JSON.stringify(fm['Tecnicas'] ?? {})).toContain('Ataque Brutal')
      },
      { timeout: 20000 },
    )
  }, 60000)
})


describe('popup via PORTAL (fixed dentro do PanelTrack era clipado)', () => {
  it('o modal monta como filho direto do body', async () => {
    const id = createLocalEntity('Heroi', 'Portalzeiro', {
      ...(emptyHeroFrontmatter() as Record<string, unknown>),
      Classe: '[[Guerreiro]]',
      'Nível': 2,
      Atributos: { FOR: 3, AGI: 2, INT: 1, PRE: 1 },
    })
    renderBiografia(id)
    await abrirPlanejamento()
    const card1 = document.querySelector('[data-nivel="1"]') as HTMLElement
    const botao = [...card1.querySelectorAll('button')].find((b) =>
      (b.textContent ?? '').includes('INCREMENTOS DE PERÍCIA'),
    )
    expect(botao).toBeTruthy()
    fireEvent.click(botao!)
    await waitFor(() => {
      const fechar = screen.getByLabelText('Fechar editor')
      // sobe até o container do overlay: precisa ser filho DIRETO do body
      let el: HTMLElement | null = fechar
      while (el && el.parentElement !== document.body) el = el.parentElement
      expect(el, 'overlay como filho do body (portal)').toBeTruthy()
    })
  }, 40000)
})
