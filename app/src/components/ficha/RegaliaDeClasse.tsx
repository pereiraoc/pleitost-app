// REGALIA DE CLASSE na ficha (2026-09-08) — o que a classe do herói ganha de
// TERCEIRO no custo de vida, em degraus de nível. A nota da vault
// (`recursos.regalias` do contexto) é a fonte; aqui só se lê e se mostra.
// Aparece em dois lugares: um resumo na BIOGRAFIA, logo abaixo do nome
// (rótulo CONTEXTO — o mundo é que dá a regalia), e a descrição inteira no
// topo do CUSTO DE VIDA. O controle é MANUAL: quem marca o eixo como "pago
// por" na aba RECURSOS é o jogador.
import { useMemo, type CSSProperties } from 'react'
import { useCatalog } from '../../data/CatalogContext'
import { useDoc } from '../../data/useDoc'
import { activeContextoDef } from '../../data/reskin'
import { MarkdownBody } from '../../markdown/MarkdownBody'
import { parseRegalias, regaliaDaClasse, type RegaliaDeClasse } from '../../recursos/regalias'
import type { VaultDoc } from '../../data/types'

const MONO: CSSProperties = { fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.16em', color: 'var(--muted)' }

/** Regalia da classe do herói (e o doc da nota, que o render usa como
 *  contexto do markdown). Null quando o mundo não tem regalias, a classe não
 *  está na nota, ou a nota ainda está carregando. */
export function useRegaliaDaClasse(classeFm: string): { regalia: RegaliaDeClasse; doc: VaultDoc } | null {
  const cfg = activeContextoDef()?.recursos
  const catalog = useCatalog()
  const nota = cfg?.regalias
  const id = useMemo(() => {
    if (!nota) return null
    const res = catalog.resolve(nota)
    return res.kind === 'doc' ? res.id : null
  }, [catalog, nota])
  const { doc } = useDoc(id ?? '')
  return useMemo(() => {
    if (!doc?.body || !classeFm) return null
    const regalia = regaliaDaClasse(parseRegalias(doc.body), classeFm)
    return regalia ? { regalia, doc } : null
  }, [doc, classeFm])
}

/** Um degrau: o nível, o título e o que se ganha (o preço escondido só no
 *  modo completo — na biografia ele polui). */
function Degrau({ d, doc, alcancado, completo }: { d: RegaliaDeClasse['degraus'][number]; doc: VaultDoc; alcancado: boolean; completo: boolean }) {
  return (
    <div
      data-regalia-degrau={d.nivel}
      data-alcancado={alcancado ? 'sim' : 'nao'}
      style={{
        display: 'flex',
        gap: 10,
        padding: '6px 0',
        borderTop: '1px solid var(--line)',
        opacity: alcancado ? 1 : 0.5,
      }}
    >
      <span style={{ ...MONO, minWidth: 42, color: alcancado ? 'var(--accent)' : 'var(--muted)' }}>NV {d.nivel}</span>
      <span style={{ minWidth: 0, fontSize: 13 }}>
        {d.titulo ? <b>{d.titulo}: </b> : null}
        <MarkdownBody doc={{ ...doc, body: d.texto }} />
        {completo && d.preco ? (
          <span style={{ display: 'block', marginTop: 2, fontSize: 12, color: 'var(--muted)' }}>
            <span style={MONO}>PREÇO </span>
            <MarkdownBody doc={{ ...doc, body: d.preco }} />
          </span>
        ) : null}
      </span>
    </div>
  )
}

/** Bloco da regalia. `completo` mostra a introdução e o preço escondido de
 *  cada degrau (custo de vida); sem ele, só a escada (biografia). */
export function RegaliaBloco({
  regalia,
  doc,
  nivel,
  completo = false,
}: {
  regalia: RegaliaDeClasse
  doc: VaultDoc
  /** Nível do herói: os degraus acima ficam esmaecidos. */
  nivel: number
  completo?: boolean
}) {
  return (
    <div data-regalia={regalia.classe}>
      <div style={{ fontSize: 13, marginBottom: 2 }}>
        <b>{regalia.nome}</b>
        {regalia.subtitulo ? <span style={{ color: 'var(--muted)' }}> · {regalia.subtitulo}</span> : null}
      </div>
      {completo && regalia.intro ? (
        <div style={{ fontSize: 13, color: 'var(--muted)', margin: '4px 0 6px' }}>
          <MarkdownBody doc={{ ...doc, body: regalia.intro }} />
        </div>
      ) : null}
      {regalia.degraus.map((d) => (
        <Degrau key={d.nivel} d={d} doc={doc} alcancado={nivel >= d.nivel} completo={completo} />
      ))}
    </div>
  )
}
