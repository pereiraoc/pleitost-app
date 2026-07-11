// Aba COMBATE da ficha — markup/estilos verbatim do design puxado
// (design/pulled/Companion App.dc.html §COMBATE, linhas 297-511; lógica da
// barra de vida portada do vidaModel() do script do design). Dados: modelo
// salvo LOCAL (useHeroModel = FM extraído + overlay) — Vida/Defesas/Sentidos/
// Ataques/Inventario/Magias + correntes da Interativa (Recursos_Restantes/
// Usos_Recursos/Condicoes_Ativas/Imunidades). Interações são AUTOCONTIDAS
// nesta aba e persistem em `Interativa.*` com autosave (setVolatile —
// semântica do autoSaveInterativa do plugin).
//
// MODELO DA INTERATIVA (issue #15): os valores exibidos passam pelo
// ConditionContext espelhado do plugin (src/interativa/ ≡ runtime/condicoes
// do pleitost-autosheet) — condições ativas + efeitos ligados alteram
// defesas/sentidos/ataques/dano/AdO/manobras/perícias, pintados nas cores
// canônicas do plugin (cond-bonus verde / cond-penalty vermelho) com o
// breakdown das fontes no title. Toggles do design agora escrevem o estado
// REAL: Vantagem de Combate → Condicoes_Ativas; Acerto Decisivo e escudo
// ERGUIDO ("Escudo Erguido") → Efeitos_Ativos.
import { useMemo, useState, type CSSProperties } from 'react'
import type { VaultDoc } from '../../data/types'
import { linkLabel, unquote } from '../../markdown/dataview-value'
import { useCatalog } from '../../data/CatalogContext'
import { useAssetIndex } from '../../data/assets'
import { weaponImageUrl } from '../../data/creature-image'
import { propriedadeImageUrl, tesouroImageUrl } from '../../data/equipment-image'
import { ItemHover, ITEM_CARD_CSS } from '../item-card'
import { useDocs } from '../../data/useDoc'
import { useHeroModel } from '../../data/useHeroModel'
import { useHeroRules } from '../../rules/useHeroRules'
import { clip, TabStrip, PanelTrack, TrackPanel, ModBox, UsoDots, GoldDots } from './bits'
import {
  TipProvider,
  TipHover,
  renderBreakdownHtml,
  resistenciaBreakdown,
  sentidoBreakdown,
  periciaBreakdown,
  ataqueBreakdown,
  danoArmaBreakdown,
  entriesBreakdown,
} from './tooltips'
import { StarChip } from './HabilidadesTab'
import { useVidaLocal, VidaAdjustRows } from './pop-panels'
import type { HeroRefs } from './useHeroRefs'
import {
  ADO_GRUPOS,
  ATTR_EMOJI,
  COMB_CHIPS,
  COND_ACUMULAVEIS,
  COND_GRUPOS,
  MAGIA_GRUPO_TITULO,
  MANOBRAS,
  RANK_GROUP_ORDER,
  custoEmoji,
  defesaEmoji,
  displayName,
  grupoArmaEmoji,
  magiaEmoji,
  rankGroupLabel,
  slugify,
  tipoDanoEmoji,
  tokens,
} from './registry'
import {
  cargasPorTier,
  danoArmaDisplay,
  fmOf,
  fmPath,
  heroAtributos,
  interativa,
  listaEntries,
  num,
  parseDanoArma,
  parseItemAlias,
  profLetter,
  PROF_DICE,
  rowMod,
  signed,
  str,
  tierLetter,
  usosPorTier,
  wikiTarget,
  type ProfRow,
} from './hero-model'
import {
  applyTarget,
  entriesTitle,
  stripSharedFrom,
  toneColor,
  valueTone,
  type AppliedDelta,
} from '../../interativa/apply'
import { applyDanoCtx, computeDanoAdO } from '../../interativa/dano'
import { propagateAutoStates } from '../../interativa/hero-context'
import { isCondicaoOn, isEfeitoOn, toMultiplier } from '../../interativa/state'
import type { AtributoId, ConditionNumberKey } from '../../interativa/condition-context'
import type { EffectDescriptor } from '../../interativa/descriptor'
import {
  buildDanoTitle,
  computeEvMax,
  genId,
  invocacoesAtivas,
  invocStatEmoji,
  isEvKey,
  listInvocacoesDisponiveis,
  lookupRota,
  matchStatKey,
  resolveAttackBonus,
  resolveInvocacao,
  formatStatValue,
  INVOC_STATS_ROWS,
  type InvocacaoCtx,
  type InvocacaoInstance,
  type InvocacoesAtivasMap,
} from '../../interativa/invocacao'
import {
  condChipDefs,
  defaultCondState,
  defaultNumericSelector,
  isPotenciaLabel,
  seedSelectores,
  useInterativaCtx,
  type InterativaCtxState,
} from '../../interativa/useInterativaCtx'

const COMB_TABS = [
  { id: 'ataques', label: 'ATAQUES' },
  { id: 'pericias', label: 'PERÍCIAS' },
  { id: 'tesouros', label: 'TESOUROS' },
  { id: 'magias', label: 'MAGIAS' },
]

/** Labels de todos os wikilinks de um inline field ("[[A|B]], [[C]]" → [B, C]). */
function wikiLabels(value: unknown): string[] {
  const s = str(value)
  const out: string[] = []
  const re = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(s)) !== null) out.push((m[2] ?? m[1].split('/').pop() ?? '').trim())
  return out
}

const popStyle: CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 8px)',
  zIndex: 60,
  background: 'var(--panel2)',
  border: '1px solid var(--line2)',
  clipPath: clip(12),
  boxShadow: '0 14px 44px rgba(0,0,0,.5)',
}

function Scrim({ onClick }: { onClick: () => void }) {
  return <div onClick={onClick} style={{ position: 'fixed', inset: 0, zIndex: 55 }} />
}

/* ===================== escudo ===================== */

function EscudoRow({ doc, refs }: { doc: VaultDoc; refs: HeroRefs }) {
  const model = useHeroModel(doc, 'combate')
  const rules = useHeroRules(model.fm)
  // Base = FM DERIVADO (FM salvo ⊕ cascata de regras); o estado volátil da
  // Interativa (Recursos_Restantes/Efeitos_Ativos) é preservado intacto pelo
  // merge, então só a BASE reflete a cascata. Fallback no salvo enquanto resolve.
  const fm = rules?.derivedFm ?? model.fm
  const escudo = (fmPath(fm, 'Inventario', 'Escudo') ?? {}) as Record<string, unknown>
  const nome = linkLabel(str(escudo['Nome']))
  // Erguido = Estado "Escudo Erguido" (Erguer Escudo, Ações Especiais) —
  // Efeitos_Ativos, como no plugin; o modifier BonusEscudo entra na Defesa.
  const efeitos = (fmPath(fm, 'Interativa', 'Efeitos_Ativos') ?? {}) as Record<string, unknown>
  const up = isEfeitoOn(efeitos['Escudo Erguido'])
  const setUp = (fn: (v: boolean) => boolean) => {
    const next = { ...efeitos }
    if (fn(up)) next['Escudo Erguido'] = { on: true }
    else delete next['Escudo Erguido']
    model.setVolatile('Interativa.Efeitos_Ativos', next)
  }
  const [open, setOpen] = useState(false)
  const escudoDoc = refs.refDoc(escudo['Nome'])
  // Integridade máx = danos:: do doc do escudo; dano corrente da Interativa.
  const intMax = num((escudoDoc?.inlineFields as Record<string, unknown>)?.['danos'])
  const dano = num(interativa(fm).restantes['Escudo_Dano'] ?? escudo['Dano'])
  const setDano = (fn: (d: number) => number) =>
    model.setVolatile('Interativa.Recursos_Restantes.Escudo_Dano', fn(dano))
  if (!nome) return null
  const dureza = num(escudo['Dureza'])
  const intCur = Math.max(0, intMax - dano)

  return (
    <div style={{ position: 'relative' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 11,
          padding: '9px 14px 9px 9px',
          background: 'linear-gradient(135deg,var(--panel2),var(--panel))',
          border: '1px solid var(--line2)',
          clipPath: clip(14),
        }}
      >
        <button
          onClick={() => setUp((v) => !v)}
          title={up ? 'Abaixar escudo' : 'Erguer escudo'}
          style={{
            flex: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '0 11px',
            height: 40,
            background: `color-mix(in srgb,var(--accent) ${up ? 20 : 0}%,var(--card))`,
            border: `1px solid color-mix(in srgb,var(--accent) ${18 + (up ? 58 : 0)}%,var(--line2))`,
            cursor: 'pointer',
            borderRadius: 6,
            boxShadow: up ? '0 0 12px color-mix(in srgb,var(--accent) 45%,transparent)' : 'none',
            transition: 'background .15s,box-shadow .15s,border-color .15s',
          }}
        >
          <span style={{ fontSize: 19, lineHeight: 1 }}>{tokens.emojis.equipProf.Escudo}</span>
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 8,
              fontWeight: 700,
              letterSpacing: '.06em',
              lineHeight: 1,
              color: `color-mix(in srgb,var(--accent) ${38 + (up ? 62 : 0)}%,var(--muted))`,
            }}
          >
            {up ? 'ERGUIDO' : 'ERGUER'}
          </span>
        </button>
        <div
          onClick={() => setOpen((v) => !v)}
          title="Ajustar integridade"
          style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 11, cursor: 'pointer' }}
        >
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 9.5,
              letterSpacing: '.12em',
              color: 'var(--muted)',
              flex: 'none',
            }}
          >
            ESCUDO
          </span>
          <span
            style={{
              fontWeight: 700,
              fontSize: 14,
              color: 'var(--text)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {nome}
          </span>
          <span style={{ flex: 1 }} />
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flex: 'none' }} title="Dureza">
            <span style={{ fontSize: 12 }}>{tokens.emojis.inv.Dureza}</span>
            <span
              style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.08em', color: 'var(--muted)' }}
            >
              DUREZA
            </span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
              {dureza}
            </span>
          </span>
          <span style={{ width: 1, height: 16, background: 'var(--line2)', flex: 'none' }} />
          <span
            style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.08em', color: 'var(--muted)', flex: 'none' }}
          >
            INTEGRIDADE
          </span>
          <span style={{ display: 'flex', gap: 5, flex: 'none' }}>
            {Array.from({ length: intMax }, (_, i) => (
              <span
                key={i}
                style={{
                  width: 10,
                  height: 10,
                  transform: 'rotate(45deg)',
                  background: i < intCur ? '#9a8f5a' : 'transparent',
                  border: `1px solid ${i < intCur ? '#c9b56a' : 'var(--line2)'}`,
                }}
              />
            ))}
          </span>
          <span style={{ color: 'var(--muted)', fontSize: 11, flex: 'none' }}>▾</span>
        </div>
      </div>
      {open ? (
        <>
          <Scrim onClick={() => setOpen(false)} />
          <div style={{ ...popStyle, right: 0, width: 'min(340px,92vw)', padding: 15 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontFamily: 'var(--mono)',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '.12em',
                color: 'var(--muted)',
                marginBottom: 13,
              }}
            >
              <span style={{ fontSize: 14 }}>🛡️</span>INTEGRIDADE<span style={{ flex: 1 }} />
              <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                {intCur} / {intMax}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 9 }}>
              <button
                onClick={() => setDano((d) => Math.min(intMax, d + 1))}
                style={{
                  flex: 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  padding: '10px 0',
                  background: 'color-mix(in srgb,var(--red) 16%,var(--panel))',
                  border: '1px solid color-mix(in srgb,var(--red) 45%,var(--line2))',
                  color: 'var(--text)',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: 'pointer',
                  clipPath: clip(8),
                }}
              >
                <span>💢</span> Danificar
              </button>
              <button
                onClick={() => setDano((d) => Math.max(0, d - 1))}
                style={{
                  flex: 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  padding: '10px 0',
                  background: 'color-mix(in srgb,#43a06a 16%,var(--panel))',
                  border: '1px solid color-mix(in srgb,#43a06a 45%,var(--line2))',
                  color: 'var(--text)',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: 'pointer',
                  clipPath: clip(8),
                }}
              >
                <span>🔧</span> Reparar
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}

