// Registro central da FICHA DO HERÓI — nada disto é inventado em call-site:
//   - Emojis/cores vêm do registro gerado do plugin (src/generated/tokens.ts).
//   - Paletas de medalha/rank e listas de chrome vêm VERBATIM do script do
//     design puxado (design/pulled/Companion App.dc.html, bloco DCLogic:
//     MEDAL/RS em profData/renderVals, INV.armadura.bases, COMBATE.combChips…).
//   - Regras numéricas (bônus de proficiência, classe de aventureiro por
//     nível) espelham o plugin pleitost-autosheet (fonte de verdade).
import { tokens } from '../../generated/tokens'

export type RankLetter = 'N' | 'A' | 'E' | 'M'
export const RANK_ORDER: RankLetter[] = ['N', 'A', 'E', 'M']

/** Bônus de proficiência por rank — espelha o plugin (e o PB do design). */
export const PROF_BONUS: Record<RankLetter, number> = { N: 0, A: 2, E: 4, M: 6 }

/** Paleta das medalhas de proficiência — VERBATIM do MEDAL do design. */
export const MEDAL: Record<RankLetter, { bg: string; fg: string; bd: string; solid: string }> = {
  N: {
    bg: 'rgba(125,130,142,.16)',
    fg: 'var(--text)',
    bd: 'rgba(125,130,142,.42)',
    solid: 'var(--muted)',
  },
  A: { bg: '#8f5a2b', fg: '#f4f6f8', bd: '#b07a44', solid: '#a4692f' },
  E: { bg: '#646d78', fg: '#f4f6f8', bd: '#828d9a', solid: '#6c7885' },
  M: { bg: '#a07e1f', fg: '#f4f6f8', bd: '#c8a23e', solid: '#ac861f' },
}

/** Estados visuais dos botõezinhos N/A/E/M no modo edição — VERBATIM do RS do design. */
export type RankStateKey =
  | 'selN'
  | 'passN'
  | 'sel'
  | 'selSlot'
  | 'selRule'
  | 'ruleSlot'
  | 'off'
export const RANK_STATES: Record<RankStateKey, { bg: string; fg: string; bd: string }> = {
  selN: { bg: '#313338', fg: '#f2f2f4', bd: '#54565c' },
  passN: {
    bg: 'transparent',
    fg: 'color-mix(in srgb,var(--text) 48%,transparent)',
    bd: 'color-mix(in srgb,var(--muted) 50%,transparent)',
  },
  sel: { bg: '#e23b2f', fg: '#ffffff', bd: '#ff6a5f' },
  selSlot: { bg: 'rgba(226,59,47,.16)', fg: '#e8635a', bd: 'rgba(226,59,47,.55)' },
  selRule: { bg: '#c89a2e', fg: '#1f1804', bd: '#e6c155' },
  ruleSlot: { bg: 'rgba(200,154,46,.17)', fg: '#caa249', bd: 'rgba(200,154,46,.5)' },
  off: {
    bg: 'color-mix(in srgb,var(--muted) 8%,transparent)',
    fg: 'color-mix(in srgb,var(--muted) 78%,transparent)',
    bd: 'color-mix(in srgb,var(--muted) 30%,transparent)',
  },
}

/** Nome do rank de qualidade de item — como o FM salvo grava (Categoria:
 *  "[[Adepto]]"/"[[Experiente]]"/"[[Mestre]]" nas listas de Inventario;
 *  aliases de consumível "(Adepto) (xN)") — fonte: heróis reais da vault
 *  (ex.: Thoren.Inventario.Armas.Lista). Round-trip com tierLetter/
 *  parseItemAlias do hero-model. */
export const TIER_NOME: Record<'A' | 'E' | 'M', string> = {
  A: 'Adepto',
  E: 'Experiente',
  M: 'Mestre',
}

/** Botões A/E/M da qualidade de item — VERBATIM do MED de invData do design. */
export const ITEM_TIER_BTN: Record<'A' | 'E' | 'M', { bg: string; bd: string }> = {
  A: { bg: '#8f5a2b', bd: '#b07a44' },
  E: { bg: '#646d78', bd: '#828d9a' },
  M: { bg: '#a07e1f', bd: '#c8a23e' },
}

/** Cores dos pontos de atributo por posição (maior → menor) — VERBATIM de hab.atributos. */
export const ATTR_DOT_COLORS = ['#e0bd55', '#cfd3d8', '#b07a3a', '#5a5a5a']

