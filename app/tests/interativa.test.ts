// @vitest-environment jsdom
// ORÁCULO do modelo da Interativa (#15): os goldens interativa__* do Carlos
// (reference/goldens/screens/carlos) são o render REAL do modo Interativa do
// plugin com buffs ativos (Inspiração + Performance Bárdica Ativa via
// Auto-Confiança, Encantar Arma potência 6 no Punhal). Este teste EXTRAI os
// valores exibidos dos goldens (diamantes/painéis pós-clique/pills de EM/
// barra de Vida) e compara com a computação espelhada de app/src/interativa —
// a expectativa vem SEMPRE do golden ou das notas de regra da vault, nunca do
// código do app.
//
// Ficha do golden: GOLDEN Bardo (Recursos e Mídia/Notas de Teste — snapshot
// congelado do Carlos na captura; fixture em tests/fixtures/golden-bardo.json)
// com o estado volátil visível nos goldens (Vit 18, Moral 26, Temp 6, EM 0,
// Encantar Arma {🌟6, Punhal} + Inspiração ativas, Performance Bárdica Ativa
// ON — ver painel Condições do golden).
import { beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import type { IndexManifest, VaultDoc } from '../src/data/types'
import {
  buildEngineModel,
  collectDescriptors,
  computeInterativaCtx,
  CONDICOES_FOLDER,
  ERGUER_ESCUDO_ID,
  propagateAutoStates,
  type DescriptorSources,
  type InterativaComputed,
} from '../src/interativa/hero-context'
import { buildEffectContext } from '../src/interativa/build-effect-context'
import { applyTarget, sumEntries, valueTone } from '../src/interativa/apply'
import { applyDanoCtx, computeDanoAdO } from '../src/interativa/dano'
import { blocoParaDescritor } from '../src/interativa/descriptor'
import {
  computeEvMax,
  computeMagiaAtaque,
  buildDanoTitle,
  invocacoesAtivas,
  isInvocacaoDisponivel,
  listInvocacoesDisponiveis,
  lookupRota,
  resolveAttackBonus,
  resolveInvocacao,
} from '../src/interativa/invocacao'
import {
  condChipDefs,
  defaultCondState,
  defaultNumericSelector,
  seedSelectores,
} from '../src/interativa/useInterativaCtx'
import { fmPath, heroAtributos, oficioMod, parseDanoArma, profLetter, PROF_DICE, rowMod, signed, str, wikiTarget, type ProfRow } from '../src/components/ficha/hero-model'
import { slugify, tokens } from '../src/components/ficha/registry'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const repoDir = path.dirname(appDir)
const vaultDataDir = path.join(repoDir, 'vault-data')
const goldenDir = path.join(repoDir, 'reference/goldens/screens/golden-bardo')

const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

const loadSync = (id: string): VaultDoc =>
  JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${id}.json`), 'utf8')) as VaultDoc

/** Resolvedor síncrono wikilink→doc — mesma semântica do HeroRefs.refDoc. */
const refDoc = (value: unknown): VaultDoc | undefined => {
  const target = wikiTarget(str(value))
  if (!target) return undefined
  const res = catalog.resolve(target)
  return res.kind === 'doc' ? loadSync(res.id) : undefined
}

const condicaoDocs: VaultDoc[] = catalog.content
  .filter((e) => e.id.startsWith(CONDICOES_FOLDER) && e.basename !== 'Condições')
  .map((e) => loadSync(e.id))
const extraDocs: VaultDoc[] = [loadSync(ERGUER_ESCUDO_ID)]

// ── fixture: GOLDEN Bardo + estado volátil dos goldens ──

const goldenBardo = JSON.parse(
  fs.readFileSync(path.join(appDir, 'tests/fixtures/golden-bardo.json'), 'utf8'),
) as VaultDoc

/** Estado salvo da nota GOLDEN Bardo (baseline LIMPO pós-reorg da vault, como
 *  aparece nos goldens golden-bardo/): ❤️ 18/18, 💙 31/36, 💚 0; 🔷 EM: 3 / 3;
 *  sem condições/efeitos ativos. O fixture golden-bardo.json já espelha 1:1 o
 *  FM da nota (Atributos/Defesas/Sentidos/Vida/Magias/Interativa) — usa direto. */
function goldenFm(): Record<string, unknown> {
  return structuredClone(goldenBardo.frontmatter) as Record<string, unknown>
}

function compute(fm: Record<string, unknown>): InterativaComputed {
  const sources: DescriptorSources = { fm, refDoc, condicaoDocs, extraDocs }
  return computeInterativaCtx(sources)
}

// ── golden parsing ──

function goldenRoot(file: string): HTMLElement {
  const root = document.createElement('div')
  root.innerHTML = fs.readFileSync(path.join(goldenDir, file), 'utf8')
  return root
}

/** Valor + classes do diamante `data-role` no golden. */
function diamondValue(root: HTMLElement, role: string): { text: string; classes: string } {
  const el = root.querySelector<HTMLElement>(`[data-role="${role}"] .value`)
  expect(el, `diamante ${role}`).toBeTruthy()
  return { text: el!.textContent?.trim() ?? '', classes: el!.className }
}

let base: HTMLElement
let fm: Record<string, unknown>
let computed: InterativaComputed
let attrs: Record<string, number>

beforeAll(() => {
  base = goldenRoot('interativa__base.html')
  fm = goldenFm()
  computed = compute(fm)
  attrs = heroAtributos(fm).values
})

const defesaRow = (nome: string): ProfRow => {
  const lista = (fmPath(goldenBardo.frontmatter as Record<string, unknown>, 'Defesas_Resistencias', 'Lista') ?? []) as ProfRow[]
  return lista.find((d) => slugify(str(d.Nome)).toLowerCase() === nome)!
}
const sentidoRow = (nome: string): ProfRow => {
  const lista = (fmPath(goldenBardo.frontmatter as Record<string, unknown>, 'Sentidos', 'Lista') ?? []) as ProfRow[]
  return lista.find((s) => slugify(str(s.Nome)).toLowerCase() === nome)!
}

describe('oráculo: interativa__base (defesas/sentidos com buffs ativos)', () => {
  it.each([
    ['res-defesa', 'defesa'],
    ['res-vigor', 'vigor'],
    ['res-impeto', 'impeto'],
    ['res-reflexo', 'reflexo'],
  ] as const)('%s = valor do golden (base + delta)', (role, key) => {
    const golden = diamondValue(base, role)
    const applied = applyTarget(computed.ctx, { kind: 'number', key })
    const total = 10 + rowMod(defesaRow(key), attrs) + applied.delta
    expect(String(total)).toBe(golden.text)
    // Destaque de buff/debuff: classes do plugin (cond-bonus/cond-penalty).
    const tone = valueTone(applied.entries)
    if (golden.classes.includes('cond-bonus')) expect(tone).toBe('bonus')
    else if (golden.classes.includes('cond-penalty')) expect(tone).toBe('penalty')
    else expect(tone).toBe('neutral')
  })

  it('baseline LIMPO: nenhuma defesa buffada (sem condições ativas salvas)', () => {
    expect(diamondValue(base, 'res-defesa').classes).not.toContain('cond-bonus')
    expect(diamondValue(base, 'res-vigor').classes).not.toContain('cond-bonus')
    const applied = applyTarget(computed.ctx, { kind: 'number', key: 'defesa' })
    expect(applied.delta).toBe(0)
    expect(valueTone(applied.entries)).toBe('neutral')
  })

  it.each([
    ['sense-percepcao', 'percepcao'],
    ['sense-intuicao', 'intuicao'],
  ] as const)('%s = valor do golden', (role, key) => {
    const golden = diamondValue(base, role)
    const applied = applyTarget(computed.ctx, { kind: 'number', key })
    const total = rowMod(sentidoRow(key), attrs) + applied.delta
    expect(signed(total)).toBe(golden.text)
    expect(valueTone(applied.entries)).toBe('neutral')
  })

  it('fórmula da Vida: total exibido = vitalidade + moral + moral temporária', () => {
    // Barra do golden (baseline limpo): ❤️ Vitalidade: 18/18 · 💙 Moral: 31/36 ·
    // sem temporária; painel mid-ataques mostra o total 49 (dv-vida-num--total).
    const labels = [...base.querySelectorAll('.dv-rc-bar-label')].map((e) => e.textContent?.trim() ?? '')
    expect(labels.some((l) => l.startsWith('❤️ Vitalidade: 18/18'))).toBe(true)
    expect(labels.some((l) => l.startsWith('💙 Moral: 31/36'))).toBe(true)
    const tempLabels = [...base.querySelectorAll('.dv-rc-bar-temp-label')].map((e) => e.textContent?.trim())
    expect(tempLabels.join('')).toBe('') // sem temporária → sem "(+N)"
    const rec = computed.model.interativa.recursosRestantes
    const vidaMax = (fm['Vida'] ?? {}) as Record<string, unknown>
    expect(`❤️ Vitalidade: ${rec.vitalidade}/${vidaMax['Vitalidade']}`).toBe('❤️ Vitalidade: 18/18')
    expect(`💙 Moral: ${rec.moral}/${vidaMax['Moral']}`).toBe('💙 Moral: 31/36')
    const painel = goldenRoot('interativa__panel-mid-ataques.html')
    const total = painel.querySelector('.dv-vida-num--total')?.textContent?.trim()
    expect(String(rec.vitalidade + rec.moral + rec.moralTemporaria)).toBe(total)
  })

  it('pills de EM: corrente/máximo do estado salvo (3 / 3, todas acesas)', () => {
    const label = base.querySelector('.dv-mag-label')?.textContent?.trim()
    expect(label).toBe('🔷 EM: 3 / 3')
    const rec = computed.model.interativa.recursosRestantes
    const emMax = Number(fmPath(fm, 'Magias', 'EM'))
    expect(`🔷 EM: ${rec.em} / ${emMax}`).toBe(label)
    // pills renderizadas: todas acesas (is-on), nenhuma apagada (is-off).
    expect(base.querySelectorAll('.dv-em-pill.is-on').length).toBe(emMax)
    expect(base.querySelectorAll('.dv-em-pill.is-off').length).toBe(0)
  })

  it('sem Encantar Arma ativo (baseline): nenhum seletor numérico ancorado', () => {
    expect(base.querySelector('.dv-panel-anchored-numeric-value')).toBeNull()
    expect(computed.model.interativa.seletores['Encantar Arma::Potência Mágica']).toBeUndefined()
  })
})

describe('oráculo: painéis pós-clique', () => {
  it('painel Defesa (res-defesa clicado): header 18, mesmo total do diamante', () => {
    const painel = goldenRoot('interativa__panel-res-defesa.html')
    // header do painel da direita: "🛡️ Defesa 18" (baseline sem buff)
    const header = [...painel.querySelectorAll('.dv-panel-title')]
      .map((e) => e.textContent?.replace(/\s+/g, ' ').trim() ?? '')
      .find((t) => t.includes('Defesa'))
    expect(header, 'painel Defesa no golden').toBeTruthy()
    expect(header).toContain('18')
    const applied = applyTarget(computed.ctx, { kind: 'number', key: 'defesa' })
    expect(10 + rowMod(defesaRow('defesa'), attrs) + applied.delta).toBe(18)
  })

  it('painel Ataques (mid-ataques clicado): Punhal +8 / 2d4+2 (baseline sem buffs)', () => {
    const painel = goldenRoot('interativa__panel-mid-ataques.html')
    const html = painel.innerHTML

    // sem condições ativas: nenhum destaque de buff/penalidade no painel
    expect(painel.querySelector('.cond-bonus')).toBeNull()
    expect(painel.querySelector('.cond-penalty')).toBeNull()
    const armas = (fmPath(fm, 'Inventario', 'Armas', 'Lista') ?? []) as Record<string, unknown>[]
    const punhal = armas[0]
    const profAtaque = str(fmPath(fm, 'Ataques', 'Proficiencia'))
    const base = rowMod(
      {
        Atributo: str(punhal['Atributo']),
        Proficiencia: profAtaque,
        Bonus_Item: Number(punhal['Bonus_Item']),
        Bonus_Especial: Number(punhal['Bonus_Especial']),
      },
      attrs,
    )
    // ataque base: AGI(+2) + Experiente(+4) + Item(+2) = +8, delta 0 (neutro)
    const applied = applyTarget(computed.ctx, { kind: 'attack', attr: 'AGI', sourceId: 'Punhal' })
    expect(signed(base + applied.delta)).toBe('+8')
    expect(valueTone(applied.entries)).toBe('neutral')

    // dano: 2d4+2 (E = +1 dado); sem o 1d12 do Encantar Arma (inativo)
    const punhalDoc = refDoc('[[Punhal]]')!
    const danoRaw = str((punhalDoc.frontmatter as Record<string, unknown>)['dano']).replace(/^"|"$/g, '')
    const calc = parseDanoArma(danoRaw)
    const danoRes = applyDanoCtx(
      { baseDice: calc.dice, profDice: PROF_DICE[profAtaque] ?? 0, dieSize: calc.die, offset: calc.offset },
      computed.ctx,
      'Punhal',
    )
    expect(html).toContain('>2d4+2<')
    expect(danoRes.display).toBe('2d4+2')
    expect(danoRes.hasDelta).toBe(false)
    expect(danoRes.hasPenalty).toBe(false)
  })

  it('painel Condições: sem chips ativos (baseline) e Lista de Condições completa', () => {
    const painel = goldenRoot('interativa__panel-condicoes.html')
    // baseline limpo: nenhuma condição ativa salva
    const ativos = [...painel.querySelectorAll('.dv-rc-cond-active-chip .dv-rc-cond-active-chip-link')]
      .map((e) => e.textContent?.trim())
    expect(new Set(ativos)).toEqual(new Set([]))
    const condAtivas = (fmPath(fm, 'Interativa', 'Condicoes_Ativas') ?? {}) as Record<string, unknown>
    expect(new Set(Object.keys(condAtivas))).toEqual(new Set(ativos))

    // Lista de Condições do golden (catálogo + efeitos tipo Condição do
    // herói) == chips computados pelo app (condChipDefs).
    const goldenLista = new Set(
      [...painel.querySelectorAll('.dv-rc-cond-chip .dv-rc-cond-chip-link')].map((e) =>
        e.textContent?.trim() ?? '',
      ),
    )
    const chips = condChipDefs(condicaoDocs, computed.descriptors, tokens.emojis.bonusType.Condicao)
    expect(new Set(chips.map((c) => c.nome))).toEqual(goldenLista)
  })
})

describe('#33 ofício prof N: atributo não conta no mod', () => {
  it('oficioMod omite o atributo com prof N (rowMod antigo somava e divergia)', () => {
    const oficios = (fmPath(fm, 'Oficios', 'Lista') ?? []) as ProfRow[]
    const profN = oficios.find((o) => profLetter(o) === 'N' && (attrs[str(o.Atributo)] ?? 0) !== 0)
    expect(profN, 'esperava um ofício prof N com atributo ≠ 0 (Conhecimento INT)').toBeTruthy()
    const atr = attrs[str(profN!.Atributo)] ?? 0
    expect(atr).toBeGreaterThan(0)
    // a diferença rowMod−oficioMod é exatamente o atributo (que o plugin não conta)
    expect(rowMod(profN!, attrs) - oficioMod(profN!, attrs)).toBe(atr)
  })
})

describe('condições do catálogo (fonte: Elementos_de_Regra das notas)', () => {
  const withConds = (conds: Record<string, unknown>): InterativaComputed => {
    const f = goldenFm() as Record<string, any>
    f.Interativa = { ...f.Interativa, Condicoes_Ativas: conds, Efeitos_Ativos: {}, Seletores: {} }
    return compute(f)
  }

  it('Enfraquecido: Vigor -2, Perícias(FOR) -2, Ataques(FOR) -2 (AGI intacto), dano -1 fixo e -1/dado', () => {
    const c = withConds({ Enfraquecido: { value: 1 } })
    expect(applyTarget(c.ctx, { kind: 'number', key: 'vigor' }).delta).toBe(-2)
    expect(applyTarget(c.ctx, { kind: 'number', key: 'defesa' }).delta).toBe(0)
    expect(applyTarget(c.ctx, { kind: 'skill', pericia: 'Atletismo', attr: 'FOR' }).delta).toBe(-2)
    expect(applyTarget(c.ctx, { kind: 'skill', pericia: 'Acrobacia', attr: 'AGI' }).delta).toBe(0)
    expect(applyTarget(c.ctx, { kind: 'attack', attr: 'FOR' }).delta).toBe(-2)
    expect(applyTarget(c.ctx, { kind: 'attack', attr: 'AGI', sourceId: 'Punhal' }).delta).toBe(0)
    // dano do Punhal (d4+2, prof E → 2 dados): fixo -1 e -1 POR DADO → 2+(-1)+(-2)=-1
    const danoRes = applyDanoCtx({ baseDice: 1, profDice: 1, dieSize: 4, offset: 2 }, c.ctx, 'Punhal')
    expect(danoRes.display).toBe('2d4-1')
    expect(danoRes.hasPenalty).toBe(true)
  })

  it('Desajeitado é Escalável 3: ×2 dobra os -2 (Defesa/Reflexo/Perícias AGI/Ataques AGI)', () => {
    const c = withConds({ Desajeitado: { value: 2 } })
    expect(applyTarget(c.ctx, { kind: 'number', key: 'defesa' }).delta).toBe(-4)
    expect(applyTarget(c.ctx, { kind: 'number', key: 'reflexo' }).delta).toBe(-4)
    expect(applyTarget(c.ctx, { kind: 'number', key: 'movimento' }).delta).toBe(-2)
    expect(applyTarget(c.ctx, { kind: 'skill', pericia: 'Acrobacia', attr: 'AGI' }).delta).toBe(-4)
    expect(applyTarget(c.ctx, { kind: 'attack', attr: 'AGI', sourceId: 'Punhal' }).delta).toBe(-4)
    // clamp no scaleMax da nota (Escalavel 3): value 5 aplica só ×3
    const c3 = withConds({ Desajeitado: { value: 5 } })
    expect(applyTarget(c3.ctx, { kind: 'number', key: 'defesa' }).delta).toBe(-6)
  })

  it('Fadigado: -1 em tudo; Defesa acumula key própria + grupo Resistencias (-2)', () => {
    const c = withConds({ Fadigado: true })
    expect(applyTarget(c.ctx, { kind: 'number', key: 'defesa' }).delta).toBe(-2)
    expect(applyTarget(c.ctx, { kind: 'number', key: 'vigor' }).delta).toBe(-1)
    expect(applyTarget(c.ctx, { kind: 'number', key: 'percepcao' }).delta).toBe(-1)
    expect(applyTarget(c.ctx, { kind: 'skill', pericia: 'Atletismo', attr: 'FOR' }).delta).toBe(-1)
    expect(applyTarget(c.ctx, { kind: 'number', key: 'movimento' }).delta).toBe(-1)
    expect(applyTarget(c.ctx, { kind: 'number', key: 'magiaAtaque' }).delta).toBe(-1)
  })

  it('Cego: Percepção -4; Intuição intacta', () => {
    const c = withConds({ Cego: true })
    expect(applyTarget(c.ctx, { kind: 'number', key: 'percepcao' }).delta).toBe(-4)
    expect(applyTarget(c.ctx, { kind: 'number', key: 'intuicao' }).delta).toBe(0)
  })

  it('Vantagem de Combate: Ataque +2 (catálogo) + Apunhalante do Punhal (passo de dado +1 e dano +1)', () => {
    const c = withConds({ 'Vantagem de Combate': { value: 1 } })
    // catálogo: Somar Condicao.Ataque 2 (untyped, key global de ataque)
    expect(applyTarget(c.ctx, { kind: 'attack', attr: 'AGI', sourceId: 'Punhal' }).delta).toBe(2)
    // Apunhalante (Propriedade do Punhal, Passivo requer VC): d4→d6 +1 fixo
    const danoRes = applyDanoCtx({ baseDice: 1, profDice: 1, dieSize: 4, offset: 2 }, c.ctx, 'Punhal')
    expect(danoRes.display).toBe('2d6+3')
    expect(danoRes.hasPenalty).toBe(false)
  })

  it('condições positivas e negativas somam vetorizado (VC + Abalado → Ataque 0, neutro)', () => {
    const c = withConds({ 'Vantagem de Combate': true, Abalado: true })
    const applied = applyTarget(c.ctx, { kind: 'attack', attr: 'AGI' })
    expect(applied.delta).toBe(0)
    expect(valueTone(applied.entries)).toBe('neutral')
    expect(applied.hasPenalty).toBe(true)
    expect(sumEntries(applied.entries)).toBe(0)
  })
})

describe('efeitos interativos (blocos Efeitos_Interativos das notas)', () => {
  it('Inspiração é ApenasAliados: a FONTE não ganha o +1 Ataque; Auto-Confiança (Passivo com estado) ganha', () => {
    // Sem Performance Bárdica Ativa: Inspiração ativa sozinha não buffa nada.
    const f = goldenFm() as Record<string, any>
    f.Interativa = {
      ...f.Interativa,
      Condicoes_Ativas: { 'Inspiração': { value: 1 } },
      Efeitos_Ativos: {},
      Seletores: {},
    }
    const semEstado = compute(f)
    expect(applyTarget(semEstado.ctx, { kind: 'attack', attr: 'AGI' }).delta).toBe(0)
    expect(applyTarget(semEstado.ctx, { kind: 'number', key: 'defesa' }).delta).toBe(0)
    // Cadeia AtivaEstado (como o toggle da UI): Inspiração liga Performance
    // Bárdica Ativa → Auto-Confiança aplica +1 Ataque/+1 Defesa (Condicao).
    const efeitos = propagateAutoStates(
      f.Interativa.Condicoes_Ativas,
      {},
      collectDescriptors({ fm: f, refDoc, condicaoDocs, extraDocs }),
    )
    expect(efeitos['Performance Bárdica Ativa']).toMatchObject({ on: true, auto: true, autoFrom: 'Inspiração' })
    f.Interativa = { ...f.Interativa, Efeitos_Ativos: efeitos }
    const comEstado = compute(f)
    expect(applyTarget(comEstado.ctx, { kind: 'attack', attr: 'AGI' }).delta).toBe(1)
    expect(applyTarget(comEstado.ctx, { kind: 'number', key: 'defesa' }).delta).toBe(1)
  })

  it('bônus típados não acumulam: Inspiração (aliado, +1 Condicao) + Auto-Confiança (+1 Condicao) → +1', () => {
    // Simula receber Inspiração de um ALIADO (sharedFrom) com Performance
    // Bárdica Ativa própria ON: duas fontes +1 Ataque tipoBonus Condicao →
    // max por tipo = +1, não +2 (winningTypedEntries).
    const f = goldenFm() as Record<string, any>
    const descriptors = collectDescriptors({ fm: f, refDoc, condicaoDocs, extraDocs })
    const inspiracao = descriptors.find((d) => d.label === 'Inspiração')!
    const shared = { ...inspiracao, sharedFrom: 'Aliado' }
    f.Interativa = {
      ...f.Interativa,
      Condicoes_Ativas: { 'Inspiração::Aliado': { value: 1 } },
      Efeitos_Ativos: { 'Performance Bárdica Ativa': { on: true } },
      Seletores: {},
    }
    const all = [...descriptors, shared]
    const model = buildEngineModel(f, all)
    const ctx = buildEffectContext(model, all)
    const applied = applyTarget(ctx, { kind: 'attack', attr: 'AGI' })
    expect(applied.delta).toBe(1)
  })

  it('Acerto Decisivo (builtin): +1 dado de dano da arma que CONTA pro por-dado; +1 dado no AdO', () => {
    const f = goldenFm() as Record<string, any>
    f.Interativa = {
      ...f.Interativa,
      Condicoes_Ativas: {},
      Efeitos_Ativos: { 'Acerto Decisivo': { on: true }, 'Ato Inspirador': { on: true }, 'Performance Bárdica Ativa': { on: true }, 'Inspiração': { on: true } },
      Seletores: {},
    }
    // Ato Inspirador requer Inspiração (guard Estado) — ativa junto pra
    // exercitar DanoArmaPorDado × dados de arma (incluindo o do Decisivo).
    const c = compute(f)
    const danoRes = applyDanoCtx({ baseDice: 1, profDice: 1, dieSize: 4, offset: 2 }, c.ctx, 'Punhal')
    // 3 dados exibidos (1 base + 1 prof + 1 decisivo); Ato Inspirador:
    // +1 fixo +1×3 por-dado (o dado do Decisivo conta) → offset 2+1+3=6
    expect(danoRes.display).toBe('3d4+6')
    // AdO: prof E (0 de Mestre) + 1 dado do Decisivo; por-dado ×1; fixo +1
    const ado = computeDanoAdO({ ...danoRes.adoInput, prof: 'E' })
    expect(ado.diceCount).toBe(1)
    expect(ado.display).toBe('1d4+4')
  })

  it('Escudo Erguido: BonusEscudo aplica na Defesa conforme o escudo equipado', () => {
    const f = goldenFm() as Record<string, any>
    f.Inventario = structuredClone(f.Inventario)
    f.Inventario.Escudo = { Nome: '[[Escudo]]', Dano: 0, Dureza: 5, Categoria: '', Propriedade: '', Proficiencia: 'P' }
    f.Interativa = {
      ...f.Interativa,
      Condicoes_Ativas: {},
      Efeitos_Ativos: { 'Escudo Erguido': { on: true } },
      Seletores: {},
    }
    const c = compute(f)
    expect(applyTarget(c.ctx, { kind: 'number', key: 'defesa' }).delta).toBe(2)
    // sem escudo equipado → no-op (GOLDEN Bardo tem Escudo.Nome vazio)
    const f2 = goldenFm() as Record<string, any>
    f2.Interativa = {
      ...f2.Interativa,
      Condicoes_Ativas: {},
      Efeitos_Ativos: { 'Escudo Erguido': { on: true } },
      Seletores: {},
    }
    const c2 = compute(f2)
    expect(applyTarget(c2.ctx, { kind: 'number', key: 'defesa' }).delta).toBe(0)
  })
})

// ──────────────────────────────────────────────────────────────────────────
// #29 — potência/seletores: defaults de ativação (defaultStateFor espelhado)
// ──────────────────────────────────────────────────────────────────────────

describe('#29 seletores: defaults de ativação (plugin condicoes-catalog.ts:104-141)', () => {
  const descriptorsCarlos = collectDescriptors({ fm: goldenFm(), refDoc, condicaoDocs, extraDocs })
  const encantar = descriptorsCarlos.find((d) => d.label === 'Encantar Arma')!

  it('Encantar Arma ativada do zero: numericSelector = potência do herói (clampada 0..11) + weaponSelector = 1ª arma', () => {
    // Encantar Arma.md: selector numérico "Potência Mágica" min 0 max 11.
    expect(encantar.numericSelector).toMatchObject({ label: 'Potência Mágica', min: 0, max: 11, step: 1 })
    expect(defaultCondState(encantar, 8, ['[[Punhal]]'])).toEqual({
      value: 1,
      numericSelector: 8,
      weaponSelector: '[[Punhal]]',
    })
    // clamp no teto do selector
    expect(defaultNumericSelector(encantar, 15)).toBe(11)
    expect(defaultNumericSelector(encantar, 0)).toBe(0)
  })

  it('selector numérico que NÃO é Potência Mágica defaulta pro min (Aspecto Ágil, EM Investido 1..4)', () => {
    const aspectoDoc = loadSync('Sistema/Criação de Personagem/Técnicas/Druida/Aspecto Ágil')
    const bloco = (aspectoDoc.frontmatter as Record<string, any>)['Efeitos_Interativos'][0]
    const desc = blocoParaDescritor(bloco, aspectoDoc.id)!
    expect(desc.numericSelector).toMatchObject({ label: 'EM Investido', min: 1, max: 4 })
    expect(defaultNumericSelector(desc, 8)).toBe(1)
  })

  it('seedSelectores semeia selectores discretos (incluindo ocultos) e o modifier porSeletor dispara', () => {
    // Passos Rápidos.md: selector discreto oculto "Graduação" ["2q","3q"];
    // Somar Movimento porSeletor {2q:2, 3q:3}.
    const doc = loadSync(
      'Sistema/Criação de Personagem/Magia/Magia Arcana/Magia Arcana Branca/Magia Branca Adepta/Passos Rápidos',
    )
    const bloco = (doc.frontmatter as Record<string, any>)['Efeitos_Interativos'][0]
    const desc = blocoParaDescritor(bloco, doc.id)!
    const seeded = seedSelectores(desc, 'Passos Rápidos', {})
    expect(seeded).toEqual({ 'Passos Rápidos::Graduação': '2q' })
    // já semeado → retorna o MESMO objeto (nada a escrever)
    expect(seedSelectores(desc, 'Passos Rápidos', seeded)).toBe(seeded)
    // engine: com a condição ativa + seletor semeado, Movimento ganha +2
    const model = buildEngineModel(goldenFm(), [desc])
    model.interativa.condicoesAtivas = { 'Passos Rápidos': { value: 1 } }
    model.interativa.seletores = { ...seeded }
    const ctx = buildEffectContext(model, [desc])
    expect(applyTarget(ctx, { kind: 'number', key: 'movimento' }).delta).toBe(2)
  })

  it('mudar a potência do Encantar Arma muda o dado extra e o AdO fixo (tabelas da nota)', () => {
    // Encantar Arma.md: DadoExtra {6: d12, 7: d12+1, 8: d12+2};
    // OportunidadeFixo {6: 3, 7: 4, 8: 4}.
    const withPot = (pot: number) => {
      const f = goldenFm() as Record<string, any>
      f.Interativa = {
        ...f.Interativa,
        Condicoes_Ativas: {
          'Encantar Arma': { value: 1, weaponSelector: '[[Punhal]]', numericSelector: pot },
        },
        Efeitos_Ativos: {},
        Seletores: { 'Encantar Arma::Potência Mágica': pot },
      }
      return compute(f)
    }
    const dano = (c: InterativaComputed) =>
      applyDanoCtx({ baseDice: 1, profDice: 1, dieSize: 4, offset: 2 }, c.ctx, 'Punhal')
    expect(dano(withPot(6)).display).toBe('2d4+2+1d12')
    expect(dano(withPot(7)).display).toBe('2d4+2+1d12+1')
    expect(dano(withPot(8)).display).toBe('2d4+2+1d12+2')
    const ado6 = computeDanoAdO({ ...dano(withPot(6)).adoInput, prof: 'E' })
    const ado7 = computeDanoAdO({ ...dano(withPot(7)).adoInput, prof: 'E' })
    expect(ado6.display).toBe('5') // offset 2 + fixo 3
    expect(ado7.display).toBe('6') // offset 2 + fixo 4
  })
})

// ──────────────────────────────────────────────────────────────────────────
// #30 — invocações: resolvers espelhados sobre docs/herói REAIS
// (Servo das Sombras.md, Amálgama das Sombras.md, Pind Bund.md)
// ──────────────────────────────────────────────────────────────────────────

describe('#30 invocações: resolvers (plugin resolve-invocacao.ts + tab-companheiros.ts)', () => {
  const pind = loadSync('Sistema/Criaturas/Heróis/Pind Bund')
  const pindFm = pind.frontmatter as Record<string, any>
  const descriptorsPind = collectDescriptors({ fm: pindFm, refDoc, condicaoDocs, extraDocs })
  const servo = descriptorsPind.find((d) => d.label === 'Servo das Sombras')!
  const amalgama = descriptorsPind.find((d) => d.label === 'Amálgama das Sombras')!

  it('lookupRota: rank do Pind por rota (Arcana Negra M; Anima N → null; "Magia Arcana" = maior rank)', () => {
    // Pind Bund.md: Magias.Lista → Arcana Negra M / Arcana Branca N / Anima N.
    expect(lookupRota(pindFm, 'Magia Arcana Negra')).toBe('M')
    expect(lookupRota(pindFm, 'Magia Anima')).toBeNull()
    expect(lookupRota(pindFm, 'Magia Arcana Branca')).toBeNull()
    expect(lookupRota(pindFm, 'Magia Arcana')).toBe('M')
  })

  it('disponibilidade: rank ≥ proficienciaMinima (Servo min A, Amálgama min E)', () => {
    expect(servo.tipoEfeito).toBe('Invocação')
    expect(listInvocacoesDisponiveis(descriptorsPind, pindFm).map((d) => d.label)).toEqual([
      'Amálgama das Sombras',
      'Servo das Sombras',
    ])
    expect(isInvocacaoDisponivel(servo, { proficiencia: 'A' })).toBe(true)
    expect(isInvocacaoDisponivel(amalgama, { proficiencia: 'A' })).toBe(false)
    expect(isInvocacaoDisponivel(servo, { proficiencia: 'N' })).toBe(false)
    expect(isInvocacaoDisponivel(servo, { proficiencia: null })).toBe(false)
  })

  it('resolveInvocacao do Servo (Pind: rank M, PM 8): stats/ataque da tabela porProficiencia', () => {
    const resolved = resolveInvocacao(servo, {
      nivelInvocador: 7,
      proficiencia: lookupRota(pindFm, servo.invocacao!.porProficienciaEm),
      selectores: { 'Potência Mágica': 8, 'Potencia Magica': 8 },
    })!
    // Servo das Sombras.md — colunas M das tabelas porProficiencia:
    expect(resolved.stats).toMatchObject({
      Defesa: 18,
      Vigor: 16,
      'Evasão': 16,
      Impeto: 16,
      'Percepção': 4,
      Movimento: 5,
      EV: '5×potência', // porNivel {1: ...} — threshold ≤ nível 7
    })
    expect(resolved.ataques).toEqual([
      { nome: 'Ataque Mental', tipo: 'corpo-a-corpo', bonus: 'MagiaAtaque', dano: '3d4+2' },
    ])
  })

  it('computeEvMax: "5×potência" × PM (Servo PM 8 → 40; Amálgama PM 6 → 30)', () => {
    expect(computeEvMax(servo, 8)).toBe(40)
    expect(computeEvMax(amalgama, 6)).toBe(30)
  })

  it('MagiaAtaque do Pind na rota Arcana Negra: PB(M) 6 + INT 3 + item 2 = +11 (breakdown nas linhas)', () => {
    const info = computeMagiaAtaque(pindFm, 'Magia Arcana Negra')!
    expect(info.total).toBe(11)
    expect(info.title).toContain('INT +3')
    expect(info.title).toContain('Mestre (Magia Arcana Negra) +6')
    expect(info.title).toContain('Item +2')
    // bonus {doInvocador: MagiaAtaque} resolvido no card
    expect(resolveAttackBonus('MagiaAtaque', pindFm, servo)?.total).toBe(11)
    expect(resolveAttackBonus(3, pindFm, servo)?.total).toBe(3)
    expect(resolveAttackBonus('OutraCoisa', pindFm, servo)).toBeNull()
  })

  it('instância PERSISTIDA no FM real do Pind (round-trip do plugin) é lida com o shape exato', () => {
    // Pind Bund.md → Interativa.Invocacoes_Ativas (gravado pelo plugin).
    const ativas = invocacoesAtivas(pindFm)
    expect(ativas['Amálgama das Sombras']).toEqual([
      {
        id: 'Amálgama das Sombras#1782167100900-1',
        potencia: 6,
        vitalidade: 30,
        moralTemporaria: 0,
      },
    ])
    // card exibiria Vitalidade 30/30 (EV máx = 5×6)
    expect(computeEvMax(amalgama, 6)).toBe(30)
  })

  it('tooltip do dano: base = coluna A da tabela + delta em dados extras pro rank atual', () => {
    // Amálgama: dano {A: 1d6+3, E: 2d6+3, M: 3d6+3}; Pind é M → 3d6+3.
    const resolved = resolveInvocacao(amalgama, {
      nivelInvocador: 7,
      proficiencia: 'M',
      selectores: { 'Potência Mágica': 6, 'Potencia Magica': 6 },
    })!
    expect(resolved.ataques[0].dano).toBe('3d6+3')
    const title = buildDanoTitle(resolved.ataques[0], amalgama, pindFm)!
    expect(title).toContain('Base 1d6+3')
    expect(title).toContain('Mestre +2d6')
  })
})