/* ===================== vida ===================== */

function VidaBar({ doc }: { doc: VaultDoc }) {
  // Porta fiel do vidaModel() do script do design (estado em pop-panels).
  const vida = useVidaLocal(doc)
  const [open, setOpen] = useState(false)

  const { vit, moral, temp, vitMax, moralMax } = vida
  const T = vitMax + moralMax
  const pct = (x: number) => (T > 0 ? (x / T) * 100 : 0)
  const cssP = (x: number) => pct(x).toFixed(3) + '%'
  const negTot = vit < 0 ? Math.min(-vit, vitMax) : 0
  const neg1 = Math.min(negTot, vitMax / 2)
  const neg2 = Math.max(0, negTot - vitMax / 2)
  // hasOver do vidaModel: excedente (moral temporária acima do teto) brilha.
  const over = Math.max(0, Math.max(0, vit) + moral + temp - T)

  return (
    <div style={{ position: 'relative' }}>
      <div
        onClick={() => setOpen((o) => !o)}
        title="Clique para ajustar a vida"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          padding: 18,
          background: 'linear-gradient(135deg,var(--panel2),var(--panel))',
          border: '1px solid var(--line2)',
          clipPath: clip(16),
          cursor: 'pointer',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontSize: 13 }}>❤️</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.12em', color: 'var(--muted)' }}>
              VITALIDADE
            </span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>
              {vit} / {vitMax}
            </span>
          </span>
          <span style={{ width: 1, height: 14, background: 'var(--line2)' }} />
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontSize: 13 }}>💙</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.12em', color: 'var(--muted)' }}>
              MORAL
            </span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>
              {moral} / {moralMax}
            </span>
          </span>
          {temp > 0 ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ fontSize: 13 }}>💚</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 15, fontWeight: 600, color: '#43c07f' }}>
                +{temp}
              </span>
            </span>
          ) : null}
          <span style={{ flex: 1 }} />
          {vit <= 0 ? (
            <span style={{ fontSize: 16 }} title="Caído">
              💀
            </span>
          ) : null}
        </div>
        <div
          style={{
            position: 'relative',
            height: 13,
            background: 'var(--card)',
            border: '1px solid var(--line2)',
            clipPath: 'polygon(0 0,100% 0,100% 100%,4px 100%,0 60%)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              height: '100%',
              width: cssP(Math.max(0, vit)),
              background: 'linear-gradient(90deg,#c0392b,#ff5547)',
              transition: 'width .4s cubic-bezier(.34,1.12,.4,1)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              height: '100%',
              width: cssP(neg1),
              background: 'repeating-linear-gradient(45deg,#d63a2a,#d63a2a 6px,#b93122 6px,#b93122 12px)',
              transition: 'width .4s ease',
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: cssP(vitMax / 2),
              height: '100%',
              width: cssP(neg2),
              background: 'repeating-linear-gradient(45deg,#6e3a24,#6e3a24 6px,#512a1a 6px,#512a1a 12px)',
              transition: 'width .4s ease,left .4s ease',
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: cssP(Math.max(0, vit)),
              height: '100%',
              width: cssP(moral),
              background: 'linear-gradient(90deg,#2f6fd0,#4f9bff)',
              transition: 'width .4s cubic-bezier(.34,1.08,.4,1),left .4s cubic-bezier(.34,1.08,.4,1)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: cssP(Math.max(0, vit) + moral),
              height: '100%',
              width: cssP(temp),
              background: 'linear-gradient(90deg,#33a869,#46cf86)',
              zIndex: 2,
              transition: 'width .4s cubic-bezier(.34,1.08,.4,1),left .4s cubic-bezier(.34,1.08,.4,1)',
            }}
          />
          {over > 0 ? (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: `${(100 - pct(Math.min(over, T))).toFixed(3)}%`,
                height: '100%',
                width: cssP(Math.min(over, T)),
                background: 'linear-gradient(90deg,#4fe39a,#7dffbe)',
                zIndex: 2,
                boxShadow: '0 0 11px rgba(110,245,180,.75)',
                transition: 'width .4s ease,left .4s ease',
              }}
            />
          ) : null}
          <div
            style={{
              position: 'absolute',
              top: -1,
              left: cssP(vitMax),
              height: 'calc(100% + 2px)',
              width: 0,
              borderLeft: '1.5px dashed rgba(255,255,255,.5)',
              zIndex: 3,
              pointerEvents: 'none',
            }}
          />
        </div>
      </div>
      {open ? (
        <>
          <Scrim onClick={() => setOpen(false)} />
          <div style={{ ...popStyle, top: 'calc(100% + 10px)', left: 0, width: 'min(440px,94%)', padding: 16 }}>
            <VidaAdjustRows vida={vida} />
          </div>
        </>
      ) : null}
    </div>
  )
}

/* ===================== defesas / condições / recuperação ===================== */

interface CondChip {
  nome: string
  grupo: string
  ic: string
  cor: string
}

/** Nome da linha do FM → key numérica do ConditionContext. */
const RES_KEY: Record<string, ConditionNumberKey> = {
  defesa: 'defesa',
  vigor: 'vigor',
  impeto: 'impeto',
  reflexo: 'reflexo',
  percepcao: 'percepcao',
  intuicao: 'intuicao',
}

