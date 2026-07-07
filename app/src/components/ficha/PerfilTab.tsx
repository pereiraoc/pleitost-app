// Aba PERFIL/BIOGRAFIA da ficha — markup/estilos verbatim do design puxado
// (design/pulled/Companion App.dc.html §PERFIL, linhas 128-277), dados do
// modelo salvo LOCAL (useHeroModel = FM extraído + overlay persistido em
// Biografia/Experiencia/Oficios). Os labels do cluster Passado
// (PASSADO/PERÍCIA/OFÍCIO/TEXTO DO OFÍCIO, emojis 📝🎓⚒️📋) batem com o
// passadoFields do renderVals recuperado no pull.
import { useState, type CSSProperties, type ReactNode } from 'react'
import type { VaultDoc } from '../../data/types'
import { useHeroModel } from '../../data/useHeroModel'
import { linkLabel } from '../../markdown/dataview-value'
import { useAssetIndex } from '../../data/assets'
import { creatureImageUrl } from '../../data/creature-image'
import { useViewportWidth } from '../../viewport'
import { useHeroRules } from '../../rules/useHeroRules'
import { applyPassadoPickToRows } from '../../rules/passado-options'
import { NATURALIDADE_OUTRO } from '../../rules/naturalidade'
import { clip, TabStrip, PanelTrack, TrackPanel } from './bits'
import {
  classeAventureiro,
  displayName,
  periciaEmoji,
  slugify,
  tokens,
} from './registry'
import {
  fmPath,
  heroNome,
  num,
  parseFonte,
  shortSintonia,
  str,
  wikiTarget,
} from './hero-model'

const BIO_TABS = [
  { id: 'identidade', label: 'IDENTIDADE' },
  { id: 'experiencia', label: 'EXPERIÊNCIA' },
]

const mono10: CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 10,
  letterSpacing: '.16em',
  color: 'var(--muted)',
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <span style={mono10}>{label}</span>
      {children}
    </div>
  )
}

function boxStyle(pad: string, fontSize: number, color = 'var(--text)'): CSSProperties {
  return {
    padding: pad,
    background: 'var(--panel)',
    border: '1px solid var(--line2)',
    clipPath: clip(10),
    fontSize,
    color,
  }
}

/** Iniciais pro slot sem retrato (mesma regra dos cards de herói). */
function initials(name: string): string {
  const words = name.split(/[\s,]+/).filter((w) => w.length > 2)
  const two = words
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
  return (two || name.slice(0, 2)).toUpperCase()
}

const stripAccents = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Emoji da sintonia derivado do VALOR selecionado (overlay, live — #37):
 *  registro tokens.emojis.sintonia por basename do wikilink sem acentos. */
function sintoniaEmojiFromValue(value: string): string {
  const target = wikiTarget(value) || value
  if (!target) return ''
  const norm = stripAccents(target)
  for (const [key, emoji] of Object.entries(tokens.emojis.sintonia)) {
    if (norm.includes(stripAccents(key))) return emoji as string
  }
  return ''
}

/** Lista editável do design (Ideais/Desprezos/Qualidades/Defeitos): cada item
 *  é input inline com lixeira; edição persiste na hora (#39). */
function ListaBio({
  titulo,
  cor,
  items,
  onChange,
  onDelete,
}: {
  titulo: string
  cor: string
  items: string[]
  onChange: (i: number, v: string) => void
  onDelete: (i: number) => void
}) {
  return (
    <div style={{ flex: 1, minWidth: 260, display: 'flex', flexDirection: 'column', gap: 9 }}>
      <span
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 11,
          letterSpacing: '.1em',
          color: cor,
          fontWeight: 700,
        }}
      >
        {titulo}
      </span>
      {items.map((texto, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            aria-label={`${titulo} ${i + 1}`}
            value={texto}
            onChange={(e) => onChange(i, e.target.value)}
            style={{
              flex: 1,
              minWidth: 0,
              padding: '11px 14px',
              background: 'var(--card)',
              border: `1px solid color-mix(in srgb,${cor} 30%,var(--line2))`,
              clipPath: clip(9),
              fontSize: 13.5,
              color: 'var(--text)',
              fontFamily: 'var(--body)',
            }}
          />
          <span
            onClick={() => onDelete(i)}
            style={{ color: 'var(--muted)', fontSize: 15, cursor: 'pointer' }}
          >
            🗑️
          </span>
        </div>
      ))}
    </div>
  )
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: 11,
        background: 'transparent',
        border: '1px dashed var(--line2)',
        color: 'var(--muted)',
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontSize: 13,
        clipPath: clip(9),
      }}
    >
      {label}
    </button>
  )
}

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  background: 'var(--card)',
  border: '1px solid var(--line2)',
  color: 'var(--text)',
  fontSize: 13,
  fontFamily: 'var(--body)',
  clipPath: clip(8),
}

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

