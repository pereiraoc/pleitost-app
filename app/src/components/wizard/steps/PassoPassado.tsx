// PASSO 3 — PASSADO (#452 §3, issue #455).
//
// 3.1 Naturalidade: seletor da árvore do Atlas (rules.naturalidadeLines — a
//     MESMA fonte do PerfilTab, com modo "Outro" texto-livre) + PREVIEW do
//     mapa-múndi com ZOOM no hex do local (mapa oficial `mapa:mundo`:
//     cell.localId → atlasHexCenter → atlas.webp transformado). Local sem hex
//     (ou "Outro") → sem mapa, só a nota nos Detalhes.
// 3.2–3.4.1 Contexto/perícia adepta/Ofício×Atuação/complemento: reusa o
//     PassadoBox INTEIRO — é a mecânica canônica desses writes (picks de
//     regra + Incrementos), idêntica à da Biografia. Zero duplicação.
// 3.5–3.9 Motivação, Gênero (M/F/Outro), Idade, Altura, Peso → Biografia.*.
import { useMemo, useState } from 'react'
import { useDetail } from '../../../data/detail-context'
import { useCatalog } from '../../../data/CatalogContext'
import { useAssetIndex, assetUrl, resolveAsset } from '../../../data/assets'
import { useHexMap } from '../../../data/useHexMap'
import { MAPA_MUNDO_ID } from '../../../data/seed-hexmaps'
import { atlasHexCenter, ATLAS_MAPA_ASSET } from '../../../map/atlas-grid'
import { NATURALIDADE_OUTRO } from '../../../rules/naturalidade'
import { fmPath, str } from '../../ficha/hero-model'
import { tokens } from '../../ficha/registry'
import { PassadoBox } from '../../ficha/PerfilTab'
import { clip } from '../../ficha/bits'
import { docIdOf, WizCampo, WizPills, WizSecao, wizTitulo } from '../bits'
import type { WizardCtx } from '../steps'

const bioStr = (fm: Record<string, unknown>, campo: string): string =>
  str(fmPath(fm, 'Biografia', campo)).trim()

/** Valor CRU pro input CONTROLADO — sem trim: o bioStr trimava o value e
 *  engolia o espaço recém-digitado no fim do texto (bug "não aceita espaço").
 *  O trim fica só nos gates/pendências. */
const bioRaw = (fm: Record<string, unknown>, campo: string): string =>
  str(fmPath(fm, 'Biografia', campo))

/** Gate: naturalidade + contexto do passado + perícia + ofício. Motivação/
 *  gênero/idade/altura/peso são OPCIONAIS (decisão do usuário) — dá pra
 *  preencher depois na Biografia. */
export function passadoCompleto(ctx: WizardCtx): boolean {
  const { fm, rules } = ctx
  if (!rules) return false
  return (
    bioStr(fm, 'Naturalidade') !== '' &&
    bioStr(fm, 'Passado') !== '' &&
    !!rules.passadoPericiaPick &&
    !!rules.passadoOficioPick
  )
}

/** Preview do mapa-múndi com zoom no hex do LOCAL escolhido (spec 3.1). */
function MapaNaturalidade({ docId }: { docId: string }) {
  const assets = useAssetIndex()
  const hexMap = useHexMap(MAPA_MUNDO_ID)
  const alvo = useMemo(() => {
    // Lugar pontual (cell.localId) tem prioridade; área (region) cai no
    // centróide das células — cobre naturalidades que são regiões inteiras.
    const pontual = hexMap.cells.find((c) => c.localId === docId)
    if (pontual) return atlasHexCenter(pontual.col, pontual.row)
    const area = hexMap.cells.filter((c) => c.areaIds?.includes(docId))
    if (!area.length) return null
    const soma = area.reduce(
      (acc, c) => {
        const p = atlasHexCenter(c.col, c.row)
        return { x: acc.x + p.x, y: acc.y + p.y }
      },
      { x: 0, y: 0 },
    )
    return { x: soma.x / area.length, y: soma.y / area.length }
  }, [hexMap.cells, docId])
  const entry = assets ? resolveAsset(assets, ATLAS_MAPA_ASSET) : null
  if (!alvo || !entry) return null
  // Viewport fixo com a fonte (7440×5262) em escala ~0.9 — mostra o entorno
  // (~6 hexes de largura) com o local no centro.
  const ESCALA = 0.9
  return (
    <div
      data-wizard-mapa=""
      style={{
        position: 'relative',
        width: '100%',
        height: 260,
        overflow: 'hidden',
        border: '1px solid var(--line2)',
        clipPath: clip(10),
        background: 'var(--panel2)',
      }}
    >
      <img
        src={assetUrl(entry)}
        alt="Mapa — local de nascimento"
        draggable={false}
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: `translate(${-alvo.x * ESCALA}px, ${-alvo.y * ESCALA}px) scale(${ESCALA})`,
          transformOrigin: '0 0',
          maxWidth: 'none',
        }}
      />
      {/* Marcador do local no centro do viewport */}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%,-50%)',
          fontSize: 26,
          filter: 'drop-shadow(0 2px 4px rgba(0,0,0,.6))',
        }}
      >
        📍
      </span>
    </div>
  )
}