function DefesasRow({ doc, inter }: { doc: VaultDoc; inter: InterativaCtxState }) {
  const model = useHeroModel(doc, 'combate')
  const rules = useHeroRules(model.fm)
  // Base derivada (atributos/defesas já cascateados); os deltas dos Efeitos
  // Interativos entram POR CIMA via applyTarget(inter.ctx,…). Volátil intacto.
  const fm = rules?.derivedFm ?? model.fm
  const { values: attrs } = heroAtributos(fm)
  const defesas = (fmPath(fm, 'Defesas_Resistencias', 'Lista') ?? []) as ProfRow[]
  const sentidos = (fmPath(fm, 'Sentidos', 'Lista') ?? []) as ProfRow[]
  const interState = interativa(fm)
  const [pop, setPop] = useState<null | 'cond' | 'recup'>(null)

  // Delta da Interativa por key numérica (defesas/sentidos) — mesmas
  // entries/cor do plugin (applyConditionToBreakdown + valueClass).
  const deltaFor = (nome: string): AppliedDelta => {
    const key = RES_KEY[slugify(str(nome)).toLowerCase()]
    if (!key) return { entries: [], delta: 0, hasPenalty: false }
    return applyTarget(inter.ctx, { kind: 'number', key })
  }

  // Lista de Condições COMPLETA como no plugin (tab-recursos): condições do
  // sistema (Sistema/Regras/Condições, grupo do FM) ∪ efeitos tipo Condição
  // visíveis pro herói (Inspiração, Encantar Arma, …) ∪ chaves já salvas.
  const condicoesExtraidas = interativa(fmOf(doc)).condicoes
  const chips: CondChip[] = useMemo(() => {
    const defs = condChipDefs(inter.condicaoDocs, inter.descriptors, tokens.emojis.bonusType.Condicao)
    const byNome = new Map(defs.map((d) => [d.nome, d]))
    for (const nome of [...Object.keys(condicoesExtraidas), ...Object.keys(interState.condicoes)]) {
      if (!byNome.has(nome)) byNome.set(nome, { nome, grupo: 'Positiva', ic: tokens.emojis.bonusType.Condicao })
    }
    return [...byNome.values()].map((d) => {
      const grupoDef = COND_GRUPOS.find((g) => g.id === d.grupo) ?? COND_GRUPOS[0]
      return { nome: d.nome, grupo: d.grupo, ic: d.ic, cor: grupoDef.cor }
    })
  }, [inter, condicoesExtraidas, interState.condicoes])
  const condOn: Record<string, boolean> = Object.fromEntries(
    chips.map((c) => [c.nome, isCondicaoOn(interState.condicoes[c.nome])]),
  )
  // Descritor por label (primeiro vence — plugin buildInteractiveDescriptorIndex)
  // pros controles de seletor numérico e defaults de ativação.
  const descByLabel = useMemo(() => {
    const map = new Map<string, EffectDescriptor>()
    for (const d of inter.descriptors) {
      if (d.sharedFrom) continue
      if (!map.has(d.label)) map.set(d.label, d)
    }
    return map
  }, [inter])
  const seletores = (fmPath(fm, 'Interativa', 'Seletores') ?? {}) as Record<string, unknown>
  const magiasPotencia = num(fmPath(fm, 'Magias', 'Potencia'))
  const armaNames = ((fmPath(fm, 'Inventario', 'Armas', 'Lista') ?? []) as Record<string, unknown>[])
    .map((a) => str(a['Nome']))
    .filter(Boolean)
  // Toggle persiste o CONTAINER (write-through do plugin grava o snapshot
  // inteiro de `interativa.<container>`): off remove a key; on restaura o
  // valor extraído da condição (senão o default do plugin — defaultStateFor,
  // condicoes-catalog.ts:104-141: {value:1} + numericSelector default +
  // weaponSelector = 1ª arma + seed dos selectores discretos em Seletores).
  // Cadeia de ativação (AtivaEstado — Inspiração liga Performance Bárdica
  // Ativa) propagada como no plugin (propagateAutoStates).
  const toggleCond = (nome: string) => {
    const next = { ...interState.condicoes }
    const removendo = nome in next
    if (removendo) delete next[nome]
    else {
      const desc = descByLabel.get(nome)
      next[nome] = condicoesExtraidas[nome] ?? defaultCondState(desc, magiasPotencia, armaNames)
      const seeded = seedSelectores(desc, nome, seletores)
      if (seeded !== seletores) model.setVolatile('Interativa.Seletores', seeded)
    }
    model.setVolatile('Interativa.Condicoes_Ativas', next)
    const efeitos = (fmPath(fm, 'Interativa', 'Efeitos_Ativos') ?? {}) as Record<string, unknown>
    // Pro cleanup de estados auto (plugin: condição desativada permanece no
    // mapa com value 0), a condição recém-removida ainda conta como LOCAL.
    const paraPropagacao = removendo ? { ...next, [nome]: { value: 0 } } : next
    const nextEfeitos = propagateAutoStates(paraPropagacao, efeitos, inter.descriptors)
    if (nextEfeitos !== efeitos) model.setVolatile('Interativa.Efeitos_Ativos', nextEfeitos)
  }
  // ── #29: potência/steppers do chip ativo ──
  // Storage DUPLO do plugin (condicoes-selectors.ts:75-82 writeBoth):
  // Condicoes_Ativas[nome].numericSelector (chip + fallback do
  // DadoExtraPorSeletor) E Seletores["nome::label"] (guard Seletor dos
  // modifiers porSeletor expandidos).
  const writeNumericSelector = (nome: string, desc: EffectDescriptor, nextVal: number) => {
    const state = interState.condicoes[nome]
    const base = state && typeof state === 'object' ? (state as Record<string, unknown>) : { value: 1 }
    model.setVolatile('Interativa.Condicoes_Ativas', {
      ...interState.condicoes,
      [nome]: { ...base, numericSelector: nextVal },
    })
    model.setVolatile('Interativa.Seletores', {
      ...seletores,
      [`${nome}::${desc.numericSelector!.label}`]: nextVal,
    })
  }
  // Contagem de condição acumulável/escalável (plugin condicoes-ativas.ts:
  // 141-166; next<=0 remove a entry).
  const writeCondValue = (nome: string, nextVal: number) => {
    if (nextVal <= 0) {
      const next = { ...interState.condicoes }
      delete next[nome]
      model.setVolatile('Interativa.Condicoes_Ativas', next)
      return
    }
    const state = interState.condicoes[nome]
    const base = state && typeof state === 'object' ? (state as Record<string, unknown>) : {}
    model.setVolatile('Interativa.Condicoes_Ativas', {
      ...interState.condicoes,
      [nome]: { ...base, value: nextVal },
    })
  }
  const nAtivas = chips.filter((c) => condOn[c.nome]).length
  const condLabel = nAtivas ? `${nAtivas}${nAtivas > 1 ? ' Ativas' : ' Ativa'}` : 'Nenhuma'

  // RECUPERAÇÃO: chips espelham Interativa.Imunidades (imune → chip desligado).
  const feridTrat = !interState.imunidades['Medicina']
  const encoraj = !interState.imunidades['Encorajar']
  const recupChips = [
    {
      n: 'Ferimentos Tratáveis',
      ic: '➕',
      on: feridTrat,
      toggle: () => model.setVolatile('Interativa.Imunidades.Medicina', feridTrat),
    },
    {
      n: 'Encorajável',
      ic: '💙',
      on: encoraj,
      toggle: () => model.setVolatile('Interativa.Imunidades.Encorajar', encoraj),
    },
  ]

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 12 }}>
        {defesas.map((d) => {
          const applied = deltaFor(str(d.Nome))
          return (
            <div
              key={d.Nome}
              title={applied.entries.length ? entriesTitle(applied.entries) : undefined}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '14px 16px',
                background: 'var(--panel)',
                border: '1px solid var(--line)',
                clipPath: clip(12),
              }}
            >
              <span style={{ fontSize: 20, flex: 'none' }}>{defesaEmoji(str(d.Nome))}</span>
              <div style={{ lineHeight: 1.1, textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '.12em', color: 'var(--muted)' }}>
                  {displayName(slugify(str(d.Nome))).toUpperCase()}
                </div>
                <TipHover
                  html={renderBreakdownHtml(resistenciaBreakdown(d, attrs))}
                  style={{ justifyContent: 'center' }}
                >
                  <div
                    style={{
                      fontSize: 22,
                      fontWeight: 700,
                      color: toneColor(valueTone(applied.entries)) ?? 'var(--text)',
                    }}
                  >
                    {10 + rowMod(d, attrs) + applied.delta}
                  </div>
                </TipHover>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <GoldDots on={num(d.Bonus_Item)} compact />
                {num(d.Bonus_Especial) > 0 ? <StarChip n={num(d.Bonus_Especial)} compact /> : null}
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 12, marginTop: 12 }}>
        <button
          onClick={() => setPop((p) => (p === 'cond' ? null : 'cond'))}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 14px',
            background: `color-mix(in srgb,var(--accent) ${8 + (pop === 'cond' ? 12 : 0)}%,var(--panel))`,
            border: `1px solid color-mix(in srgb,var(--accent) ${30 + (pop === 'cond' ? 50 : 0)}%,var(--line2))`,
            color: 'var(--text)',
            cursor: 'pointer',
            textAlign: 'left',
            clipPath: clip(10),
          }}
        >
          <span style={{ fontSize: 16, flex: 'none' }}>⚠️</span>
          <div style={{ lineHeight: 1.1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.1em', color: 'var(--muted)' }}>
              CONDIÇÕES
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{condLabel}</div>
          </div>
        </button>
        {sentidos.map((s) => {
          const applied = deltaFor(str(s.Nome))
          return (
            <div
              key={s.Nome}
              title={applied.entries.length ? entriesTitle(applied.entries) : undefined}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: '10px 14px',
                background: 'var(--panel)',
                border: '1px solid var(--line)',
                clipPath: clip(10),
              }}
            >
              <span style={{ fontSize: 16, flex: 'none' }}>{defesaEmoji(str(s.Nome))}</span>
              <div style={{ lineHeight: 1.1, textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.1em', color: 'var(--muted)' }}>
                  {displayName(slugify(str(s.Nome))).toUpperCase()}
                </div>
                <TipHover
                  html={renderBreakdownHtml(sentidoBreakdown(s, attrs))}
                  style={{ justifyContent: 'center' }}
                >
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: toneColor(valueTone(applied.entries)) ?? 'var(--text)',
                    }}
                  >
                    {signed(rowMod(s, attrs) + applied.delta)}
                  </div>
                </TipHover>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <GoldDots on={num(s.Bonus_Item)} compact />
                {num(s.Bonus_Especial) > 0 ? <StarChip n={num(s.Bonus_Especial)} compact /> : null}
              </div>
            </div>
          )
        })}
        <button
          onClick={() => setPop((p) => (p === 'recup' ? null : 'recup'))}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 14px',
            background: `color-mix(in srgb,#43a06a ${8 + (pop === 'recup' ? 14 : 0)}%,var(--panel))`,
            border: `1px solid color-mix(in srgb,#43a06a ${30 + (pop === 'recup' ? 50 : 0)}%,var(--line2))`,
            color: 'var(--text)',
            cursor: 'pointer',
            textAlign: 'left',
            clipPath: clip(10),
          }}
        >
          <span style={{ fontSize: 16, flex: 'none' }}>💤</span>
          <div style={{ lineHeight: 1.1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.1em', color: 'var(--muted)' }}>
              RECUPERAÇÃO
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Descanso</div>
          </div>
        </button>
      </div>

      {pop === 'cond' ? (
        <>
          <Scrim onClick={() => setPop(null)} />
          <div
            style={{
              ...popStyle,
              left: 0,
              right: 'auto',
              width: 'calc(50% - 6px)',
              padding: '16px 18px',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            {COND_GRUPOS.map((g) => {
              const doGrupo = chips.filter((c) => c.grupo === g.id)
              if (!doGrupo.length) return null
              return (
                <div key={g.id}>
                  <div
                    style={{
                      fontFamily: 'var(--mono)',
                      fontSize: 9.5,
                      letterSpacing: '.14em',
                      color: g.cor,
                      marginBottom: 9,
                    }}
                  >
                    {g.titulo}
                  </div>
                  <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
                    {doGrupo.map((c) => {
                      const on = condOn[c.nome] ? 1 : 0
                      const desc = descByLabel.get(c.nome)
                      const sel = desc?.numericSelector
                      // Escalável (Escalavel N nas Elementos_de_Regra) ou
                      // acumulável do catálogo do plugin (Lento/Acelerado).
                      const scaleMax = inter.catalog.get(c.nome)?.scaleMax ?? 1
                      const acumulavel = !sel && (scaleMax > 1 || COND_ACUMULAVEIS.has(c.nome))
                      const state = interState.condicoes[c.nome]
                      const savedNs =
                        state && typeof state === 'object'
                          ? (state as { numericSelector?: number }).numericSelector
                          : undefined
                      const cur = savedNs ?? (desc ? defaultNumericSelector(desc, magiasPotencia) ?? 0 : 0)
                      const value = Math.max(1, toMultiplier(state))
                      const hasControls = on === 1 && (Boolean(sel) || acumulavel)
                      const miniBtn = (enabled: boolean): CSSProperties => ({
                        width: 22,
                        height: 22,
                        flex: 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'var(--card)',
                        border: `1px solid color-mix(in srgb,${c.cor} 45%,var(--line2))`,
                        color: enabled ? c.cor : 'var(--muted)',
                        fontFamily: 'var(--mono)',
                        fontWeight: 700,
                        fontSize: 13,
                        cursor: enabled ? 'pointer' : 'default',
                        opacity: enabled ? 1 : 0.45,
                      })
                      return (
                        <span
                          key={c.nome}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '6px 6px 6px 13px',
                            background: `color-mix(in srgb,${c.cor} ${10 + on * 14}%,var(--panel))`,
                            border: `1px solid color-mix(in srgb,${c.cor} ${35 + on * 45}%,var(--line2))`,
                            clipPath: 'polygon(0 0,100% 0,100% 100%,8px 100%,0 calc(100% - 8px))',
                          }}
                        >
                          <span style={{ fontSize: 13 }}>{c.ic}</span>
                          <span
                            style={{
                              fontWeight: 600,
                              fontSize: 13,
                              color: on ? c.cor : 'var(--text)',
                            }}
                          >
                            {c.nome}
                          </span>
                          {on === 1 && sel && desc ? (
                            // Counter `− 🌟 N +` do plugin (condicoes-selectors
                            // .ts:20-93): 🌟 só no label Potência Mágica;
                            // clamp por step; disabled nos extremos.
                            <span
                              title={sel.label}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
                            >
                              <button
                                title={`Diminuir ${sel.label}`}
                                disabled={cur <= sel.min}
                                onClick={() =>
                                  writeNumericSelector(c.nome, desc, Math.max(sel.min, cur - sel.step))
                                }
                                style={miniBtn(cur > sel.min)}
                              >
                                {tokens.emojis.ui.Decrement}
                              </button>
                              <span
                                style={{
                                  fontFamily: 'var(--mono)',
                                  fontSize: 12,
                                  fontWeight: 700,
                                  color: 'var(--text)',
                                }}
                              >
                                {isPotenciaLabel(sel.label)
                                  ? `${tokens.emojis.subcategoria.PotenciaMagica} ${cur}`
                                  : String(cur)}
                              </span>
                              <button
                                title={`Aumentar ${sel.label}`}
                                disabled={cur >= sel.max}
                                onClick={() =>
                                  writeNumericSelector(c.nome, desc, Math.min(sel.max, cur + sel.step))
                                }
                                style={miniBtn(cur < sel.max)}
                              >
                                {tokens.emojis.ui.Increment}
                              </button>
                            </span>
                          ) : null}
                          {on === 1 && acumulavel ? (
                            // Contagem `[N] − +` do plugin (condicoes-ativas
                            // .ts:131-166): qty visível quando >1; escaláveis
                            // clampam no scaleMax da nota (engine idem).
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                              {value > 1 ? (
                                <span
                                  style={{
                                    fontFamily: 'var(--mono)',
                                    fontSize: 12,
                                    fontWeight: 700,
                                    color: 'var(--text)',
                                  }}
                                >
                                  {value}
                                </span>
                              ) : null}
                              <button
                                title={`Diminuir ${c.nome}`}
                                disabled={value <= 1}
                                onClick={() => writeCondValue(c.nome, value - 1)}
                                style={miniBtn(value > 1)}
                              >
                                {tokens.emojis.ui.Decrement}
                              </button>
                              <button
                                title={`Aumentar ${c.nome}`}
                                disabled={scaleMax > 1 && value >= scaleMax}
                                onClick={() => writeCondValue(c.nome, value + 1)}
                                style={miniBtn(!(scaleMax > 1 && value >= scaleMax))}
                              >
                                {tokens.emojis.ui.Increment}
                              </button>
                            </span>
                          ) : null}
                          <button
                            onClick={() => toggleCond(c.nome)}
                            title={hasControls ? `Remover ${c.nome}` : undefined}
                            style={{
                              width: 24,
                              height: 24,
                              flex: 'none',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              background: `color-mix(in srgb,${c.cor} ${20 + on * 60}%,var(--card))`,
                              border: `1px solid color-mix(in srgb,${c.cor} 45%,var(--line2))`,
                              color: on ? '#fff' : c.cor,
                              fontFamily: 'var(--mono)',
                              fontWeight: 700,
                              fontSize: 14,
                              cursor: 'pointer',
                            }}
                          >
                            {on ? (hasControls ? '×' : '−') : '+'}
                          </button>
                        </span>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      ) : null}

      {pop === 'recup' ? (
        <>
          <Scrim onClick={() => setPop(null)} />
          <div
            style={{
              ...popStyle,
              left: 'auto',
              right: 0,
              width: 'calc(50% - 6px)',
              padding: '16px 18px',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {recupChips.map((c) => (
                <span
                  key={c.n}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 9,
                    padding: '7px 7px 7px 14px',
                    background: `color-mix(in srgb,#43a06a ${c.on ? 16 : 0}%,var(--panel))`,
                    border: `1px solid color-mix(in srgb,#43a06a ${30 + (c.on ? 45 : 0)}%,var(--line2))`,
                    clipPath: 'polygon(0 0,100% 0,100% 100%,8px 100%,0 calc(100% - 8px))',
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{c.n}</span>
                  <button
                    onClick={c.toggle}
                    style={{
                      width: 26,
                      height: 26,
                      flex: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'var(--card)',
                      border: '1px solid var(--line2)',
                      fontSize: 14,
                      cursor: 'pointer',
                    }}
                  >
                    {c.ic}
                  </button>
                </span>
              ))}
            </div>
            <div>
              <div
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 9.5,
                  letterSpacing: '.14em',
                  color: 'var(--muted)',
                  marginBottom: 9,
                }}
              >
                DESCANSO
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {[
                  { ic: '⌛', l: 'Descansar' },
                  { ic: '💤', l: 'Dormir' },
                ].map((b) => (
                  <button
                    key={b.l}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 9,
                      padding: '9px 16px',
                      background: 'var(--panel2)',
                      border: '1px solid var(--line2)',
                      color: 'var(--text)',
                      fontWeight: 600,
                      fontSize: 13,
                      cursor: 'pointer',
                      clipPath: clip(8),
                    }}
                  >
                    <span style={{ fontSize: 15 }}>{b.ic}</span> {b.l}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}

/* ===================== sub-aba ATAQUES ===================== */

/** Figura da arma no ATAQUE (issue #77): a IMAGEM DA ARMA (weaponImageUrl) com
 *  a imagem da imbuição/propriedade PEQUENA no canto inferior direito — mesmo
 *  padrão do selo de obra-prima da armadura (#65: overlay absoluto). Sem imagem
 *  da arma → o emoji do grupo, como o design (Companion App.dc.html:429). */
function AtaqueArmaFigura({
  img,
  propImg,
  emoji,
}: {
  img: string | null
  propImg: string | null
  emoji: string
}) {
  if (!img) return <span style={{ fontSize: 19, flex: 'none' }}>{emoji}</span>
  return (
    <span
      style={{
        position: 'relative',
        flex: 'none',
        width: 42,
        height: 42,
        background: 'var(--card)',
        border: '1px solid var(--line2)',
        clipPath: clip(8),
        backgroundImage: `url("${img}")`,
        backgroundSize: 'contain',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center',
      }}
    >
      {propImg ? (
        <span
          aria-label="Propriedade"
          style={{
            position: 'absolute',
            right: -4,
            bottom: -4,
            width: 20,
            height: 20,
            backgroundImage: `url("${propImg}")`,
            backgroundSize: 'contain',
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'center',
            pointerEvents: 'none',
          }}
        />
      ) : null}
    </span>
  )
}

function AtaquesPanel({ doc, refs, inter }: { doc: VaultDoc; refs: HeroRefs; inter: InterativaCtxState }) {
  const model = useHeroModel(doc, 'combate')
  const assets = useAssetIndex()
  const rules = useHeroRules(model.fm)
  // Base derivada (atributos/proficiência de ataque cascateados); Efeitos
  // Interativos (Vantagem de Combate, Apunhalante…) somam por cima via inter.ctx.
  const fm = rules?.derivedFm ?? model.fm
  const { values: attrs } = heroAtributos(fm)
  const profAtaque = str(fmPath(fm, 'Ataques', 'Proficiencia'))
  const armas = (fmPath(fm, 'Inventario', 'Armas', 'Lista') ?? []) as Record<string, unknown>[]
  const interState = interativa(fm)
  const efeitos = (fmPath(fm, 'Interativa', 'Efeitos_Ativos') ?? {}) as Record<string, unknown>
  // Chips do design = toggles REAIS da engine (ancoragem AtaquesEAcoes do
  // plugin): Vantagem de Combate → Condicoes_Ativas (catálogo "Somar
  // Condicao.Ataque 2" + Apunhalante via guard); Acerto Decisivo →
  // Efeitos_Ativos (builtin DadoDecisivo/DadoOportunidade).
  const chipOn = (n: string) =>
    isCondicaoOn(interState.condicoes[n]) || isEfeitoOn(efeitos[n])
  const toggleChip = (nome: string) => {
    // Condições do catálogo (VC) → Condicoes_Ativas, como o chip da Lista
    // de Condições do plugin (Estados aceitam esse mapa via fallback);
    // efeitos builtin/Estado fora do catálogo (Acerto Decisivo) →
    // Efeitos_Ativos.
    if (inter.catalog.has(nome)) {
      const next = { ...interState.condicoes }
      if (nome in next) delete next[nome]
      else next[nome] = { value: 1 }
      model.setVolatile('Interativa.Condicoes_Ativas', next)
      return
    }
    const next = { ...efeitos }
    if (isEfeitoOn(next[nome])) delete next[nome]
    else next[nome] = { on: true }
    model.setVolatile('Interativa.Efeitos_Ativos', next)
  }
  const setUso = (key: string, next: number) =>
    model.setVolatile('Interativa.Usos_Recursos', { ...interState.usos, [key]: next })

  // Manobras: linha padrão de Ataques.Lista (mod usa a proficiência de ataque)
  // + delta da Interativa (key `manobra` — inclui ManobrasPorItemDaArma).
  const manobraRow = ((fmPath(fm, 'Ataques', 'Lista') ?? []) as ProfRow[]).find(
    (r) => str(r.Nome) === 'Manobras',
  )
  const manobraBase = manobraRow
    ? rowMod({ ...manobraRow, Proficiencia: profAtaque }, attrs)
    : null
  const manobraApplied = applyTarget(inter.ctx, { kind: 'number', key: 'manobra' })
  const manobraMod = manobraBase !== null ? manobraBase + manobraApplied.delta : null

  const rowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 15,
    padding: '13px 16px',
    background: 'var(--panel)',
    border: '1px solid var(--line)',
    clipPath: clip(13),
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 2 }}>
        {COMB_CHIPS.map((c) => {
          const on = chipOn(c.n) ? 1 : 0
          return (
            <button
              key={c.id}
              onClick={() => toggleChip(c.n)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 9,
                padding: '8px 15px',
                background: `color-mix(in srgb,${c.cor} ${8 + on * 16}%,var(--panel))`,
                border: `1px solid color-mix(in srgb,${c.cor} ${32 + on * 48}%,var(--line2))`,
                color: on ? c.cor : 'var(--text)',
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
                clipPath: 'polygon(0 0,100% 0,100% 100%,8px 100%,0 calc(100% - 8px))',
              }}
            >
              <span style={{ fontSize: 15 }}>{c.ic}</span>
              {c.n}
            </button>
          )
        })}
      </div>

      {armas.map((arma, i) => {
        const nome = linkLabel(str(arma['Nome']))
        const prop = linkLabel(str(arma['Propriedade']))
        const basename = wikiTarget(str(arma['Nome'])).split('/').pop() ?? nome
        const armaDoc = refs.refDoc(arma['Nome'])
        const inline = (armaDoc?.inlineFields ?? {}) as Record<string, unknown>
        const danoRaw = unquote(str(inline['dano']))
        // dano exibido = calcDanoArma do plugin (dados base + prof) COM o
        // contexto de dano aplicado (applyDanoCtx: fixo/por-dado/passo de
        // dado/dados extras — Encantar Arma, Apunhalante, Ato Inspirador…).
        const calc = parseDanoArma(danoRaw)
        const danoRes = calc.die
          ? applyDanoCtx(
              { baseDice: calc.dice, profDice: PROF_DICE[profAtaque] ?? 0, dieSize: calc.die, offset: calc.offset },
              inter.ctx,
              basename,
            )
          : null
        const dano = danoRes ? danoRes.display : danoArmaDisplay(danoRaw, profAtaque)
        const props = wikiLabels(inline['propriedades'])
        const tipo = props.length ? props.join(' · ') : str(inline['tipo'])
        // AdO (a.ado do design): arma corpo-a-corpo/especial + prof>=A —
        // computeDanoAdO do plugin (Mestre +1 dado; canais ado/adoFixo;
        // técnicas não acumulam entre si).
        const grupoArma = str(fmOf(armaDoc)['grupo']).toLowerCase().trim()
        const adoRes =
          danoRes && ADO_GRUPOS.includes(grupoArma) && ['A', 'E', 'M'].includes(profAtaque)
            ? computeDanoAdO({ ...danoRes.adoInput, prof: profAtaque as 'A' | 'E' | 'M' })
            : null
        const tipoIco = tipoDanoEmoji(unquote(str(inline['tipo'])))
        const modBase = rowMod(
          {
            Atributo: str(arma['Atributo']),
            Proficiencia: profAtaque,
            Bonus_Item: num(arma['Bonus_Item']),
            Bonus_Especial: num(arma['Bonus_Especial']),
          },
          attrs,
        )
        const modApplied = applyTarget(inter.ctx, {
          kind: 'attack',
          attr: str(arma['Atributo']) as AtributoId,
          sourceId: basename,
        })
        const mod = modBase + modApplied.delta
        const tier = tierLetter(arma['Categoria'])
        const propDoc = refs.refDoc(arma['Propriedade'])
        const usosMaxN = tier ? usosPorTier(propDoc, tier) : null
        const usoKey = `arma:${nome}|prop:${prop}`
        const usoCur = interState.usos[usoKey] !== undefined ? num(interState.usos[usoKey]) : (usosMaxN ?? 0)

        // Figura da arma + imbuição no canto (issue #77): imagem da carta da
        // arma (weaponImageUrl) com a propriedade (imbuição OU obra-prima)
        // sobreposta no canto; sem imagem → o emoji do grupo (fallback).
        const armaImg = weaponImageUrl(armaDoc, assets)
        const propImg = propriedadeImageUrl(
          (wikiTarget(str(arma['Propriedade'])).split('/').pop() ?? '').trim(),
          tier ?? '',
          assets,
        )
        return (
          <div key={`${nome}-${i}`} style={rowStyle}>
            <ItemHover doc={armaDoc} propDoc={propDoc} tier={tier || 'A'}>
              <AtaqueArmaFigura
                img={armaImg}
                propImg={propImg}
                emoji={grupoArmaEmoji(fmOf(armaDoc)['grupo'])}
              />
            </ItemHover>
            <span style={{ fontWeight: 600, fontSize: 15, minWidth: 160 }}>
              {`${nome}${prop ? ` ${prop}` : ''}${tier ? ` (${tier})` : ''}`}
            </span>
            {dano ? (
              <TipHover
                html={
                  renderBreakdownHtml(
                    danoArmaBreakdown(nome, danoRaw, profLetter({ Proficiencia: profAtaque })),
                  ) +
                  // + bônus/condições APLICADOS ao dano (o que estava só no title
                  // nativo, agora tap-able no celular).
                  (danoRes?.entries.length
                    ? renderBreakdownHtml(
                        entriesBreakdown(
                          `${nome} — Modificadores de dano`,
                          danoRes.entries.map((e) => ({ label: stripSharedFrom(e.label), value: e.value })),
                        ),
                      )
                    : '')
                }
              >
                <span
                  title={danoRes?.entries.length ? entriesTitle(danoRes.entries) : undefined}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '5px 12px',
                    background: 'var(--card)',
                    border: '1px solid var(--line2)',
                    clipPath: 'polygon(0 0,100% 0,100% 100%,6px 100%,0 calc(100% - 6px))',
                    fontFamily: 'var(--mono)',
                    fontSize: 13,
                    color: danoRes?.hasDelta
                      ? toneColor(danoRes.hasPenalty ? 'penalty' : 'bonus')
                      : 'var(--accent)',
                  }}
                >
                  ⚔️ {dano}
                </span>
              </TipHover>
            ) : null}
            {adoRes !== null ? (
              <TipHover
                html={renderBreakdownHtml(
                  // AdO: o display já reflete os canais/condições (computeDanoAdO);
                  // o tooltip nomeia o valor. Sem entries expostas pra listar.
                  entriesBreakdown('Ataque de Oportunidade', [], { base: adoRes.display }),
                )}
              >
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '5px 11px',
                    background: 'var(--card)',
                    border: '1px solid var(--line2)',
                    clipPath: 'polygon(0 0,100% 0,100% 100%,6px 100%,0 calc(100% - 6px))',
                    fontFamily: 'var(--mono)',
                    fontSize: 12,
                    color: adoRes.hasDelta
                      ? toneColor(adoRes.hasPenalty ? 'penalty' : 'bonus')
                      : 'var(--muted)',
                  }}
                >
                  {tipoIco ? `${tipoIco} ` : ''}AdO {adoRes.display}
                </span>
              </TipHover>
            ) : null}
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.06em', color: 'var(--muted)' }}>
              {tipo}
            </span>
            <span style={{ flex: 1 }} />
            <TipHover
              html={renderBreakdownHtml(
                ataqueBreakdown(
                  nome,
                  str(arma['Atributo']),
                  profLetter({ Proficiencia: profAtaque }),
                  num(arma['Bonus_Item']),
                  num(arma['Bonus_Especial']),
                  attrs[str(arma['Atributo'])] ?? 0,
                ),
              )}
            >
              <span
                title={modApplied.entries.length ? entriesTitle(modApplied.entries) : undefined}
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 11,
                  color: toneColor(valueTone(modApplied.entries)) ?? 'var(--muted)',
                }}
              >
                {signed(mod)}
              </span>
            </TipHover>
            {usosMaxN ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <span
                  style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.08em', color: 'var(--muted)' }}
                >
                  USOS
                </span>
                <UsoDots cur={usoCur} max={usosMaxN} onToggle={(next) => setUso(usoKey, next)} />
              </span>
            ) : null}
          </div>
        )
      })}

      {manobraMod !== null ? (
        <div style={{ ...rowStyle, gap: 12 }}>
          <span style={{ fontSize: 19, flex: 'none' }}>{tokens.emojis.combate.Ataque}</span>
          <span style={{ fontWeight: 600, fontSize: 15, minWidth: 160 }}>
            Manobras{' '}
            <span
              title={manobraApplied.entries.length ? entriesTitle(manobraApplied.entries) : undefined}
              style={{
                color: toneColor(valueTone(manobraApplied.entries)) ?? 'var(--accent)',
                fontFamily: 'var(--mono)',
              }}
            >
              {signed(manobraMod)}
            </span>
          </span>
          <span style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            {MANOBRAS.map((m) => (
              <span
                key={m}
                style={{
                  padding: '5px 11px',
                  background: 'var(--card)',
                  border: '1px solid var(--line2)',
                  fontSize: 12.5,
                  color: 'var(--text)',
                  clipPath: 'polygon(0 0,100% 0,100% 100%,5px 100%,0 calc(100% - 5px))',
                }}
              >
                {m}
              </span>
            ))}
          </span>
        </div>
      ) : null}
    </div>
  )
}

/* ===================== sub-aba PERÍCIAS ===================== */

const ACOES_PERICIA_FOLDER = 'Sistema/Regras/Ações/Ações de Perícia/'

/** AÇÕES por perícia (p.acts do design) — catálogo real da vault: docs de
 *  Ação de Perícia apontam a(s) perícia(s) no inline `perícia::`. */
function useAcoesPorPericia(): Map<string, string[]> {
  const catalog = useCatalog()
  const ids = useMemo(
    () =>
      catalog.content
        .filter((e) => e.id.startsWith(ACOES_PERICIA_FOLDER) && e.basename !== 'Ações de Perícia')
        .map((e) => e.id),
    [catalog],
  )
  const docs = useDocs(ids)
  return useMemo(() => {
    const map = new Map<string, string[]>()
    if (docs) {
      for (const acaoDoc of docs.values()) {
        const alvo = (acaoDoc.inlineFields as Record<string, unknown>)['perícia']
        for (const label of wikiLabels(alvo)) {
          const key = slugify(label)
          const list = map.get(key) ?? []
          list.push(acaoDoc.basename ?? acaoDoc.id)
          map.set(key, list)
        }
      }
      for (const list of map.values()) list.sort((a, b) => a.localeCompare(b, 'pt'))
    }
    return map
  }, [docs])
}

function PericiasPanel({ doc, inter }: { doc: VaultDoc; inter: InterativaCtxState }) {
  const model = useHeroModel(doc, 'combate')
  const rules = useHeroRules(model.fm)
  // Base derivada (atributos/perícias cascateados) + delta da Interativa por cima.
  const fm = rules?.derivedFm ?? model.fm
  const { values: attrs } = heroAtributos(fm)
  const actsByPericia = useAcoesPorPericia()
  // mod = projeção do FM + delta da Interativa (Pericias/PericiasDeAtributo/
  // Pericia(X) — untyped + typed vencedoras, como o painel de atributo do
  // plugin).
  const pericias = ((fmPath(fm, 'Pericias', 'Lista') ?? []) as ProfRow[])
    .map((p) => {
      const applied = applyTarget(inter.ctx, {
        kind: 'skill',
        pericia: slugify(str(p.Nome)),
        attr: str(p.Atributo) as AtributoId,
      })
      return { row: p, mod: rowMod(p, attrs) + applied.delta, applied }
    })
    .sort((a, b) => b.mod - a.mod)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {pericias.map(({ row, mod, applied }) => {
        const acts = actsByPericia.get(slugify(str(row.Nome))) ?? []
        return (
          <div
            key={row.Nome}
            style={{
              padding: '8px 12px',
              background: 'var(--panel)',
              border: '1px solid var(--line)',
              clipPath: clip(12),
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '3px 8px',
                  background: 'var(--card)',
                  border: '1px solid var(--line2)',
                  fontFamily: 'var(--mono)',
                  fontSize: 10,
                  fontWeight: 700,
                  color: 'var(--muted)',
                  flex: 'none',
                }}
              >
                <span>{ATTR_EMOJI[str(row.Atributo)] ?? ''}</span>
                <span>{str(row.Atributo)}</span>
              </span>
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontWeight: 600,
                  fontSize: 14,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {displayName(slugify(str(row.Nome)))}
              </span>
              <span title={applied.entries.length ? entriesTitle(applied.entries) : undefined}>
                <TipHover html={renderBreakdownHtml(periciaBreakdown(row, attrs))}>
                  <ModBox
                    modStr={signed(mod)}
                    rank={profLetter(row)}
                    star={num(row.Bonus_Especial) > 0}
                    dots={num(row.Bonus_Item)}
                    width={40}
                    modColor={toneColor(valueTone(applied.entries))}
                  />
                </TipHover>
              </span>
            </div>
            {acts.length ? (
              <div
                style={{
                  display: 'flex',
                  gap: 6,
                  flexWrap: 'wrap',
                  marginTop: 7,
                  paddingTop: 7,
                  borderTop: '1px solid var(--line)',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 8.5,
                    letterSpacing: '.1em',
                    color: 'var(--muted)',
                    alignSelf: 'center',
                    marginRight: 2,
                  }}
                >
                  AÇÕES
                </span>
                {acts.map((ac) => (
                  <span
                    key={ac}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      padding: '4px 10px',
                      background: 'var(--card)',
                      border: '1px solid var(--line2)',
                      fontSize: 11.5,
                      color: 'var(--text)',
                      clipPath: 'polygon(0 0,100% 0,100% 100%,5px 100%,0 calc(100% - 5px))',
                    }}
                  >
                    <span style={{ fontSize: 8, color: 'var(--accent)' }}>◆</span>
                    {ac}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

/* ===================== sub-aba TESOUROS ===================== */

function TesourosPanel({ doc, refs }: { doc: VaultDoc; refs: HeroRefs }) {
  const model = useHeroModel(doc, 'combate')
  const rules = useHeroRules(model.fm)
  const assets = useAssetIndex()
  // Base derivada; o volátil (Usos_Recursos) é preservado pelo merge.
  const fm = rules?.derivedFm ?? model.fm
  const inter = interativa(fm)
  const setUso = (key: string, next: number) =>
    model.setVolatile('Interativa.Usos_Recursos', { ...inter.usos, [key]: next })
  const tesouros = ((fmPath(fm, 'Inventario', 'Tesouros') ?? []) as unknown[])
    .map((raw) => {
      const { nome, tier } = parseItemAlias(raw)
      if (!tier) return null
      const tDoc = refs.refDoc(raw)
      const cargas = cargasPorTier(tDoc, tier)
      const usosN = usosPorTier(tDoc, tier)
      const max = cargas ?? usosN
      if (!max) return null
      const key = `tes:${nome}|tier:${tier}`
      const salvo = inter.usos[key] !== undefined ? num(inter.usos[key]) : null
      // Usos iniciam cheios; Cargas iniciam descarregadas (plugin, usos.ts).
      const cur = salvo ?? (cargas ? 0 : max)
      // Figura do tesouro (issue #65) — igual ao inventário.
      const img = tesouroImageUrl(nome, tier, assets)
      return { nome: `${nome} (${tier})`, key, cur, max, img }
    })
    .filter((t): t is NonNullable<typeof t> => t !== null)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {tesouros.map((t) => (
        <div
          key={t.key}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 13,
            padding: '12px 15px',
            background: 'var(--panel)',
            border: '1px solid var(--line)',
            clipPath: clip(12),
          }}
        >
          {t.img ? (
            <span
              style={{
                width: 34,
                height: 34,
                flex: 'none',
                // mesmo quadrado com borda do inventário/tesouros
                background: 'var(--panel2)',
                border: '1px solid var(--line2)',
                clipPath: clip(6),
                backgroundImage: `url("${t.img}")`,
                backgroundSize: 'contain',
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'center',
              }}
            />
          ) : (
            <span style={{ fontSize: 17, flex: 'none' }}>{tokens.emojis.subcategoria.Tesouro}</span>
          )}
          <span style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 14 }}>{t.nome}</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.08em', color: 'var(--muted)' }}>
            USOS
          </span>
          <UsoDots cur={t.cur} max={t.max} onToggle={(next) => setUso(t.key, next)} />
        </div>
      ))}
    </div>
  )
}

/* ===================== sub-aba MAGIAS ===================== */

interface MagiaRow {
  n: string
  ic: string
  acao: string
}

/** Agrupa as magias aprendidas por rank (Slot.X → rank do doc; Tesouro.* → Tesouros). */
export function magiaGroups(
  fm: Record<string, unknown>,
  refDoc: HeroRefs['refDoc'],
): { titulo: string; cor: string; magias: MagiaRow[] }[] {
  const porGrupo = new Map<string, MagiaRow[]>()
  const escolas = (fmPath(fm, 'Magias', 'Lista') ?? []) as Record<string, unknown>[]
  for (const escola of Array.isArray(escolas) ? escolas : []) {
    for (const entry of listaEntries(escola['Lista'])) {
      const spellDoc = refDoc(entry.raw)
      const spellFm = fmOf(spellDoc)
      const grupo =
        entry.fonte.kind === 'Tesouro'
          ? 'Tesouro'
          : rankGroupLabel(str(spellFm['rank']) || SLOTS_RANK[entry.fonte.target] || '')
      const row: MagiaRow = {
        n: entry.label,
        ic: magiaEmoji(spellFm),
        acao: custoEmoji(spellFm['custo']),
      }
      const list = porGrupo.get(grupo) ?? []
      list.push(row)
      porGrupo.set(grupo, list)
    }
  }
  return [...RANK_GROUP_ORDER, 'Tesouro']
    .filter((g) => porGrupo.has(g))
    .map((g) => ({
      titulo: MAGIA_GRUPO_TITULO[g] ?? g.toUpperCase(),
      cor: g === 'Tesouro' ? 'var(--gold)' : 'var(--blue)',
      magias: porGrupo.get(g)!,
    }))
}
const SLOTS_RANK: Record<string, string> = { B: 'Básica', A: 'Adepta', E: 'Experiente', M: 'Mestre' }

/** Abas internas do painel de magias — só aparecem quando o herói tem magia
 *  de invocação disponível (#30); a EM continua visível acima das duas. */
const MAGIA_SUB_TABS = [
  { id: 'magias', label: 'MAGIAS' },
  { id: 'invocacoes', label: 'INVOCAÇÕES' },
]

function MagiasPanel({ doc, refs, inter }: { doc: VaultDoc; refs: HeroRefs; inter: InterativaCtxState }) {
  const model = useHeroModel(doc, 'combate')
  const rules = useHeroRules(model.fm)
  // Base derivada (EM/Potência/escolas cascateados); EM restante (volátil) intacto.
  const fm = rules?.derivedFm ?? model.fm
  const emMax = num(fmPath(fm, 'Magias', 'EM'))
  const rest = interativa(fm).restantes
  const em = rest['EM'] !== undefined ? num(rest['EM']) : emMax
  const setEm = (fn: (cur: number) => number) =>
    model.setVolatile('Interativa.Recursos_Restantes.EM', fn(em))
  const groups = useMemo(() => magiaGroups(fm, refs.refDoc), [fm, refs])
  // Invocações disponíveis (rank na rota ≥ mínima — plugin
  // listInvocacoesDisponiveis); sem nenhuma, o painel fica como era (sem
  // strip de abas).
  const invocacoes = useMemo(() => listInvocacoesDisponiveis(inter.descriptors, fm), [inter, fm])
  const [sub, setSub] = useState('magias')
  const subIndex = invocacoes.length > 0 && sub === 'invocacoes' ? 1 : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: '13px 16px',
          background: 'var(--card)',
          border: '1px solid var(--line2)',
          clipPath: clip(12),
        }}
      >
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.14em', color: 'var(--muted)' }}>
          ENERGIA MÁGICA
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ display: 'flex', gap: 9 }}>
          {Array.from({ length: emMax }, (_, i) => {
            const on = i < em ? 1 : 0
            return (
              <span
                key={i}
                onClick={() => setEm((cur) => (cur === i + 1 ? i : i + 1))}
                title="Alternar EM"
                style={{
                  width: 24,
                  height: 24,
                  transform: 'rotate(45deg)',
                  borderRadius: 4,
                  cursor: 'pointer',
                  background: `color-mix(in srgb,#3b82d6 ${8 + on * 92}%,transparent)`,
                  border: `2px solid color-mix(in srgb,#3b82d6 ${55 + on * 45}%,transparent)`,
                  boxShadow: on ? '0 0 12px rgba(59,130,214,.45)' : 'none',
                  transition: 'background .12s,box-shadow .12s,border-color .12s',
                }}
              />
            )
          })}
        </span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 15, fontWeight: 700, color: 'var(--blue)' }}>
          {em} / {emMax}
        </span>
      </div>

      {invocacoes.length === 0 ? (
        <MagiasLista groups={groups} />
      ) : (
        <div>
          <div style={{ marginBottom: 16 }}>
            <TabStrip
              tabs={MAGIA_SUB_TABS}
              active={subIndex === 1 ? 'invocacoes' : 'magias'}
              onSelect={setSub}
              pad="9px 16px"
            />
          </div>
          <PanelTrack index={subIndex}>
            <TrackPanel>
              <MagiasLista groups={groups} />
            </TrackPanel>
            <TrackPanel>
              <InvocacoesPanel doc={doc} invocacoes={invocacoes} />
            </TrackPanel>
          </PanelTrack>
        </div>
      )}
    </div>
  )
}