/** Garante que o valor atual apareça nas opções (registro ainda carregando
 *  ou valor órfão) — mesmo guard do SelectBox de COMPETÊNCIAS. */
export function withCurrent(options: SelectOption[], value: string, label?: string): SelectOption[] {
  if (!value || options.some((o) => o.value === value)) return options
  return [...options, { value, label: label ?? value }]
}

/** Caixa do design com <select> nativo invisível por cima — mesmo padrão do
 *  linked-dropdown do plugin (render/shared/linked-dropdown.ts: display
 *  decorado + select transparente). O visual fica verbatim do design; as
 *  OPÇÕES vêm da projeção de regras (app/src/rules). */
export function BoxSelect({
  display,
  options,
  value,
  onChange,
  ariaLabel,
  disabled,
}: {
  display: ReactNode
  options: SelectOption[]
  value: string
  onChange: (v: string) => void
  ariaLabel: string
  disabled?: boolean
}) {
  return (
    // width:100% do wrapper de select do design (dc.html:795) — sem ele a
    // célula encolhe pro conteúdo em colunas com align-items:center.
    <div style={{ position: 'relative', minWidth: 0, width: '100%' }}>
      {display}
      <select
        aria-label={ariaLabel}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          opacity: 0,
          cursor: disabled ? 'default' : 'pointer',
        }}
      >
        {options.map((o, i) => (
          <option key={`${o.value}-${i}`} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

// Grid do cluster PASSADO: no PERFIL/bio o design usa auto-fit (linha 176);
// na sub-aba PERFIL de COMPETÊNCIAS, 4 colunas fixas (linha 804).
export function PassadoBox({
  doc,
  cols = 'repeat(auto-fit,minmax(150px,1fr))',
  origem = 'perfil',
}: {
  doc: VaultDoc
  cols?: string
  origem?: string
}) {
  const model = useHeroModel(doc, origem)
  const fm = model.fm
  const passado = str(fmPath(fm, 'Biografia', 'Passado'))
  // Perícia/Ofício concedidos pelo Passado = linhas com incremento "Passado".
  const ehDoPassado = (row: Record<string, unknown>) =>
    (Array.isArray(row['Incrementos']) ? (row['Incrementos'] as unknown[]) : []).some(
      (inc) =>
        inc !== null &&
        typeof inc === 'object' &&
        Object.values(inc).some((v) => parseFonte(v).kind === 'Passado'),
    )
  const daFonte = (lista: unknown) =>
    ((Array.isArray(lista) ? lista : []) as Record<string, unknown>[]).find(ehDoPassado)
  const periciasRows = (fmPath(fm, 'Pericias', 'Lista') ?? []) as Record<string, unknown>[]
  const pericia = daFonte(periciasRows)
  const oficios = (fmPath(fm, 'Oficios', 'Lista') ?? []) as Record<string, unknown>[]
  const oficio = daFonte(oficios)
  // Opções elegíveis dos selects — projeção de regras do plugin
  // (periciasPassadoOptions/oficiosPassadoOptions, util/passado-options.ts).
  const rules = useHeroRules(fm)
  // Edição persiste NA HORA: texto do passado e complemento do ofício
  // (a linha do ofício é regravada dentro da lista — write de container).
  const setPassado = (v: string) => model.set('Biografia.Passado', v)
  const setOficioTexto = (v: string) => {
    if (!oficio) return
    model.set(
      'Oficios.Lista',
      oficios.map((row) => (row === oficio ? { ...row, Complemento: v } : row)),
    )
  }
  // Troca de pick = ESTADO no FM (pick do Passado vira incremento
  // `{A: "Passado"}` na linha escolhida) — espelho de applyPassadoToModel
  // do plugin (extract/apply-passado-to-model.ts).
  const setPericiaPick = (slug: string) =>
    model.set(
      'Pericias.Lista',
      applyPassadoPickToRows(periciasRows, (row) => !!slug && slugify(str(row['Nome'])) === slug),
    )
  const setOficioPick = (v: string) =>
    model.set(
      'Oficios.Lista',
      applyPassadoPickToRows(
        oficios,
        (row) =>
          !!v && (v === 'Atuacao' ? str(row['Nome']) === 'Atuacao' : str(row['Nome']) === 'Oficio'),
      ),
    )
  const perPick = pericia ? slugify(str(pericia['Nome'])) : ''
  const perNome = pericia ? displayName(perPick) : ''
  const perIc = pericia ? periciaEmoji(str(pericia['Nome'])) : ''
  const ofNome = oficio ? str(oficio['Nome']) : ''
  // Rótulo do ofício — espelho de labelOf (plugin biografia-card.ts:358-359).
  const oficioLabel = (v: string) =>
    v === 'Atuacao'
      ? `${tokens.emojis.perfil.Atuacao} Atuação`
      : `${tokens.emojis.perfil.OficioPassado} Ofício`
  const ofTexto = oficio ? str(oficio['Complemento']) : ''

  const periciaOptions = withCurrent(
    [
      { value: '', label: '—' },
      ...(rules?.periciasPassado ?? []).map((o) => ({
        value: o.id,
        label: `${periciaEmoji(o.id)} ${displayName(o.id)}`.trim(),
      })),
    ],
    perPick,
    perNome ? `${perIc} ${perNome}`.trim() : undefined,
  )
  const oficioOptions = withCurrent(
    [
      { value: '', label: '—' },
      ...(rules?.oficiosPassado ?? []).map((o) => ({ value: o.value, label: oficioLabel(o.value) })),
    ],
    ofNome,
    ofNome ? oficioLabel(ofNome) : undefined,
  )

  const P = tokens.emojis.perfil
  const fields: {
    ic: string
    label: string
    value: string
    select?: boolean
    options?: SelectOption[]
    onChange?: (v: string) => void
  }[] = [
    { ic: P.Passado, label: 'PASSADO', value: passado, onChange: setPassado },
    {
      ic: P.PericiaPassado,
      label: 'PERÍCIA',
      value: perPick,
      select: true,
      options: periciaOptions,
      onChange: setPericiaPick,
    },
    {
      ic: P.OficioPassadoCampo,
      label: 'OFÍCIO',
      value: ofNome,
      select: true,
      options: oficioOptions,
      onChange: setOficioPick,
    },
    { ic: P.TextoOficio, label: 'TEXTO DO OFÍCIO', value: ofTexto, onChange: setOficioTexto },
  ]

  return (
    <div
      style={{
        padding: '16px 18px',
        background: 'var(--panel)',
        border: '1px solid var(--line2)',
        clipPath: clip(14),
      }}
    >
      <div
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 10,
          letterSpacing: '.14em',
          color: 'var(--muted)',
          textAlign: 'center',
          marginBottom: 13,
        }}
      >
        {P.PassadoSecao} PASSADO
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: cols,
          gap: 12,
        }}
      >
        {fields.map((f) => (
          <div
            key={f.label}
            style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}
          >
            <span
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 9.5,
                letterSpacing: '.08em',
                color: 'var(--muted)',
              }}
            >
              {f.ic} {f.label}
            </span>
            {f.select ? (
              <div style={{ position: 'relative', minWidth: 0 }}>
                <select
                  aria-label={f.label}
                  value={f.value}
                  onChange={f.onChange ? (e) => f.onChange!(e.target.value) : undefined}
                  style={{
                    appearance: 'none',
                    WebkitAppearance: 'none',
                    width: '100%',
                    padding: '10px 26px 10px 12px',
                    background: 'var(--card)',
                    border: '1px solid var(--line2)',
                    color: 'var(--blue)',
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: 'pointer',
                    clipPath: clip(8),
                  }}
                >
                  {(f.options ?? [{ value: f.value, label: f.value || '—' }]).map((o, i) => (
                    <option key={`${o.value}-${i}`} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <span
                  style={{
                    position: 'absolute',
                    right: 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--muted)',
                    fontSize: 10,
                    pointerEvents: 'none',
                  }}
                >
                  ▾
                </span>
              </div>
            ) : (
              <input
                value={f.value}
                onChange={f.onChange ? (e) => f.onChange!(e.target.value) : undefined}
                readOnly={!f.onChange}
                style={inputStyle}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function IdentidadePanel({ doc }: { doc: VaultDoc }) {
  // Modelo salvo LOCAL (FM extraído + overlay) — edição da Naturalidade
  // persiste NA HORA (canal imediato).
  const model = useHeroModel(doc, 'perfil')
  const fm = model.fm
  const rules = useHeroRules(fm)
  const bio = (fm['Biografia'] ?? {}) as Record<string, unknown>
  // Sem filtrar vazios: em edição um item recém-adicionado (string vazia)
  // precisa sobreviver pro usuário digitar (#39).
  const listOf = (key: string) =>
    (Array.isArray(bio[key]) ? (bio[key] as unknown[]) : []).map((s) => str(s))
  const setBio = (key: string, v: unknown) => model.set(`Biografia.${key}`, v)
  const setList = (key: string, list: string[]) => setBio(key, list)
  // "+ A / B": adiciona uma linha em branco a cada uma das duas listas.
  const addPair = (k1: string, k2: string) => {
    setList(k1, [...listOf(k1), ''])
    setList(k2, [...listOf(k2), ''])
  }
  const editItem = (key: string, i: number, v: string) =>
    setList(key, listOf(key).map((x, j) => (j === i ? v : x)))
  const delItem = (key: string, i: number) =>
    setList(key, listOf(key).filter((_, j) => j !== i))
  // Campo de identidade editável, persistido na hora (#38).
  const editField = (label: string, key: string) => (
    <div style={{ flex: 1, minWidth: 120, display: 'flex', flexDirection: 'column', gap: 7 }}>
      <span style={{ ...mono10, letterSpacing: '.14em' }}>{label}</span>
      <input
        aria-label={label}
        value={str(bio[key])}
        onChange={(e) => setBio(key, e.target.value)}
        style={{ ...boxStyle('12px 14px', 14), width: '100%', fontFamily: 'var(--body)' }}
      />
    </div>
  )
  // Naturalidade: wikilink → dropdown do Atlas; texto livre → modo "Outro";
  // vazio → "—". Espelho dos modos do naturalidadePicker do plugin
  // (render/groups/naturalidade-picker.ts:273-293).
  const naturalidadeRaw = str(bio['Naturalidade'])
  const naturalidadeIsLink = /^\[\[[^\]]+\]\]$/.test(naturalidadeRaw.trim())
  const naturalidadeIsOutro = !naturalidadeIsLink && naturalidadeRaw.trim().length > 0
  const [outroMode, setOutroMode] = useState(false)
  const naturalidade = linkLabel(naturalidadeRaw)
  const setNaturalidade = (v: string) => model.set('Biografia.Naturalidade', v)
  const naturalidadeLines = (rules?.naturalidadeLines ?? []).map((l, i) => ({
    value: l.value === null ? `__header_${i}` : l.value,
    label: l.label,
    disabled: l.disabled,
  }))
  const naturalidadeValue = outroMode || naturalidadeIsOutro ? NATURALIDADE_OUTRO : naturalidadeRaw.trim()
  const onNaturalidadeSelect = (v: string) => {
    if (v === NATURALIDADE_OUTRO) {
      // Entra em modo Outro — commit só no blur do input (picker do plugin:322-336).
      setOutroMode(true)
      return
    }
    setOutroMode(false)
    setNaturalidade(v)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PassadoBox doc={doc} />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          padding: 22,
          background: 'var(--panel)',
          border: '1px solid var(--line2)',
          clipPath: clip(16),
        }}
      >
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 240, display: 'flex', flexDirection: 'column', gap: 7 }}>
            <span style={{ ...mono10, letterSpacing: '.14em' }}>🧭 MOTIVAÇÃO DE AVENTUREIRO</span>
            <input
              aria-label="Motivação de aventureiro"
              value={str(bio['Motivacao'])}
              onChange={(e) => setBio('Motivacao', e.target.value)}
              style={{ ...boxStyle('12px 14px', 14), width: '100%', fontFamily: 'var(--body)' }}
            />
          </div>
          <div style={{ flex: 1, minWidth: 240, display: 'flex', flexDirection: 'column', gap: 7 }}>
            <span style={{ ...mono10, letterSpacing: '.14em' }}>🖼️ NATURALIDADE</span>
            <BoxSelect
              ariaLabel="Naturalidade"
              display={
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    ...boxStyle('12px 14px', 14, 'var(--blue)'),
                  }}
                >
                  <span style={{ flex: 1 }}>
                    {outroMode || naturalidadeIsOutro
                      ? `${tokens.emojis.ui.Outro} ${naturalidadeIsOutro ? naturalidadeRaw : 'Outro'}`
                      : `🏛️ ${naturalidade || '—'}`}
                  </span>
                  <span style={{ color: 'var(--muted)' }}>▾</span>
                </div>
              }
              options={naturalidadeLines}
              value={naturalidadeValue}
              onChange={onNaturalidadeSelect}
            />
            {outroMode || naturalidadeIsOutro ? (
              <input
                aria-label="Naturalidade (texto livre)"
                type="text"
                placeholder="Digite o nome…"
                defaultValue={naturalidadeIsOutro ? naturalidadeRaw : ''}
                onBlur={(e) => {
                  const txt = e.target.value.trim()
                  if (txt !== naturalidadeRaw) setNaturalidade(txt)
                }}
                style={inputStyle}
              />
            ) : null}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {editField('⚧ GÊNERO', 'Genero')}
          {editField('🎂 IDADE', 'Idade')}
          {editField('📏 ALTURA', 'Altura')}
          {editField('⚖️ PESO', 'Peso')}
        </div>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <ListaBio
            titulo="🔱 IDEAIS"
            cor="var(--gold)"
            items={listOf('Ideais')}
            onChange={(i, v) => editItem('Ideais', i, v)}
            onDelete={(i) => delItem('Ideais', i)}
          />
          <ListaBio
            titulo="🚫 DESPREZOS"
            cor="var(--red)"
            items={listOf('Desprezos')}
            onChange={(i, v) => editItem('Desprezos', i, v)}
            onDelete={(i) => delItem('Desprezos', i)}
          />
        </div>
        <AddButton label="+ Ideais / Desprezos" onClick={() => addPair('Ideais', 'Desprezos')} />

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <ListaBio
            titulo="🏆 QUALIDADES"
            cor="var(--gold)"
            items={listOf('Qualidades')}
            onChange={(i, v) => editItem('Qualidades', i, v)}
            onDelete={(i) => delItem('Qualidades', i)}
          />
          <ListaBio
            titulo="⚓ DEFEITOS"
            cor="var(--red)"
            items={listOf('Defeitos')}
            onChange={(i, v) => editItem('Defeitos', i, v)}
            onDelete={(i) => delItem('Defeitos', i)}
          />
        </div>
        <AddButton label="+ Qualidades / Defeitos" onClick={() => addPair('Qualidades', 'Defeitos')} />
      </div>
    </div>
  )
}

