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
import { applyTarget, entriesTitle, sumEntries, valueTone } from '../src/interativa/apply'
import { applyDanoCtx, computeDanoAdO } from '../src/interativa/dano'
import { condChipDefs } from '../src/interativa/useInterativaCtx'
import { fmPath, heroAtributos, parseDanoArma, PROF_DICE, rowMod, signed, str, wikiTarget, type ProfRow } from '../src/components/ficha/hero-model'
import { slugify, tokens } from '../src/components/ficha/registry'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const repoDir = path.dirname(appDir)
const vaultDataDir = path.join(repoDir, 'vault-data')
const goldenDir = path.join(repoDir, 'reference/goldens/screens/carlos')

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

/** Estado da captura, como aparece nos goldens (painel Condições/Recursos):
 *  chips ativos "Encantar Arma − 🌟 6 + × Punhal Relampejante (E)" e
 *  "Inspiração ×"; Efeitos Interativos "Performance Bárdica Ativa" ON;
 *  ❤️ 18/18, 💙 26/36, 💚 6; 🔷 EM: 0 / 3. */
function goldenFm(): Record<string, unknown> {
  const fm = structuredClone(goldenBardo.frontmatter) as Record<string, any>
  fm.Interativa = {
    ...fm.Interativa,
    Recursos_Restantes: {
      Vitalidade: 18,
      Moral: 26,
      Moral_Temporaria: 6,
      EM: 0,
      Escudo_Dano: 0,
    },
    Condicoes_Ativas: {
      'Encantar Arma': { value: 1, weaponSelector: '[[Punhal]]', numericSelector: 6 },
      'Inspiração': { value: 1 },
    },
    Efeitos_Ativos: {
      'Performance Bárdica Ativa': { on: true, auto: true, autoFrom: 'Inspiração' },
    },
    Seletores: { 'Encantar Arma::Potência Mágica': 6 },
  }
  return fm
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

  it('só a DEFESA está buffada (Auto-Confiança via Performance Bárdica Ativa)', () => {
    expect(diamondValue(base, 'res-defesa').classes).toContain('cond-bonus')
    expect(diamondValue(base, 'res-vigor').classes).not.toContain('cond-bonus')
    // A fonte do +1 aparece no breakdown do golden como
    // "Condição: Auto-Confiança" — mesmo label composto da computação.
    const applied = applyTarget(computed.ctx, { kind: 'number', key: 'defesa' })
    expect(entriesTitle(applied.entries)).toBe('Condição: Auto-Confiança +1')
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
    // Barra do golden: ❤️ Vitalidade: 18/18 · 💙 Moral: 26/36 · (+6);
    // painel mid-ataques mostra o total 50 (dv-vida-num--total).
    const labels = [...base.querySelectorAll('.dv-rc-bar-label')].map((e) => e.textContent?.trim() ?? '')
    expect(labels.some((l) => l.startsWith('❤️ Vitalidade: 18/18'))).toBe(true)
    expect(labels.some((l) => l.startsWith('💙 Moral: 26/36'))).toBe(true)
    const tempLabels = [...base.querySelectorAll('.dv-rc-bar-temp-label')].map((e) => e.textContent?.trim())
    expect(tempLabels).toContain('(+6)')
    const rec = computed.model.interativa.recursosRestantes
    const vidaMax = (fm['Vida'] ?? {}) as Record<string, unknown>
    expect(`❤️ Vitalidade: ${rec.vitalidade}/${vidaMax['Vitalidade']}`).toBe('❤️ Vitalidade: 18/18')
    expect(`💙 Moral: ${rec.moral}/${vidaMax['Moral']}`).toBe('💙 Moral: 26/36')
    const painel = goldenRoot('interativa__panel-mid-ataques.html')
    const total = painel.querySelector('.dv-vida-num--total')?.textContent?.trim()
    expect(String(rec.vitalidade + rec.moral + rec.moralTemporaria)).toBe(total)
  })

  it('pills de EM: corrente/máximo do estado salvo (0 / 3, todas apagadas)', () => {
    const label = base.querySelector('.dv-mag-label')?.textContent?.trim()
    expect(label).toBe('🔷 EM: 0 / 3')
    const rec = computed.model.interativa.recursosRestantes
    const emMax = Number(fmPath(fm, 'Magias', 'EM'))
    expect(`🔷 EM: ${rec.em} / ${emMax}`).toBe(label)
    // pills renderizadas: nenhuma acesa (is-on), 3 apagadas (is-off).
    expect(base.querySelectorAll('.dv-em-pill.is-on').length).toBe(0)
    expect(base.querySelectorAll('.dv-em-pill.is-off').length).toBe(emMax)
  })

  it('seletor numérico do Encantar Arma ancorado: 🌟 6 (potência da captura)', () => {
    expect(base.querySelector('.dv-panel-anchored-numeric-value')?.textContent?.trim()).toBe('🌟 6')
    expect(computed.model.interativa.seletores['Encantar Arma::Potência Mágica']).toBe(6)
  })
})