/** Emojis de atributo (💪💨🧠🗣️) — registro do plugin. */
export const ATTR_EMOJI: Record<string, string> = tokens.emojis.atributo

/** Emoji da Especialidade (🎖️ medalha, igual ao autosheet) e da Maestria (🏆
 *  troféu). Centralizado aqui (não hardcodar no call-site) — usado em
 *  Competências/Perícias e Combate/Perícias (#163). */
export const ESPECIALIDADE_EMOJI: string =
  (tokens.emojis.subcategoria as Record<string, string>).Especializacao
export const MAESTRIA_EMOJI = '🏆'

/** Slug NFD-strip do plugin (util/display-names.ts) — chave dos registros. */
export function slugify(s: string): string {
  return String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '')
}

/** Nome de exibição de slug — espelho de SLUG_TO_DISPLAY do plugin. */
const SLUG_TO_DISPLAY: Record<string, string> = {
  Sobrevivencia: 'Sobrevivência',
  Enganacao: 'Enganação',
  Intimidacao: 'Intimidação',
  Oficio: 'Ofício',
  Atuacao: 'Atuação',
  Impeto: 'Ímpeto',
  // A defesa de AGI é "Evasão" na fonte de verdade (vault: Evasão.json); o
  // modelo interno ainda usa o slug legado "Reflexo" (emoji/condições). O NOME
  // exibido — e o que resolve a regra do compêndio — é Evasão.
  Reflexo: 'Evasão',
  Evasao: 'Evasão',
  Percepcao: 'Percepção',
  Intuicao: 'Intuição',
  Aereo: 'Aéreo',
  Aquatico: 'Aquático',
  ArcanaNegra: 'Arcana Negra',
  ArcanaBranca: 'Arcana Branca',
}
export function displayName(slug: string): string {
  return SLUG_TO_DISPLAY[slug] ?? slug
}

/** Emoji de perícia (registro pericia do plugin, chave slugada). */
export function periciaEmoji(nome: string): string {
  const map = tokens.emojis.pericia as Record<string, string>
  return map[slugify(nome)] ?? ''
}

/** Emoji de defesa/sentido (registros defesa + categoria do plugin). */
export function defesaEmoji(nome: string): string {
  const map = tokens.emojis.defesa as Record<string, string>
  const cat = tokens.emojis.categoria as Record<string, string>
  const key = slugify(nome)
  return map[key] ?? cat[key] ?? ''
}

/** Emoji de grupo de arma via FM `grupo` do doc da arma (registro grupoArma). */
const GRUPO_ARMA_KEY: Record<string, keyof typeof tokens.emojis.grupoArma> = {
  'cac-marcial': 'CaCMarcial',
  'cac-simples': 'CaCSimples',
  'd-marcial': 'DistMarcial',
  'd-simples': 'DistSimples',
  natural: 'Natural',
  especial: 'Especial',
}
export function grupoArmaEmoji(grupo: unknown): string {
  if (typeof grupo !== 'string') return ''
  const key = GRUPO_ARMA_KEY[grupo.toLowerCase()]
  return key ? tokens.emojis.grupoArma[key] : ''
}

/** Ordem/rótulos dos grupos de arma no dropdown — VERBATIM do GRUPO_ORDER do
 *  plugin (render/groups/inventario/equipamentos-section.ts:74-81); o emoji
 *  do label vem do registro grupoArma via grupoArmaEmoji. */
export const GRUPO_ARMA_ORDER: { key: string; label: string }[] = [
  { key: 'cac-simples', label: 'Corpo-a-Corpo Simples' },
  { key: 'cac-marcial', label: 'Corpo-a-Corpo Marcial' },
  { key: 'd-simples', label: 'Distância Simples' },
  { key: 'd-marcial', label: 'Distância Marcial' },
  { key: 'especial', label: 'Armas Especiais' },
  { key: 'natural', label: 'Armas Naturais' },
]

/** Emoji de imbuição/propriedade via inline `propriedades::` do doc do tesouro
 *  ("[[Traço Elemental do Vento|Vento]]" → registro propriedadeImbuicao.Vento). */
export function imbuicaoEmoji(propriedades: unknown): string {
  if (typeof propriedades !== 'string') return ''
  const map = tokens.emojis.propriedadeImbuicao as Record<string, string>
  const re = /\[\[[^\]|]+(?:\|([^\]]+))?\]\]|([^,\s][^,]*)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(propriedades)) !== null) {
    const label = (m[1] ?? m[2] ?? '').trim()
    if (label && map[label]) return map[label]
  }
  return ''
}