interface Marca {
  qtd: number
  texto: string
}
interface Reconhecimento {
  entidade: string
  texto: string
}

const regInput: CSSProperties = {
  flex: 1,
  minWidth: 0,
  padding: '9px 13px',
  background: 'var(--panel)',
  border: '1px solid var(--line2)',
  color: 'var(--text)',
  fontSize: 13.5,
  fontFamily: 'var(--body)',
  clipPath: clip(9),
}

function DeleteBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: 34,
        height: 34,
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--card)',
        border: '1px solid var(--line2)',
        color: 'var(--muted)',
        cursor: 'pointer',
        fontSize: 13,
        clipPath: clip(7),
      }}
    >
      🗑️
    </button>
  )
}

/** Cabeçalho de seção com botão Alterar/Concluir (padrão de edição das
 *  competências) — modo leitura por padrão, edição ao clicar (#40). */
function SectionHead({
  title,
  editing,
  onToggle,
}: {
  title: string
  editing: boolean
  onToggle: () => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 11px' }}>
      <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>{title}</span>
      <span style={{ flex: 1 }} />
      <button
        onClick={onToggle}
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 10,
          letterSpacing: '.1em',
          fontWeight: 700,
          padding: '6px 12px',
          cursor: 'pointer',
          background: editing ? 'var(--accent)' : 'transparent',
          color: editing ? 'var(--ink)' : 'var(--accent)',
          border: '1px solid color-mix(in srgb,var(--accent) 45%,var(--line2))',
          clipPath: clip(6),
        }}
      >
        {editing ? 'Concluir' : 'Alterar'}
      </button>
    </div>
  )
}