function MagiasLista({ groups }: { groups: ReturnType<typeof magiaGroups> }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {groups.map((grp) => (
        <div key={grp.titulo} style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 10,
                letterSpacing: '.16em',
                color: grp.cor,
                fontWeight: 700,
              }}
            >
              {grp.titulo}
            </span>
            <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
          </div>
          {grp.magias.map((m) => (
            <div
              key={m.n}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 13,
                padding: '11px 15px',
                background: 'var(--panel)',
                border: '1px solid var(--line)',
                clipPath: clip(12),
              }}
            >
              <span style={{ fontSize: 17, flex: 'none' }}>{m.ic}</span>
              <span style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 14 }}>{m.n}</span>
              <span
                title="Custo de ação"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontFamily: 'var(--mono)',
                  fontSize: 11,
                  color: 'var(--muted)',
                }}
              >
                <span style={{ fontSize: 15 }}>{m.acao}</span>
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

/* ===================== aba INVOCAÇÕES (#30) ===================== */

const invocMiniBtn = (enabled: boolean): CSSProperties => ({
  width: 22,
  height: 22,
  flex: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--card)',
  border: '1px solid var(--line2)',
  color: enabled ? 'var(--text)' : 'var(--muted)',
  fontFamily: 'var(--mono)',
  fontWeight: 700,
  fontSize: 13,
  cursor: enabled ? 'pointer' : 'default',
  opacity: enabled ? 1 : 0.45,
})

