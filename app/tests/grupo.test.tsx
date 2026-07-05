// @vitest-environment jsdom
// Ficha de grupo: lógica espelhada do plugin validada sobre os dados REAIS
// da vault + render da tela desenhada (§GRUPOS) com um grupo real.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { GrupoView } from '../src/grupo/GrupoView'
import {
  BAL_CAPTION,
  groupMembers,
  groupTotals,
  papelValues,
  rankLetter,
  tierFromLevel,
} from '../src/grupo/party'
import { computeGrupoAggregates, memberStats } from '../src/grupo/stats'
import { maxAttackModifier } from '../src/grupo/ataques'
import { topTwoForSkill } from '../src/grupo/destaques'
import {
  computeMemberWealthParts,
  expectedWealthForLevel,
  precoPO,
  tierMultFromName,
} from '../src/grupo/wealth'
import { cycleSort, gnum } from '../src/grupo/sort'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

const GROUP_ID = 'Sistema/Criaturas/Grupos de Criaturas/Adriann, Carlos, Kenji, Zuko'
const GROUP5_ID = 'Sistema/Criaturas/Grupos de Criaturas/Carlos, Dante, Mera, Pind, Thoren'

const readDoc = (id: string): VaultDoc =>
  JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${id}.json`), 'utf8')) as VaultDoc

/** Docs reais dos membros de um grupo, indexados por id. */
const readMemberDocs = (groupId: string): Map<string, VaultDoc> =>
  new Map(groupMembers(catalog, groupId).map((m) => [m.id, readDoc(m.id)]))

// Bônus de proficiência recomputado NO TESTE (expectativa independente).
const PB: Record<string, number> = { N: 0, A: 2, E: 4, M: 6 }
type AnyFm = Record<string, any>

beforeAll(() => {
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

describe('party.ts (espelho do plugin) sobre dados reais', () => {
  it('membros = criaturas cujo FM.grupo resolve pro doc do grupo', () => {
    const members = groupMembers(catalog, GROUP_ID)
    // expectativa independente: varre o índice cru
    const expected = manifest.docs.filter((d) => {
      if (d.kind !== 'content' || d.type !== 'Criatura' || !d.grupo) return false
      const list = Array.isArray(d.grupo) ? d.grupo : [d.grupo]
      return list.some((g) => g.includes('[[Adriann, Carlos, Kenji, Zuko]]'))
    })
    expect(members.map((m) => m.id).sort()).toEqual(expected.map((d) => d.id).sort())
    expect(members.length).toBeGreaterThan(0)
  })

  it('papelValues espelha FM.Papel (Adriann real)', () => {
    const adriann = readDoc('Sistema/Criaturas/Heróis/Adriann')
    expect(papelValues(adriann)).toEqual(adriann.frontmatter['Papel'])
  })

  it('tierFromLevel e rankLetter seguem o plugin', () => {
    expect([1, 3, 4, 6, 7, 9, 10, 15].map(tierFromLevel)).toEqual([1, 1, 2, 2, 3, 3, 4, 4])
    expect(rankLetter({}, 1)).toBe('C')
    expect(rankLetter({}, 3)).toBe('A')
    expect(rankLetter({}, 4)).toBe('S')
    // regra do plugin: primeiro [SABCD] da string ("Classe B" daria 'C')
    expect(rankLetter({ rank: 'B' }, 4)).toBe('B')
    expect(rankLetter({ rank: 'Classe B' }, 4)).toBe('C')
  })

  it('linha Grupo soma os papéis dos membros', () => {
    const members = groupMembers(catalog, GROUP_ID)
    const values = members.map((m) => papelValues(readDoc(m.id)))
    const totals = groupTotals(values)
    for (const papel of ['Lider', 'Controlador', 'Abatedor', 'Vanguarda'] as const) {
      expect(totals[papel]).toBe(values.reduce((s, v) => s + v[papel], 0))
    }
  })
})

describe('GrupoView (tela do design com dados reais)', () => {
  it('header + tabela de balanceamento + nota verbatim', async () => {
    render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter>
          <GrupoView groupId={GROUP_ID} />
        </MemoryRouter>
      </CatalogProvider>,
    )
    const members = groupMembers(catalog, GROUP_ID)
    // header: nomes do grupo + contagem real
    expect(screen.getByText('Adriann, Carlos, Kenji, Zuko')).toBeTruthy()
    expect(screen.getByText(`${members.length} integrantes`)).toBeTruthy()
    // linha do Adriann usa a classe real (Mago) após o load
    expect(await screen.findByText('Mago')).toBeTruthy()
    // linha Grupo + nota do plugin ("Grupo" também aparece nas linhas
    // agregadas dos painéis Vida/Riqueza, montados no track deslizante)
    expect(screen.getAllByText('Grupo').length).toBeGreaterThan(0)
    expect(screen.getByText(BAL_CAPTION)).toBeTruthy()
    // colunas dos papéis
    for (const col of ['LID', 'CON', 'ABT', 'VAN', 'TIR']) {
      expect(screen.getByText(col)).toBeTruthy()
    }
  })
})

describe('stats.ts (espelho de aggregates.ts) sobre o grupo do Thoren', () => {
  it('defesas/sentidos/movimento do Thoren batem com o cálculo manual do FM', () => {
    const fm = readDoc('Sistema/Criaturas/Heróis/Thoren').frontmatter as AnyFm
    const stats = memberStats(fm)
    expect(stats.v).toBe(fm.Vida.Vitalidade)
    expect(stats.m).toBe(fm.Vida.Moral)
    for (const row of fm.Defesas_Resistencias.Lista) {
      const manual =
        10 + fm.Atributos[row.Atributo] + PB[row.Proficiencia] + row.Bonus_Item + row.Bonus_Especial
      expect(stats.defs[row.Nome]).toBe(manual)
    }
    for (const row of fm.Sentidos.Lista) {
      const manual =
        fm.Atributos[row.Atributo] + PB[row.Proficiencia] + row.Bonus_Item + row.Bonus_Especial
      expect(stats.sns[row.Nome]).toBe(manual)
    }
    const mov = fm.Movimento.Lista.find((r: AnyFm) => r.Nome === 'Terrestre')
    expect(stats.sp).toBe(4 + fm.Atributos[mov.Atributo] + mov.Bonus_Item + mov.Bonus_Especial)
  })

  it('linha Grupo: soma VIT/MOR, média floor de Defesa, mínimo de MOV', () => {
    const docs = readMemberDocs(GROUP5_ID)
    const members = groupMembers(catalog, GROUP5_ID)
    expect(members.length).toBeGreaterThan(0)
    const agg = computeGrupoAggregates(
      members.map((m) => memberStats(docs.get(m.id)!.frontmatter)),
    )!
    const fms = members.map((m) => docs.get(m.id)!.frontmatter as AnyFm)
    expect(agg.sumVit).toBe(fms.reduce((s, f) => s + f.Vida.Vitalidade, 0))
    expect(agg.sumMor).toBe(fms.reduce((s, f) => s + f.Vida.Moral, 0))
    const manualDef = fms.map((f) => {
      const row = f.Defesas_Resistencias.Lista.find((r: AnyFm) => r.Nome === 'Defesa')
      return 10 + f.Atributos[row.Atributo] + PB[row.Proficiencia] + row.Bonus_Item + row.Bonus_Especial
    })
    expect(agg.defsAvg['Defesa']).toBe(
      Math.floor(manualDef.reduce((a, b) => a + b, 0) / manualDef.length),
    )
    const manualSp = fms.map((f) => {
      const row =
        f.Movimento.Lista.find((r: AnyFm) => r.Nome === 'Terrestre') ?? f.Movimento.Lista[0]
      return 4 + f.Atributos[row.Atributo] + row.Bonus_Item + row.Bonus_Especial
    })
    expect(agg.minSp).toBe(Math.min(...manualSp))
  })
})

describe('ataques.ts e destaques.ts (espelho do plugin) sobre dados reais', () => {
  it('maxAttackModifier = prof de ataque + atributo + bônus (maior linha)', () => {
    const fm = readDoc('Sistema/Criaturas/Heróis/Thoren').frontmatter as AnyFm
    const rows = [
      ...(fm.Inventario?.Armas?.Lista ?? []),
      ...fm.Ataques.Lista.filter((r: AnyFm) => r.Nome !== 'Manobras'),
    ].filter((r: AnyFm) => String(r.Nome ?? '').trim())
    const manual = Math.max(
      ...rows.map(
        (r: AnyFm) =>
          PB[fm.Ataques.Proficiencia] +
          (fm.Atributos[String(r.Atributo).toUpperCase()] || 0) +
          (Number(r.Bonus_Item) || 0) +
          (Number(r.Bonus_Especial) || 0),
      ),
    )
    expect(maxAttackModifier(fm)).toBe(manual)
  })

  it('topTwoForSkill ordena por mod desc (Atletismo no grupo do Thoren)', () => {
    const members = groupMembers(catalog, GROUP5_ID)
    const docs = readMemberDocs(GROUP5_ID)
    const tops = topTwoForSkill(members, docs, 'Atletismo')
    expect(tops.length).toBe(2)
    const manual = members
      .map((m) => {
        const f = docs.get(m.id)!.frontmatter as AnyFm
        const row = f.Pericias.Lista.find((r: AnyFm) => r.Nome === 'Atletismo')
        return f.Atributos[row.Atributo] + PB[row.Proficiencia] + row.Bonus_Item + row.Bonus_Especial
      })
      .sort((a, b) => b - a)
    expect(tops[0].mod).toBe(manual[0])
    expect(tops[1].mod).toBe(manual[1])
  })
})

describe('wealth.ts (espelho de runtime/wealth) sobre dados reais', () => {
  it('tabela de riqueza esperada e multiplicadores de tier', () => {
    expect(expectedWealthForLevel(7)).toBe(1000)
    expect(expectedWealthForLevel(10)).toBe(4800)
    expect(expectedWealthForLevel(12)).toBe(5700)
    expect(
      [tierMultFromName('Adepto'), tierMultFromName('Experiente'), tierMultFromName('Mestre')],
    ).toEqual([1, 5, 25])
  })

  it('partes de riqueza do Thoren batem com o cálculo manual (preços reais)', () => {
    const fm = readDoc('Sistema/Criaturas/Heróis/Thoren').frontmatter as AnyFm
    const priceOf = (target: string): number => {
      const res = catalog.resolve(target)
      return res.kind === 'doc' ? precoPO(readDoc(res.id)) : 0
    }
    const parts = computeMemberWealthParts(fm, priceOf)
    expect(parts.ouro).toBe(Number(fm.Inventario.Ouro) || 0)
    // Tesouros: preço do item × mult do "(Tier)" no display do wikilink.
    const MULT: Record<string, number> = { Adepto: 1, Experiente: 5, Mestre: 25 }
    const manualTesouros = (fm.Inventario.Tesouros as string[]).reduce((sum, wl) => {
      const target = /\[\[([^\]|]+)/.exec(wl)![1]
      const tier = /\((Adepto|Experiente|Mestre)\)/.exec(wl)?.[1] ?? 'Adepto'
      return sum + priceOf(target) * MULT[tier]
    }, 0)
    expect(parts.tesouros).toBe(manualTesouros)
    expect(manualTesouros).toBeGreaterThan(0)
    // Consumíveis: idem, × quantidade "(xN)".
    const manualConsum = (fm.Inventario.Consumiveis as string[]).reduce((sum, wl) => {
      const target = /\[\[([^\]|]+)/.exec(wl)![1]
      const tier = /\((Adepto|Experiente|Mestre)\)/.exec(wl)?.[1] ?? 'Adepto'
      const qty = /\(x(\d+)\)/.exec(wl)?.[1] ?? '1'
      return sum + priceOf(target) * MULT[tier] * Number(qty)
    }, 0)
    expect(parts.consumiveis).toBe(manualConsum)
    expect(parts.itensSemConsumiveis).toBe(parts.tesouros + parts.armaduraEscudo + parts.armasProp)
    expect(parts.totalComTudo).toBe(parts.ouro + parts.itensSemConsumiveis + parts.consumiveis)
  })
})

describe('GrupoView: abas, painéis e imagem do grupo (dados reais)', () => {
  const renderGroup5 = () =>
    render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter>
          <GrupoView groupId={GROUP5_ID} />
        </MemoryRouter>
      </CatalogProvider>,
    )

  it('abas trocam o painel: track desliza pro índice da aba', () => {
    const { container } = renderGroup5()
    const track = container.querySelector('[data-track]') as HTMLElement
    expect(track).toBeTruthy()
    expect(track.style.transform).toBe('translateX(-0%)')
    fireEvent.click(screen.getByText('RIQUEZA'))
    expect(track.style.transform).toBe('translateX(-200%)')
    fireEvent.click(screen.getByText('ATAQUES'))
    expect(track.style.transform).toBe('translateX(-400%)')
    fireEvent.click(screen.getByText('PAPÉIS'))
    expect(track.style.transform).toBe('translateX(-0%)')
  })

  it('painel COMPETÊNCIAS mostra os agregados de vida do grupo', async () => {
    const { container } = renderGroup5()
    const docs = readMemberDocs(GROUP5_ID)
    const members = groupMembers(catalog, GROUP5_ID)
    const agg = computeGrupoAggregates(
      members.map((m) => memberStats(docs.get(m.id)!.frontmatter)),
    )!
    fireEvent.click(screen.getByText('COMPETÊNCIAS'))
    const vidaPanel = container.querySelectorAll('[data-panel]')[1] as HTMLElement
    // soma de VIT do grupo aparece na linha Grupo do painel
    await waitFor(() => {
      expect(vidaPanel.textContent).toContain(String(agg.sumVit))
      expect(vidaPanel.textContent).toContain(String(agg.sumMor))
    })
    // colunas verbatim do design
    for (const col of ['VIT', 'MOR', 'DEF', 'VIG', 'IMP', 'REF', 'PER', 'ITU', 'MOV']) {
      expect(vidaPanel.textContent).toContain(col)
    }
  })

  it('header resolve a imagem do grupo (Retratos/<basename do grupo>)', async () => {
    const { container } = renderGroup5()
    await waitFor(() => expect(container.querySelector('img')).toBeTruthy())
    const src = container.querySelector('img')!.getAttribute('src') ?? ''
    expect(decodeURIComponent(src)).toContain('Retratos/Carlos, Dante, Mera, Pind, Thoren.png')
  })
})

describe('sort por clique nos cabeçalhos (grpCycleSort/applySort do design)', () => {
  it('cycleSort: sem sort → ▼ desc; ▼ → ▲ asc; ▲ → null (padrão)', () => {
    expect(cycleSort(null, 2)).toEqual({ col: 2, dir: -1 })
    expect(cycleSort({ col: 2, dir: -1 }, 2)).toEqual({ col: 2, dir: 1 })
    expect(cycleSort({ col: 2, dir: 1 }, 2)).toBeNull()
    // clicar noutra coluna reinicia o ciclo
    expect(cycleSort({ col: 2, dir: -1 }, 0)).toEqual({ col: 0, dir: -1 })
  })

  it('gnum do design: "Tier 3"→3, "+9"→9, "—"→0, "350 PO"→350', () => {
    expect(gnum('Tier 3')).toBe(3)
    expect(gnum('+9')).toBe(9)
    expect(gnum('—')).toBe(0)
    expect(gnum('350 PO')).toBe(350)
    expect(gnum('-120 PO')).toBe(-120)
  })

  it('clicar em VIT reordena as linhas (desc → asc → padrão alfabético)', async () => {
    const { container } = render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter>
          <GrupoView groupId={GROUP5_ID} />
        </MemoryRouter>
      </CatalogProvider>,
    )
    const docs = readMemberDocs(GROUP5_ID)
    const members = groupMembers(catalog, GROUP5_ID)
    const vidaPanel = container.querySelectorAll('[data-panel]')[1] as HTMLElement
    // espera os docs carregarem (VIT real do primeiro membro visível)
    const anyVit = String((docs.get(members[0].id)!.frontmatter as AnyFm).Vida.Vitalidade)
    await waitFor(() => expect(vidaPanel.textContent).toContain(anyVit))

    // expectativa independente: lista base = nível desc + nome (ordem do
    // plugin); sort estável do applySort preserva empates da base
    const base = members
      .map((m) => {
        const fm = docs.get(m.id)!.frontmatter as AnyFm
        return { nome: m.basename ?? m.id, nivel: Number(fm['Nível']) || 1, vit: Number(fm.Vida.Vitalidade) }
      })
      .sort((a, b) => b.nivel - a.nivel || a.nome.localeCompare(b.nome, 'pt'))
    const stable = <T,>(arr: T[], cmp: (a: T, b: T) => number): T[] =>
      arr
        .map((v, i) => [v, i] as const)
        .sort((a, b) => cmp(a[0], b[0]) || a[1] - b[1])
        .map(([v]) => v)
    const namesInOrder = (expected: string[]) => {
      const txt = vidaPanel.textContent ?? ''
      const idx = expected.map((n) => txt.indexOf(n))
      for (const i of idx) expect(i).toBeGreaterThanOrEqual(0)
      for (let i = 1; i < idx.length; i++) expect(idx[i]).toBeGreaterThan(idx[i - 1])
    }

    // padrão (sem sort): alfabético pt por nome
    namesInOrder([...base.map((r) => r.nome)].sort((a, b) => a.localeCompare(b, 'pt')))

    const vitHead = within(vidaPanel).getByText('VIT')
    // 1º clique: desc + seta ▼
    fireEvent.click(vitHead)
    expect(vitHead.textContent).toContain('▼')
    namesInOrder(stable(base, (a, b) => b.vit - a.vit).map((r) => r.nome))
    // 2º clique: asc + seta ▲
    fireEvent.click(vitHead)
    expect(vitHead.textContent).toContain('▲')
    namesInOrder(stable(base, (a, b) => a.vit - b.vit).map((r) => r.nome))
    // 3º clique: volta ao padrão, sem seta
    fireEvent.click(vitHead)
    expect(vitHead.textContent).not.toMatch(/[▼▲]/)
    namesInOrder([...base.map((r) => r.nome)].sort((a, b) => a.localeCompare(b, 'pt')))
    // linha Grupo sempre por último
    const txt = vidaPanel.textContent ?? ''
    expect(txt.lastIndexOf('Grupo')).toBeGreaterThan(txt.indexOf(base[0].nome))
  })
})

describe('tooltips do grupo (buildGtip + window.__GTIPS do design)', () => {
  const renderGroup5 = () =>
    render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter>
          <GrupoView groupId={GROUP5_ID} />
        </MemoryRouter>
      </CatalogProvider>,
    )

  it('grupo-tips.js foi carregado no window (registro central)', () => {
    renderGroup5()
    const gt = (window as unknown as { __GTIPS?: { store: unknown[]; map: Record<string, number> } })
      .__GTIPS
    expect(gt).toBeTruthy()
    expect(gt!.store.length).toBeGreaterThan(0)
    expect(gt!.map['vida:h1']).toBeDefined()
    expect(gt!.map['riq:f1']).toBeDefined()
  })

  it('hover no cabeçalho VIT mostra o conteúdo real do grupo-tips e some no leave', async () => {
    const { container } = renderGroup5()
    const vidaPanel = container.querySelectorAll('[data-panel]')[1] as HTMLElement
    const vitHead = within(vidaPanel).getByText('VIT')
    fireEvent.mouseOver(vitHead, { clientX: 200, clientY: 200 })
    // conteúdo verbatim do store ('vida:h1')
    expect(await screen.findByText(/pontos de vida físicos/)).toBeTruthy()
    fireEvent.mouseOut(vitHead)
    expect(screen.queryByText(/pontos de vida físicos/)).toBeNull()
  })

  it('hero RIQUEZA TOTAL usa a chave riq:f1; trocar de aba limpa o tooltip', async () => {
    const { container } = renderGroup5()
    const riqPanel = container.querySelectorAll('[data-panel]')[2] as HTMLElement
    const hero = within(riqPanel).getByText('RIQUEZA TOTAL').parentElement as HTMLElement
    fireEvent.mouseOver(hero, { clientX: 300, clientY: 300 })
    expect(await screen.findByText(/inclui consumíveis/)).toBeTruthy()
    // grupoTabs do design: onClick seta {grupoTab, gtip:null}
    fireEvent.click(screen.getByText('PAPÉIS'))
    expect(screen.queryByText(/inclui consumíveis/)).toBeNull()
  })

  it('rótulo da linha Grupo usa a chave fixa vida:r5c0', async () => {
    const { container } = renderGroup5()
    const vidaPanel = container.querySelectorAll('[data-panel]')[1] as HTMLElement
    const label = within(vidaPanel).getByText('Grupo').parentElement as HTMLElement
    fireEvent.mouseOver(label, { clientX: 150, clientY: 150 })
    // conteúdo do store em 'vida:r5c0' (Linha Grupo)
    expect(await screen.findByText(/Resumo do conjunto/)).toBeTruthy()
    fireEvent.mouseOut(label)
    expect(screen.queryByText(/Resumo do conjunto/)).toBeNull()
  })
})
