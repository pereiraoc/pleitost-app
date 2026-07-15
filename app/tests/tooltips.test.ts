// Fidelidade dos tooltips da ficha (#21 #22 #25 #26) contra os goldens REAIS
// do plugin (reference/goldens/screens/carlos/**). Duas famílias de oráculo:
//
//   A) BYTE-EXACT do render: os `data-breakdown-html` dos panels da
//      Interativa do Carlos são a saída real de renderBreakdownHtml+builders
//      do plugin. Os goldens foram capturados numa época ANTERIOR do FM
//      (Enganação ainda E, Vigor A…), então os builders são alimentados com
//      os NÚMEROS DO PRÓPRIO GOLDEN — o que se valida é o formato/markup
//      exatos (título slugado, linhas sempre/omitidas, sinal do total, emoji).
//
//   B) FONTES via projeção REAL (extract sobre vault-data): ruleSourcesByPath/
//      sourcesPerRank/especializacaoOptions do app comparados com os tooltips
//      e radios dos goldens do Editável que continuam válidos pro FM atual.
import { beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import type { IndexManifest, VaultDoc } from '../src/data/types'
import { projectHeroRules } from '../src/rules/useHeroRules'
import type { HeroProjection } from '../src/rules/projection'
import {
  ataqueBreakdown,
  danoArmaBreakdown,
  enrichRuleTooltips,
  movimentoBreakdown,
  oficioBreakdown,
  periciaBreakdown,
  rankSourceTips,
  renderBreakdownHtml,
  resistenciaBreakdown,
  sentidoBreakdown,
  sourceTipHtml,
} from '../src/components/ficha/tooltips'
import type { ProfRow } from '../src/components/ficha/hero-model'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const repoDir = path.dirname(appDir)
const vaultDataDir = path.join(repoDir, 'vault-data')
const goldenDir = path.join(repoDir, 'reference/goldens/screens/carlos')

const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

const CARLOS_ID = 'Sistema/Criaturas/Heróis/Carlos Facão de Andradas'
const carlos = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, `${CARLOS_ID}.json`), 'utf8'),
) as VaultDoc
const fm = carlos.frontmatter as Record<string, unknown>

