// CENA do formato de aventura: cabeçalho (nº, título, tipo, atual), campos
// (Local/Personagens como chips expansíveis; Objetivo/Duração/extras como
// FieldBlock) e o corpo em segmentos — markdown normal + cada fence de combate
// como o bloco de combate (roster/dificuldade/PREPARAR/+ INICIATIVA), chaveado
// por `<docId>#<cena>#<n>` (prep por monstro e sourceNotePath do encounter).
import type { VaultDoc } from '../../../data/types'
import { reskinName } from '../../../data/reskin'
import { MarkdownBody } from '../../../markdown/MarkdownBody'
import { CombatMarkerBlock } from '../../../mestre/CombatMarkerBlock'
import { InlineFieldValue } from '../InlineFieldValue'
import { FieldBlock } from '../FieldBlock'
import type { AventuraModel, Cena } from '../../../aventura/types'
import { CAMPOS_REF, CENA_NUCLEO, ordenarCampos } from '../../../aventura/registros'
import { RefRow, cenaAnchorId } from './RefChip'

export function CenaBlock({
  cena,
  model,
  doc,
  aberta,
  onToggle,
  atual,
  onMarcarAtual,
}: {
  cena: Cena
  model: AventuraModel
  doc: VaultDoc
  aberta: boolean
  onToggle: () => void
  /** É a cena atual da sessão (state.aventura.cenaAtual). */
  atual: boolean
  /** Mestre com sessão viva: marca esta cena como a atual. */
  onMarcarAtual?: () => void
}) {
  const campos = ordenarCampos(cena.campos, CENA_NUCLEO, new Set([...CAMPOS_REF, 'tipo']))
  const nomeBase = reskinName(doc.basename)
  return (
    <section className={`av-cena${aberta ? ' is-aberta' : ''}${atual ? ' is-atual' : ''}`} id={cenaAnchorId(cena.slug)} data-av-cena={cena.n}>
      <header className="av-cena-head">
        <button type="button" className="av-cena-toggle" aria-expanded={aberta} onClick={onToggle}>
          <span className="av-cena-n">{cena.n}</span>
          <span className="av-cena-titulo">{cena.titulo}</span>
          {cena.tipo ? <span className="av-chip is-tipo">{cena.tipo}</span> : null}
          {atual ? <span className="av-chip is-atual">▶ cena atual</span> : null}
        </button>
        {onMarcarAtual && !atual ? (
          <button type="button" className="av-btn-mini" onClick={onMarcarAtual} title="Marcar como cena atual da sessão">
            marcar atual
          </button>
        ) : null}
      </header>
      {aberta ? (
        <div className="av-cena-body">
          <RefRow label="Local" refs={cena.locais} model={model} doc={doc} />
          <RefRow label="Personagens" refs={cena.personagens} model={model} doc={doc} />
          {campos.map((c) => (
            <FieldBlock key={c.label} label={c.label}>
              {c.value.includes('\n') ? <MarkdownBody doc={{ ...doc, body: c.value }} /> : <InlineFieldValue value={c.value} />}
            </FieldBlock>
          ))}
          {cena.segmentos.map((s, i) =>
            s.kind === 'md' ? (
              <MarkdownBody key={i} doc={{ ...doc, body: s.md }} />
            ) : (
              <div key={i} className="av-combate" data-av-combate={s.n}>
                <div className="kicker">{`// ⚔ ${s.titulo || `Combate ${s.n}`}`}</div>
                <CombatMarkerBlock
                  code={s.code}
                  roster={s.roster}
                  encounterPath={s.encounterPath}
                  nome={`${nomeBase} · Cena ${cena.n} · ${s.titulo || `Combate ${s.n}`}`}
                />
              </div>
            ),
          )}
        </div>
      ) : null}
    </section>
  )
}
