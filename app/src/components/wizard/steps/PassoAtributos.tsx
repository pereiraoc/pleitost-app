// PASSO 5 — ATRIBUTOS (#452 §5, issue #456).
//
// LEGENDA data-driven: os docs de `subcategoria: Atributo` da vault (Força/
// Agilidade/Inteligência/Presença) são a fonte — a sigla vem do FM `alias`
// ("FOR, Força (FOR)") e a lista "Contribui com:" do corpo vira a legenda.
// Nada de strings inventadas no call-site (regra da casa).
//
// DISTRIBUIÇÃO 3/2/1/0 em três perguntas (spec 5.1–5.3): atributo CHAVE (3 —
// vira `Atributos.Principal`, FILTRADO por `rules.principalAllowed`, a
// restrição `Escolher Atributos.Principal ...` dos elementos de regra),
// SECUNDÁRIO (2) e depois quem fica com 1 (o restante recebe 0).
//
// 5.4: preview imediato de defesas/resistências/sentidos/movimento — reusa o
// `memberStats` (grupo/stats), a MESMA projeção de fórmulas usada no resto do
// app, sobre o FM DERIVADO (proficiências da classe já cascateadas).
import { useMemo } from 'react'
import { useCatalog } from '../../../data/CatalogContext'
import { useDetail } from '../../../data/detail-context'
import { useDocs } from '../../../data/useDoc'
import { ATRIBUTOS, type AtributoId } from '../../../rules/rules-model'
import { memberStats, fmtPlain, fmtSigned } from '../../../grupo/stats'
import { ATTR_EMOJI } from '../../ficha/registry'
import { fmPath, num, str } from '../../ficha/hero-model'
import { clip } from '../../ficha/bits'
import { WizSecao, wizTitulo } from '../bits'
import type { WizardCtx } from '../steps'

function valores(fm: Record<string, unknown>): Record<AtributoId, number> {
  const at = (fm['Atributos'] ?? {}) as Record<string, unknown>
  return { FOR: num(at['FOR']), AGI: num(at['AGI']), INT: num(at['INT']), PRE: num(at['PRE']) }
}

/** Gate: 3/2/1/0 distribuídos (um de cada) + Principal = o atributo de valor 3
 *  e permitido pela restrição de regra (revalida se a classe mudou). */