const loadFromDisk = async (id: string): Promise<VaultDoc> =>
  JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${id}.json`), 'utf8')) as VaultDoc

// ─────────────────── extração dos goldens ───────────────────

/** Inverso do escapeForAttr do plugin (breakdown-tooltip.ts:273-279). */
function unescapeAttr(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

function goldenTips(file: string): string[] {
  const txt = fs.readFileSync(path.join(goldenDir, file), 'utf8')
  const out: string[] = []
  for (const m of txt.matchAll(/data-breakdown-html="([^"]*)"/g)) out.push(unescapeAttr(m[1]))
  return out
}

/** Tooltip do golden cujo cabeçalho é `<strong>title</strong>`. */
function byTitle(tips: string[], title: string): string {
  const hit = tips.find((t) => t.includes(`<strong>${title}</strong>`))
  expect(hit, `golden tip "${title}"`).toBeTruthy()
  return hit!
}

/** Linha de proficiência do FM salvo do Carlos, por Nome. */
function fmRow(section: string, nome: string): ProfRow {
  const lista = ((fm[section] as Record<string, unknown>)['Lista'] ?? []) as ProfRow[]
  const row = lista.find((r) => r.Nome === nome)
  expect(row, `${section}.Lista.${nome}`).toBeTruthy()
  return row!
}

let projection: HeroProjection

beforeAll(async () => {
  const out = await projectHeroRules(fm, catalog, loadFromDisk)
  projection = out.projection
})

describe('#50 concessão de regra ao vivo aninha (source per-item)', () => {
  it('ação concedida por regra ganha Regra.[[pai]] (não Regra genérico) ao derivar', async () => {
    // Carlos: Inspiração (ação) concede Ato Inspirador. Removo a materialização
    // salva do Ato Inspirador → ele passa a vir SÓ da regra (cenário "ao vivo").
    const stripped = structuredClone(fm) as Record<string, any>
    stripped.Acoes = {
      Lista: ((fm.Acoes as any)?.Lista ?? []).filter((a: any) => !('[[Ato Inspirador]]' in a)),
    }
    const out = await projectHeroRules(stripped, catalog, loadFromDisk)
    const acoes = ((out.projection.derivedFm.Acoes as any)?.Lista ?? []) as Record<string, string>[]
    const ato = acoes.find((a) => '[[Ato Inspirador]]' in a)
    expect(ato, 'Ato Inspirador reaparece pela regra').toBeTruthy()
    // #50: fonte é Regra.[[<pai>]] — item ANINHA sob quem concedeu, em vez do
    // genérico 'Regra' que virava raiz. (Multi-concessor: fica o 1º aplicado —
    // Performance Bárdica; o importante é ter um pai, não ser raiz.)
    expect(ato!['[[Ato Inspirador]]']).toMatch(/^Regra\.\[\[.+\]\]$/)
    expect(ato!['[[Ato Inspirador]]']).not.toBe('Regra')
  })
})

describe('#51 poda de saída de regra órfã (unpick ao vivo)', () => {
  it('entrada rule-derived que nenhuma regra produz é podada; o resto fica intacto', async () => {
    const withOrphan = structuredClone(fm) as Record<string, any>
    const savedHab = ((fm.Habilidades as any)?.Lista ?? []) as Record<string, string>[]
    withOrphan.Habilidades = {
      Lista: [...savedHab, { '[[Habilidade Fantasma]]': 'Regra.[[Regra Inexistente]]' }],
    }
    const out = await projectHeroRules(withOrphan, catalog, loadFromDisk)
    const hab = ((out.projection.derivedFm.Habilidades as any)?.Lista ?? []) as Record<string, string>[]
    // a órfã (fonte de regra que não fira) foi podada
    expect(hab.some((h) => '[[Habilidade Fantasma]]' in h)).toBe(false)
    // e NADA além dela mudou: mesma contagem da derivação normal (sem over-prune)
    const normal = await projectHeroRules(fm, catalog, loadFromDisk)
    const normalHab = ((normal.projection.derivedFm.Habilidades as any)?.Lista ?? []) as unknown[]
    expect(hab.length).toBe(normalHab.length)
  })
})

describe('#145 fontes de Potência Mágica / EM Máximo (elementos de regra)', () => {
  it('ruleSourcesByPath tem as fontes de magias.potencia e magias.em (Definir)', () => {
    // Carlos (Bardo) recebe Potência/EM por Definir Magias.Potencia/EM na cadeia
    // de regras — o tooltip do NÚMERO lista essas fontes.
    expect(projection.ruleSourcesByPath['magias.potencia']?.length ?? 0).toBeGreaterThan(0)
    expect(projection.ruleSourcesByPath['magias.em']?.length ?? 0).toBeGreaterThan(0)
  })
})

// ─────────────────── A) breakdown byte-exact vs Interativa ───────────────────

describe('renderBreakdownHtml + builders — byte-exact vs goldens da Interativa (Carlos)', () => {
  const resTips = goldenTips('interativa__panel-res-defesa.html')

  it('resistência (Vigor/Reflexo/Impeto): Base 10 crua + 4 linhas sempre + total sem sinal', () => {
    expect(
      renderBreakdownHtml(
        resistenciaBreakdown(
          { Nome: 'Vigor', Atributo: 'PRE', Proficiencia: 'E', Bonus_Item: 1, Bonus_Especial: 0 },
          { PRE: 3 },
        ),
      ),
    ).toBe(byTitle(resTips, 'Vigor'))
    expect(
      renderBreakdownHtml(
        resistenciaBreakdown(
          { Nome: 'Reflexo', Atributo: 'AGI', Proficiencia: 'M', Bonus_Item: 1, Bonus_Especial: 0 },
          { AGI: 2 },
        ),
      ),
    ).toBe(byTitle(resTips, 'Reflexo'))
    // FM grava "Ímpeto" com acento; o título do popup é o slug "Impeto"
    expect(
      renderBreakdownHtml(
        resistenciaBreakdown(
          { Nome: 'Ímpeto', Atributo: 'PRE', Proficiencia: 'M', Bonus_Item: 1, Bonus_Especial: 0 },
          { PRE: 3 },
        ),
      ),
    ).toBe(byTitle(resTips, 'Impeto'))
  })

  it('sentidos (Percepção/Intuição): título acentuado + total assinado', () => {
    expect(
      renderBreakdownHtml(
        sentidoBreakdown(
          { Nome: 'Percepção', Atributo: 'INT', Proficiencia: 'M', Bonus_Item: 2, Bonus_Especial: 0 },
          { INT: 1 },
        ),
      ),
    ).toBe(byTitle(resTips, 'Percepção'))
    expect(
      renderBreakdownHtml(
        sentidoBreakdown(
          { Nome: 'Intuição', Atributo: 'PRE', Proficiencia: 'M', Bonus_Item: 0, Bonus_Especial: 0 },
          { PRE: 3 },
        ),
      ),
    ).toBe(byTitle(resTips, 'Intuição'))
  })

  it('movimento (Terrestre): Base 4 + AGI + Item + Especialização, total sem sinal', () => {
    const movTips = goldenTips('interativa__panel-movimento.html')
    expect(
      renderBreakdownHtml(
        movimentoBreakdown({ Nome: 'Terrestre', Bonus_Item: 0, Bonus_Especial: 0 }, { AGI: 2 }),
      ),
    ).toBe(byTitle(movTips, 'Terrestre'))
  })

  it('ofício (Oficio/Atuacao): atributo só com prof ≥ A e linhas zeradas OMITIDAS', () => {
    const ofiTips = goldenTips('interativa__panel-mid-oficios.html')
    expect(
      renderBreakdownHtml(
        oficioBreakdown(
          { Nome: 'Oficio', Atributo: 'INT', Proficiencia: 'A', Bonus_Item: 0, Bonus_Especial: 0 },
          { INT: 1 },
        ),
      ),
    ).toBe(byTitle(ofiTips, 'Oficio (INT)'))
    expect(
      renderBreakdownHtml(
        oficioBreakdown(
          { Nome: 'Atuacao', Atributo: 'PRE', Proficiencia: 'M', Bonus_Item: 0, Bonus_Especial: 0 },
          { PRE: 3 },
        ),
      ),
    ).toBe(byTitle(ofiTips, 'Atuacao (PRE)'))
  })

  it('ataque (Punhal — Ataque): header 🥊 assinado + 4 linhas SEMPRE (Esp 0 inclusa)', () => {
    const atkTips = goldenTips('interativa__panel-mid-ataques.html')
    // Golden do Punhal: AGI +2, Mestre +6, Item +2, Especialização 0.
    // O golden aplica a condição Auto-Confiança (+1) POR CIMA (header +11 +
    // linha pos extra); a BASE que buildo é a porção antes da condição.
    const golden = byTitle(atkTips, 'Punhal — Ataque')
    // 1) as 4 linhas de base são byte-exact (mesmo emoji/label/sinal do plugin)
    expect(golden).toContain(
      '<div class="dv-breakdown-line">⚖️ AGI (+2)</div>' +
        '<div class="dv-breakdown-line">🎓 Mestre (+6)</div>' +
        '<div class="dv-breakdown-line">💍 Item (+2)</div>' +
        '<div class="dv-breakdown-line">⭐ Especialização (0)</div>',
    )
    // 2) o breakdown de base (sem condição) — header 🥊, total assinado da base
    expect(
      renderBreakdownHtml(ataqueBreakdown('Punhal', 'AGI', 'M', 2, 0, 2)),
    ).toBe(
      '<div class="dv-tooltip-head-row"><span class="dv-tooltip-emoji">🥊</span>' +
        '<span class="dv-tooltip-head-title"><strong>Punhal — Ataque</strong> ' +
        '<span class="dv-tooltip-mod">+10</span></span></div>' +
        '<div class="dv-tooltip-head-rule"></div>' +
        '<div class="dv-breakdown-line">⚖️ AGI (+2)</div>' +
        '<div class="dv-breakdown-line">🎓 Mestre (+6)</div>' +
        '<div class="dv-breakdown-line">💍 Item (+2)</div>' +
        '<div class="dv-breakdown-line">⭐ Especialização (0)</div>',
    )
  })

  it('dano (Punhal — Dano): header sem emoji/total, Base (1d4+2) + dado extra de prof', () => {
    const atkTips = goldenTips('interativa__panel-mid-ataques.html')
    const golden = byTitle(atkTips, 'Punhal — Dano')
    // Base "1d4+2" (dano::) + Mestre adiciona +2d4 (PROF_DICE[M]=2). O golden
    // soma o Encantar Arma (+1d12+3) POR CIMA; a base é a porção antes dele.
    expect(golden).toContain(
      '<div class="dv-breakdown-line">● Base (1d4+2)</div>' +
        '<div class="dv-breakdown-line">🎓 Mestre (+2d4)</div>',
    )
    // header sem emoji + sem total (hideTotal): "Punhal — Dano"
    expect(renderBreakdownHtml(danoArmaBreakdown('Punhal', 'd4+2', 'M'))).toBe(
      '<div class="dv-tooltip-head-row">' +
        '<span class="dv-tooltip-head-title"><strong>Punhal — Dano</strong></span></div>' +
        '<div class="dv-tooltip-head-rule"></div>' +
        '<div class="dv-breakdown-line">● Base (1d4+2)</div>' +
        '<div class="dv-breakdown-line">🎓 Mestre (+2d4)</div>',
    )
  })

  it('dano: Mestre soma +2 dados; Adepto sem extra; sem dado → "Sem dano"', () => {
    // Mestre com "1d8+1" → base 1d8+1 + Mestre +2d8
    expect(renderBreakdownHtml(danoArmaBreakdown('Espada', '1d8+1', 'M'))).toBe(
      '<div class="dv-tooltip-head-row">' +
        '<span class="dv-tooltip-head-title"><strong>Espada — Dano</strong></span></div>' +
        '<div class="dv-tooltip-head-rule"></div>' +
        '<div class="dv-breakdown-line">● Base (1d8+1)</div>' +
        '<div class="dv-breakdown-line">🎓 Mestre (+2d8)</div>',
    )
    // Adepto: nenhum dado extra (PROF_DICE[A]=0) — só a linha de Base
    expect(renderBreakdownHtml(danoArmaBreakdown('Adaga', 'd4', 'A'))).toBe(
      '<div class="dv-tooltip-head-row">' +
        '<span class="dv-tooltip-head-title"><strong>Adaga — Dano</strong></span></div>' +
        '<div class="dv-tooltip-head-rule"></div>' +
        '<div class="dv-breakdown-line">● Base (1d4)</div>',
    )
    // Sem dado → "Sem dano"
    expect(renderBreakdownHtml(danoArmaBreakdown('Punho', undefined, 'A'))).toBe(
      '<div class="dv-tooltip-head-row">' +
        '<span class="dv-tooltip-head-title"><strong>Punho — Dano</strong></span></div>' +
        '<div class="dv-tooltip-head-rule"></div>' +
        '<div class="dv-breakdown-line">● Dano (Sem dano)</div>',
    )
  })

  it('perícia (Enganacao/Diplomacia): título slugado com atributo + total assinado', () => {
    const preTips = goldenTips('interativa__panel-attr-pre.html')
    // #256: DIVERGÊNCIA CONSCIENTE do plugin, pedida pelo usuário — o header da
    // perícia usa o emoji do ATRIBUTO (💪/💨/🧠/🗣️) em vez do 🧠 fixo de perícia do
    // plugin (que coincide com o emoji de INT e fazia toda perícia parecer INT no
    // resumo). O CORPO do breakdown segue byte-exact com o golden; normalizamos só
    // esse emoji de header (é a única ocorrência desses 4 no tooltip — as linhas de
    // atributo usam ⚖️).
    const norm = (s: string) => s.replace(/🧠|🗣️|💪|💨/g, '§')
    expect(
      norm(
        renderBreakdownHtml(
          periciaBreakdown(
            { Nome: 'Enganação', Atributo: 'PRE', Proficiencia: 'M', Bonus_Item: 1, Bonus_Especial: 0 },
            { PRE: 3 },
          ),
        ),
      ),
    ).toBe(norm(byTitle(preTips, 'Enganacao (PRE)')))
    // e o header REAL agora é o do atributo PRE (🗣️), não o 🧠 do plugin
    expect(
      periciaBreakdown(
        { Nome: 'Enganação', Atributo: 'PRE', Proficiencia: 'M', Bonus_Item: 1, Bonus_Especial: 0 },
        { PRE: 3 },
      ).headerEmoji,
    ).toBe('🗣️')
    expect(
      norm(
        renderBreakdownHtml(
          periciaBreakdown(
            { Nome: 'Diplomacia', Atributo: 'PRE', Proficiencia: 'E', Bonus_Item: 1, Bonus_Especial: 0 },
            { PRE: 3 },
          ),
        ),
      ),
    ).toBe(norm(byTitle(preTips, 'Diplomacia (PRE)')))
  })
})

// ─────────────────── B) fontes — sourceTipHtml/rankSourceTips vs Editável ───────────────────

describe('tooltips de Fonte vs goldens do Editável (Carlos)', () => {
  const profTips = goldenTips('editavel__tab-proficiencias.html')

  it('sourceTipHtml de slot/regra/tesouro bate byte-a-byte com o golden', () => {
    const slotA = profTips.find((t) => t.includes('>Slot.A<'))!
    expect(sourceTipHtml(['Slot.A'])).toBe(slotA)

    const metodo = profTips.find((t) => t.includes('Método Artístico (Inspirador)'))!
    expect(sourceTipHtml(['Regra.[[Método Artístico (Inspirador)]]'])).toBe(metodo)

    const diapasao = profTips.find((t) => t.includes('Diapasão Elemental'))!
    expect(sourceTipHtml(['Tesouro.[[Diapasão Elemental]]'])).toBe(diapasao)
  })

  it('célula do Atributo Principal (#22): duplo prefixo Regra.Regra.[[Bardo]] como no golden', () => {
    const perfilTips = goldenTips('editavel__tab-perfil.html')
    expect(perfilTips).toHaveLength(1)
    // espelho do attach do perfil-card (perfil-card.ts:649-651)
    const html = sourceTipHtml(
      (projection.ruleSourcesByPath['atributoPrincipal'] ?? []).map((n) => `Regra.${n}`),
    )
    expect(html).toBe(perfilTips[0])
  })

  it('rankSourceTips sobre o FM REAL: incrementos → fontes por rank', () => {
    // Enganação M: A veio do Passado, E/M de slots
    expect(rankSourceTips({ row: fmRow('Pericias', 'Enganação'), allRuleDriven: false })).toEqual({
      A: ['Passado'],
      E: ['Slot.E'],
      M: ['Slot.M'],
    })
    // Diplomacia E: A granular por regra (golden: "Regra · Método Artístico
    // (Inspirador)"), E de slot; incremento field-based (Bonus_Item) ignorado
    expect(rankSourceTips({ row: fmRow('Pericias', 'Diplomacia'), allRuleDriven: false })).toEqual({
      A: ['Regra.[[Método Artístico (Inspirador)]]'],
      E: ['Slot.E'],
    })
    // Acrobacia E: escada toda de slots
    expect(rankSourceTips({ row: fmRow('Pericias', 'Acrobacia'), allRuleDriven: false })).toEqual({
      A: ['Slot.A'],
      E: ['Slot.E'],
    })
  })

  it('seções rule-driven: sourcesPerRank granular + fallback "Regra" enriquecido', () => {
    // Defesa: rank A concedido pelo Bardo (golden: ruleBase "Regra · Bardo")
    expect(projection.sourcesPerRank['defesasResistencias.Defesa.proficiencia']?.A).toEqual([
      '[[Bardo]]',
    ])
    // fallback: rank atual sem source granular numa seção all-rule-driven
    // vira "Regra" e o enrich troca pelas notas reais do path
    const tips = rankSourceTips({
      row: { Nome: 'Defesa', Proficiencia: 'E' },
      allRuleDriven: true,
      sourcesPerRank: { A: ['[[Bardo]]'] },
    })
    expect(tips).toEqual({ A: ['Regra.[[Bardo]]'], E: ['Regra'] })
    expect(enrichRuleTooltips(tips, ['Regra.[[Trovador]]'])).toEqual({
      A: ['Regra.[[Bardo]]'],
      E: ['Regra.Regra.[[Trovador]]'],
    })
  })

  it('fontes de bônus por path da projeção real (dots/equipamentos)', () => {
    // dots do plugin: "Tesouro · <item>" (typeForPath: .bonusItem → Tesouro)
    expect(projection.ruleSourcesByPath['pericias.Anima.bonusItem']).toEqual([
      'Tesouro.[[Diapasão Elemental]]',
    ])
    expect(projection.ruleSourcesByPath['pericias.Diplomacia.bonusItem']).toEqual([
      'Tesouro.[[Anel Mensageiro]]',
    ])
    // toggle N/P de Armadura Leve (golden pn-grid: "Regra · Bardo") — regra
    // `Definir Inventario.Armadura.Proficiencia.Leve P` do Bardo
    expect(projection.ruleSourcesByPath['inventario.armadura.proficiencias.Leve']).toEqual([
      'Regra.[[Bardo]]',
    ])
  })
})

// ─────────────────── #26 — opções de especialização vs golden ───────────────────

describe('especializacaoOptions vs golden editavel__tab-habilidades (Carlos)', () => {
  const goldenHtml = fs.readFileSync(path.join(goldenDir, 'editavel__tab-habilidades.html'), 'utf8')

  /** Radios do golden por perícia: name="as-ht-especializacao-<pid>" value="[[X]]". */
  function goldenRadios(pid: string): string[] {
    const out: string[] = []
    const rx = new RegExp(`name="as-ht-especializacao-${pid}" value="([^"]*)"`, 'g')
    for (const m of goldenHtml.matchAll(rx)) out.push(unescapeAttr(m[1]))
    return out
  }

  it('opções (valores e ordem pt-BR) idênticas às do card real do plugin', () => {
    expect(goldenRadios('Acrobacia')).toEqual(['[[Estabilidade]]', '[[Mobilidade]]'])
    expect(projection.especializacaoOptions['Acrobacia']).toEqual(goldenRadios('Acrobacia'))
    expect(projection.especializacaoOptions['Diplomacia']).toEqual(goldenRadios('Diplomacia'))
    expect(projection.especializacaoOptions['Enganacao']).toEqual(goldenRadios('Enganacao'))
  })

  it('grupos do golden = perícias com rank ≥ E no FM (elegibilidade do plugin)', () => {
    const groups = [...goldenHtml.matchAll(/name="as-ht-especializacao-([^"]+)"/g)].map((m) => m[1])
    const uniq = [...new Set(groups)]
    const elegiveis = ((fm['Pericias'] as Record<string, unknown>)['Lista'] as ProfRow[])
      .filter((r) => r.Proficiencia === 'E' || r.Proficiencia === 'M')
      .map((r) =>
        String(r.Nome)
          .normalize('NFD')
          .replace(/[̀-ͯ]/g, ''),
      )
    expect(uniq.sort()).toEqual(elegiveis.sort())
  })
})