/** Aba de invocações — espelha o modelo do plugin (tab-companheiros.ts):
 *  pra cada invocação DISPONÍVEL, 1 creator slot no topo (título + PM ± +
 *  Invocar) e N cards de instância ativa (vida Vit+Temp+dano, stats em 2
 *  linhas, ataques, habilidades especiais, notas), mais recentes em cima.
 *  Estado no volátil `Interativa.Invocacoes_Ativas[label]` (autosave),
 *  shape idêntico ao FM que o plugin persiste. */
function InvocacoesPanel({ doc, invocacoes }: { doc: VaultDoc; invocacoes: EffectDescriptor[] }) {
  const model = useHeroModel(doc, 'combate')
  const rules = useHeroRules(model.fm)
  // Base derivada (Potência do invocador cascateada); Invocacoes_Ativas (volátil) intacto.
  const fm = rules?.derivedFm ?? model.fm
  const ativas = invocacoesAtivas(fm)
  // Default PM = potência do herói invocador (plugin defaultPM :122-124).
  const potenciaRaw = fmPath(fm, 'Magias', 'Potencia')
  const pmDefault = potenciaRaw === undefined ? 1 : num(potenciaRaw)
  const [creatorPM, setCreatorPM] = useState<Record<string, number>>({})
  const writeAtivas = (next: InvocacoesAtivasMap) =>
    model.setVolatile('Interativa.Invocacoes_Ativas', next)

  const pmOf = (label: string) => creatorPM[label] ?? pmDefault
  const invocar = (desc: EffectDescriptor) => {
    const label = desc.label
    const pm = pmOf(label)
    const evMax = computeEvMax(desc, pm)
    writeAtivas({
      ...ativas,
      [label]: [
        ...(ativas[label] ?? []),
        { id: genId(label), potencia: pm, vitalidade: evMax, moralTemporaria: 0 },
      ],
    })
    setCreatorPM((p) => {
      const rest = { ...p }
      delete rest[label]
      return rest
    })
  }
  const dissipar = (label: string, id: string) => {
    const lista = (ativas[label] ?? []).filter((x) => x.id !== id)
    const next = { ...ativas }
    if (lista.length === 0) delete next[label]
    else next[label] = lista
    writeAtivas(next)
  }
  const updateInst = (label: string, id: string, patch: Partial<InvocacaoInstance>) =>
    writeAtivas({
      ...ativas,
      [label]: (ativas[label] ?? []).map((x) => (x.id === id ? { ...x, ...patch } : x)),
    })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {invocacoes.map((desc) => {
        const pm = pmOf(desc.label)
        const lista = ativas[desc.label] ?? []
        return (
          <div key={desc.label} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div
              data-invoc-creator=""
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 13,
                padding: '11px 15px',
                background: 'var(--panel)',
                border: '1px solid var(--line)',
                clipPath: clip(12),
              }}
            >
              <span style={{ fontSize: 17, flex: 'none' }}>{tokens.emojis.tabInterativa.Companheiros}</span>
              <span style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 14 }}>{desc.label}</span>
              <span title="Potência Mágica" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <button
                  title="Diminuir PM"
                  disabled={pm <= 1}
                  onClick={() => setCreatorPM((p) => ({ ...p, [desc.label]: pm - 1 }))}
                  style={invocMiniBtn(pm > 1)}
                >
                  {tokens.emojis.ui.Decrement}
                </button>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                  {tokens.emojis.subcategoria.PotenciaMagica} {pm}
                </span>
                <button
                  title="Aumentar PM"
                  onClick={() => setCreatorPM((p) => ({ ...p, [desc.label]: pm + 1 }))}
                  style={invocMiniBtn(true)}
                >
                  {tokens.emojis.ui.Increment}
                </button>
              </span>
              <button
                title="Invocar nova instância"
                onClick={() => invocar(desc)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '7px 15px',
                  background: 'color-mix(in srgb,var(--accent) 16%,var(--panel))',
                  border: '1px solid color-mix(in srgb,var(--accent) 55%,var(--line2))',
                  color: 'var(--text)',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: 'pointer',
                  clipPath: clip(8),
                }}
              >
                Invocar
              </button>
            </div>
            {[...lista].reverse().map((inst) => (
              <InvocacaoCard
                key={inst.id}
                desc={desc}
                inst={inst}
                fm={fm}
                onDissipar={() => dissipar(desc.label, inst.id)}
                onUpdate={(patch) => updateInst(desc.label, inst.id, patch)}
              />
            ))}
          </div>
        )
      })}
    </div>
  )
}

