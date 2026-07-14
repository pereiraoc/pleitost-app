// Seção "// ELEMENTOS DE REGRA" do DocPage (issue #193) — só no Modo Mestre.
//
// Espelho do Visualizador de Regras do plugin pleitost-autosheet
// (src/render/modes/rules-viewer/render-elemento-regra.ts): os rótulos de
// verbo/operador/condição/escopo abaixo são PORTADOS de lá, não inventados
// aqui. NÃO há parser novo: o extractor já entrega `doc.ruleElements` com o
// raw e a AST do rule-parser do plugin (lossless) — este componente só
// APRESENTA esses dados. Campo ausente fica de fora (sem fallback); kind
// desconhecido mostra o próprio kind vindo do JSON.
import type { CSSProperties } from 'react'
import type { ConditionParse, RuleElement, VaultDoc } from '../../data/types'
import { useSettings } from '../../settings'
import { InlineFieldValue } from './InlineFieldValue'
import { RuleElementsEditor } from './RuleElementsEditor'
import { DocContentEditor } from './DocContentEditor'

// ──────────────────────────────────────────────────────────────────────────
// Narrowing do `parsed` (unknown no JSON) pra uma vista mínima da AST
// ──────────────────────────────────────────────────────────────────────────

/** Campos da RuleAction usados no resumo (vista parcial da AST do plugin). */
interface RuleActionLite extends Record<string, unknown> {
  kind: string
}