export function PassoPassado({ ctx }: { ctx: WizardCtx }) {
  const { doc, fm, model, rules } = ctx
  const detail = useDetail()
  const catalog = useCatalog()

  // — Naturalidade (mesmos modos do PerfilTab: wikilink do Atlas ou "Outro") —
  const natRaw = str(fmPath(fm, 'Biografia', 'Naturalidade'))
  const natIsLink = /^\[\[[^\]]+\]\]$/.test(natRaw.trim())
  const natIsOutro = !natIsLink && natRaw.trim().length > 0
  const [outroMode, setOutroMode] = useState(false)
  const natDocId = useMemo(
    () => (natIsLink ? docIdOf(catalog, natRaw) : null),
    [catalog, natRaw, natIsLink],
  )
  const onNaturalidade = (v: string) => {
    if (v === NATURALIDADE_OUTRO) {
      setOutroMode(true)
      return
    }
    setOutroMode(false)
    model.set('Biografia.Naturalidade', v)
    const id = docIdOf(catalog, v)
    if (id) detail?.open({ kind: 'doc', id }) // a nota do local ao lado
  }

  return (
    <div>
      <WizSecao
        titulo="Onde você nasceu?"
        pendente={bioStr(fm, 'Naturalidade') === ''}
        nota="Todo herói vem de algum lugar. Escolha o local no Atlas: o mapa foca no ponto e a nota do lugar abre nos detalhes — se o seu canto não estiver lá, use “Outro” e descreva."
      >
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5, width: '100%' }}>
          <span style={{ ...wizTitulo, fontSize: 10 }}>
            {tokens.emojis.biografia.Naturalidade} NATURALIDADE
          </span>
          <select
            aria-label="Naturalidade"
            value={outroMode || natIsOutro ? NATURALIDADE_OUTRO : natRaw.trim()}
            onChange={(e) => onNaturalidade(e.target.value)}
            style={{
              padding: '9px 12px',
              background: 'var(--card)',
              border: '1px solid var(--line2)',
              color: 'var(--text)',
              fontFamily: 'inherit',
              fontSize: 14,
              outline: 'none',
              clipPath: clip(7),
            }}
          >
            {/* naturalidadeLines JÁ traz "—" e "Outro (texto livre)" no topo
                (naturalidadeSelectLines) — nada de opções extras aqui. */}
            {(rules?.naturalidadeLines ?? []).map((l, i) => (
              <option key={i} value={l.value ?? `__header_${i}`} disabled={l.disabled}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        {outroMode || natIsOutro ? (
          <WizCampo
            label="Descreva o local"
            value={natIsOutro ? natRaw : ''}
            onChange={(v) => model.set('Biografia.Naturalidade', v)}
            placeholder="Vilarejo sem nome nas Colinas…"
          />
        ) : null}
        {natDocId ? <MapaNaturalidade docId={natDocId} /> : null}
      </WizSecao>

      <WizSecao
        titulo="Qual seu contexto do passado?"
        pendente={
          bioStr(fm, 'Passado') === '' || !rules?.passadoPericiaPick || !rules?.passadoOficioPick
        }
        nota="O que você era antes da aventura? O contexto te dá uma perícia adepta e diz como você trabalhava (Ofício ou Atuação)."
      >
        {/* Mecânica canônica de Passado/perícia/ofício/complemento (Biografia). */}
        <PassadoBox doc={doc} origem="wizard" />
      </WizSecao>

      {/* #461 item 6: motivação + gênero numa linha; idade/altura/peso na de
          baixo — tudo ocupando a horizontal. Sem asterisco = opcional. */}
      <WizSecao titulo="Quem é esse aventureiro?">
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 12, alignItems: 'end' }}>
          <WizCampo
            label={`${tokens.emojis.biografia.Motivacao} Por que você decidiu virar aventureiro?`}
            value={bioRaw(fm, 'Motivacao')}
            onChange={(v) => model.set('Biografia.Motivacao', v)}
            placeholder="Fugir do passado, fama, uma dívida…"
          />
          <WizPills
            label={`${tokens.emojis.biografia.Genero} Gênero`}
            options={['M', 'F', 'Outro']}
            value={bioStr(fm, 'Genero')}
            onChange={(v) => model.set('Biografia.Genero', v)}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 12 }}>
          <WizCampo
            label={`${tokens.emojis.biografia.Idade} Idade`}
            value={bioRaw(fm, 'Idade')}
            onChange={(v) => model.set('Biografia.Idade', v)}
          />
          <WizCampo
            label={`${tokens.emojis.biografia.Altura} Altura`}
            value={bioRaw(fm, 'Altura')}
            onChange={(v) => model.set('Biografia.Altura', v)}
          />
          <WizCampo
            label={`${tokens.emojis.biografia.Peso} Peso`}
            value={bioRaw(fm, 'Peso')}
            onChange={(v) => model.set('Biografia.Peso', v)}
          />
        </div>
      </WizSecao>
    </div>
  )
}
