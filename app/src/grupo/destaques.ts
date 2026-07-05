// Destaques de Proficiências, Perícias e Magias — ESPELHA o plugin
// pleitost-autosheet (READ-ONLY):
//  - render/modes/grupo/pericia-helpers.ts: OFICIO_NOMES, skillMod
//    (= calcPericia: attr + prof + item + especial), scoredEntriesForSkill
//    (sort mod desc, tie basename pt) e topTwoForSkill.
//  - render/modes/grupo/section-pericia.ts: chaves de perícia agrupadas
//    pelo Atributo do 1º membro que tem a linha, ATTR_ORDER FOR/AGI/INT/PRE,
//    chaves ordenadas pt dentro do atributo; warn ⚠️ quando há linha mas
//    ninguém ≥ Adepto (warnAdeptoHtml — mesma regra das magias).
//  - render/modes/grupo/section-magias.ts: escolas Anima/Arcana Branca/
//    Arcana Negra, integrantes ≥ Adepto por mod (calcMagia), warn ⚠️ quando
//    há linha mas ninguém ≥ Adepto.
//  - render/modes/grupo/section-equip-prof.ts: cartões Armas Marciais/
//    Escudos/Armaduras Pesadas/Armaduras Leves com quem tem "P"
//    (marciais: ★ quando só há Especificas).
// Nota: o design (§GRUPOS, painel DESTAQUES) não tem slot pra Ofícios —
// só perícias por atributo + Prof. Equipamento + Magias.
import type { IndexDocEntry, VaultDoc } from '../data/types'
import { findNamedRow, getAttr, profMod, profRank, toArray, type Fm, type NamedRow } from './stats'

export const OFICIO_NOMES: ReadonlySet<string> = new Set(['Ofício', 'Atuação', 'Conhecimento'])
export const ATTR_ORDER = ['FOR', 'AGI', 'INT', 'PRE'] as const

/** Espelha skillMod (pericia-helpers.ts) = calcPericia (util/modificadores.ts). */
export function skillMod(fm: Fm | undefined, row: NamedRow | null): number | null {
  if (!row) return null
  return (
    getAttr(fm, row.Atributo) +
    profMod(row.Proficiencia) +
    (Number(row.Bonus_Item) || 0) +
    (Number(row.Bonus_Especial) || 0)
  )
}

export interface SkillTop {
  mod: number
  prof: string
  who: string
}

export interface SkillHighlight {
  key: string
  tops: SkillTop[]
  /** ⚠️ quando algum membro tem a linha mas ninguém ≥ Adepto — espelha
   *  section-pericia.ts:73-82 (hasAny && !anyNonN → warnAdeptoHtml). */
  warn: boolean
}

export interface AttrGroup {
  attr: string
  skills: SkillHighlight[]
}

const periciasLista = (fm: Fm | undefined) =>
  toArray((fm as { Pericias?: { Lista?: unknown } } | undefined)?.Pericias?.Lista) as NamedRow[]

/** Espelha scoredEntriesForSkill + topTwoForSkill (pericia-helpers.ts). */
export function topTwoForSkill(
  members: IndexDocEntry[],
  docs: Map<string, VaultDoc> | undefined,
  key: string,
): SkillTop[] {
  const scored: Array<SkillTop & { name: string }> = []
  for (const member of members) {
    const fm = docs?.get(member.id)?.frontmatter
    const row = findNamedRowExact(periciasLista(fm), key)
    const mod = skillMod(fm, row)
    if (row == null || mod == null) continue
    const name = member.basename ?? member.id
    scored.push({
      mod,
      prof: String(row.Proficiencia ?? 'N').toUpperCase(),
      who: name,
      name,
    })
  }
  scored.sort((a, b) => b.mod - a.mod || a.name.localeCompare(b.name, 'pt'))
  return scored.slice(0, 2).map(({ name: _name, ...top }) => top)
}

/** Match EXATO por Nome (espelha getPericiaRowByKey, que compara String(Nome) === key). */
function findNamedRowExact(list: NamedRow[], key: string): NamedRow | null {
  for (const row of list) {
    if (String(row?.Nome) === key) return row
  }
  return null
}

/** Espelha buildPericiaSectionEl (section-pericia.ts): agrupa chaves pelo
 *  Atributo do 1º membro com a linha; ordena chaves pt; ATTR_ORDER fixa.
 *  Grupos sem chave ficam de fora (plugin: `if (!keys.length) continue`). */