interface ParsedRuleLite {
  action: RuleActionLite
  scope: Record<string, unknown>[]
  condition: Record<string, unknown>
  conditionNegated: boolean
  channel: unknown
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** String exibível de um campo da AST; número vira string, resto é null. */
function str(v: unknown): string | null {
  if (typeof v === 'string') return v
  if (typeof v === 'number') return String(v)
  return null
}

function strList(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.map(str).filter((s): s is string => s !== null)
}

/** Aceita só itens do `parsed` com `action.kind` string (shape do rule-parser). */
function parsedRules(parsed: unknown): ParsedRuleLite[] {
  if (!Array.isArray(parsed)) return []
  const rules: ParsedRuleLite[] = []
  for (const item of parsed) {
    if (!isRecord(item)) continue
    const action = item.action
    if (!isRecord(action) || typeof action.kind !== 'string') continue
    rules.push({
      action: action as RuleActionLite,
      scope: Array.isArray(item.scope) ? item.scope.filter(isRecord) : [],
      condition: isRecord(item.condition) ? item.condition : {},
      conditionNegated: item.conditionNegated === true,
      channel: item.channel,
    })
  }
  return rules
}

// ──────────────────────────────────────────────────────────────────────────
// Resumo — port 1:1 dos rótulos do rules-viewer do plugin
// ──────────────────────────────────────────────────────────────────────────

/** Texto de condição — port de `conditionText` do render-elemento-regra.ts. */
function conditionText(cond: Record<string, unknown>): string | null {
  const s = (k: string) => str(cond[k]) ?? ''
  switch (cond.kind) {
    case 'attr-compare':
      return `${s('left')} ${s('op')} ${s('right')}`
    case 'attr-min':
      return `${s('attr')} ≥ ${s('min')}`
    case 'prof-min':
      return `prof. ${s('prop')} ≥ ${s('min')}`
    case 'bonus-min':
      return `bônus ${s('prop')} ≥ ${s('min')}`
    case 'props-contains':
      return `${s('slotProp')} contém ${s('needle')}`
    case 'name-contains':
      return `nome de ${s('slotProp')} contém ${s('needle')}`
    case 'unknown':
      return s('raw')
    default:
      // 'none', ausente ou kind não conhecido pelo viewer: sem badge
      return null
  }
}

/** Rótulo de escopo — port dos labels de `nivelGroup`/badge de escolha. */
function scopeLabel(sc: Record<string, unknown>): string | null {
  switch (sc.kind) {
    case 'nivel-min':
      return `Nível ${str(sc.min) ?? ''}`
    case 'tier-min':
      return `Tier ${str(sc.min) ?? ''}`
    case 'categoria':
      return str(sc.value)
    case 'escolha':
      return `escolha: ${str(sc.label) ?? ''}`
    default:
      return null
  }
}

interface ActionResumo {
  verbo: string
  alvo?: string
  op?: string
  valor?: string
  chips?: string[]
}

/** `Aplicável a` — cada termo é um grupo OR de condições (AplicavelOrGroup). */
function aplicavelChips(predicates: unknown): string[] {
  if (!Array.isArray(predicates)) return []
  return predicates.map((group) =>
    Array.isArray(group)
      ? group.map((c) => (isRecord(c) ? (conditionText(c) ?? '?') : '?')).join(' ou ')
      : '?',
  )
}

/** Resumo de uma action — port de `renderActionInto` (verbos/ops do plugin). */
function actionResumo(a: RuleActionLite): ActionResumo {
  const alvo = str(a.targetRaw) ?? undefined
  const valor = str(a.valueRaw) ?? undefined
  switch (a.kind) {
    case 'definir':
      return { verbo: 'Definir', alvo, op: '=', valor }
    case 'somar':
      return { verbo: 'Somar', alvo, op: '+', valor }
    case 'multiplicar':
      return { verbo: 'Multiplicar', alvo, op: 'x', valor }
    case 'sobrescrever':
      return { verbo: 'Sobrescrever', alvo, op: '=', valor }
    case 'complementar':
      return { verbo: 'Complementar', alvo, op: '+=', valor }
    case 'escolher':
      return { verbo: 'Escolher', alvo, op: 'de', chips: strList(a.allowed) }
    case 'restringir':
      return { verbo: 'Restringir', alvo, op: 'a', chips: strList(a.allowed) }
    case 'prof-definir':
      return { verbo: `Proficiência ≥${str(a.minRank) ?? ''}`, alvo, op: '=', valor }
    case 'alias':
      return { verbo: 'Alias', alvo, op: '→', valor: str(a.aliasRaw) ?? undefined }
    case 'alias-compor':
      return {
        verbo: 'Alias compor',
        alvo,
        op: `pos. ${str(a.order) ?? ''}`,
        valor: str(a.fragment) ?? undefined,
      }
    case 'requisito':
      return { verbo: 'Requisito', alvo, valor }
    case 'requisito-contem':
      return { verbo: 'Requisito (contém)', alvo, valor }
    case 'movimento-lista-complementar':
      return { verbo: 'Adiciona movimento', alvo: str(a.nome) ?? undefined }
    case 'movimento-lista-definir':
      return {
        verbo: 'Movimento',
        alvo: str(a.nome) ?? undefined,
        op: `· ${str(a.field) ?? ''} =`,
        valor,
      }
    case 'complementar-sel': {
      const label = str(a.label)
      return {
        verbo: 'Complementar (selecionável)',
        alvo,
        op: label ? `«${label}»` : undefined,
        chips: strList(a.options),
      }
    }
    case 'escolha-prop-map':
      return {
        verbo: `Escolha «${str(a.label) ?? ''}»`,
        valor,
        chips: Array.isArray(a.propMap)
          ? a.propMap
              .filter(isRecord)
              .map((p) => `${str(p.label) ?? ''} → ${str(p.targetRaw) ?? ''}`)
          : [],
      }
    case 'escolha-pericia-especial': {
      const label = str(a.label)
      return {
        verbo: 'Escolha de perícia especial',
        alvo: label ? `«${label}»` : undefined,
        valor,
      }
    }
    case 'interativa':
      return {
        verbo: 'Interativa',
        alvo: `«${str(a.efeitoLabel) ?? ''}»`,
        op: '·',
        valor: [alvo, valor].filter(Boolean).join(' ') || undefined,
      }
    case 'aplicavel-a':
      return { verbo: 'Aplicável a', chips: aplicavelChips(a.predicates) }
    default:
      // kind que o viewer não conhece: mostra o próprio kind do dado
      return { verbo: a.kind, alvo, valor }
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Estilos — vocabulário dos painéis (mono, var(--...), canto cortado)
// ──────────────────────────────────────────────────────────────────────────

/** clip-path de canto cortado (mesmo polígono do design). */
function clip(n: number): NonNullable<CSSProperties['clipPath']> {
  return `polygon(0 0,calc(100% - ${n}px) 0,100% ${n}px,100% 100%,${n}px 100%,0 calc(100% - ${n}px))`
}

const cardStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: '10px 12px',
  background: 'var(--panel)',
  border: '1px solid var(--line2)',
  clipPath: clip(8),
}

const rowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'baseline',
  gap: 6,
  fontFamily: 'var(--mono)',
  fontSize: 12,
}

const verbStyle: CSSProperties = { color: 'var(--accent)', letterSpacing: '.06em' }
const alvoStyle: CSSProperties = { color: 'var(--text)', fontWeight: 600 }
const opStyle: CSSProperties = { color: 'var(--muted)' }
const valorStyle: CSSProperties = { color: 'var(--text)' }

const chipStyle: CSSProperties = {
  fontSize: 11,
  color: 'var(--muted)',
  border: '1px solid var(--line2)',
  padding: '1px 6px',
  clipPath: clip(4),
}

const badgeStyle: CSSProperties = {
  fontSize: 10,
  letterSpacing: '.08em',
  color: 'var(--accent2)',
  border: '1px solid color-mix(in srgb,var(--accent2) 40%,transparent)',
  padding: '1px 6px',
  clipPath: clip(4),
}

const rawRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 8,
  padding: '5px 8px',
  background: 'var(--card)',
  border: '1px solid var(--line2)',
  clipPath: clip(6),
  overflowX: 'auto',
}