// Grupos de arma elegíveis a Ataque de Oportunidade — espelho de
// isArmaAdoEligible/GRUPOS_POR_TERMO do plugin (util/grupo-arma.ts):
// corpo-a-corpo (cac-* e natural) e especial; distância (d-*) fica fora.
export const ADO_GRUPOS = ['cac-simples', 'cac-marcial', 'natural', 'especial']

/** Emoji do tipo de dano da arma (inline `tipo::`) — espelho do tipoIcon
 *  do plugin (interativa/panel/internal-helpers.ts) sobre o registro
 *  tipoDano (🪡/💥/🔪). */
export function tipoDanoEmoji(tipo: unknown): string {
  if (typeof tipo !== 'string' || !tipo) return ''
  const t = tipo.toLowerCase()
  if (t.includes('perfu')) return tokens.emojis.tipoDano.Perfuracao
  if (t.includes('contu')) return tokens.emojis.tipoDano.Contusao
  if (t.includes('cort')) return tokens.emojis.tipoDano.Corte
  return ''
}

/** Emoji de custo de ação ("2A" → 2️⃣; L/R/etc do registro custo). */
export function custoEmoji(custo: unknown): string {
  if (typeof custo !== 'string' || !custo.trim()) return ''
  const map = tokens.emojis.custo as Record<string, string>
  return map[custo.trim()] ?? ''
}

/** Custo de técnica em slots — casos do design: 2️⃣/🆓/↩️, senão ▫️ (Empty). */
export function tecnicaCustoEmoji(custo: unknown): string {
  const c = typeof custo === 'string' ? custo.trim() : ''
  if (/^([2-9])A$/.test(c)) return tokens.emojiCostExtra.digits[c[0] as '2']
  if (c === 'L') return tokens.emojiCostExtra.Livre
  if (c === 'R') return tokens.emojiCostExtra.Reacao
  return tokens.emojiCostExtra.Empty
}

/** Emoji da magia: elemento (FM elemento) senão escola (FM escola) — registros do plugin. */
export function magiaEmoji(fm: Record<string, unknown>): string {
  const elemento = fm['elemento']
  if (typeof elemento === 'string') {
    const el = (tokens.emojis.elemento as Record<string, string>)[slugify(elemento)]
    if (el) return el
  }
  const escola = fm['escola'] ?? fm['Escola']
  if (typeof escola === 'string') {
    const es = (tokens.emojis.escola as Record<string, string>)[slugify(escola)]
    if (es) return es
  }
  return tokens.emojis.escola.Especial
}

/** Cor do diamante de NÍVEL por classe — VERBATIM do pfTierColor do design
 *  (renderVals recuperado: ≤3 '#cd7f32' · ≤6 '#94a3b8' · ≤9 '#d4af37' ·
 *  senão '#8fd3ff'); os emojis 🥉🥈🥇🏅 (pfTier) coincidem com
 *  tokens.emojis.tier. */
export const PF_TIER_COLORS: Record<'C' | 'B' | 'A' | 'S', string> = {
  C: '#cd7f32',
  B: '#94a3b8',
  A: '#d4af37',
  S: '#8fd3ff',
}

/** Classe de aventureiro por nível — espelha classeInfo do plugin (aventureiro-card.ts). */
export function classeAventureiro(nivel: number): {
  classe: string
  emoji: string
  color: string
} {
  const t = tokens.emojis.tier
  const c = tokens.colors.tier
  if (nivel <= 3) return { classe: 'C', emoji: t.Bronze, color: c.Bronze }
  if (nivel <= 6) return { classe: 'B', emoji: t.Silver, color: c.Silver }
  if (nivel <= 9) return { classe: 'A', emoji: t.Gold, color: c.Gold }
  return { classe: 'S', emoji: t.Platina, color: c.Platina }
}

/** Rank de habilidade/técnica → rótulo dos grupos do design (Adepta/Experiente/Mestre). */
export function rankGroupLabel(raw: string): string {
  const key = slugify(raw).toLowerCase()
  if (key.startsWith('adept')) return 'Adepta'
  if (key.startsWith('experiente')) return 'Experiente'
  if (key.startsWith('mestre')) return 'Mestre'
  if (key.startsWith('basica')) return 'Básica'
  return raw
}
export const RANK_GROUP_ORDER = ['Básica', 'Adepta', 'Experiente', 'Mestre']