function InvocacaoCard({
  desc,
  inst,
  fm,
  onDissipar,
  onUpdate,
}: {
  desc: EffectDescriptor
  inst: InvocacaoInstance
  fm: Record<string, unknown>
  onDissipar: () => void
  onUpdate: (patch: Partial<InvocacaoInstance>) => void
}) {
  // Contexto desta instância (PM próprio) — plugin renderInstanciaCard
  // :300-304: rank vem da rota do bloco; PM entra como selector.
  const ctx: InvocacaoCtx = {
    nivelInvocador: num(fm['Nível']) || 1,
    proficiencia: lookupRota(fm, desc.invocacao?.porProficienciaEm),
    selectores: { 'Potência Mágica': inst.potencia, 'Potencia Magica': inst.potencia },
  }
  const resolved = resolveInvocacao(desc, ctx)
  const evMax = computeEvMax(desc, inst.potencia)
  // Dano consome Moral Temporária primeiro (plugin :498-507).
  const aplicarDano = (n: number) => {
    const useTemp = Math.min(inst.moralTemporaria, n)
    onUpdate({
      moralTemporaria: inst.moralTemporaria - useTemp,
      vitalidade: Math.max(0, inst.vitalidade - (n - useTemp)),
    })
  }
  const setVit = (d: number) => onUpdate({ vitalidade: Math.max(0, Math.min(evMax, inst.vitalidade + d)) })
  const setTemp = (d: number) => onUpdate({ moralTemporaria: Math.max(0, inst.moralTemporaria + d) })
  const pct = (x: number) => (evMax > 0 ? Math.min(100, (x / evMax) * 100).toFixed(3) + '%' : '0%')

  const sectionTitle: CSSProperties = {
    fontFamily: 'var(--mono)',
    fontSize: 9,
    letterSpacing: '.12em',
    color: 'var(--muted)',
    marginBottom: 6,
  }
  const used = new Set<string>()
  const statRows: string[][] = INVOC_STATS_ROWS.map((row) =>
    row.filter((wanted) => {
      const k = resolved ? matchStatKey(resolved.stats, wanted) : null
      if (k) used.add(k)
      return Boolean(k)
    }),
  )
  const resto = resolved
    ? Object.keys(resolved.stats).filter((k) => !used.has(k) && !isEvKey(k))
    : []
  if (resto.length > 0) statRows.push(resto)

  return (
    <div
      data-invoc-card=""
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 11,
        padding: '13px 16px',
        background: 'var(--panel)',
        border: '1px solid var(--line)',
        clipPath: clip(13),
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 15 }}>{desc.label}</span>
        <span
          title="Potência Mágica"
          style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}
        >
          {tokens.emojis.subcategoria.PotenciaMagica} {inst.potencia}
        </span>
        <button
          title="Dissipar essa instância"
          onClick={onDissipar}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '6px 13px',
            background: 'color-mix(in srgb,var(--red) 14%,var(--panel))',
            border: '1px solid color-mix(in srgb,var(--red) 45%,var(--line2))',
            color: 'var(--text)',
            fontWeight: 600,
            fontSize: 12,
            cursor: 'pointer',
            clipPath: clip(7),
          }}
        >
          Dissipar
        </button>
      </div>

      {evMax > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12 }}>{tokens.emojis.subcategoria.Vitalidade}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
              Vitalidade: {inst.vitalidade}/{evMax}
            </span>
            {inst.moralTemporaria > 0 ? (
              <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: '#43c07f' }}>
                (+{inst.moralTemporaria} {tokens.emojis.subcategoria.MoralTemporaria})
              </span>
            ) : null}
            <span style={{ flex: 1 }} />
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <button title="Diminuir Vitalidade" onClick={() => setVit(-1)} style={invocMiniBtn(inst.vitalidade > 0)}>
                {tokens.emojis.ui.Decrement}
              </button>
              <button title="Aumentar Vitalidade" onClick={() => setVit(1)} style={invocMiniBtn(inst.vitalidade < evMax)}>
                {tokens.emojis.ui.Increment}
              </button>
              <span style={{ fontSize: 11 }}>{tokens.emojis.subcategoria.MoralTemporaria}</span>
              <button title="Diminuir Moral Temporária" onClick={() => setTemp(-1)} style={invocMiniBtn(inst.moralTemporaria > 0)}>
                {tokens.emojis.ui.Decrement}
              </button>
              <button title="Aumentar Moral Temporária" onClick={() => setTemp(1)} style={invocMiniBtn(true)}>
                {tokens.emojis.ui.Increment}
              </button>
              {[1, 5, 10].map((n) => (
                <button
                  key={n}
                  title={`Aplicar ${n} de dano`}
                  onClick={() => aplicarDano(n)}
                  style={{
                    padding: '3px 8px',
                    background: 'color-mix(in srgb,#000 44%,var(--red))',
                    border: '1px solid color-mix(in srgb,#000 22%,var(--red))',
                    color: '#ffe9e4',
                    fontFamily: 'var(--mono)',
                    fontWeight: 700,
                    fontSize: 11,
                    cursor: 'pointer',
                    borderRadius: 3,
                  }}
                >
                  {tokens.emojis.subcategoria.Sangue}-{n}
                </button>
              ))}
            </span>
          </div>
          <div
            style={{
              position: 'relative',
              height: 9,
              background: 'var(--card)',
              border: '1px solid var(--line2)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                height: '100%',
                width: pct(inst.vitalidade),
                background: 'linear-gradient(90deg,#c0392b,#ff5547)',
                transition: 'width .3s ease',
              }}
            />
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: pct(inst.vitalidade),
                height: '100%',
                width: pct(inst.moralTemporaria),
                background: 'linear-gradient(90deg,#33a869,#46cf86)',
                transition: 'width .3s ease,left .3s ease',
              }}
            />
          </div>
        </div>
      ) : null}

      {resolved ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {statRows.map((row, i) =>
            row.length > 0 ? (
              <div key={i} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {row.map((wanted) => {
                  const k = matchStatKey(resolved.stats, wanted)!
                  return (
                    <span
                      key={wanted}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '5px 10px',
                        background: 'var(--card)',
                        border: '1px solid var(--line2)',
                        clipPath: 'polygon(0 0,100% 0,100% 100%,5px 100%,0 calc(100% - 5px))',
                      }}
                    >
                      {invocStatEmoji(wanted) ? (
                        <span style={{ fontSize: 12 }}>{invocStatEmoji(wanted)}</span>
                      ) : null}
                      <span
                        style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.08em', color: 'var(--muted)' }}
                      >
                        {wanted.toUpperCase()}
                      </span>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                        {formatStatValue(wanted, resolved.stats[k])}
                      </span>
                    </span>
                  )
                })}
              </div>
            ) : null,
          )}
        </div>
      ) : (
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)' }}>
          — Stats não resolvidos —
        </div>
      )}

      {resolved && resolved.ataques.length > 0 ? (
        <div>
          <div style={sectionTitle}>
            {tokens.emojis.combate.Ataque} ATAQUES
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {resolved.ataques.map((at) => {
              const bonusInfo = resolveAttackBonus(at.bonus, fm, desc)
              const danoTitle = buildDanoTitle(at, desc, fm)
              return (
                <div key={at.nome} style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, fontSize: 13.5 }}>{at.nome}</span>
                  {at.tipo ? (
                    <span style={{ fontSize: 11.5, fontStyle: 'italic', color: 'var(--muted)' }}>({at.tipo})</span>
                  ) : null}
                  {bonusInfo ? (
                    <span
                      title={bonusInfo.title}
                      style={{ fontFamily: 'var(--mono)', fontSize: 12.5, fontWeight: 700, color: 'var(--accent)' }}
                    >
                      {signed(bonusInfo.total)}
                    </span>
                  ) : typeof at.bonus === 'string' ? (
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--muted)' }}>({at.bonus})</span>
                  ) : null}
                  {at.dano != null ? (
                    <span
                      title={danoTitle ?? undefined}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '3px 10px',
                        background: 'var(--card)',
                        border: '1px solid var(--line2)',
                        clipPath: 'polygon(0 0,100% 0,100% 100%,5px 100%,0 calc(100% - 5px))',
                        fontFamily: 'var(--mono)',
                        fontSize: 12.5,
                        color: 'var(--accent)',
                      }}
                    >
                      ⚔️ {at.dano}
                    </span>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      {(desc.invocacao?.habilidadesEspeciais.length ?? 0) > 0 ? (
        <div>
          <div style={sectionTitle}>
            {tokens.emojis.categoria.Habilidade} HABILIDADES
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {desc.invocacao!.habilidadesEspeciais.map((hab) => (
              <div key={hab.label} style={{ fontSize: 12.5, lineHeight: 1.4 }}>
                <span style={{ fontWeight: 700 }}>{hab.label}.</span>{' '}
                <span style={{ color: 'var(--muted)' }}>{hab.descricao}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {(desc.invocacao?.notas.length ?? 0) > 0 ? (
        <div>
          <div style={sectionTitle}>
            {tokens.emojis.subcategoria.Passado} NOTAS
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {desc.invocacao!.notas.map((nota) => (
              <li key={nota} style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.45 }}>
                {nota}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

/* ===================== aba ===================== */

export function CombateTab({ doc, refs }: { doc: VaultDoc; refs: HeroRefs }) {
  const [tab, setTab] = useState('ataques')
  // ConditionContext da Interativa — computado UMA vez sobre o FM overlaid
  // e compartilhado por todos os campos afetados (defesas/sentidos/ataques/
  // perícias/manobras), como o contexto único por render do plugin
  // (mount-interativa-context.ts:computeCtx).
  const inter = useInterativaCtx(doc, refs)
  const index = Math.max(
    0,
    COMB_TABS.findIndex((t) => t.id === tab),
  )

  // Sem flash de valores crus: espera as fontes do contexto (docs das
  // condições + refs) antes de renderizar — os campos já nascem com os
  // deltas de buff/debuff aplicados, como na Interativa do plugin.
  if (!inter.loaded) return null

  return (
    // TipProvider: overlay singleton dos tooltips de breakdown desta aba
    // (defesas/sentidos/perícias/ataques/danos — #21/#22/#25), mesmo padrão
    // da HabilidadesTab. 1 provider por render de aba.
    <TipProvider>
      <style>{ITEM_CARD_CSS}</style>
      <div
        style={{
          maxWidth: 1180,
          margin: '0 auto',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <EscudoRow doc={doc} refs={refs} />
        <VidaBar doc={doc} />
        <DefesasRow doc={doc} inter={inter} />
        <div>
          <div style={{ marginBottom: 16 }}>
            <TabStrip tabs={COMB_TABS} active={tab} onSelect={setTab} pad="11px 18px" />
          </div>
          <PanelTrack index={index}>
            <TrackPanel>
              <AtaquesPanel doc={doc} refs={refs} inter={inter} />
            </TrackPanel>
            <TrackPanel>
              <PericiasPanel doc={doc} inter={inter} />
            </TrackPanel>
            <TrackPanel>
              <TesourosPanel doc={doc} refs={refs} />
            </TrackPanel>
            <TrackPanel>
              <MagiasPanel doc={doc} refs={refs} inter={inter} />
            </TrackPanel>
          </PanelTrack>
        </div>
      </div>
    </TipProvider>
  )
}
