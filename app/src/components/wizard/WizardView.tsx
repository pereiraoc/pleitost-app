// WIZARD DE CRIAÇÃO DE HERÓI (#452/#453) — casca do modo acompanhado da
// FichaPage: barra de progresso, corpo do passo atual e rodapé Voltar/Avançar.
//
// Navegação (design doc): SEQUENCIAL — avançar só com o passo completo
// (step.complete); voltar sempre livre (inclusive pelos chips da barra);
// passos invisíveis (step.visible) são pulados sem invalidar o ponteiro salvo
// (Wizard.passo indexa o registro FIXO). "Descartar criação" deleta o herói
// (removeLocalEntity → tombstone propaga) e volta pra lista.
//
// Os "mostra nos detalhes" de todos os passos usam o canal de Detalhes
// existente (useDetail) — a sidebar direita fica só com a face DETALHES
// enquanto o wizard está ativo (AppShell/RightSidebar).
import { useMemo, useRef } from 'react'
import { reskinText } from '../../data/reskin'
import { useNavigate } from 'react-router-dom'
import { removeLocalEntity } from '../../data/local-entities'
import { useHeroModel } from '../../data/useHeroModel'
import { useHeroRules } from '../../rules/useHeroRules'
import type { VaultDoc } from '../../data/types'
import type { HeroRefs } from '../ficha/useHeroRefs'
import { fmPath, str } from '../ficha/hero-model'
import { clip, useWheelScrollX } from '../ficha/bits'
import { wizardPasso } from './wizard-mode'
import { WIZARD_STEPS, type WizardCtx } from './steps'
import { ForcarDetalhesContext } from '../item-card'