const rawLabelStyle: CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 9,
  letterSpacing: '.18em',
  color: 'var(--muted)',
  flexShrink: 0,
}

const rawTextStyle: CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 11,
  color: 'var(--muted)',
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
}

// ──────────────────────────────────────────────────────────────────────────
// Componentes
// ──────────────────────────────────────────────────────────────────────────

function ResumoRow({ rule }: { rule: ParsedRuleLite }) {
  const resumo = actionResumo(rule.action)
  const cond = conditionText(rule.condition)
  const badges: string[] = []
  if (cond) badges.push(`${rule.conditionNegated ? 'senão' : 'se'} ${cond}`)
  if (rule.channel === 'interactive-only') badges.push('só interativa')
  for (const sc of rule.scope) {
    const label = scopeLabel(sc)
    if (label) badges.push(label)
  }
  return (
    <div style={rowStyle}>
      <span style={verbStyle}>{resumo.verbo}</span>
      {resumo.alvo ? (
        <span style={alvoStyle}>
          <InlineFieldValue value={resumo.alvo} />
        </span>
      ) : null}
      {resumo.op ? <span style={opStyle}>{resumo.op}</span> : null}
      {resumo.valor ? (
        <span style={valorStyle}>
          <InlineFieldValue value={resumo.valor} />
        </span>
      ) : null}
      {resumo.chips?.map((chip, i) => (
        <span key={i} style={chipStyle}>
          <InlineFieldValue value={chip} />
        </span>
      ))}
      {badges.map((b, i) => (
        <span key={i} style={badgeStyle}>
          {b}
        </span>
      ))}
    </div>
  )
}

/** Validação de COBERTURA/SINTAXE (#251, F7) — o extractor usa o parser real
 *  do plugin; se uma linha RAW não-vazia não produz regra, é erro de SINTAXE;
 *  se o parser classificou a ação como 'unknown', o elemento NÃO está coberto
 *  (ninguém aplica o efeito). Isso deixa "ver que tudo está coberto e não tem
 *  erros de sintaxe" — o pedido do usuário — sem lista frágil mantida à mão. */
export interface RuleIssue {
  /** RAW não-vazio sem nenhuma regra parseada → sintaxe inválida. */
  syntax: boolean
  /** Nº de ações classificadas como 'unknown' (não cobertas pelo sistema). */
  unknown: number
}

/** Notas de Condição usam um subsistema próprio do plugin (Escalavel/Derivar/
 *  Somar Condicao.X): o parser genérico devolve `parsed: []`, mas o extractor
 *  funde `element.condition` com o parse REAL. Um elemento de condição está
 *  coberto quando o parser reconheceu algo — escala (scaleMax>1), deriva, ou ao
 *  menos uma regra que não seja `unknown`. Só o que NADA reconhece (ex.: "null")
 *  segue como problema. */
function conditionRecognized(cond: ConditionParse): boolean {
  return (
    cond.scaleMax > 1 ||
    cond.derived.length > 0 ||
    cond.rules.some((r) => r.kind !== 'unknown')
  )
}