/** Slot letter → grupo de técnica (Slot.A → Adepta), como no mock do design. */
export const SLOT_GROUP: Record<string, string> = { B: 'Básica', A: 'Adepta', E: 'Experiente', M: 'Mestre' }

/** Títulos dos grupos de magia na aba COMBATE (BÁSICAS/ADEPTAS/TESOUROS do design). */
export const MAGIA_GRUPO_TITULO: Record<string, string> = {
  Básica: 'BÁSICAS',
  Adepta: 'ADEPTAS',
  Experiente: 'EXPERIENTES',
  Mestre: 'MESTRES',
  Tesouro: 'TESOUROS',
}

/** Chrome do design (strings verbatim do script do Companion App). */
export const COMB_CHIPS = [
  { id: 'vant', n: 'Vantagem de Combate', ic: '🗡️', cor: '#5aa563' },
  { id: 'acerto', n: 'Acerto Decisivo', ic: '🎯', cor: '#c98b3a' },
]
export const MANOBRAS = ['Derrubar', 'Agarrar', 'Desarmar']
// Bases de armadura/escudo NÃO ficam aqui: são derivadas dos docs reais das
// pastas Sistema/Equipamento/{Armaduras,Escudos} (equipment-bases.ts, issue #63).
export const COND_GRUPOS = [
  { id: 'Positiva', titulo: 'POSITIVAS', cor: '#5aa563' },
  { id: 'Negativa', titulo: 'NEGATIVAS', cor: '#c85a4a' },
]

/** Condições ACUMULÁVEIS por contagem (Lento/Acelerado X) — VERBATIM do
 *  catálogo hardcoded do plugin (data/condicoes-catalog.ts:77 e :86,
 *  `acumulavel: true`); a UI mostra `− N +`. Condições ESCALÁVEIS
 *  (Escalavel N nas Elementos_de_Regra) ganham o mesmo stepper via
 *  `scaleMax > 1` do catálogo runtime — a fonte que o próprio plugin
 *  documenta como ideal (data/condicoes-catalog.ts:17). */
export const COND_ACUMULAVEIS: ReadonlySet<string> = new Set(['Lento', 'Acelerado'])

/** Equipamentos com proficiência (aba COMPETÊNCIAS) — nomes do design, emojis
 *  do registro. `srcPath` = chave do ruleSourcesByPath pro tooltip de Fonte
 *  dos toggles N/P — VERBATIM dos equipRows do plugin
 *  (render/groups/prof-equipamentos-card.ts:77-82). */
export const EQUIP_TYPES: { nm: string; ic: string; path: string[]; srcPath: string }[] = [
  { nm: 'Armas Simples', ic: tokens.emojis.equipProf.ArmasSimples, path: ['Armas', 'Proficiencia', 'Simples'], srcPath: 'ataques.proficiencia.armasSimples' },
  { nm: 'Armas Marciais', ic: tokens.emojis.equipProf.ArmasMarciais, path: ['Armas', 'Proficiencia', 'Marciais'], srcPath: 'ataques.proficiencia.armasMarciais' },
  { nm: 'Escudos', ic: tokens.emojis.equipProf.Escudo, path: ['Escudo', 'Proficiencia'], srcPath: 'inventario.escudo.proficiencia' },
  { nm: 'Sem Armadura', ic: tokens.emojis.equipProf.Armadura, path: ['Armadura', 'Proficiencia', 'Sem'], srcPath: 'inventario.armadura.proficiencias.Sem' },
  { nm: 'Armadura Leve', ic: tokens.emojis.equipProf.Armadura, path: ['Armadura', 'Proficiencia', 'Leve'], srcPath: 'inventario.armadura.proficiencias.Leve' },
  { nm: 'Armadura Pesada', ic: tokens.emojis.equipProf.Armadura, path: ['Armadura', 'Proficiencia', 'Pesada'], srcPath: 'inventario.armadura.proficiencias.Pesada' },
]

/** Chave de fonte da proficiência das armas ESPECÍFICAS (coluna direita do
 *  card Equipamentos) — espelho de prof-equipamentos-card.ts:101. */
export const EQUIP_ARMA_ESPECIFICA_SRC_PATH = 'ataques.proficiencia.armasEspecificas'

export { tokens }