function ExperienciaPanel({ doc }: { doc: VaultDoc }) {
  const model = useHeroModel(doc, 'perfil')
  const fm = model.fm
  const [editRec, setEditRec] = useState(false)
  const [editMarcas, setEditMarcas] = useState(false)
  const nivel = num(fm['Nível'])
  const ci = classeAventureiro(nivel)
  const exp = (fm['Experiencia'] ?? {}) as Record<string, unknown>
  // Listas do modelo salvo local; edição regrava a LISTA no overlay NA HORA
  // (mesmo shape do FM: Marcas [{qtd,texto}], Reconhecimentos [{entidade,texto}]).
  const marcas: Marca[] = (
    Array.isArray(exp['Marcas']) ? (exp['Marcas'] as Record<string, unknown>[]) : []
  ).map((m) => ({ qtd: num(m['qtd']), texto: str(m['texto']) }))
  const recs: Reconhecimento[] = (
    Array.isArray(exp['Reconhecimentos'])
      ? (exp['Reconhecimentos'] as Record<string, unknown>[])
      : []
  ).map((r) => ({ entidade: str(r['entidade']), texto: str(r['texto']) }))
  const setMarcas = (fn: (list: Marca[]) => Marca[]) => model.set('Experiencia.Marcas', fn(marcas))
  const setRecs = (fn: (list: Reconhecimento[]) => Reconhecimento[]) =>
    model.set('Experiencia.Reconhecimentos', fn(recs))

  const recCount = recs.filter((r) => r.entidade.trim() || r.texto.trim()).length
  const totalMarcas = marcas.reduce((sum, m) => sum + Math.max(0, m.qtd), 0)
  // 10 dots fixos; unit calibra marcas por dot (1:1 até nv 3, 10:1 depois) — plugin.
  const unit = nivel <= 3 ? 1 : 10
  const filledMarks = Math.min(Math.ceil(totalMarcas / unit), 10)

  const offDot = (
    <span
      style={{
        width: 9,
        height: 9,
        borderRadius: 2,
        background: 'color-mix(in srgb,var(--muted) 32%,transparent)',
      }}
    />
  )
  const pill = (children: ReactNode) => (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 14px',
        background: 'var(--panel2)',
        border: '1px solid var(--line)',
        clipPath: clip(9),
      }}
    >
      {children}
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 11,
          padding: '16px 18px',
          background: 'var(--panel)',
          border: '1px solid var(--line2)',
          clipPath: clip(14),
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{ fontSize: 18 }}>{ci.emoji}</span>
          <span
            style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--text)', letterSpacing: '.01em' }}
          >
            Aventureiro Classe {ci.classe}
          </span>
        </div>
        {pill(
          <>
            <span style={{ fontSize: 13.5, color: 'var(--text)' }}>
              Reconhecimentos: <strong style={{ fontFamily: 'var(--mono)' }}>{recCount}</strong>
            </span>
            <span style={{ flex: 1 }} />
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              {Array.from({ length: 3 }, (_, i) =>
                i < Math.min(recCount, 3) ? (
                  <span key={i} style={{ fontSize: 17, lineHeight: 1 }}>
                    {tokens.emojis.aventureiro.Reconhecimento}
                  </span>
                ) : (
                  <span key={i} style={{ display: 'contents' }}>
                    {offDot}
                  </span>
                ),
              )}
            </span>
          </>,
        )}
        {pill(
          <>
            <span style={{ fontSize: 13.5, color: 'var(--text)' }}>
              Marcas: <strong style={{ fontFamily: 'var(--mono)' }}>{totalMarcas}</strong>
            </span>
            <span style={{ flex: 1 }} />
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
              {Array.from({ length: 10 }, (_, i) =>
                i < filledMarks ? (
                  <span key={i} style={{ fontSize: 15, lineHeight: 1 }}>
                    {tokens.emojis.aventureiro.Marca}
                  </span>
                ) : (
                  <span key={i} style={{ display: 'contents' }}>
                    {offDot}
                  </span>
                ),
              )}
            </span>
          </>,
        )}
      </div>

      <div>
        <SectionHead
          title="Registros de Reconhecimentos"
          editing={editRec}
          onToggle={() => setEditRec((v) => !v)}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {recs.map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <span
                style={{ fontSize: 19, lineHeight: 1, width: 24, textAlign: 'center', flex: 'none' }}
              >
                {tokens.emojis.aventureiro.Reconhecimento}
              </span>
              {editRec ? (
                <>
                  <input
                    aria-label={`Reconhecimento ${i + 1} entidade`}
                    value={r.entidade}
                    onChange={(e) =>
                      setRecs((list) =>
                        list.map((x, j) => (j === i ? { ...x, entidade: e.target.value } : x)),
                      )
                    }
                    style={{ ...regInput, color: 'var(--blue)', fontWeight: 600 }}
                  />
                  <input
                    aria-label={`Reconhecimento ${i + 1} texto`}
                    value={r.texto}
                    onChange={(e) =>
                      setRecs((list) =>
                        list.map((x, j) => (j === i ? { ...x, texto: e.target.value } : x)),
                      )
                    }
                    style={{ ...regInput, flex: 1.35 }}
                  />
                  <DeleteBtn onClick={() => setRecs((list) => list.filter((_, j) => j !== i))} />
                </>
              ) : (
                <>
                  <span style={{ flex: 1, color: 'var(--blue)', fontWeight: 600, fontSize: 13.5 }}>
                    {r.entidade || '—'}
                  </span>
                  <span style={{ flex: 1.35, color: 'var(--text)', fontSize: 13.5 }}>{r.texto}</span>
                </>
              )}
            </div>
          ))}
          {editRec ? (
            <button
              onClick={() => setRecs((list) => [...list, { entidade: '', texto: '' }])}
              style={{
                width: '100%',
                padding: 11,
                background: 'transparent',
                border: '1px dashed var(--line2)',
                color: 'var(--gold)',
                cursor: 'pointer',
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 9,
              }}
            >
              <span style={{ fontSize: 15, lineHeight: 1 }}>+</span>
              <span style={{ fontSize: 16, lineHeight: 1 }}>
                {tokens.emojis.aventureiro.Reconhecimento}
              </span>
            </button>
          ) : recs.length === 0 ? (
            <span style={{ color: 'var(--muted)', fontSize: 13 }}>Nenhum reconhecimento.</span>
          ) : null}
        </div>
      </div>

      <div>
        <SectionHead
          title="Registros de Marcas"
          editing={editMarcas}
          onToggle={() => setEditMarcas((v) => !v)}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {marcas.map((m, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <span
                style={{ fontSize: 19, lineHeight: 1, width: 24, textAlign: 'center', flex: 'none' }}
              >
                {tokens.emojis.aventureiro.Marca}
              </span>
              {editMarcas ? (
                <input
                  aria-label={`Marca ${i + 1} quantidade`}
                  type="number"
                  min={0}
                  value={m.qtd}
                  onChange={(e) =>
                    setMarcas((list) =>
                      list.map((x, j) =>
                        j === i ? { ...x, qtd: Math.max(0, Number(e.target.value) || 0) } : x,
                      ),
                    )
                  }
                  style={{
                    ...regInput,
                    width: 60,
                    flex: 'none',
                    textAlign: 'center',
                    fontFamily: 'var(--mono)',
                    fontWeight: 700,
                    color: 'var(--blue)',
                  }}
                />
              ) : (
                <span
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 13,
                    fontWeight: 700,
                    color: 'var(--blue)',
                    width: 26,
                    textAlign: 'center',
                    flex: 'none',
                  }}
                >
                  {m.qtd}
                </span>
              )}
              {editMarcas ? (
                <>
                  <input
                    aria-label={`Marca ${i + 1} texto`}
                    value={m.texto}
                    onChange={(e) =>
                      setMarcas((list) =>
                        list.map((x, j) => (j === i ? { ...x, texto: e.target.value } : x)),
                      )
                    }
                    style={regInput}
                  />
                  <DeleteBtn onClick={() => setMarcas((list) => list.filter((_, j) => j !== i))} />
                </>
              ) : (
                <span style={{ flex: 1, color: 'var(--text)', fontSize: 13.5 }}>{m.texto}</span>
              )}
            </div>
          ))}
          {editMarcas ? (
            <button
              onClick={() => setMarcas((list) => [...list, { qtd: 0, texto: '' }])}
              style={{
                width: '100%',
                padding: 11,
                background: 'transparent',
                border: '1px dashed var(--line2)',
                color: 'var(--blue)',
                cursor: 'pointer',
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 9,
              }}
            >
              <span style={{ fontSize: 15, lineHeight: 1 }}>+</span>
              <span style={{ fontSize: 16, lineHeight: 1 }}>{tokens.emojis.aventureiro.Marca}</span>
            </button>
          ) : marcas.length === 0 ? (
            <span style={{ color: 'var(--muted)', fontSize: 13 }}>Nenhuma marca.</span>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export function PerfilTab({ doc }: { doc: VaultDoc }) {
  const [bioTab, setBioTab] = useState('identidade')
  const assets = useAssetIndex()
  const vw = useViewportWidth()
  const model = useHeroModel(doc, 'perfil')
  const fm = model.fm
  const rules = useHeroRules(fm)
  // NOME editável (#7): FM `nome` (overlay), senão basename — regra do plugin.
  const nome = str(fm['nome']) || heroNome(doc)
  const setNome = (v: string) => model.set('nome', v)
  // APELIDO — slot do design (linhas 145-148); fonte FM Biografia.Apelido,
  // editável com persistência no overlay (#2).
  const apelido = str(fmPath(fm, 'Biografia', 'Apelido'))
  const setApelido = (v: string) => model.set('Biografia.Apelido', v)
  const nivel = num(fm['Nível'])
  const ci = classeAventureiro(nivel)
  const classe = linkLabel(str(fm['Classe']))
  const sintonia = shortSintonia(fm['Sintonia'])
  const sintoniaIc = sintoniaEmojiFromValue(str(fm['Sintonia']))
  // Valor do FM mapeado pra opção do dropdown (opções vêm com alias curto —
  // match por target do wikilink, como o linkedDropdown do plugin).
  const sintoniaFmValue =
    rules?.sintonias.find((o) => wikiTarget(o.value) === wikiTarget(str(fm['Sintonia'])))?.value ??
    str(fm['Sintonia'])
  const portrait = creatureImageUrl(doc, assets)
  // portW do renderVals (2133): 200 abaixo de 560, senão 262.
  const portW = vw < 560 ? 200 : 262
  const index = Math.max(
    0,
    BIO_TABS.findIndex((t) => t.id === bioTab),
  )

  return (
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
      <div
        style={{
          textAlign: 'center',
          padding: 10,
          background: 'var(--panel)',
          border: '1px solid var(--line)',
          fontFamily: 'var(--mono)',
          fontSize: 12,
          letterSpacing: '.18em',
          color: 'var(--muted)',
          clipPath: clip(10),
        }}
      >
        AVENTUREIRO CLASSE {ci.classe}
      </div>

      <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', width: portW, height: portW, flex: 'none' }}>
          {portrait ? (
            <img
              src={portrait}
              alt=""
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                clipPath: 'polygon(0 0,100% 0,100% 88%,88% 100%,0 100%)',
                border: '1px solid var(--line2)',
              }}
            />
          ) : (
            <span
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--card)',
                border: '1px solid var(--line2)',
                clipPath: 'polygon(0 0,100% 0,100% 88%,88% 100%,0 100%)',
                fontFamily: 'var(--mono)',
                fontSize: 48,
                color: 'var(--muted)',
              }}
            >
              {initials(nome)}
            </span>
          )}
          <span
            style={{
              position: 'absolute',
              left: 0,
              bottom: 0,
              right: 0,
              height: 34,
              background: 'linear-gradient(180deg,transparent,rgba(8,10,14,.85))',
            }}
          />
          <span
            style={{
              position: 'absolute',
              right: 12,
              bottom: 16,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              background: 'var(--accent)',
              color: 'var(--ink)',
              fontFamily: 'var(--mono)',
              fontWeight: 700,
              fontSize: 14,
              clipPath: 'polygon(0 0,100% 0,100% 100%,7px 100%,0 calc(100% - 7px))',
            }}
          >
            NVL {nivel || '—'}
          </span>
        </div>

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="NOME">
            <input
              aria-label="Nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              style={{ ...boxStyle('13px 15px', 16), width: '100%', fontFamily: 'var(--body)' }}
            />
          </Field>
          {/* #2: mesma largura/estilo do NOME, editável e persistido. */}
          <Field label="APELIDO">
            <input
              aria-label="Apelido"
              value={apelido}
              onChange={(e) => setApelido(e.target.value)}
              style={{ ...boxStyle('13px 15px', 16), width: '100%', fontFamily: 'var(--body)' }}
            />
          </Field>
          {/* #7: SINTONIA como dropdown dos Traços Elementais reais —
              opções da projeção de regras (mesmas do Editável do plugin). */}
          <Field label="SINTONIA">
            <BoxSelect
              ariaLabel="Sintonia"
              display={
                <div style={boxStyle('13px 15px', 15, 'var(--blue)')}>
                  {sintoniaIc} {sintonia || '—'}
                </div>
              }
              options={withCurrent(
                [{ value: '', label: '—' }, ...(rules?.sintonias ?? [])],
                sintoniaFmValue,
                sintonia,
              )}
              value={sintoniaFmValue}
              onChange={(v) => model.set('Sintonia', v)}
              disabled={rules?.sintoniaRuleLocked}
            />
          </Field>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          padding: '15px 20px',
          background: 'var(--accent)',
          color: 'var(--ink)',
          fontWeight: 700,
          fontSize: 16,
          textAlign: 'center',
          clipPath: clip(15),
        }}
      >
        <span>{classe}</span>
      </div>

      <TabStrip tabs={BIO_TABS} active={bioTab} onSelect={setBioTab} pad="12px 20px" />
      <PanelTrack index={index}>
        <TrackPanel pad="4px 1px 2px">
          <IdentidadePanel doc={doc} />
        </TrackPanel>
        <TrackPanel pad="4px 1px 2px">
          <ExperienciaPanel doc={doc} />
        </TrackPanel>
      </PanelTrack>
    </div>
  )
}
