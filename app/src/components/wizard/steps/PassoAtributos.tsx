// PASSO 5 — ATRIBUTOS (#452 §5, #456; feedback r2 #463 itens 10-11).
//
// A distribuição usa o PAINEL REAL da ficha (AtributosPanel de COMPETÊNCIAS —
// 4 dropdowns em cascata 3/2/1/0, restrição de Principal dos elementos de
// regra, swap determinístico e re-derive das armas Precisas). O herói novo já
// NASCE com a distribuição default do skeleton — mesma lógica de hoje.
//
// Abaixo, os CARDS do que cada atributo representa (legenda data-driven dos
// docs de `subcategoria: Atributo` da vault — "Contribui com:"), na ORDEM das
// seleções da esquerda pra direita (3 → 0).
//
// Preview (item 11): VIDA em cima + defesas/resistências/sentidos/movimento no
// idioma da aba COMBATE (cards emoji/rótulo/valor preenchendo a horizontal) —
// derivados via memberStats sobre o FM derivado, já ambientando o jogador.
import { useMemo } from 'react'
import { useCatalog } from '../../../data/CatalogContext'
import { useDetail } from '../../../data/detail-context'
import { useDocs } from '../../../data/useDoc'
import { ATRIBUTOS, type AtributoId } from '../../../rules/rules-model'
import { memberStats, fmtPlain, fmtSigned } from '../../../grupo/stats'
import { ATTR_EMOJI, defesaEmoji, tokens } from '../../ficha/registry'
import { AtributosPanel } from '../../ficha/HabilidadesTab'
import { fmPath, num, str } from '../../ficha/hero-model'
import { clip } from '../../ficha/bits'
import { WizSecao } from '../bits'
import type { WizardCtx } from '../steps'

function valores(fm: Record<string, unknown>): Record<AtributoId, number> {
  const at = (fm['Atributos'] ?? {}) as Record<string, unknown>
  return { FOR: num(at['FOR']), AGI: num(at['AGI']), INT: num(at['INT']), PRE: num(at['PRE']) }
}

/** Gate: 3/2/1/0 distribuídos (um de cada) + Principal = o atributo de valor 3
 *  e permitido pela restrição de regra. O default do skeleton já satisfaz; o
 *  painel da ficha só permite swaps válidos — o gate é a rede de segurança
 *  (ex.: classe trocada com restrição nova enquanto a projeção resolve). */
export function atributosCompletos(ctx: WizardCtx): boolean {
  // Valida sobre o DERIVADO (o swap de Principal por regra roda ao vivo).
  const fm = (ctx.rules?.derivedFm ?? ctx.fm) as Record<string, unknown>
  const v = valores(fm)
  const sorted = [...ATRIBUTOS.map((a) => v[a])].sort((x, y) => x - y)
  if (sorted.join(',') !== '0,1,2,3') return false
  const principal = str(fmPath(fm, 'Atributos', 'Principal')) as AtributoId | ''
  if (!principal || v[principal as AtributoId] !== 3) return false
  const allowed = ctx.rules?.principalAllowed ?? null
  return allowed === null || allowed.includes(principal as AtributoId)
}

/** Legenda do corpo do doc: bullets após "Contribui com:" com wikilinks
 *  reduzidos ao rótulo ("[[A|B]]" → B; "[[A]]" → A). */
function legendaDoCorpo(body: string): string {
  const depois = body.split(/contribui com:/i)[1]
  if (!depois) return ''
  const bullets: string[] = []
  for (const linha of depois.split('\n')) {
    const m = /^\s*[*-]\s+(.*)$/.exec(linha)
    if (!m) {
      if (bullets.length) break // fim da lista
      continue
    }
    bullets.push(m[1]!.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2').replace(/\[\[([^\]]+)\]\]/g, '$1'))
  }
  return bullets.join(' · ')
}

/** Sigla (FOR/AGI/INT/PRE) do doc de Atributo via FM `alias`. */
function siglaDoAlias(alias: unknown): AtributoId | null {
  const texto = Array.isArray(alias) ? alias.join(',') : str(alias)
  for (const sigla of ATRIBUTOS) {
    if (new RegExp(`(^|[,\\s])${sigla}([,\\s)]|$)`).test(texto)) return sigla
  }
  return null
}

/** Card de stat derivado no idioma da aba COMBATE (emoji + rótulo mono +
 *  valor grande, centralizado). */
function CombateCard({ ic, nome, valor, largo }: { ic: string; nome: string; valor: string; largo?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        padding: '12px 10px',
        background: 'var(--panel)',
        border: '1px solid var(--line)',
        clipPath: clip(10),
        ...(largo ? { gridColumn: 'span 2' } : null),
      }}
    >
      <span style={{ fontSize: 18 }}>{ic}</span>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.1em', color: 'var(--muted)' }}>
        {nome.toUpperCase()}
      </span>
      <span style={{ fontSize: 17, fontWeight: 700 }}>{valor}</span>
    </div>
  )
}