export function skillHighlights(
  members: IndexDocEntry[],
  docs: Map<string, VaultDoc> | undefined,
): AttrGroup[] {
  const keys = new Set<string>()
  for (const member of members) {
    for (const row of periciasLista(docs?.get(member.id)?.frontmatter)) {
      if (!row?.Nome) continue
      if (OFICIO_NOMES.has(String(row.Nome))) continue
      keys.add(String(row.Nome))
    }
  }
  const byAttr = new Map<string, string[]>()
  for (const key of keys) {
    let attr = 'FOR'
    for (const member of members) {
      const row = findNamedRowExact(periciasLista(docs?.get(member.id)?.frontmatter), key)
      if (row) {
        attr = String(row.Atributo || 'FOR').toUpperCase()
        break
      }
    }
    const list = byAttr.get(attr)
    if (list) list.push(key)
    else byAttr.set(attr, [key])
  }
  // Espelha section-pericia.ts:73-82: hasAny = algum membro tem a linha;
  // anyNonN = algum deles com Proficiencia > N; warn = hasAny && !anyNonN.
  const warnFor = (key: string): boolean => {
    let hasAny = false
    let anyNonN = false
    for (const member of members) {
      const row = findNamedRowExact(periciasLista(docs?.get(member.id)?.frontmatter), key)
      if (row) {
        hasAny = true
        if (profRank(row.Proficiencia) > 0) anyNonN = true
      }
    }
    return hasAny && !anyNonN
  }
  const groups: AttrGroup[] = []
  for (const attr of ATTR_ORDER) {
    const list = (byAttr.get(attr) ?? []).sort((a, b) => a.localeCompare(b, 'pt'))
    if (!list.length) continue
    groups.push({
      attr,
      skills: list.map((key) => ({
        key,
        tops: topTwoForSkill(members, docs, key),
        warn: warnFor(key),
      })),
    })
  }
  return groups
}

// ── Prof. equipamento (espelha section-equip-prof.ts) ────────────────────

export interface EquipMember {
  who: string
  /** 'P' ou '★' (marcial só com Especificas) — espelha htmlEquipProfMarcialModCell. */
  mark: string
}

export interface EquipCard {
  /** Chave no registro EMOJI.partyEquip (tokens.emojis.partyEquip). */
  emojiKey: 'ArmasMarciais' | 'Escudos' | 'ArmadurasPesadas' | 'ArmadurasLeves'
  label: string
  members: EquipMember[]
}

interface EquipFm {
  Inventario?: {
    Armadura?: { Proficiencia?: { Leve?: unknown; Pesada?: unknown } }
    Escudo?: { Proficiencia?: unknown }
  }
  Ataques?: { Proficiencia?: { Armas?: { Marciais?: unknown; Especificas?: unknown } } }
}

/** Espelha isProfPLetter (section-equip-prof.ts). */
export function isProfPLetter(val: unknown): boolean {
  return String(val ?? 'N').trim().toUpperCase() === 'P'
}

/** Espelha buildEquipProfSectionEl (section-equip-prof.ts): ordem Marciais →
 *  Escudos → Pesadas → Leves; cartões vazios ficam de fora. Marca '★' vem
 *  do registro central (tokens.emojis.glyph.Star) via caller. */
