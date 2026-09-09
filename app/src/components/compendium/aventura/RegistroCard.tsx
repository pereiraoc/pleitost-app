// CARD DE REGISTRO (Personagem/Local) do formato de aventura — leitura
// vertical (FieldBlock: label mono + prosa, padrão aprovado do Local/Org/
// Pessoa). Ordem: refs (Nota/Atlas/Entrada/Cenas como chips expansíveis) →
// campos-núcleo na ordem do registro → extras na ordem da nota → Frases em
// balões → 🔊 leituras → segredos [!gm].
import { useEffect, useState } from 'react'
import type { VaultDoc } from '../../../data/types'
import { MarkdownBody } from '../../../markdown/MarkdownBody'
import { InlineFieldValue } from '../InlineFieldValue'
import { FieldBlock } from '../FieldBlock'
import type { AventuraModel, Registro } from '../../../aventura/types'
import { campo, itensDe, refsDe } from '../../../aventura/parse-aventura'
import { CAMPOS_REF, LOCAL_NUCLEO, PERSONAGEM_FRASES, PERSONAGEM_NUCLEO, ordenarCampos } from '../../../aventura/registros'
import { FiguraStrip } from './FiguraStrip'
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
  aberto,
}: {
  reg: Registro
  tipo: 'personagem' | 'local'
  model: AventuraModel
  doc: VaultDoc
  /** Dentro de um chip expandido: sem o heading grande, sempre aberto. */
  embedded?: boolean
  /** Abre o card (ex.: clique no marker do mapa). */
  aberto?: boolean
}) {
  const [open, setOpen] = useState(!!aberto)
  useEffect(() => {
    if (aberto) setOpen(true)
  }, [aberto])
  const nucleo = tipo === 'personagem' ? PERSONAGEM_NUCLEO : LOCAL_NUCLEO
  const omitir = new Set<string>([...CAMPOS_REF, PERSONAGEM_FRASES.toLowerCase()])
  const campos = ordenarCampos(reg.campos, nucleo, omitir)
  const frases = tipo === 'personagem' ? itensDe(campo(reg.campos, PERSONAGEM_FRASES)) : []
  const hint = tipo === 'personagem' ? campo(reg.campos, 'Papel') : campo(reg.campos, 'Atlas')
  const conteudo = (
    <>
      <FiguraStrip figuras={reg.figuras} />
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
    </>
  )
  if (embedded) {
    return (
      <article className={`av-registro is-${tipo} is-embedded`} data-av-registro={reg.nome}>
        {conteudo}
      </article>
    )
  }
  // Colapsado por padrão (pedido 2026-09-07: facilitar a navegação) — <details>
  // nativo, mesma linguagem dos cards do Contexto Atual; o conteúdo fica no DOM.
  return (
    <details
      className={`av-registro is-${tipo} ctx-acc`}
      id={`av-reg-${reg.slug}`}
      data-av-registro={reg.nome}
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="ctx-acc-head av-registro-head">
        <span className="ctx-acc-title">{reg.nome}</span>
        {hint ? <span className="ctx-acc-assunto"><InlineFieldValue value={hint} /></span> : null}
      </summary>
      <div className="av-registro-body">{conteudo}</div>
    </details>
  )
}