export function WizardView({ doc, refs }: { doc: VaultDoc; refs: HeroRefs }) {
  const navigate = useNavigate()
  // r16: roda vertical do mouse rola as ABAS de progresso de lado (#334).
  const barraRef = useRef<HTMLDivElement>(null)
  useWheelScrollX(barraRef)
  const model = useHeroModel(doc, 'wizard')
  const rules = useHeroRules(model.fm)
  const ctx: WizardCtx = useMemo(
    () => ({ doc, fm: model.fm, model, rules, refs }),
    [doc, model, rules, refs],
  )

  // Índices (0-based) dos passos VISÍVEIS na ordem do registro.
  const visiveis = WIZARD_STEPS.map((s, i) => ({ s, i })).filter(
    ({ s }) => !s.visible || s.visible(ctx),
  )
  const salvo = wizardPasso(model.fm) - 1 // ponteiro salvo (0-based, registro fixo)
  // Passo atual = o salvo se visível; senão o PRÓXIMO visível (ex.: Magias
  // sumiu porque a classe mudou) — nunca trava num passo inexistente.
  const atualIdx =
    visiveis.find(({ i }) => i === salvo)?.i ??
    (visiveis.find(({ i }) => i > salvo)?.i ?? visiveis[visiveis.length - 1]!.i)
  const atual = WIZARD_STEPS[atualIdx]!
  const posAtual = visiveis.findIndex(({ i }) => i === atualIdx)
  const ehUltimo = posAtual === visiveis.length - 1
  const completo = atual.complete(ctx)

  const irPara = (regIdx: number) => model.set('Wizard.passo', regIdx + 1)
  const voltar = () => {
    if (posAtual > 0) irPara(visiveis[posAtual - 1]!.i)
  }
  const avancar = () => {
    if (!completo) return
    if (ehUltimo) {
      // Concluir: remove o marcador — a ficha volta à visualização padrão com
      // todas as edições (o JSON persistido descarta a chave undefined).
      model.set('Wizard', undefined)
      return
    }
    irPara(visiveis[posAtual + 1]!.i)
  }
  const descartar = () => {
    if (!window.confirm('Descartar a criação? O herói será apagado.')) return
    // #452 r15: o Companheiro Animal criado no passo dele morre junto —
    // senão fica órfão na lista de criaturas.
    const caId = str(fmPath(model.fm, 'Wizard', 'companheiroId'))
    if (caId) removeLocalEntity(caId)
    removeLocalEntity(doc.id)
    navigate('/herois', { replace: true })
  }

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Cabeçalho: título do modo + descartar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '.16em',
            color: 'var(--accent)',
          }}
        >
          {'// CRIAÇÃO DE HERÓI'}
        </span>
        <span style={{ flex: 1 }} />
        <button
          onClick={descartar}
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 10,
            letterSpacing: '.08em',
            color: 'var(--muted)',
            background: 'transparent',
            border: '1px solid var(--line2)',
            padding: '4px 10px',
            cursor: 'pointer',
            clipPath: clip(6),
          }}
        >
          ✕ Descartar criação
        </button>
      </div>

      {/* Barra de progresso — chips numerados; clicar VOLTA livre (nunca pula
          pra frente além do gate). */}
      <div ref={barraRef} className="tabs-scroll" style={{ display: 'flex', gap: 6, paddingBottom: 2 }}>
        {visiveis.map(({ s, i }, pos) => {
          const feito = pos < posAtual
          const ativo = i === atualIdx
          const clicavel = pos <= posAtual
          return (
            <button
              key={s.id}
              onClick={clicavel ? () => irPara(i) : undefined}
              aria-current={ativo ? 'step' : undefined}
              disabled={!clicavel}
              style={{
                flex: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 12px',
                fontFamily: 'var(--mono)',
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '.08em',
                whiteSpace: 'nowrap',
                cursor: clicavel ? 'pointer' : 'default',
                color: ativo ? 'var(--ink)' : feito ? 'var(--accent)' : 'var(--muted)',
                background: ativo
                  ? 'var(--accent)'
                  : feito
                    ? 'color-mix(in srgb,var(--accent) 12%,var(--card))'
                    : 'var(--card)',
                border: `1px solid ${ativo || feito ? 'color-mix(in srgb,var(--accent) 55%,var(--line2))' : 'var(--line2)'}`,
                clipPath: clip(6),
              }}
            >
              {/* r16: sem NÚMERO nos chips (ocupava espaço à toa) — só o ✓
                  dos passos feitos. */}
              {feito ? <span>✓</span> : null}
              <span>{reskinText(s.titulo).toUpperCase()}</span>
            </button>
          )
        })}
      </div>

      {/* Corpo do passo — TODO ItemHover aqui dentro abre os DETALHES no
          clique (#452: o wizard inteiro navega por detalhes). */}
      <ForcarDetalhesContext.Provider value={true}>
        <div key={atual.id}>
          <atual.Component ctx={ctx} />
        </div>
      </ForcarDetalhesContext.Provider>

      {/* Rodapé de navegação */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 6, borderTop: '1px solid var(--line)' }}>
        <button
          onClick={voltar}
          disabled={posAtual === 0}
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '.08em',
            padding: '9px 16px',
            background: 'var(--card)',
            border: '1px solid var(--line2)',
            color: posAtual === 0 ? 'var(--muted)' : 'var(--text)',
            cursor: posAtual === 0 ? 'default' : 'pointer',
            clipPath: clip(7),
            opacity: posAtual === 0 ? 0.5 : 1,
          }}
        >
          ← Voltar
        </button>
        <span style={{ flex: 1 }} />
        <button
          onClick={avancar}
          disabled={!completo}
          title={completo ? undefined : 'Complete este passo pra avançar'}
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: '.08em',
            padding: '9px 18px',
            background: completo ? 'var(--accent)' : 'var(--card)',
            border: `1px solid ${completo ? 'var(--accent)' : 'var(--line2)'}`,
            color: completo ? 'var(--ink)' : 'var(--muted)',
            cursor: completo ? 'pointer' : 'default',
            clipPath: clip(7),
          }}
        >
          {ehUltimo ? '✓ Concluir criação' : 'Avançar →'}
        </button>
      </div>
    </div>
  )
}