describe('oráculo: painéis pós-clique', () => {
  it('painel Defesa (res-defesa clicado): header 19, mesmo total do diamante', () => {
    const painel = goldenRoot('interativa__panel-res-defesa.html')
    // header do painel da direita: "🛡️ Defesa 19"
    const header = [...painel.querySelectorAll('.dv-panel-title')]
      .map((e) => e.textContent?.replace(/\s+/g, ' ').trim() ?? '')
      .find((t) => t.includes('Defesa'))
    expect(header, 'painel Defesa no golden').toBeTruthy()
    expect(header).toContain('19')
    const applied = applyTarget(computed.ctx, { kind: 'number', key: 'defesa' })
    expect(10 + rowMod(defesaRow('defesa'), attrs) + applied.delta).toBe(19)
  })

  it('painel Ataques (mid-ataques clicado): Punhal +9 / 2d4+2+1d12 / AdO 5', () => {
    const painel = goldenRoot('interativa__panel-mid-ataques.html')
    const html = painel.innerHTML

    // ataque: +9 com cond-bonus (Auto-Confiança +1, típado — Inspiração é
    // ApenasAliados e NÃO conta pra fonte)
    const rollEl = [...painel.querySelectorAll<HTMLElement>('.cond-bonus')].find(
      (e) => e.textContent?.trim() === '+9',
    )
    expect(rollEl, 'roll +9 cond-bonus no golden').toBeTruthy()
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
    const applied = applyTarget(computed.ctx, { kind: 'attack', attr: 'AGI', sourceId: 'Punhal' })
    expect(signed(base + applied.delta)).toBe('+9')
    expect(valueTone(applied.entries)).toBe('bonus')

    // dano: 2d4+2 (E = +1 dado) + 1d12 do Encantar Arma (potência 6 → d12)
    const punhalDoc = refDoc('[[Punhal]]')!
    const danoRaw = str((punhalDoc.inlineFields as Record<string, unknown>)['dano']).replace(/^"|"$/g, '')
    const calc = parseDanoArma(danoRaw)
    const danoRes = applyDanoCtx(
      { baseDice: calc.dice, profDice: PROF_DICE[profAtaque] ?? 0, dieSize: calc.die, offset: calc.offset },
      computed.ctx,
      'Punhal',
    )
    expect(html).toContain('>2d4+2+1d12<')
    expect(danoRes.display).toBe('2d4+2+1d12')
    expect(danoRes.hasDelta).toBe(true)
    expect(danoRes.hasPenalty).toBe(false)

    // AdO: 5 = offset base 2 + OportunidadeFixo 3 (Encantar Arma potência 6);
    // prof E → sem dado de Mestre.
    const ado = computeDanoAdO({ ...danoRes.adoInput, prof: 'E' })
    const adoEl = [...painel.querySelectorAll<HTMLElement>('.atk-roll-pos')].find(
      (e) => e.textContent?.trim() === '5',
    )
    expect(adoEl, 'AdO 5 atk-roll-pos no golden').toBeTruthy()
    expect(ado.display).toBe('5')
    expect(ado.hasDelta).toBe(true)
  })

  it('painel Condições: chips ativos e Lista de Condições completa', () => {
    const painel = goldenRoot('interativa__panel-condicoes.html')
    // ativos do golden (colunas Ativas): Encantar Arma + Inspiração
    const ativos = [...painel.querySelectorAll('.dv-rc-cond-active-chip .dv-rc-cond-active-chip-link')]
      .map((e) => e.textContent?.trim())
    expect(new Set(ativos)).toEqual(new Set(['Encantar Arma', 'Inspiração']))
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
