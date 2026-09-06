// CARD DE REGISTRO (Personagem/Local) do formato de aventura — leitura
// vertical (FieldBlock: label mono + prosa, padrão aprovado do Local/Org/
// Pessoa). Ordem: refs (Nota/Atlas/Entrada/Cenas como chips expansíveis) →
// campos-núcleo na ordem do registro → extras na ordem da nota → Frases em
// balões → 🔊 leituras → segredos [!gm].
import type { VaultDoc } from '../../../data/types'
import { MarkdownBody } from '../../../markdown/MarkdownBody'
import { InlineFieldValue } from '../InlineFieldValue'
import { FieldBlock } from '../FieldBlock'
import type { AventuraModel, Registro } from '../../../aventura/types'
import { campo, itensDe, refsDe } from '../../../aventura/parse-aventura'
import { CAMPOS_REF, LOCAL_NUCLEO, PERSONAGEM_FRASES, PERSONAGEM_NUCLEO, ordenarCampos } from '../../../aventura/registros'
import { LeituraBlock, SegredoBlock } from './LeituraBlock'
import { RefRow } from './RefChip'

const REF_LABELS: Record<'personagem' | 'local', string[]> = {
  personagem: ['Nota', 'Entrada'],
  local: ['Atlas', 'Cenas'],
}

export function RegistroCard({
  reg,
  tipo,
  model,
  doc,
  embedded,
}: {
  reg: Registro
  tipo: 'personagem' | 'local'
  model: AventuraModel
  doc: VaultDoc
  /** Dentro de um chip expandido: sem o heading grande. */
  embedded?: boolean
}) {
  const nucleo = tipo === 'personagem' ? PERSONAGEM_NUCLEO : LOCAL_NUCLEO
  const omitir = new Set<string>([...CAMPOS_REF, PERSONAGEM_FRASES.toLowerCase()])
  const campos = ordenarCampos(reg.campos, nucleo, omitir)
  const frases = tipo === 'personagem' ? itensDe(campo(reg.campos, PERSONAGEM_FRASES)) : []
  return (
    <article className={`av-registro is-${tipo}${embedded ? ' is-embedded' : ''}`} id={`av-reg-${reg.slug}`} data-av-registro={reg.nome}>
      {embedded ? null : <h3 className="av-registro-nome">{reg.nome}</h3>}
      {REF_LABELS[tipo].map((label) => (
        <RefRow key={label} label={label} refs={refsDe(campo(reg.campos, label))} model={model} doc={doc} />
      ))}
      {campos.map((c) => (
        <FieldBlock key={c.label} label={c.label}>
          {c.value.includes('\n') ? <MarkdownBody doc={{ ...doc, body: c.value }} /> : <InlineFieldValue value={c.value} />}
        </FieldBlock>
      ))}
      {frases.length ? (
        <section className="local-field local-field-col av-frases" data-av-frases="">
          <span className="local-field-label">FRASES</span>
          <ul className="av-frases-lista">
            {frases.map((f, i) => (
              <li key={i} className="av-frase">
                <MarkdownBody doc={{ ...doc, body: f }} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {reg.leituras.map((l, i) => (
        <LeituraBlock key={i} leitura={l} doc={doc} />
      ))}
      {reg.segredos.map((s, i) => (
        <SegredoBlock key={i} segredo={s} doc={doc} />
      ))}
      {reg.corpo ? <MarkdownBody doc={{ ...doc, body: reg.corpo }} /> : null}
    </article>
  )
}
