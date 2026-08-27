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
      (b.textContent ?? '').includes('ESSÊNCIA'),
    )
    expect(botao, 'botão do grupo de essências no N2').toBeTruthy()
    fireEvent.click(botao!)
    // o editor agora abre em POPUP (portal no body)
    const sel = await waitFor(() => {
      const s2 = [...document.querySelectorAll('select')].find((x) =>
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
    // popup ESCOPADO com a grade REAL (RankBtns): clica o Rank A da linha da
    // Furtividade (menor div que contém o nome + o botão)
    const rankA = await waitFor(() => {
      const linha = [...document.querySelectorAll('div')]
        .filter(
          (d) =>
            (d.textContent ?? '').includes('Furtividade') &&
            d.querySelector('[aria-label="Rank A"]:not([aria-disabled])'),
        )
        .sort((a, b) => (a.textContent ?? '').length - (b.textContent ?? '').length)[0]
      const btn = linha?.querySelector('[aria-label="Rank A"]:not([aria-disabled])') as HTMLElement
      expect(btn, 'Rank A clicável da Furtividade no popup').toBeTruthy()
      return btn
    })
    fireEvent.click(rankA)
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
    // editor no estilo das competências abre em POPUP: linha com ➕ verde
    const addBrutal = await waitFor(() => {
      const btn = [...document.querySelectorAll('button')].find(
        (b) => b.getAttribute('aria-label') === 'Aprender Ataque Brutal',
      ) as HTMLElement
      expect(btn, '➕ Aprender Ataque Brutal no popup do N4').toBeTruthy()
      return btn
    })
    fireEvent.click(addBrutal)
    fireEvent.click(screen.getByLabelText('Fechar editor'))
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

describe('espec/maestria destravam e M futuro é clicável', () => {
  it('subir E abre a oportunidade de ESPECIALIDADE; plano E→M futuro clicável', async () => {
    const id = createLocalEntity('Heroi', 'Especializador', {
      ...(emptyHeroFrontmatter() as Record<string, unknown>),
      Classe: '[[Guerreiro]]',
      'Nível': 5,
      Atributos: { FOR: 1, AGI: 3, INT: 2, PRE: 1 },
      Pericias: {
        Lista: [
          {
            // ACENTUADA de propósito: o mapa de especializações é chaveado por
            // slug ('Enganacao') — a consulta por display nunca achava
            Nome: 'Enganação',
            Atributo: 'PRE',
            Proficiencia: 'A',
            Bonus_Item: 0,
            Bonus_Especial: 0,
            Incrementos: [{ A: 'Slot.A' }],
          },
        ],
      },
    })
    renderBiografia(id)
    await abrirPlanejamento()
    // N4: sobe Atletismo pra E no popup de perícias
    const card4 = document.querySelector('[data-nivel="4"]') as HTMLElement
    const botaoPer = [...card4.querySelectorAll('button')].find((b) =>
      (b.textContent ?? '').includes('INCREMENTOS DE PERÍCIA'),
    )
    expect(botaoPer, 'botão de perícias no N4').toBeTruthy()
    fireEvent.click(botaoPer!)
    const rankE = await waitFor(() => {
      const linha = [...document.querySelectorAll('div')]
        .filter(
          (d) =>
            (d.textContent ?? '').includes('Enganação') &&
            d.querySelector('[aria-label="Rank E"]:not([aria-disabled])'),
        )
        .sort((a, b) => (a.textContent ?? '').length - (b.textContent ?? '').length)[0]
      const btn = linha?.querySelector('[aria-label="Rank E"]:not([aria-disabled])') as HTMLElement
      expect(btn, 'Rank E clicável da Enganação no popup N4').toBeTruthy()
      return btn
    })
    fireEvent.click(rankE)
    fireEvent.click(screen.getByLabelText('Fechar editor'))
    // a oportunidade de ESPECIALIDADE aparece no card 4 (bug: mapa chaveado
    // por slug — a consulta por nome com acento nunca achava)
    await waitFor(
      () => {
        const c4 = document.querySelector('[data-nivel="4"]') as HTMLElement
        const btn = [...c4.querySelectorAll('button')].find((b) =>
          (b.textContent ?? '').includes('ESPEC/MAESTRIAS'),
        )
        expect(btn, 'botão ESPEC/MAESTRIAS no N4').toBeTruthy()
      },
      { timeout: 45000 },
    )
    // N7 (nível FUTURO... 7 > 5): popup de perícias com o M da Enganação
    // clicável (entrando E após o gasto do N4)
    const card7 = document.querySelector('[data-nivel="7"]') as HTMLElement
    const botaoPer7 = [...card7.querySelectorAll('button')].find((b) =>
      (b.textContent ?? '').includes('INCREMENTOS DE PERÍCIA'),
    )
    expect(botaoPer7, 'botão de perícias no N7').toBeTruthy()
    fireEvent.click(botaoPer7!)
    await waitFor(() => {
      const linha = [...document.querySelectorAll('div')]
        .filter(
          (d) =>
            (d.textContent ?? '').includes('Enganação') &&
            d.querySelector('[aria-label="Rank M"]:not([aria-disabled])'),
        )
        .sort((a, b) => (a.textContent ?? '').length - (b.textContent ?? '').length)[0]
      expect(linha, 'Rank M clicável da Enganação no popup N7').toBeTruthy()
    })
  }, 180000)
})

describe('#494 — registro de perícia POR RANK no popup (não apaga os outros ranks)', () => {
  it('registrar M@7 preserva A@1/E@4; desfazer o M remove SÓ o M', async () => {
    const id = createLocalEntity('Heroi', 'Escalador', {
      ...(emptyHeroFrontmatter() as Record<string, unknown>),
      Classe: '[[Guerreiro]]',
      'Nível': 7,
      Atributos: { FOR: 3, AGI: 2, INT: 1, PRE: 1 },
      Pericias: {
        Lista: [
          {
            Nome: 'Atletismo',
            Atributo: 'FOR',
            Proficiencia: 'E',
            Bonus_Item: 0,
            Bonus_Especial: 0,
            Incrementos: [{ A: 'Slot.A' }, { E: 'Slot.E' }],
          },
        ],
      },
      Planejamento: {
        gastosSlots: [
          { nivel: 1, tipo: 'pericia', rank: 'A', alvo: 'Atletismo' },
          { nivel: 4, tipo: 'pericia', rank: 'E', alvo: 'Atletismo' },
        ],
      },
    })
    renderBiografia(id)
    await abrirPlanejamento()
    const regsDe = () => {
      const fm = getLocalEntity(id)!.frontmatter as Record<string, unknown>
      const regs = ((fm['Planejamento'] as Record<string, unknown>)?.['gastosSlots'] ?? []) as Array<
        Record<string, unknown>
      >
      return regs
        .filter((r) => r['alvo'] === 'Atletismo')
        .map((r) => `${String(r['rank'])}@${String(r['nivel'])}`)
        .sort()
    }
    // N7 tem o slot M de perícia (Evolução) — abre o popup escopado
    const card7 = document.querySelector('[data-nivel="7"]') as HTMLElement
    const botaoPer = [...card7.querySelectorAll('button')].find((b) =>
      (b.textContent ?? '').includes('INCREMENTOS DE PERÍCIA'),
    )
    expect(botaoPer, 'botão de perícia no N7').toBeTruthy()
    fireEvent.click(botaoPer!)
    const rankM = await waitFor(() => {
      const linha = [...document.querySelectorAll('div')]
        .filter(
          (d) =>
            (d.textContent ?? '').includes('Atletismo') &&
            d.querySelector('[aria-label="Rank M"]:not([aria-disabled])'),
        )
        .sort((a, b) => (a.textContent ?? '').length - (b.textContent ?? '').length)[0]
      const btn = linha?.querySelector('[aria-label="Rank M"]:not([aria-disabled])') as HTMLElement
      expect(btn, 'Rank M clicável do Atletismo no popup').toBeTruthy()
      return btn
    })
    fireEvent.click(rankM)
    // o M entra SEM engolir o A@1 e o E@4 (report 2026-08-25: "perde o valor
    // do nível anterior")
    await waitFor(() => expect(regsDe()).toEqual(['A@1', 'E@4', 'M@7']))
    // desfazer: clicar o rank selecionado remove SÓ o registro do M
    const rankMSel = await waitFor(() => {
      const linha = [...document.querySelectorAll('div')]
        .filter(
          (d) =>
            (d.textContent ?? '').includes('Atletismo') &&
            d.querySelector('[aria-label="Rank M"]:not([aria-disabled])'),
        )
        .sort((a, b) => (a.textContent ?? '').length - (b.textContent ?? '').length)[0]
      const btn = linha?.querySelector('[aria-label="Rank M"]:not([aria-disabled])') as HTMLElement
      expect(btn).toBeTruthy()
      return btn
    })
    fireEvent.click(rankMSel)
    await waitFor(() => expect(regsDe()).toEqual(['A@1', 'E@4']))
  }, 60000)
})

describe('#495 — maestria escolhida não é re-ofertada nem empilha (Base Firme)', () => {
  it('clicar a oportunidade grava UMA vez, remove a oferta e não duplica a linha', async () => {
    const id = createLocalEntity('Heroi', 'Equilibrista', {
      ...(emptyHeroFrontmatter() as Record<string, unknown>),
      Classe: '[[Guerreiro]]',
      'Nível': 8,
      Atributos: { FOR: 3, AGI: 2, INT: 1, PRE: 1 },
      Pericias: {
        Lista: [
          {
            Nome: 'Acrobacia',
            Atributo: 'AGI',
            Proficiencia: 'E',
            Bonus_Item: 0,
            Bonus_Especial: 0,
            Especializacao: '[[Estabilidade]]',
            Incrementos: [{ A: 'Slot.A' }, { E: 'Slot.E' }],
          },
        ],
      },
      Planejamento: {
        gastosSlots: [{ nivel: 9, tipo: 'pericia', rank: 'M', alvo: 'Acrobacia' }],
      },
    })
    renderBiografia(id)
    await abrirPlanejamento()
    const card9 = document.querySelector('[data-nivel="9"]') as HTMLElement
    const botao = [...card9.querySelectorAll('button')].find((b) =>
      (b.textContent ?? '').includes('ESPEC/MAESTRIAS'),
    )
    expect(botao, 'botão ESPEC/MAESTRIAS no N9').toBeTruthy()
    fireEvent.click(botao!)
    // a oportunidade "Acrobacia (M)" oferece Base Firme (radio vazio)
    const oferta = await waitFor(() => {
      const btn = [...document.querySelectorAll('button[aria-pressed="false"]')].find((b) =>
        (b.getAttribute('aria-label') ?? '').includes('Base Firme'),
      ) as HTMLElement
      expect(btn, 'oferta de Base Firme no popup').toBeTruthy()
      return btn
    })
    fireEvent.click(oferta)
    const regsBaseFirme = () => {
      const fm = getLocalEntity(id)!.frontmatter as Record<string, unknown>
      const regs = ((fm['Planejamento'] as Record<string, unknown>)?.['gastosSlots'] ?? []) as Array<
        Record<string, unknown>
      >
      return regs.filter((r) => String(r['alvo']).includes('Base Firme'))
    }
    // gravou UM registro e a linha selecionada aparece
    await waitFor(() => {
      expect(regsBaseFirme()).toHaveLength(1)
      const sel = [...document.querySelectorAll('button[aria-pressed="true"]')].filter((b) =>
        (b.getAttribute('aria-label') ?? '').includes('Base Firme'),
      )
      expect(sel, 'linha selecionada única').toHaveLength(1)
    })
    // a OFERTA some (report: "fui clicando e foi aparecendo novas seleções") —
    // sem re-oferta não há como empilhar
    const ofertasDepois = [...document.querySelectorAll('button[aria-pressed="false"]')].filter((b) =>
      (b.getAttribute('aria-label') ?? '').includes('Base Firme'),
    )
    expect(ofertasDepois).toHaveLength(0)
    // desfazer pelo radio selecionado: registro sai, oferta volta
    const sel = [...document.querySelectorAll('button[aria-pressed="true"]')].find((b) =>
      (b.getAttribute('aria-label') ?? '').includes('Base Firme'),
    ) as HTMLElement
    fireEvent.click(sel)
    await waitFor(() => {
      expect(regsBaseFirme()).toHaveLength(0)
      const oferta2 = [...document.querySelectorAll('button[aria-pressed="false"]')].filter((b) =>
        (b.getAttribute('aria-label') ?? '').includes('Base Firme'),
      )
      expect(oferta2, 'oferta de volta após desfazer').toHaveLength(1)
    })
  }, 60000)
})

describe('escolhas preenchidas como CHIPS + auto-seed do planejamento', () => {
  it('abrir a aba materializa gastosSlots do que JÁ está gasto (sem clique)', async () => {
    const id = createLocalEntity('Heroi', 'Veterano', {
      ...(emptyHeroFrontmatter() as Record<string, unknown>),
      Classe: '[[Guerreiro]]',
      'Nível': 3,
      Atributos: { FOR: 3, AGI: 2, INT: 1, PRE: 1 },
      Tecnicas: {
        Lista: [
          { '[[Ataque Poderoso]]': 'Slot.A' },
          { '[[Aparar]]': 'Slot.A' },
        ],
      },
      Pericias: {
        Lista: [
          {
            Nome: 'Atletismo',
            Atributo: 'FOR',
            Proficiencia: 'A',
            Bonus_Item: 0,
            Bonus_Especial: 0,
            Incrementos: [{ A: 'Slot.A' }],
          },
        ],
      },
    })
    renderBiografia(id)
    await abrirPlanejamento()
    // o seed roda no fim do build — SEM nenhuma edição os gastos reais já
    // têm registro explícito com o nível da atribuição
    await waitFor(() => {
      const fm = getLocalEntity(id)!.frontmatter as Record<string, unknown>
      const regs = ((fm['Planejamento'] as Record<string, unknown>)?.['gastosSlots'] ?? []) as Array<
        Record<string, unknown>
      >
      const chave = (r: Record<string, unknown>) => `${String(r['tipo'])}:${String(r['alvo'])}@${String(r['nivel'])}`
      expect(regs.map(chave)).toEqual(
        expect.arrayContaining([
          'tecnica:[[Ataque Poderoso]]@1',
          'tecnica:[[Aparar]]@2',
          'pericia:Atletismo@1',
        ]),
      )
    })
  }, 60000)

  it('escolha preenchida aparece como CHIP na strip ESCOLHAS, não como row', async () => {
    const id = createLocalEntity('Heroi', 'Chipado', {
      ...(emptyHeroFrontmatter() as Record<string, unknown>),
      Classe: '[[Animista]]',
      'Nível': 1,
      Sintonia: '[[Traço Elemental do Fogo|Fogo]]',
      Atributos: { FOR: 1, AGI: 2, INT: 3, PRE: 4 },
      Planejamento: { picks: {} },
    })
    renderBiografia(id)
    await abrirPlanejamento()
    // escolhe a essência FUTURA (N2) pelo popup do grupo (label da regra)
    const card2 = document.querySelector('[data-nivel="2"]') as HTMLElement
    const botao = [...card2.querySelectorAll('button')].find((b) =>
      (b.textContent ?? '').includes('ESSÊNCIA'),
    )
    expect(botao, 'botão do grupo de essências no N2').toBeTruthy()
    fireEvent.click(botao!)
    const sel = await waitFor(() => {
      const s2 = [...document.querySelectorAll('select')].find((x) =>
        [...(x as HTMLSelectElement).options].some((o) => o.value.includes('Essência')),
      ) as HTMLSelectElement
      expect(s2).toBeTruthy()
      return s2
    })
    const opcao = [...sel.options].map((o) => o.value).find((v) => v.includes('Essência'))!
    fireEvent.change(sel, { target: { value: opcao } })
    fireEvent.click(screen.getByLabelText('Fechar editor'))
    // o pick vira CHIP na strip ESCOLHAS do card 2 (com marcador de plano)…
    await waitFor(() => {
      const c2 = document.querySelector('[data-nivel="2"]') as HTMLElement
      const strip = [...c2.querySelectorAll('span')].find((s) =>
        (s.textContent ?? '').includes('ESSÊNCIA ELEMENTAL'),
      )
      expect(strip, 'linha do grupo de essências no card 2').toBeTruthy()
      expect(strip!.parentElement!.textContent).toContain('plano')
    })
    // …e NÃO existe mais row expansível de seleção no corpo do card (o
    // kicker antigo era `label · sourceNote · plano`; o chip novo não traz o
    // separador com a fonte)
    const c2 = document.querySelector('[data-nivel="2"]') as HTMLElement
    const kickers = [...c2.querySelectorAll('span')].map((el) => el.textContent ?? '')
    expect(kickers.some((t) => / · .+ · plano$/.test(t))).toBe(false)
  }, 60000)
})

describe('#497 — Leonel: grupos por tipo, magias identadas sob a essência, sem colchetes', () => {
  const leonelFm = () =>
    JSON.parse(
      fs.readFileSync(path.join(appDir, 'tests/fixtures/heroes/Leonel Bravolla.json'), 'utf8'),
    ).frontmatter as Record<string, unknown>

  it('card 1: botões por grupo; essências com magias identadas; sem row de magia concedida duplicada', async () => {
    const id = createLocalEntity('Heroi', 'Leonel Teste', leonelFm())
    renderBiografia(id)
    await abrirPlanejamento()
    const card1 = document.querySelector('[data-nivel="1"]') as HTMLElement
    const botoes = [...card1.querySelectorAll('button')].map((b) => b.textContent ?? '')
    // um botão POR TIPO de seleção (label da regra), não um "SELEÇÕES" único
    expect(botoes.some((t) => t.includes('ESSÊNCIA ELEMENTAL ADEPTA'))).toBe(true)
    expect(botoes.some((t) => t.includes('TÉCNICA ('))).toBe(true)
    expect(botoes.some((t) => t.includes('FORMA ('))).toBe(true)
    expect(botoes.some((t) => t.includes('SELEÇÕES'))).toBe(false)
    // linha do grupo de essências com os DOIS picks
    const linhaEss = [...card1.querySelectorAll('span')].find((s) =>
      s.textContent === 'ESSÊNCIA ELEMENTAL ADEPTA',
    )
    expect(linhaEss, 'kicker do grupo de essências').toBeTruthy()
    const grupoEl = linhaEss!.closest('div')!.parentElement!
    expect(grupoEl.textContent).toContain('Essência Torrencial Adepta')
    expect(grupoEl.textContent).toContain('Essência Congelante Adepta')
    // magias concedidas IDENTADAS sob cada essência (↳)
    expect(grupoEl.textContent).toContain("Esfera d'Água")
    expect(grupoEl.textContent).toContain('Caminho de Gelo')
    // …e NÃO aparecem mais como row "Magia concedida" no topo do card
    const rowsMagia = [...card1.querySelectorAll('span')].filter((s) =>
      (s.textContent ?? '').startsWith('Magia concedida'),
    )
    expect(rowsMagia).toHaveLength(0)
    // sem valor cru com colchetes em lugar nenhum do card
    expect(card1.textContent).not.toContain('[[')
    // bloco-base mostra as DUAS subclasses do Druida (#498: o find() escondia
    // a Tradição Druídica)
    expect(document.body.textContent).toContain('SUBCLASSE · CÍRCULO DRUÍDICO')
    expect(document.body.textContent).toContain('SUBCLASSE · TRADIÇÃO DRUÍDICA')
  }, 90000)

  it('popup do grupo FORMA mostra o pick sem colchetes', async () => {
    const id = createLocalEntity('Heroi', 'Leonel Popup', leonelFm())
    renderBiografia(id)
    await abrirPlanejamento()
    const card1 = document.querySelector('[data-nivel="1"]') as HTMLElement
    const botaoForma = [...card1.querySelectorAll('button')].find((b) =>
      (b.textContent ?? '').includes('FORMA ('),
    )
    expect(botaoForma, 'botão FORMA no N1').toBeTruthy()
    fireEvent.click(botaoForma!)
    // o select da Forma lista o pick atual como opção LIMPA (sem [[ ]])
    await waitFor(() => {
      const sel = [...document.querySelectorAll('select')].find((x) =>
        [...(x as HTMLSelectElement).options].some((o) => (o.textContent ?? '').includes('Forma')),
      ) as HTMLSelectElement
      expect(sel, 'select de Forma no popup').toBeTruthy()
      const labels = [...sel.options].map((o) => o.textContent ?? '')
      expect(labels).toContain('Forma Caçadora')
      expect(labels.some((l) => l.includes('[['))).toBe(false)
      // só as escolhas do GRUPO Forma neste popup (essências ficam no delas)
      const selects = [...document.querySelectorAll('select')]
      expect(
        selects.some((x) =>
          [...(x as HTMLSelectElement).options].some((o) => (o.textContent ?? '').includes('Essência')),
        ),
      ).toBe(false)
    })
  }, 90000)
})

describe('#500 — Forma do Leonel: mover do futuro, limpar com — e ícone por tipo', () => {
  const leonelHeroi = () =>
    createLocalEntity(
      'Heroi',
      'Leonel Formas',
      JSON.parse(
        fs.readFileSync(path.join(appDir, 'tests/fixtures/heroes/Leonel Bravolla.json'), 'utf8'),
      ).frontmatter as Record<string, unknown>,
    )
  const formasDe = (id: string) => {
    const cur = getLocalEntity(id)!.frontmatter as Record<string, unknown>
    const lista = ((cur['Acoes'] as Record<string, unknown>)?.['Lista'] ?? []) as Array<
      Record<string, unknown>
    >
    return lista
      .flatMap((r) => Object.entries(r))
      .filter(([k]) => k.includes('Forma '))
      .map(([k, v]) => `${k}=${String(v)}`)
  }
  const abreFormaN1 = async () => {
    const card1 = document.querySelector('[data-nivel="1"]') as HTMLElement
    const botaoForma = [...card1.querySelectorAll('button')].find((b) =>
      (b.textContent ?? '').includes('FORMA ('),
    )
    expect(botaoForma, 'botão FORMA no N1').toBeTruthy()
    fireEvent.click(botaoForma!)
    return waitFor(() => {
      const s2 = [...document.querySelectorAll('select')].find((x) =>
        [...(x as HTMLSelectElement).options].some((o) => (o.textContent ?? '').includes('Forma')),
      ) as HTMLSelectElement
      expect(s2, 'select de Forma').toBeTruthy()
      return s2
    })
  }

  it('selecionar no N1 a forma segurada pelo nível futuro MOVE a linha; limpar (—) esvazia e NÃO re-preenche', async () => {
    const id = leonelHeroi()
    renderBiografia(id)
    await abrirPlanejamento()
    const sel = await abreFormaN1()
    // pick default NÃO conta como escolha: select abre VAZIO (espelho #473)
    expect(sel.value).toBe('')
    // Caçadora está segurada pela escolha do N3 (Forma Adicional) — mesmo
    // assim aparece aqui (elegibilidade retroativa) e selecionar MOVE a linha
    const opcao = [...sel.options].map((o) => o.value).find((v) => v.includes('Caçadora'))
    expect(opcao, 'Forma Caçadora selecionável no N1 (report 2026-08-25)').toBeTruthy()
    fireEvent.change(sel, { target: { value: opcao } })
    await waitFor(() => {
      const formas = formasDe(id)
      const cacadoras = formas.filter((f) => f.includes('Caçadora'))
      expect(cacadoras).toHaveLength(1) // moveu, não duplicou
      expect(cacadoras[0]).toContain('Tradição Druídica') // tag canônico
      expect(formas.some((f) => f.includes('Espreitadora'))).toBe(true) // intacta
    })
    // fecha e reabre: o pick agora é REAL (inferência estrita) e persiste
    fireEvent.click(screen.getByLabelText('Fechar editor'))
    const sel2 = await abreFormaN1()
    await waitFor(() => expect(sel2.value).toContain('Caçadora'))
    // LIMPAR com — : a linha canônica sai e o select FICA vazio
    fireEvent.change(sel2, { target: { value: '' } })
    await waitFor(() => {
      expect(formasDe(id).some((f) => f.includes('Caçadora'))).toBe(false)
    })
    fireEvent.click(screen.getByLabelText('Fechar editor'))
    const sel3 = await abreFormaN1()
    expect(sel3.value).toBe('')
  }, 120000)

  it('botão do grupo TÉCNICA usa o emoji de técnica (registro), não o livrinho de seleção', async () => {
    const id = leonelHeroi()
    renderBiografia(id)
    await abrirPlanejamento()
    const card1 = document.querySelector('[data-nivel="1"]') as HTMLElement
    const botaoTec = [...card1.querySelectorAll('button')].find((b) =>
      (b.textContent ?? '').includes('TÉCNICA ('),
    )
    expect(botaoTec, 'botão TÉCNICA no N1').toBeTruthy()
    expect(botaoTec!.textContent).toContain('📘')
    const botaoForma = [...card1.querySelectorAll('button')].find((b) =>
      (b.textContent ?? '').includes('FORMA ('),
    )
    expect(botaoForma!.textContent).toContain('📕')
  }, 90000)
})

describe('#501 — linha com tag de pai MORTO fica selecionável (Forma Espreitadora)', () => {
  it('Espreitadora (Escolha.[[Forma Feral]], pai sem escolha viva) aparece e escolher retagueia', async () => {
    const id = createLocalEntity(
      'Heroi',
      'Leonel Espreita',
      JSON.parse(
        fs.readFileSync(path.join(appDir, 'tests/fixtures/heroes/Leonel Bravolla.json'), 'utf8'),
      ).frontmatter as Record<string, unknown>,
    )
    renderBiografia(id)
    await abrirPlanejamento()
    const card1 = document.querySelector('[data-nivel="1"]') as HTMLElement
    const botaoForma = [...card1.querySelectorAll('button')].find((b) =>
      (b.textContent ?? '').includes('FORMA ('),
    )
    fireEvent.click(botaoForma!)
    const sel = await waitFor(() => {
      const s2 = [...document.querySelectorAll('select')].find((x) =>
        [...(x as HTMLSelectElement).options].some((o) => (o.textContent ?? '').includes('Forma')),
      ) as HTMLSelectElement
      expect(s2, 'select de Forma').toBeTruthy()
      return s2
    })
    // a linha existe nas Ações com tag legado de pai morto — mesmo assim é
    // selecionável (report 2026-08-25: "não ta aparecendo a forma espreitadora")
    const opcao = [...sel.options].map((o) => o.value).find((v) => v.includes('Espreitadora'))
    expect(opcao, 'Forma Espreitadora nas opções').toBeTruthy()
    fireEvent.change(sel, { target: { value: opcao } })
    await waitFor(() => {
      const cur = getLocalEntity(id)!.frontmatter as Record<string, unknown>
      const lista = ((cur['Acoes'] as Record<string, unknown>)?.['Lista'] ?? []) as Array<
        Record<string, unknown>
      >
      const espreitas = lista
        .flatMap((r) => Object.entries(r))
        .filter(([k]) => k.includes('Espreitadora'))
        .map(([, v]) => String(v))
      // moveu/retagueou: UMA linha, agora com o pai canônico da escolha
      expect(espreitas).toHaveLength(1)
      expect(espreitas[0]).toContain('Tradição Druídica')
    })
  }, 90000)
})

describe('#502 — essência já escolhida por IRMÃ de nível anterior não re-oferece', () => {
  it('a essência do N3 não lista Torrencial/Congelante (picks das irmãs do N1)', async () => {
    const id = createLocalEntity(
      'Heroi',
      'Leonel Essencias',
      JSON.parse(
        fs.readFileSync(path.join(appDir, 'tests/fixtures/heroes/Leonel Bravolla.json'), 'utf8'),
      ).frontmatter as Record<string, unknown>,
    )
    renderBiografia(id)
    await abrirPlanejamento()
    const card3 = document.querySelector('[data-nivel="3"]') as HTMLElement
    const botao = [...card3.querySelectorAll('button')].find((b) =>
      (b.textContent ?? '').includes('ESSÊNCIA ELEMENTAL ADEPTA'),
    )
    expect(botao, 'botão de essências no N3').toBeTruthy()
    fireEvent.click(botao!)
    const sel = await waitFor(() => {
      const s2 = [...document.querySelectorAll('select')].find((x) =>
        [...(x as HTMLSelectElement).options].some((o) => (o.textContent ?? '').includes('Essência')),
      ) as HTMLSelectElement
      expect(s2, 'select de essência no popup do N3').toBeTruthy()
      return s2
    })
    const labels = [...sel.options].map((o) => o.textContent ?? '')
    // livres seguem ofertadas…
    expect(labels.some((l) => l.includes('Hidratante'))).toBe(true)
    // …mas as escolhidas pelas IRMÃS do N1 não repetem (report 2026-08-26)
    expect(labels.some((l) => l.includes('Torrencial'))).toBe(false)
    expect(labels.some((l) => l.includes('Congelante'))).toBe(false)
  }, 90000)
})

describe('#504 — pick PLANEJADO de irmã (gate futuro) também exclui a oferta nas outras', () => {
  it('Congelante Experiente escolhida no N7 (plano) some do N9; plano não duplica', async () => {
    const id = createLocalEntity(
      'Heroi',
      'Leonel Experiente',
      JSON.parse(
        fs.readFileSync(path.join(appDir, 'tests/fixtures/heroes/Leonel Bravolla.json'), 'utf8'),
      ).frontmatter as Record<string, unknown>,
    )
    renderBiografia(id)
    await abrirPlanejamento()
    const abreEss = async (nivel: number) => {
      const card = document.querySelector(`[data-nivel="${nivel}"]`) as HTMLElement
      const botao = [...card.querySelectorAll('button')].find((b) =>
        (b.textContent ?? '').includes('ESSÊNCIA ELEMENTAL EXPERIENTE'),
      )
      expect(botao, `botão de essências experiente no N${nivel}`).toBeTruthy()
      fireEvent.click(botao!)
      return waitFor(() => {
        const s2 = [...document.querySelectorAll('select')].find((x) =>
          [...(x as HTMLSelectElement).options].some((o) => (o.textContent ?? '').includes('Experiente')),
        ) as HTMLSelectElement
        expect(s2, `select de essência experiente no N${nivel}`).toBeTruthy()
        return s2
      })
    }
    // N7 (futuro — Leonel é N3): escolhe Congelante Experiente → vai pro PLANO
    const sel7 = await abreEss(7)
    const opcao = [...sel7.options].map((o) => o.value).find((v) => v.includes('Congelante Experiente'))!
    expect(opcao).toBeTruthy()
    fireEvent.change(sel7, { target: { value: opcao } })
    await waitFor(() => {
      const fmCur = getLocalEntity(id)!.frontmatter as Record<string, unknown>
      const picks = ((fmCur['Planejamento'] as Record<string, unknown>)?.['picks'] ?? {}) as Record<string, string>
      expect(Object.values(picks).filter((v) => v.includes('Congelante Experiente'))).toHaveLength(1)
    })
    fireEvent.click(screen.getByLabelText('Fechar editor'))
    // N9: a MESMA essência não pode ser re-ofertada (report 2026-08-26)
    const sel9 = await abreEss(9)
    const labels9 = [...sel9.options].map((o) => o.textContent ?? '')
    expect(labels9.some((l) => l.includes('Torrencial Experiente'))).toBe(true) // livres seguem
    expect(labels9.some((l) => l.includes('Congelante Experiente'))).toBe(false)
  }, 90000)
})

describe('#507 — remover a ESPECIALIDADE derruba a maestria dependente (cascata)', () => {
  it('tirar a espec no popup remove também o registro da maestria futura', async () => {
    const id = createLocalEntity('Heroi', 'Cascateador', {
      ...(emptyHeroFrontmatter() as Record<string, unknown>),
      Classe: '[[Guerreiro]]',
      'Nível': 4,
      Atributos: { FOR: 3, AGI: 2, INT: 1, PRE: 1 },
      Pericias: {
        Lista: [
          {
            Nome: 'Atletismo',
            Atributo: 'FOR',
            Proficiencia: 'E',
            Bonus_Item: 0,
            Bonus_Especial: 0,
            Especializacao: '[[Impulso]]',
            Incrementos: [{ A: 'Slot.A' }, { E: 'Slot.E' }],
          },
        ],
      },
      Planejamento: {
        gastosSlots: [
          { nivel: 1, tipo: 'pericia', rank: 'A', alvo: 'Atletismo' },
          { nivel: 4, tipo: 'pericia', rank: 'E', alvo: 'Atletismo' },
          { nivel: 4, tipo: 'especialidade', alvo: '[[Impulso]]', contexto: 'Atletismo' },
          { nivel: 8, tipo: 'pericia', rank: 'M', alvo: 'Atletismo' },
          // maestria de Impulso PLANEJADA pro N8 — depende da espec
          { nivel: 8, tipo: 'maestria', alvo: '[[Inércia]]', contexto: 'Atletismo' },
        ],
      },
    })
    renderBiografia(id)
    await abrirPlanejamento()
    const card4 = document.querySelector('[data-nivel="4"]') as HTMLElement
    const botao = [...card4.querySelectorAll('button')].find((b) =>
      (b.textContent ?? '').includes('ESPEC/MAESTRIAS'),
    )
    expect(botao, 'botão ESPEC/MAESTRIAS no N4').toBeTruthy()
    fireEvent.click(botao!)
    // remove a ESPECIALIDADE pelo radio selecionado
    const radio = await waitFor(() => {
      const b = [...document.querySelectorAll('button[aria-pressed="true"]')].find((x) =>
        (x.getAttribute('aria-label') ?? '').includes('Impulso'),
      ) as HTMLElement
      expect(b, 'radio da espec Impulso').toBeTruthy()
      return b
    })
    fireEvent.click(radio)
    await waitFor(
      () => {
        const fmCur = getLocalEntity(id)!.frontmatter as Record<string, unknown>
        const rows = ((fmCur['Pericias'] as Record<string, unknown>)?.['Lista'] ?? []) as Array<
          Record<string, unknown>
        >
        expect(String(rows[0]?.['Especializacao'] ?? '')).toBe('')
        const regs = ((fmCur['Planejamento'] as Record<string, unknown>)?.['gastosSlots'] ?? []) as Array<
          Record<string, unknown>
        >
        // a espec saiu E a maestria dependente saiu junto (report 2026-08-26)
        expect(regs.some((r) => String(r['alvo']).includes('Impulso'))).toBe(false)
        expect(regs.some((r) => String(r['alvo']).includes('Inércia'))).toBe(false)
        // os demais registros ficam
        expect(regs.some((r) => r['tipo'] === 'pericia' && r['rank'] === 'M')).toBe(true)
      },
      { timeout: 20000 },
    )
  }, 90000)
})

describe('#509 — remover incremento de perícia PLANEJADO (nível futuro)', () => {
  it('clicar o rank E selecionado no N4 (futuro) remove o registro e o chip', async () => {
    const id = createLocalEntity('Heroi', 'Munro Caso', {
      ...(emptyHeroFrontmatter() as Record<string, unknown>),
      Classe: '[[Guerreiro]]',
      'Nível': 3,
      Atributos: { FOR: 3, AGI: 2, INT: 1, PRE: 1 },
      Pericias: {
        Lista: [
          {
            Nome: 'Atletismo',
            Atributo: 'FOR',
            Proficiencia: 'A',
            Bonus_Item: 0,
            Bonus_Especial: 0,
            Incrementos: [{ A: 'Slot.A' }],
          },
        ],
      },
      Planejamento: {
        gastosSlots: [
          { nivel: 1, tipo: 'pericia', rank: 'A', alvo: 'Atletismo' },
          // E PLANEJADO pro N4 (herói é N3)
          { nivel: 4, tipo: 'pericia', rank: 'E', alvo: 'Atletismo' },
        ],
      },
    })
    renderBiografia(id)
    await abrirPlanejamento()
    const card4 = document.querySelector('[data-nivel="4"]') as HTMLElement
    const botaoPer = [...card4.querySelectorAll('button')].find((b) =>
      (b.textContent ?? '').includes('INCREMENTOS DE PERÍCIA'),
    )
    expect(botaoPer, 'botão de perícia no N4').toBeTruthy()
    fireEvent.click(botaoPer!)
    const rankE = await waitFor(() => {
      const linha = [...document.querySelectorAll('div')]
        .filter(
          (d) =>
            (d.textContent ?? '').includes('Atletismo') &&
            d.querySelector('[aria-label="Rank E"]:not([aria-disabled])'),
        )
        .sort((a, b) => (a.textContent ?? '').length - (b.textContent ?? '').length)[0]
      const btn = linha?.querySelector('[aria-label="Rank E"]:not([aria-disabled])') as HTMLElement
      expect(btn, 'Rank E clicável do Atletismo no popup N4').toBeTruthy()
      return btn
    })
    fireEvent.click(rankE)
    // o registro E@4 SOME e não volta (report Munro 2026-08-26: "tentei tirar
    // no nivel 4 o Atletismo como experiente mas não mudou")
    await waitFor(
      () => {
        const fmCur = getLocalEntity(id)!.frontmatter as Record<string, unknown>
        const regs = ((fmCur['Planejamento'] as Record<string, unknown>)?.['gastosSlots'] ?? []) as Array<
          Record<string, unknown>
        >
        expect(regs.some((r) => r['tipo'] === 'pericia' && r['rank'] === 'E')).toBe(false)
        expect(regs.some((r) => r['tipo'] === 'pericia' && r['rank'] === 'A')).toBe(true)
      },
      { timeout: 20000 },
    )
    // e segue fora após o rebuild assentar (sem ressurreição por pin/sync)
    await new Promise((r) => setTimeout(r, 300))
    const regs2 = ((getLocalEntity(id)!.frontmatter as Record<string, unknown>)['Planejamento'] as Record<
      string,
      unknown
    >)['gastosSlots'] as Array<Record<string, unknown>>
    expect(regs2.some((r) => r['tipo'] === 'pericia' && r['rank'] === 'E')).toBe(false)
  }, 90000)
})

describe('#512 — escolha de perícia (prop-map) grava o incremento tagueado', () => {
  it('selecionar Atletismo na PERÍCIA ADEPTA do Domador persiste e o pick resolve', async () => {
    const id = createLocalEntity('Heroi', 'Domador', {
      ...(emptyHeroFrontmatter() as Record<string, unknown>),
      Classe: '[[Caçador]]',
      'Nível': 3,
      Atributos: { FOR: 2, AGI: 3, INT: 1, PRE: 1 },
    })
    renderBiografia(id)
    await abrirPlanejamento()
    const card1 = document.querySelector('[data-nivel="1"]') as HTMLElement
    const botao = [...card1.querySelectorAll('button')].find((b) =>
      (b.textContent ?? '').includes('PERÍCIA ADEPTA'),
    )
    expect(botao, 'botão PERÍCIA ADEPTA no N1').toBeTruthy()
    fireEvent.click(botao!)
    const sel = await waitFor(() => {
      const s2 = [...document.querySelectorAll('select')].find((x) =>
        [...(x as HTMLSelectElement).options].some((o) => (o.textContent ?? '').includes('Atletismo')),
      ) as HTMLSelectElement
      expect(s2, 'select da Perícia Adepta').toBeTruthy()
      return s2
    })
    const opcao = [...sel.options].map((o) => o.value).find((v) => v.includes('Atletismo'))!
    fireEvent.change(sel, { target: { value: opcao } })
    // o pick persiste como INCREMENTO tagueado na perícia (report 2026-08-27:
    // "eu Clico e não seleciona" — o write caía em Habilidades.Lista)
    await waitFor(
      () => {
        const fmCur = getLocalEntity(id)!.frontmatter as Record<string, unknown>
        const rows = ((fmCur['Pericias'] as Record<string, unknown>)?.['Lista'] ?? []) as Array<
          Record<string, unknown>
        >
        const atl = rows.find((r) => r['Nome'] === 'Atletismo')
        const incs = JSON.stringify(atl?.['Incrementos'] ?? [])
        expect(incs).toContain('Estratégia de Caça (Domador)')
        // e NÃO vazou pra Habilidades.Lista
        const habs = JSON.stringify((fmCur['Habilidades'] as Record<string, unknown>)?.['Lista'] ?? [])
        expect(habs).not.toContain('[[Atletismo]]')
      },
      { timeout: 20000 },
    )
  }, 90000)
})

describe('#513 — coluna de maestrias vazia não mostra "Nenhuma cadastrada"', () => {
  it('herói sem perícia M elegível não renderiza o placeholder nas Competências', async () => {
    const id = createLocalEntity('Heroi', 'Sem Maestria', {
      ...(emptyHeroFrontmatter() as Record<string, unknown>),
      Classe: '[[Guerreiro]]',
      'Nível': 2,
      Atributos: { FOR: 3, AGI: 2, INT: 1, PRE: 1 },
      Pericias: {
        Lista: [
          {
            Nome: 'Atletismo',
            Atributo: 'FOR',
            Proficiencia: 'E',
            Bonus_Item: 0,
            Bonus_Especial: 0,
            Incrementos: [{ A: 'Slot.A' }, { E: 'Slot.E' }],
          },
        ],
      },
    })
    render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter initialEntries={[heroPath(id, 'habilidades')]}>
          <Routes>
            <Route path="/heroi/*" element={<FichaPage />} />
          </Routes>
        </MemoryRouter>
      </CatalogProvider>,
    )
    await waitFor(() => expect(document.body.textContent).toContain('Especialidades'), {
      timeout: 20000,
    })
    // com E elegível a coluna de Especialidades existe; a de Maestrias (sem
    // M elegível nem escolhida) SOME — e o placeholder morreu (Érico 2026-08-27)
    expect(document.body.textContent).not.toContain('Nenhuma Maestria cadastrada')
    expect(document.body.textContent).not.toContain('Nenhuma Especialidade cadastrada')
    // 'Maestrias' só no header "Especialidades e Maestrias" — a COLUNA sumiu
    expect((document.body.textContent?.match(/Maestrias/g) ?? []).length).toBe(1)
  }, 60000)
})

describe('#516 — popup MAGIAS oferece a escola SECUNDÁRIA e aprende nela', () => {
  it('Caçador+Arcanista: Choque Mental entra em Magias.Secundaria.Lista com registro sec', async () => {
    const id = createLocalEntity('Heroi', 'Cacador Arcano', {
      ...(emptyHeroFrontmatter() as Record<string, unknown>),
      Classe: '[[Caçador]]',
      'Nível': 4,
      Atributos: { FOR: 2, AGI: 3, INT: 1, PRE: 1 },
      Tecnicas: { Lista: [{ '[[Treinamento de Classe Secundária]]': 'Slot.A' }] },
      Habilidades: {
        Lista: [
          { '[[Treinamento de Arcanista]]': 'Escolha.[[Treinamento de Classe Secundária]]' },
          { '[[Escola Arcana Menor]]': 'Regra.[[Treinamento de Arcanista]]' },
          { '[[Escola Arcana Menor (Estudos do Vazio)]]': 'Escolha.[[Escola Arcana Menor]]' },
        ],
      },
    })
    renderBiografia(id)
    await abrirPlanejamento()
    // acha o card com o botão MAGIAS de slots secundários (2ª no label)
    const botao = await waitFor(() => {
      const b = [...document.querySelectorAll('button')].find((x) =>
        (x.textContent ?? '').includes('MAGIAS') && (x.textContent ?? '').includes('2ª'),
      ) as HTMLElement
      expect(b, 'botão MAGIAS com slots secundários').toBeTruthy()
      return b
    })
    fireEvent.click(botao)
    // seção da escola secundária com Choque Mental aprendível
    const add = await waitFor(() => {
      const btn = [...document.querySelectorAll('button')].find((x) =>
        (x.getAttribute('aria-label') ?? '') === 'Aprender Choque Mental (secundária)',
      ) as HTMLElement
      expect(btn, 'aprender Choque Mental na secundária').toBeTruthy()
      return btn
    })
    // magias AGRUPADAS por rank com cabeçalho (report 2026-08-27: "não ta
    // agrupada pelo rank, ai fica dificil")
    const modal = add.closest('[role="dialog"]') ?? document.body
    expect(modal.textContent).toContain('Básica')
    expect(modal.textContent).toContain('Adepta')
    fireEvent.click(add)
    await waitFor(
      () => {
        const fmCur = getLocalEntity(id)!.frontmatter as Record<string, unknown>
        const sec = ((fmCur['Magias'] as Record<string, unknown>)?.['Secundaria'] ?? {}) as Record<string, unknown>
        expect(JSON.stringify(sec['Lista'] ?? [])).toContain('[[Choque Mental]]')
        const regs = ((fmCur['Planejamento'] as Record<string, unknown>)?.['gastosSlots'] ?? []) as Array<
          Record<string, unknown>
        >
        const r = regs.find((x) => String(x['alvo']).includes('Choque Mental'))
        expect(r?.['sec']).toBe(true)
        // e NÃO entrou na lista primária
        expect(JSON.stringify((fmCur['Magias'] as Record<string, unknown>)?.['Lista'] ?? [])).not.toContain(
          'Choque Mental',
        )
      },
      { timeout: 20000 },
    )
  }, 90000)
})

describe('#518 — remover a técnica de multiclasse derruba TODOS os derivados', () => {
  it('tirar o Treinamento limpa magia sec real, registro sec e picks do plano', async () => {
    const id = createLocalEntity('Heroi', 'Ex Multiclasse', {
      ...(emptyHeroFrontmatter() as Record<string, unknown>),
      Classe: '[[Caçador]]',
      'Nível': 4,
      Atributos: { FOR: 2, AGI: 3, INT: 1, PRE: 1 },
      Tecnicas: { Lista: [{ '[[Treinamento de Classe Secundária]]': 'Slot.A' }] },
      Habilidades: {
        Lista: [
          { '[[Treinamento de Arcanista]]': 'Escolha.[[Treinamento de Classe Secundária]]' },
          { '[[Escola Arcana Menor]]': 'Regra.[[Treinamento de Arcanista]]' },
          { '[[Escola Arcana Menor (Estudos do Vazio)]]': 'Escolha.[[Escola Arcana Menor]]' },
        ],
      },
      Magias: {
        Lista: [],
        Secundaria: {
          Lista: [
            { Nome: 'Arcana Negra', Proficiencia: 'N', Lista: [{ '[[Choque Mental]]': 'Slot.B' }] },
          ],
        },
      },
      Planejamento: {
        gastosSlots: [
          { nivel: 1, tipo: 'tecnica', rank: 'A', alvo: '[[Treinamento de Classe Secundária]]' },
          { nivel: 1, tipo: 'magia', rank: 'B', alvo: '[[Choque Mental]]', contexto: 'Arcana Negra', sec: true },
        ],
      },
    })
    renderBiografia(id)
    await abrirPlanejamento()
    // remove o Treinamento pelo popup de TÉCNICAS do N1
    const card1 = document.querySelector('[data-nivel="1"]') as HTMLElement
    // o gasto da técnica pode ter caído em outro nível — acha o card com o
    // botão TÉCNICAS
    const botaoTec = [...document.querySelectorAll('[data-nivel] button')].find((b) =>
      (b.textContent ?? '').includes('TÉCNICAS'),
    )
    expect(botaoTec, 'botão TÉCNICAS em algum card').toBeTruthy()
    fireEvent.click(botaoTec!)
    const remover = await waitFor(() => {
      const btn = [...document.querySelectorAll('button')].find((x) =>
        (x.getAttribute('aria-label') ?? '').includes('Remover Treinamento de Classe Secundária'),
      ) as HTMLElement
      expect(btn, 'remover do Treinamento no popup').toBeTruthy()
      return btn
    })
    fireEvent.click(remover)
    // TUDO derivado cai (report 2026-08-27: "as magias e coisas que vieram
    // derivadas dela continuam no planejamento, ta muito errado")
    await waitFor(
      () => {
        const fmCur = getLocalEntity(id)!.frontmatter as Record<string, unknown>
        expect(JSON.stringify((fmCur['Tecnicas'] as Record<string, unknown>)?.['Lista'] ?? [])).not.toContain(
          'Treinamento',
        )
        const regs = ((fmCur['Planejamento'] as Record<string, unknown>)?.['gastosSlots'] ?? []) as Array<
          Record<string, unknown>
        >
        expect(regs.some((r) => String(r['alvo']).includes('Choque Mental'))).toBe(false)
        const sec = JSON.stringify(
          ((fmCur['Magias'] as Record<string, unknown>)?.['Secundaria'] as Record<string, unknown>)?.['Lista'] ?? [],
        )
        expect(sec).not.toContain('Choque Mental')
      },
      { timeout: 30000 },
    )
  }, 120000)
})
