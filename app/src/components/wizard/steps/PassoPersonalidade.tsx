// PASSO 4 — PERSONALIDADE (#452 §4, issue #455).
//
// Ideais × Desprezos: MESMO NÚMERO (spec 4.1 — "mesmo número de ideais e
// desprezos"), editados lado a lado em pares.
// Qualidades ↔ Defeitos: LINKADOS (spec 4.4 — "a qualidade seja linkada ao
// defeito": Confiante/Orgulhoso, Honesto/Tapado) — uma LINHA = o par.
// Persistência: os 4 arrays de Biografia.* que a ficha já usa (ListaBio do
// PerfilTab lê os mesmos paths); o pareamento é POSICIONAL (índice i de
// Qualidades corresponde ao i de Defeitos) — nenhum campo novo no FM.
import { fmPath } from '../../ficha/hero-model'
import { tokens } from '../../ficha/registry'
import { clip } from '../../ficha/bits'
import { WizSecao, wizTitulo } from '../bits'
import type { WizardCtx } from '../steps'

function bioLista(fm: Record<string, unknown>, campo: string): string[] {
  const raw = fmPath(fm, 'Biografia', campo)
  return Array.isArray(raw) ? raw.map((x) => (typeof x === 'string' ? x : String(x ?? ''))) : []
}

/** Gate LIVRE (decisão do usuário): personalidade é opcional — dá pra pular e
 *  preencher depois na Biografia. O editor mantém o PAREAMENTO estrutural
 *  (ideal↔desprezo, qualidade↔defeito) pra quem preencher aqui. */
export function personalidadeCompleta(): boolean {
  return true
}

/** Editor de PARES posicionais (a[i] ↔ b[i]) sobre dois arrays da Biografia. */
function ParesEditor({
  ctx,
  campoA,
  campoB,
  labelA,
  labelB,
  ariaA,
  ariaB,
  placeholderA,
  placeholderB,
}: {
  ctx: WizardCtx
  campoA: string
  campoB: string
  labelA: string
  labelB: string
  /** aria-labels SEM emoji (acessibilidade/testes). */
  ariaA: string
  ariaB: string
  placeholderA: string
  placeholderB: string
}) {
  const { fm, model } = ctx
  const a = bioLista(fm, campoA)
  const b = bioLista(fm, campoB)
  const linhas = Math.max(a.length, b.length)
  const setCampo = (campo: string, lista: string[]) => model.set(`Biografia.${campo}`, lista)
  const setLinha = (campo: string, base: string[], i: number, v: string) => {
    const next = [...base]
    while (next.length <= i) next.push('')
    next[i] = v
    setCampo(campo, next)
  }
  const addPar = () => {
    setCampo(campoA, [...a, ''])
    setCampo(campoB, [...b, ''])
  }
  const removePar = (i: number) => {
    setCampo(campoA, a.filter((_, idx) => idx !== i))
    setCampo(campoB, b.filter((_, idx) => idx !== i))
  }
  const inputStyle = {
    flex: 1,
    minWidth: 0,
    padding: '8px 10px',
    background: 'var(--card)',
    border: '1px solid var(--line2)',
    color: 'var(--text)',
    fontFamily: 'inherit',
    fontSize: 13.5,
    outline: 'none',
    clipPath: clip(6),
  } as const
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <span style={{ ...wizTitulo, fontSize: 10, flex: 1 }}>{labelA.toUpperCase()}</span>
        <span style={{ ...wizTitulo, fontSize: 10, flex: 1 }}>{labelB.toUpperCase()}</span>
        <span style={{ width: 26 }} />
      </div>
      {Array.from({ length: linhas }, (_, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            aria-label={`${ariaA} ${i + 1}`}
            value={a[i] ?? ''}
            placeholder={placeholderA}
            onChange={(e) => setLinha(campoA, a, i, e.target.value)}
            style={inputStyle}
          />
          <span aria-hidden style={{ color: 'var(--muted)', fontSize: 12 }}>
            ↔
          </span>
          <input
            aria-label={`${ariaB} ${i + 1}`}
            value={b[i] ?? ''}
            placeholder={placeholderB}
            onChange={(e) => setLinha(campoB, b, i, e.target.value)}
            style={inputStyle}
          />
          <button
            aria-label={`Remover par ${i + 1}`}
            onClick={() => removePar(i)}
            style={{
              width: 26,
              border: 'none',
              background: 'none',
              color: 'var(--muted)',
              fontSize: 15,
              cursor: 'pointer',
            }}
          >
            ×
          </button>
        </div>
      ))}
      <button
        onClick={addPar}
        style={{
          alignSelf: 'flex-start',
          fontFamily: 'var(--mono)',
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '.08em',
          color: 'var(--accent)',
          background: 'transparent',
          border: '1px solid color-mix(in srgb,var(--accent) 45%,var(--line2))',
          padding: '5px 12px',
          cursor: 'pointer',
          clipPath: clip(6),
        }}
      >
        + Adicionar par
      </button>
    </div>
  )
}

export function PassoPersonalidade({ ctx }: { ctx: WizardCtx }) {
  const B = tokens.emojis.biografia
  return (
    <div>
      <WizSecao
        titulo="Ideais e Desprezos"
        nota="Em que o seu herói acredita — e o que ele não tolera? Preencha em pares: pra cada causa que ele defende, a contraparte que ele combate. Ex.: “Liberdade acima de tudo” ↔ “Tiranos e correntes”."
      >
        <ParesEditor
          ctx={ctx}
          campoA="Ideais"
          campoB="Desprezos"
          labelA={`${B.Ideais} Ideais`}
          labelB={`${B.Desprezos} Desprezos`}
          ariaA="Ideais"
          ariaB="Desprezos"
          placeholderA="Liberdade acima de tudo"
          placeholderB="Tiranos e correntes"
        />
      </WizSecao>
      <WizSecao
        titulo="Qualidades e Defeitos"
        nota="Como o seu herói se comporta? Pra cada traço que ele considera uma vantagem, o outro lado da mesma moeda que alguém poderia apontar. Ex.: “Confiante” ↔ “Orgulhoso”, “Honesto” ↔ “Tapado”."
      >
        <ParesEditor
          ctx={ctx}
          campoA="Qualidades"
          campoB="Defeitos"
          labelA={`${B.Qualidades} Qualidades`}
          labelB={`${B.Defeitos} Defeitos`}
          ariaA="Qualidades"
          ariaB="Defeitos"
          placeholderA="Confiante"
          placeholderB="Orgulhoso"
        />
      </WizSecao>
    </div>
  )
}