export function elementIssues(element: RuleElement): RuleIssue {
  const rules = parsedRules(element.parsed)
  // Elemento de condição coberto pelo subsistema próprio → sem problema, mesmo
  // com `parsed` genérico vazio.
  if (element.condition && conditionRecognized(element.condition)) {
    return { syntax: false, unknown: 0 }
  }
  return {
    syntax: element.raw.trim() !== '' && rules.length === 0,
    unknown: rules.filter((r) => r.action.kind === 'unknown').length,
  }
}

const issueBadgeStyle: CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 9,
  letterSpacing: '.08em',
  fontWeight: 700,
  padding: '2px 7px',
  color: '#fff',
  background: 'var(--red)',
  alignSelf: 'flex-start',
}

function ElementoCard({ element }: { element: RuleElement }) {
  const issue = elementIssues(element)
  const problema = issue.syntax || issue.unknown > 0
  return (
    <div
      data-rule-element=""
      data-rule-issue={problema ? (issue.syntax ? 'syntax' : 'unknown') : undefined}
      style={
        problema
          ? { ...cardStyle, borderColor: 'color-mix(in srgb,var(--red) 55%,var(--line2))' }
          : cardStyle
      }
    >
      {issue.syntax ? (
        <span data-issue-badge="" style={issueBadgeStyle}>
          ⚠ ERRO DE SINTAXE
        </span>
      ) : issue.unknown > 0 ? (
        <span data-issue-badge="" style={issueBadgeStyle}>
          ⚠ NÃO COBERTO ({issue.unknown})
        </span>
      ) : null}
      {parsedRules(element.parsed).map((rule, i) => (
        <ResumoRow key={i} rule={rule} />
      ))}
      {/* raw em bloco mono — a linha original da DSL, verbatim */}
      <div style={rawRowStyle}>
        <span style={rawLabelStyle}>RAW</span>
        <code style={rawTextStyle}>{element.raw}</code>
      </div>
    </div>
  )
}

/** Seção dos Elementos de Regra da nota; o gate do Modo Mestre é do chamador.
 *  F7 (#251): resumo de COBERTURA no topo — quantos com problema (sintaxe/não
 *  coberto) — pra ver de relance que "tudo está coberto e sem erros". */
export function RuleElementsSection({ elements }: { elements: readonly RuleElement[] }) {
  if (!elements.length) return null
  const problemas = elements.reduce((n, el) => {
    const it = elementIssues(el)
    return n + (it.syntax || it.unknown > 0 ? 1 : 0)
  }, 0)
  return (
    <section
      data-rule-elements=""
      style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 10 }}
    >
      <div className="kicker" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>{'// ELEMENTOS DE REGRA'}</span>
        <span style={{ color: 'var(--accent)' }}>{elements.length}</span>
        <span style={{ flex: 1 }} />
        {problemas === 0 ? (
          <span data-coverage="ok" style={{ color: '#4ade80', fontSize: 10 }}>
            ✓ tudo coberto
          </span>
        ) : (
          <span data-coverage="issues" style={{ color: 'var(--red)', fontSize: 10, fontWeight: 700 }}>
            ⚠ {problemas} {problemas === 1 ? 'com problema' : 'com problemas'}
          </span>
        )}
      </div>
      {elements.map((el, i) => (
        <ElementoCard key={i} element={el} />
      ))}
    </section>
  )
}

/** Wrapper CONECTADO da seção de um doc. Centraliza AQUI o gate do Modo Mestre
 *  (elementos de regra são conteúdo só-mestre) e o no-op quando não há
 *  elementos. Toda view de doc termina com `<DocRuleElements doc={doc} />` —
 *  assim o gate nunca é esquecido e QUALQUER tipo que venha a ter elementos de
 *  regra ganha o visualizador+cobertura (#251, F7) de graça, sem repetir o
 *  `{mestre && doc.ruleElements?.length ? …}` em cada call-site. */
export function DocRuleElements({ doc }: { doc: VaultDoc }) {
  const { mestre, desenvolvedor } = useSettings()
  // Modo Desenvolvedor (#253, F9): slot de edição in-place no fim de todo doc —
  // editor de elementos de regra (validação viva) + editor de texto (preview ao
  // vivo). Aparece mesmo sem elementos (pra ADICIONAR).
  if (desenvolvedor) {
    return (
      <>
        <RuleElementsEditor doc={doc} />
        <DocContentEditor doc={doc} />
      </>
    )
  }
  if (!mestre || !doc.ruleElements?.length) return null
  return <RuleElementsSection elements={doc.ruleElements} />
}
