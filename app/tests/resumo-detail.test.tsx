// @vitest-environment jsdom
// Ficha RESUMO completa (#199) — espelho do modo Resumo do pleitost-autosheet
// sobre o FM REAL do Carlos (vault-data): movimento em QUADRADOS ("Nq", emoji
// 👣 do registro), perícias treinadas por atributo, magias (modificador
// +N/CD, Potência, EM e listas por rank), ataques com armas (modificador/
// dano/propriedades), ações, técnicas, tesouros, habilidades e consumíveis —
// TUDO com tooltip (data-breakdown-html do TipHover/ItemHover).
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { ResumoDetail } from '../src/components/detail/ResumoDetail'
import { tokens } from '../src/generated/tokens'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest
const catalog = buildCatalog(manifest)
// Carlos: bardo nível 7 — AGI 2/INT 1/PRE 3, Punhal Relampejante (E), Arcana
// Branca E, 7 tesouros, 5 consumíveis, 2 ações (FM real da vault).
const CARLOS_ID = 'Sistema/Criaturas/Heróis/Carlos Facão de Andradas'

beforeAll(() => {
  globalThis.fetch = (async (input: unknown) => {
    const url = String(input)
    const rel = decodeURIComponent(url.replace(/^\/vault-data\//, ''))
    const file = path.join(vaultDataDir, rel)
    const ok = fs.existsSync(file)
    return { ok, status: ok ? 200 : 404, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) }
  }) as typeof fetch
})
afterEach(() => {
  cleanup()
  window.localStorage?.clear()
})

async function renderResumo() {
  const utils = render(
    <CatalogProvider catalog={catalog}>
      <ResumoDetail id={CARLOS_ID} />
    </CatalogProvider>,
  )
  // corpo carregado (o chip de movimento só existe com o doc na tela)
  await screen.findByText('6q')
  return utils
}

/** Todos os data-breakdown-html da tela (tooltips graváveis sem hover). */
function allTips(container: HTMLElement): string[] {
  return [...container.querySelectorAll<HTMLElement>('[data-breakdown-html]')].map(
    (el) => el.getAttribute('data-breakdown-html') ?? '',
  )
}

describe('#199 resumo — movimento em quadrados', () => {
  it('MOV mostra "Nq" (4 + AGI 2 = 6q) com o emoji 👣 do registro e tooltip do breakdown', async () => {
    const { container } = await renderResumo()
    const chip = screen.getByText('6q').closest('[data-breakdown-html]') as HTMLElement
    expect(chip).toBeTruthy()
    // emoji do registro central (subcategoria.Movimento), não 👟 inventado
    expect(chip.textContent).toContain(tokens.emojis.subcategoria.Movimento)
    expect(chip.textContent).not.toContain('👟')
    // não é mais metros ("6m")
    expect(container.textContent).not.toContain('6m')
    // breakdown do plugin: Terrestre = Base 4 + AGI 2
    const tip = chip.getAttribute('data-breakdown-html') ?? ''
    expect(tip).toContain('Terrestre')
    expect(tip).toContain('Base (4)')
    expect(tip).toContain('AGI (+2)')
    // tap (jsdom = sem hover) abre o overlay com o breakdown
    fireEvent.click(screen.getByText('6q'))
    const overlay = document.querySelector('.dv-breakdown-tip')
    expect(overlay).toBeTruthy()
    expect(overlay!.innerHTML).toContain('Terrestre')
  })

  it('defesas e sentidos também ganham tooltip de breakdown', async () => {
    await renderResumo()
    // DEF = 10 + AGI 2 + M 6 + item 2 = 20; ÍMP = 10 + PRE 3 + M 6 + item 1 = 20
    const defs = screen
      .getAllByText('20', { selector: 'span' })
      .map((el) => el.closest('[data-breakdown-html]')?.getAttribute('data-breakdown-html') ?? '')
    expect(defs.some((t) => t.includes('Defesa') && t.includes('Base (10)'))).toBe(true)
    expect(defs.some((t) => t.includes('Impeto') && t.includes('Base (10)'))).toBe(true)
    // PER = INT 1 + M 6 + item 2 = +9 (aparece 2x: PER e ITU são ambos +9)
    const sentidos = screen
      .getAllByText('+9', { selector: 'span' })
      .map((el) => el.closest('[data-breakdown-html]')?.getAttribute('data-breakdown-html') ?? '')
    expect(sentidos.some((t) => t.includes('Percepção'))).toBe(true)
    expect(sentidos.some((t) => t.includes('Intuição'))).toBe(true)
  })
})

describe('#199 resumo — perícias', () => {
  it('lista só as treinadas, agrupadas por atributo, com modificador assinado', async () => {
    const { container } = await renderResumo()
    expect(screen.getByText('// PERÍCIAS')).toBeTruthy()
    const txt = container.textContent ?? ''
    // AGI: Acrobacia E (2+4), Furtividade A (2+2)
    expect(txt).toContain('Acrobacia +6')
    expect(txt).toContain('Furtividade +4')
    // PRE: Enganação M +1 item (3+6+1), Diplomacia E +1 (3+4+1)
    expect(txt).toContain('Enganação +10')
    expect(txt).toContain('Diplomacia +8')
    // não-treinada (Atletismo N) fica fora
    expect(txt).not.toContain('Atletismo')
  })

  it('cada perícia tem tooltip com o breakdown (atributo/proficiência/item)', async () => {
    const { container } = await renderResumo()
    const tips = allTips(container)
    const enganacao = tips.find((t) => t.includes('Enganacao (PRE)'))
    expect(enganacao).toBeTruthy()
    expect(enganacao).toContain('Mestre (+6)')
    expect(enganacao).toContain('Item (+1)')
  })
})

describe('#199 resumo — magias', () => {
  it('mostra o modificador +N/CD da escola proficiente, Potência e EM', async () => {
    const { container } = await renderResumo()
    // Arcana Branca E: PRE 3 + prof 4 = +7, CD 17 (formato do resumo do plugin)
    expect(screen.getByText('Magia Arcana Branca')).toBeTruthy()
    expect(screen.getByText('+7/CD17')).toBeTruthy()
    // escola não-proficiente não ganha linha de modificador
    expect(screen.queryByText('Magia Arcana Negra')).toBeNull()
    const txt = container.textContent ?? ''
    expect(txt).toContain('POTÊNCIA MÁGICA 8')
    expect(txt).toContain('ENERGIA MÁGICA 4/4')
  })

  it('modificador tem tooltip do somatório do ataque mágico', async () => {
    await renderResumo()
    const tip =
      screen.getByText('+7/CD17').closest('[data-breakdown-html]')?.getAttribute('data-breakdown-html') ?? ''
    expect(tip).toContain('Ataque Mágico')
    expect(tip).toContain('PRE')
  })

  it('lista as magias por rank (e as de tesouros) com a carta da regra no hover', async () => {
    await renderResumo()
    expect(screen.getByText('BÁSICAS')).toBeTruthy()
    expect(screen.getByText('ADEPTAS')).toBeTruthy()
    expect(screen.getByText('TESOUROS')).toBeTruthy() // grupo das magias de tesouros
    expect(screen.getByText('Avivar')).toBeTruthy()
    expect(screen.getByText('Visão no Escuro')).toBeTruthy()
    // carta do doc chega async (refs) — o hover fica no wrapper do TipHover
    await waitFor(() => {
      const tip = screen.getByText('Avivar').closest('[data-breakdown-html]')
      expect(tip).toBeTruthy()
      expect(tip!.getAttribute('data-breakdown-html')).toContain('shc-card')
    })
  })

  it('#257: tooltip de tesouro possuído renderiza o card da QUALIDADE possuída', async () => {
    await renderResumo()
    // Carlos possui "Anel da Resistência (Adepto)" — o hover mostra a carta do
    // item no tier possuído (tier-específico), não a prosa inteira (fullBody).
    await waitFor(() => {
      const chip = screen.getAllByText(/Anel da Resistência/)[0]
      const tip = chip.closest('[data-breakdown-html]')
      expect(tip).toBeTruthy()
      const html = tip!.getAttribute('data-breakdown-html') ?? ''
      expect(html).toContain('shc-card')
      // tier-específico (não fullBody): a carta do resumo é o card compacto do
      // tier possuído — sem a variante larga `shc-card--wide` da prosa completa.
      expect(html).not.toContain('shc-card--wide')
    })
  })

  it('Potência e EM têm tooltip com a nota do compêndio', async () => {
    await renderResumo()
    await waitFor(() => {
      const pot = screen.getByText('POTÊNCIA MÁGICA').closest('[data-breakdown-html]')
      expect(pot).toBeTruthy()
      expect(pot!.getAttribute('data-breakdown-html')).toContain('Potência Mágica')
      const em = screen.getByText('ENERGIA MÁGICA').closest('[data-breakdown-html]')
      expect(em).toBeTruthy()
      expect(em!.getAttribute('data-breakdown-html')).toContain('Energia Mágica')
    })
  })
})

describe('#199 resumo — ataques com armas', () => {
  it('mostra nome (com imbuição/tier), modificador e dano calculados do modelo salvo', async () => {
    await renderResumo()
    // escopo na seção ATAQUES — "+10" também existe em PERÍCIAS (Enganação)
    const sec = screen.getByText('// ATAQUES').parentElement as HTMLElement
    // Punhal + Imbuição Relampejante, categoria Experiente
    expect(within(sec).getByText('Punhal Relampejante (E)')).toBeTruthy()
    // acerto: AGI 2 + Mestre 6 + item 2 = +10
    expect(within(sec).getByText('+10')).toBeTruthy()
    // dano: d4+2 com prof M (+2 dados) = 3d4+2 — depende do doc da arma (async)
    expect(await within(sec).findByText('3d4+2')).toBeTruthy()
  })

  it('modificador e dano têm tooltip de breakdown; propriedades têm a regra no hover', async () => {
    const { container } = await renderResumo()
    const sec = screen.getByText('// ATAQUES').parentElement as HTMLElement
    const modTip =
      within(sec).getByText('+10').closest('[data-breakdown-html]')?.getAttribute('data-breakdown-html') ??
      ''
    expect(modTip).toContain('Punhal — Ataque')
    expect(modTip).toContain('AGI (+2)')
    const danoEl = await within(sec).findByText('3d4+2')
    const danoTip = danoEl.closest('[data-breakdown-html]')?.getAttribute('data-breakdown-html') ?? ''
    expect(danoTip).toContain('Punhal — Dano')
    expect(danoTip).toContain('Base (1d4+2)')
    expect(danoTip).toContain('Mestre (+2d4)')
    // sub-row de propriedades intrínsecas (↳ do resumo do plugin)
    expect(container.textContent).toContain('↳ Precisa, Arremesso 3, Apunhalante')
    await waitFor(() => {
      const prop = screen.getByText('Precisa').closest('[data-breakdown-html]')
      expect(prop).toBeTruthy()
      expect(prop!.getAttribute('data-breakdown-html')).toContain('Precisa')
    })
  })
})

describe('#199 resumo — ações, técnicas, tesouros, habilidades e consumíveis', () => {
  it('ações de habilidade aparecem com a regra completa no hover', async () => {
    await renderResumo()
    expect(screen.getByText('// AÇÕES')).toBeTruthy()
    expect(screen.getByText('Inspiração')).toBeTruthy()
    expect(screen.getByText('Ato Inspirador')).toBeTruthy()
    await waitFor(() => {
      const tip = screen.getByText('Inspiração').closest('[data-breakdown-html]')
      expect(tip).toBeTruthy()
      expect(tip!.getAttribute('data-breakdown-html')).toContain('shc-card')
    })
  })

  it('técnicas e habilidades ganham hover da carta da regra', async () => {
    await renderResumo()
    expect(screen.getByText('// TÉCNICAS')).toBeTruthy()
    expect(screen.getByText('Entrada Dramática')).toBeTruthy()
    expect(screen.getByText('// HABILIDADES')).toBeTruthy()
    expect(screen.getByText('Performance Bárdica')).toBeTruthy()
    await waitFor(() => {
      expect(screen.getByText('Entrada Dramática').closest('[data-breakdown-html]')).toBeTruthy()
      expect(screen.getByText('Performance Bárdica').closest('[data-breakdown-html]')).toBeTruthy()
    })
  })

  it('tesouros aparecem com a letra do tier e a carta no hover', async () => {
    await renderResumo()
    expect(screen.getByText('// TESOUROS')).toBeTruthy()
    expect(screen.getByText('Anel da Resistência (A)')).toBeTruthy()
    expect(screen.getByText('Amplificador Audiovisual (E)')).toBeTruthy()
    await waitFor(() => {
      const tip = screen.getByText('Anel da Resistência (A)').closest('[data-breakdown-html]')
      expect(tip).toBeTruthy()
      expect(tip!.getAttribute('data-breakdown-html')).toContain('Anel da Resistência')
    })
  })

  it('consumíveis aparecem com tier + quantidade e a carta no hover', async () => {
    const { container } = await renderResumo()
    expect(screen.getByText('// CONSUMÍVEIS')).toBeTruthy()
    const txt = container.textContent ?? ''
    expect(txt).toContain('Poção de Cura (A) x3')
    expect(txt).toContain('Poção de Cura (E) x2')
    expect(txt).toContain('Poção da Coragem (E) x1')
    await waitFor(() => {
      const tip = screen.getByText('Poção de Cura (A)').closest('[data-breakdown-html]')
      expect(tip).toBeTruthy()
      expect(tip!.getAttribute('data-breakdown-html')).toContain('Poção de Cura')
    })
  })
})

// Apresentação #242 — espelho visual do `.as-resumo` do plugin na linguagem
// do app: header-card com accent bar/badge do tier, cada seção um card com
// kicker, grids alinhados de defesas/sentidos e listas de itens em chips.
describe('#242 resumo — apresentação em cards', () => {
  it('header é um card com accent bar e badge NVL na cor do tier do registro (nível 7 → ouro)', async () => {
    const { container } = await renderResumo()
    const card = container.querySelector<HTMLElement>('[data-resumo-card]')
    expect(card).toBeTruthy()
    expect(card!.style.clipPath).toContain('polygon')
    // accent bar lateral (.as-resumo-accent do plugin) com gradient do tier
    const accent = card!.querySelector<HTMLElement>('[data-resumo-accent]')
    expect(accent).toBeTruthy()
    expect(accent!.style.background).toContain('linear-gradient')
    expect(accent!.style.background).toContain(tokens.colors.tier.Gold)
    // badge NVL/TIER (.as-resumo-badge) — Carlos nível 7 → "7" + "NVL"
    const badge = card!.querySelector<HTMLElement>('[data-resumo-badge]')
    expect(badge).toBeTruthy()
    expect(badge!.textContent).toBe('7NVL')
    // borda na cor do tier (jsdom normaliza hex → rgb; compara normalizado)
    const probe = document.createElement('div')
    probe.style.color = tokens.colors.tier.Gold
    expect(badge!.style.borderColor).toBe(probe.style.color)
  })

  it('cada seção é um card (borda + cantos cortados) com kicker mono, na ordem do #199', async () => {
    const { container } = await renderResumo()
    const secs = [...container.querySelectorAll<HTMLElement>('[data-resumo-section]')]
    for (const sec of secs) {
      expect(sec.style.clipPath).toContain('polygon')
      expect(sec.style.border).toContain('1px solid')
      const kicker = sec.querySelector<HTMLElement>('[data-resumo-kicker]')
      expect(kicker).toBeTruthy()
      // o kicker é filho direto do card — os testes de conteúdo escopam a
      // seção via `getByText('// X').parentElement`
      expect(kicker!.parentElement).toBe(sec)
    }
    expect(secs.map((s) => s.getAttribute('data-resumo-section'))).toEqual([
      '// VIDA',
      '// DEFESAS · SENTIDOS · MOVIMENTO',
      '// PERÍCIAS',
      '// MAGIAS',
      '// ATAQUES',
      '// AÇÕES',
      '// TÉCNICAS',
      '// TESOUROS',
      '// HABILIDADES',
      '// CONSUMÍVEIS',
    ])
  })

  it('defesas em grid de 4 células e sentidos+movimento em grid de 3, todas com tooltip', async () => {
    const { container } = await renderResumo()
    const defs = container.querySelector<HTMLElement>('[data-resumo-statgrid="defesas"]')
    expect(defs).toBeTruthy()
    expect(defs!.style.gridTemplateColumns).toContain('repeat(4')
    expect(defs!.children.length).toBe(4)
    const sens = container.querySelector<HTMLElement>('[data-resumo-statgrid="sentidos"]')
    expect(sens).toBeTruthy()
    expect(sens!.style.gridTemplateColumns).toContain('repeat(3')
    expect(sens!.children.length).toBe(3)
    // cada célula é o próprio TipHover do breakdown (#199)
    for (const cell of [...defs!.children, ...sens!.children]) {
      expect(cell.getAttribute('data-breakdown-html')).toBeTruthy()
    }
  })

  it('vida e listas de itens (ações/técnicas/tesouros/habilidades/consumíveis) viram chips', async () => {
    const { container } = await renderResumo()
    // vida: chips de ❤️ e 💙 (💚 só com temp > 0)
    const vida = screen.getByText('// VIDA').parentElement as HTMLElement
    expect(vida.querySelectorAll('[data-resumo-chip]').length).toBeGreaterThanOrEqual(2)
    // 5 seções de lista em chiplist
    const lists = [...container.querySelectorAll<HTMLElement>('[data-resumo-chiplist]')]
    expect(lists.length).toBe(5)
    const chip = screen.getByText('Anel da Resistência (A)').closest('[data-resumo-chip]') as HTMLElement
    expect(chip).toBeTruthy()
    expect(chip.style.clipPath).toContain('polygon')
    // quantidade do consumível fica no mesmo chip do item
    const pocao = screen.getByText('Poção da Coragem (E)').closest('[data-resumo-chip]') as HTMLElement
    expect(pocao.textContent).toBe('Poção da Coragem (E) x1')
  })

  it('perícias em grid com o emoji do atributo em coluna própria e mods em var(--red)', async () => {
    const { container } = await renderResumo()
    const grid = container.querySelector<HTMLElement>('[data-resumo-pericias]')
    expect(grid).toBeTruthy()
    expect(grid!.style.gridTemplateColumns).toContain('18px')
    // mod da perícia colorizado como o .as-resumo-mod-num do plugin
    const enganacao = within(grid!).getByText('+10')
    expect(enganacao.style.color).toBe('var(--red)')
  })

  it('ataque tem mod em var(--red) e dano em var(--blue) (mod-num/dmg-num do plugin)', async () => {
    await renderResumo()
    const sec = screen.getByText('// ATAQUES').parentElement as HTMLElement
    expect(within(sec).getByText('+10').style.color).toBe('var(--red)')
    const dano = await within(sec).findByText('3d4+2')
    expect(dano.style.color).toBe('var(--blue)')
  })
})
