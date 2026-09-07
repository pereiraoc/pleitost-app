// CARD DE COMBATE (2.5 Combates): campos do registro (Cena → rola até ela;
// Quando/Inimigos/Velocidades/Função/Elementos como FieldBlock) + 🔊 +
// segredos + o BLOCO DE COMBATE (roster com as velocidades da nota,
// dificuldade, PREPARAR, adicionar à sessão/ao combate ativo). A cena que
// referencia o combate mostra este mesmo card (embedded).
import type { VaultDoc } from '../../../data/types'
import { reskinName } from '../../../data/reskin'
import { MarkdownBody } from '../../../markdown/MarkdownBody'
import { CombatMarkerBlock } from '../../../mestre/CombatMarkerBlock'
import { InlineFieldValue } from '../InlineFieldValue'
import { FieldBlock } from '../FieldBlock'
import type { AventuraModel, Combate } from '../../../aventura/types'
import { campo, refsDe } from '../../../aventura/parse-aventura'
import { CAMPOS_REF, COMBATE_NUCLEO, ordenarCampos } from '../../../aventura/registros'
import { LeituraBlock, SegredoBlock } from './LeituraBlock'
import { RefRow } from './RefChip'

export function CombateCard({
  combate,
  model,
  doc,
  embedded,
}: {
  combate: Combate
  model: AventuraModel
  doc: VaultDoc
  /** Dentro de uma cena: sem o heading grande, sem a ref pra cena. */
  embedded?: boolean
}) {
  const campos = ordenarCampos(combate.campos, COMBATE_NUCLEO, new Set(CAMPOS_REF))
  return (
    <article className={`av-combate-reg${embedded ? ' is-embedded' : ''}`} id={`av-comb-${combate.slug}`} data-av-combate-reg={combate.nome}>
      {embedded ? <div className="kicker">{`// ⚔ ${combate.nome}`}</div> : <h3 className="av-registro-nome">⚔ {combate.nome}</h3>}
      {embedded ? null : <RefRow label="Cena" refs={refsDe(campo(combate.campos, 'Cena'))} model={model} doc={doc} />}
      {campos.map((c) => (
        <FieldBlock key={c.label} label={c.label}>
          {c.value.includes('\n') ? <MarkdownBody doc={{ ...doc, body: c.value }} /> : <InlineFieldValue value={c.value} />}
        </FieldBlock>
      ))}
      {combate.leituras.map((l, i) => (
        <LeituraBlock key={i} leitura={l} doc={doc} />
      ))}
      {combate.segredos.map((s, i) => (
        <SegredoBlock key={i} segredo={s} doc={doc} />
      ))}
      {combate.corpo ? <MarkdownBody doc={{ ...doc, body: combate.corpo }} /> : null}
      {combate.roster.entries.length ? (
        <div className="av-combate" data-av-combate={combate.slug}>
          <CombatMarkerBlock
            code={combate.code}
            roster={combate.roster}
            encounterPath={combate.encounterPath}
            nome={`${reskinName(doc.basename)} · ${combate.nome}`}
          />
        </div>
      ) : (
        <p className="ctx-acc-vazio">Sem roster (fence combat-marker) neste combate.</p>
      )}
    </article>
  )
}