export function equipCards(
  members: IndexDocEntry[],
  docs: Map<string, VaultDoc> | undefined,
  starGlyph: string,
): EquipCard[] {
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'pt')
  const marciais: Array<EquipMember & { name: string; fullP: boolean }> = []
  const escudos: Array<EquipMember & { name: string }> = []
  const pesadas: Array<EquipMember & { name: string }> = []
  const leves: Array<EquipMember & { name: string }> = []
  for (const member of members) {
    const fm = (docs?.get(member.id)?.frontmatter ?? {}) as EquipFm
    const name = member.basename ?? member.id
    const armas = fm?.Ataques?.Proficiencia?.Armas || {}
    const fullP = isProfPLetter(armas.Marciais)
    const espec = toArray(armas.Especificas).filter((x) => x != null && String(x).trim() !== '')
    if (fullP || espec.length) {
      marciais.push({ who: name, name, fullP, mark: fullP ? 'P' : starGlyph })
    }
    const arm = fm?.Inventario?.Armadura?.Proficiencia || {}
    if (isProfPLetter(fm?.Inventario?.Escudo?.Proficiencia)) escudos.push({ who: name, name, mark: 'P' })
    if (isProfPLetter(arm.Pesada)) pesadas.push({ who: name, name, mark: 'P' })
    if (isProfPLetter(arm.Leve)) leves.push({ who: name, name, mark: 'P' })
  }
  // Marciais: fullP primeiro, depois nome (espelha collectEquipMarciais).
  marciais.sort((a, b) => (a.fullP !== b.fullP ? (a.fullP ? -1 : 1) : byName(a, b)))
  escudos.sort(byName)
  pesadas.sort(byName)
  leves.sort(byName)
  const strip = ({ name: _n, ...m }: EquipMember & { name: string }) => m
  const cards: EquipCard[] = [
    {
      emojiKey: 'ArmasMarciais',
      label: 'Armas Marciais',
      members: marciais.map(({ fullP: _f, name: _n, ...m }) => m),
    },
    { emojiKey: 'Escudos', label: 'Escudos', members: escudos.map(strip) },
    { emojiKey: 'ArmadurasPesadas', label: 'Armaduras Pesadas', members: pesadas.map(strip) },
    { emojiKey: 'ArmadurasLeves', label: 'Armaduras Leves', members: leves.map(strip) },
  ]
  return cards.filter((c) => c.members.length > 0)
}

// ── Magias (espelha section-magias.ts) ───────────────────────────────────

export interface MagiaHighlight {
  /** Nome da escola como no FM (Anima / Arcana Branca / Arcana Negra). */
  nome: string
  /** Chave no registro EMOJI.escola (tokens.emojis.escola). */
  emojiKey: 'Anima' | 'Branca' | 'Negra'
  /** ⚠️ quando há a linha em algum membro mas ninguém ≥ Adepto. */
  warn: boolean
  /** Melhor integrante ≥ Adepto (mod desc, tie basename pt); null sem top. */
  top: SkillTop | null
}

const MAGIA_ESCOLAS: Array<readonly [string, MagiaHighlight['emojiKey']]> = [
  ['Anima', 'Anima'],
  ['Arcana Branca', 'Branca'],
  ['Arcana Negra', 'Negra'],
]

const magiasLista = (fm: Fm | undefined) =>
  toArray((fm as { Magias?: { Lista?: unknown } } | undefined)?.Magias?.Lista) as NamedRow[]

/** Espelha magiaModDisplay (section-magias.ts) = calcMagia. */
export function magiaMod(fm: Fm | undefined, nome: string): { total: number; prof: string } | null {
  const row = findNamedRow(magiasLista(fm), nome)
  if (!row) return null
  const prof = String(row.Proficiencia ?? 'N').toUpperCase()
  const total =
    getAttr(fm, row.Atributo) +
    profMod(prof) +
    (Number(row.Bonus_Item) || 0) +
    (Number(row.Bonus_Especial) || 0)
  return { total, prof }
}

/** Espelha buildMagiasSectionEl + allMagiaAdeptoPlus (section-magias.ts);
 *  o design mostra só o melhor integrante por escola (mg.mod/prof/who). */
export function magiaHighlights(
  members: IndexDocEntry[],
  docs: Map<string, VaultDoc> | undefined,
): MagiaHighlight[] {
  return MAGIA_ESCOLAS.map(([nome, emojiKey]) => {
    let hasAny = false
    let anyNonN = false
    const scored: Array<SkillTop & { name: string }> = []
    for (const member of members) {
      const fm = docs?.get(member.id)?.frontmatter
      const row = findNamedRow(magiasLista(fm), nome)
      if (row) {
        hasAny = true
        if (profRank(row.Proficiencia) > 0) anyNonN = true
      }
      const d = magiaMod(fm, nome)
      if (!d || profRank(d.prof) < 1) continue
      const name = member.basename ?? member.id
      scored.push({ mod: d.total, prof: d.prof, who: name, name })
    }
    scored.sort((a, b) => b.mod - a.mod || a.name.localeCompare(b.name, 'pt'))
    const first = scored[0]
    return {
      nome,
      emojiKey,
      warn: hasAny && !anyNonN,
      top: first ? { mod: first.mod, prof: first.prof, who: first.who } : null,
    }
  })
}
