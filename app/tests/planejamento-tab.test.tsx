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