export function atributosCompletos(ctx: WizardCtx): boolean {
  const v = valores(ctx.fm)
  const sorted = [...ATRIBUTOS.map((a) => v[a])].sort((x, y) => x - y)
  if (sorted.join(',') !== '0,1,2,3') return false
  const principal = str(fmPath(ctx.fm, 'Atributos', 'Principal')) as AtributoId | ''
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

function EscolhaAttr({
  pergunta,
  opcoes,
  atual,
  onPick,
  extra,
}: {
  pergunta: string
  opcoes: AtributoId[]
  atual: AtributoId | null
  onPick: (a: AtributoId) => void
  extra?: (a: AtributoId) => string | null
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ ...wizTitulo, fontSize: 10 }}>{pergunta.toUpperCase()}</span>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {ATRIBUTOS.map((a) => {
          const habil = opcoes.includes(a)
          const on = atual === a
          const nota = extra?.(a) ?? null
          return (
            <button
              key={a}
              onClick={habil ? () => onPick(a) : undefined}
              disabled={!habil}
              aria-pressed={on}
              title={nota ?? undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontFamily: 'var(--mono)',
                fontSize: 12,
                fontWeight: 700,
                padding: '8px 14px',
                color: on ? 'var(--ink)' : habil ? 'var(--text)' : 'var(--muted)',
                background: on ? 'var(--accent)' : 'var(--card)',
                border: `1px solid ${on ? 'var(--accent)' : 'var(--line2)'}`,
                cursor: habil ? 'pointer' : 'default',
                opacity: habil ? 1 : 0.45,
                clipPath: clip(6),
              }}
            >
              <span>{ATTR_EMOJI[a] ?? ''}</span>
              <span>{a}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function PassoAtributos({ ctx }: { ctx: WizardCtx }) {
  const { fm, model, rules } = ctx
  const detail = useDetail()
  const catalog = useCatalog()
  const v = valores(fm)
  const principal = str(fmPath(fm, 'Atributos', 'Principal')) as AtributoId | ''
  const allowed = rules?.principalAllowed ?? null

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

  // Escolhas derivadas dos VALORES salvos (o FM é a única fonte de estado).
  const chave = (ATRIBUTOS.find((a) => v[a] === 3 && principal === a) ?? null) as AtributoId | null
  const secundario = (ATRIBUTOS.find((a) => v[a] === 2) ?? null) as AtributoId | null
  const terciario = (ATRIBUTOS.find((a) => v[a] === 1) ?? null) as AtributoId | null

  /** Regrava a distribuição inteira a partir das três escolhas (determinístico:
   *  não-escolhidos = 0; escolha posterior incompatível é descartada). */
  const aplicar = (novoChave: AtributoId | null, novoSec: AtributoId | null, novoTer: AtributoId | null) => {
    const sec = novoSec === novoChave ? null : novoSec
    const ter = novoTer === novoChave || novoTer === sec ? null : novoTer
    const next: Record<string, unknown> = { FOR: 0, AGI: 0, INT: 0, PRE: 0 }
    if (novoChave) next[novoChave] = 3
    if (sec) next[sec] = 2
    if (ter) next[ter] = 1
    next['Principal'] = novoChave ?? ''
    model.set('Atributos', next)
  }

  // 5.4 — preview com o FM derivado (classe cascateada) — recalcula na hora.
  const stats = memberStats((rules?.derivedFm ?? fm) as Record<string, unknown>)

  return (
    <div>
      <WizSecao
        titulo="Atributos"
        nota="Clique no nome de um atributo pra abrir a regra completa nos detalhes."
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 8 }}>
          {ATRIBUTOS.map((a) => {
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
                {/* Legenda: no que o atributo contribui (corpo do doc da vault). */}
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

      <WizSecao titulo="Distribua 3 · 2 · 1 · 0">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <EscolhaAttr
            pergunta="Selecione seu atributo CHAVE (3)"
            opcoes={(allowed ?? ATRIBUTOS) as AtributoId[]}
            atual={chave}
            onPick={(a) => aplicar(a, secundario, terciario)}
            extra={(a) =>
              allowed && !allowed.includes(a) ? 'A sua classe restringe o atributo chave' : null
            }
          />
          <EscolhaAttr
            pergunta="Selecione seu atributo SECUNDÁRIO (2)"
            opcoes={ATRIBUTOS.filter((a) => a !== chave)}
            atual={secundario}
            onPick={(a) => aplicar(chave, a, terciario)}
          />
          <EscolhaAttr
            pergunta="Quem fica com 1? (o restante fica com 0)"
            opcoes={ATRIBUTOS.filter((a) => a !== chave && a !== secundario)}
            atual={terciario}
            onPick={(a) => aplicar(chave, secundario, a)}
          />
        </div>
      </WizSecao>

      <WizSecao
        titulo="Defesas · Resistências · Sentidos · Movimento"
        nota="Derivados na hora da sua distribuição (e das proficiências da classe)."
      >
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {Object.entries(stats.defs).map(([nome, valor]) => (
            <span key={nome} style={{ padding: '8px 12px', background: 'var(--card)', border: '1px solid var(--line2)', clipPath: clip(6), fontSize: 13 }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.08em', color: 'var(--muted)', display: 'block' }}>
                {nome.toUpperCase()}
              </span>
              <strong>{valor != null ? fmtPlain(valor) : '—'}</strong>
            </span>
          ))}
          {Object.entries(stats.sns).map(([nome, valor]) => (
            <span key={nome} style={{ padding: '8px 12px', background: 'var(--card)', border: '1px solid var(--line2)', clipPath: clip(6), fontSize: 13 }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.08em', color: 'var(--muted)', display: 'block' }}>
                {nome.toUpperCase()}
              </span>
              <strong>{valor != null ? fmtSigned(valor) : '—'}</strong>
            </span>
          ))}
          <span style={{ padding: '8px 12px', background: 'var(--card)', border: '1px solid var(--line2)', clipPath: clip(6), fontSize: 13 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.08em', color: 'var(--muted)', display: 'block' }}>
              MOVIMENTO
            </span>
            <strong>{stats.sp != null ? fmtPlain(stats.sp) : '—'}</strong>
          </span>
        </div>
      </WizSecao>
    </div>
  )
}