export function PassoAtributos({ ctx }: { ctx: WizardCtx }) {
  const { doc, fm, rules } = ctx
  const detail = useDetail()
  const catalog = useCatalog()
  const derivado = (rules?.derivedFm ?? fm) as Record<string, unknown>
  const v = valores(derivado)

  // Docs de Atributo da vault (legenda + detalhes) — mapeados pela sigla do alias.
  const attrEntryIds = useMemo(
    () => catalog.content.filter((e) => e.subtype === 'Atributo').map((e) => e.id),
    [catalog],
  )
  const attrDocs = useDocs(attrEntryIds)
  const porSigla = useMemo(() => {
    const out = new Map<AtributoId, { id: string; nome: string; legenda: string }>()
    for (const id of attrEntryIds) {
      const d = attrDocs?.get(id)
      if (!d) continue
      const sigla = siglaDoAlias((d.frontmatter as Record<string, unknown>)['alias'])
      if (sigla) out.set(sigla, { id, nome: d.basename ?? id, legenda: legendaDoCorpo(d.body ?? '') })
    }
    return out
  }, [attrDocs, attrEntryIds])

  // Ordem dos cards = ordem das seleções da esquerda pra direita (3 → 0).
  const ordenados = [...ATRIBUTOS].sort((a, b) => v[b] - v[a])

  return (
    <div>
      <WizSecao
        titulo="Atributos"
        pendente={!atributosCompletos(ctx)}
        nota="Distribua 3 · 2 · 1 · 0 nos quatro atributos — o da esquerda (3) é o seu atributo-chave; a classe pode restringir quem pode ocupá-lo. Os cards embaixo mostram no que cada atributo contribui (toque pra abrir a regra)."
      >
        {/* O painel REAL da ficha (4 dropdowns em cascata + Principal). */}
        <AtributosPanel doc={doc} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 8 }}>
          {ordenados.map((a) => {
            const info = porSigla.get(a)
            return (
              <button
                key={a}
                onClick={info ? () => detail?.open({ kind: 'doc', id: info.id }) : undefined}
                style={{
                  textAlign: 'left',
                  padding: '10px 12px',
                  background: 'var(--card)',
                  border: '1px solid var(--line2)',
                  color: 'var(--text)',
                  fontFamily: 'inherit',
                  cursor: info ? 'pointer' : 'default',
                  clipPath: clip(8),
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 14 }}>
                  <span>{ATTR_EMOJI[a] ?? ''}</span>
                  <span>{info?.nome ?? a}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 15, marginLeft: 'auto', color: 'var(--accent)' }}>
                    {v[a]}
                  </span>
                </span>
                {info?.legenda ? (
                  <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)', marginTop: 5, lineHeight: 1.45 }}>
                    {info.legenda}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      </WizSecao>

      <PreviewCombate
        derivado={derivado}
        titulo="Como seu herói se defende"
        nota="Derivado na hora da sua distribuição e das proficiências da classe — é assim que aparece na aba Combate."
      />
    </div>
  )
}

/** Preview no idioma do COMBATE — vida (EV/EH) + defesas/resistências +
 *  sentidos/movimento do memberStats sobre o FM DERIVADO. Compartilhado entre
 *  o passo de Atributos do herói e o passo do Companheiro Animal (#452 r15). */
export function PreviewCombate({
  derivado,
  titulo,
  nota,
}: {
  derivado: Record<string, unknown>
  titulo: string
  nota?: string
}) {
  const stats = memberStats(derivado)
  return (
      <WizSecao
        titulo={titulo}
        nota={nota}
      >
        {/* VIDA em cima (EV/EM), como a barra do Combate. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 8 }}>
          <CombateCard
            ic={(tokens.emojis.subcategoria as Record<string, string>)['Vitalidade'] ?? ''}
            nome="Energia Vital"
            valor={String(stats.v ?? '—')}
          />
          <CombateCard
            ic={(tokens.emojis.subcategoria as Record<string, string>)['Moral'] ?? ''}
            nome="Energia Heroica"
            valor={String(stats.m ?? '—')}
          />
        </div>
        {/* Como no COMBATE: defesas/resistências num BLOCO e Percepção/
            Intuição/Movimento noutro — sem espaço, o segundo bloco quebra
            INTEIRO pra linha de baixo (não card por card). */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <div
            style={{
              flex: '99 1 340px',
              display: 'grid',
              gridTemplateColumns: 'repeat(4,minmax(0,1fr))',
              gap: 8,
            }}
          >
            {Object.entries(stats.defs).map(([nome, valor]) => (
              <CombateCard key={nome} ic={defesaEmoji(nome)} nome={nome} valor={valor != null ? fmtPlain(valor) : '—'} />
            ))}
          </div>
          <div
            style={{
              flex: '1 1 250px',
              display: 'grid',
              gridTemplateColumns: 'repeat(3,minmax(0,1fr))',
              gap: 8,
            }}
          >
            {Object.entries(stats.sns).map(([nome, valor]) => (
              <CombateCard key={nome} ic={defesaEmoji(nome)} nome={nome} valor={valor != null ? fmtSigned(valor) : '—'} />
            ))}
            <CombateCard
              ic={(tokens.emojis.subcategoria as Record<string, string>)['Movimento'] ?? ''}
              nome="Movimento"
              valor={stats.sp != null ? fmtPlain(stats.sp) : '—'}
            />
          </div>
        </div>
      </WizSecao>
  )
}
