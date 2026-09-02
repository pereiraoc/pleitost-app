// VISUALIZADOR de Criação de Personagem por SUBTIPO (#246, F2 do épico #243).
// Magia / Técnica / Habilidade / Classe / Sintonia — cada um com identidade
// visual distinta (ícone/cor/campos do registro criacao-subtipos.ts), o
// resumo em destaque, a imagem (se houver) e o corpo, com os elementos de
// regra no fim (mestre). Registrado no barrel; não toca o DocView.
import type { CSSProperties } from 'react'
import type { VaultDoc } from '../../data/types'
import { useAssetIndex } from '../../data/assets'
import { worldClassHeroTarget } from '../../data/creature-image'
import { reskinName, reskinText } from '../../data/reskin'
import { MarkdownBody } from '../../markdown/MarkdownBody'
import { InlineFieldValue } from './InlineFieldValue'
import { VaultImage } from './VaultImage'
import { DocRuleElements } from './RuleElements'
import { compendioKicker } from '../layout/design-nav'
import { CRIACAO_SUBTIPOS, isCriacaoSubtipo, type SubtipoCriacao } from './criacao-subtipos'

export function isCriacao(doc: VaultDoc): boolean {
  return isCriacaoSubtipo(doc.type)
}

/** Valor de um campo-chave: procura no FM e nos inline fields (o extractor
 *  guarda os dois; ex.: escola no FM da magia, rank no inline da técnica). */
function campoValor(doc: VaultDoc, keys: string[]): string | null {
  const fm = doc.frontmatter as Record<string, unknown>
  const inl = doc.inlineFields as Record<string, string> | undefined
  for (const k of keys) {
    const v = fm[k] ?? inl?.[k]
    if (v != null && String(v).trim() !== '') return String(v)
  }
  return null
}

export function CriacaoView({
  doc,
  sidebar,
  embedded,
}: {
  doc: VaultDoc
  sidebar?: boolean
  embedded?: boolean
}) {
  // dispatch por `match: isCriacao` garante que doc.type é chave do registro
  const sub: SubtipoCriacao = CRIACAO_SUBTIPOS[doc.type as string]!
  const assets = useAssetIndex()
  const fmHero = doc.images.find((img) => img.from.startsWith('frontmatter:'))
  // #519: nota de Classe no mundo com arte própria mostra a arte do MUNDO —
  // o FM Imagem aponta pra arte da fantasia (Sistema/ é compartilhado).
  const worldHero = worldClassHeroTarget(doc, assets)
  const hero = worldHero ? { target: worldHero } : fmHero
  const resumo = (doc.inlineFields as Record<string, string> | undefined)?.['resumo']
  const chips = sub.campos
    .map((c) => ({ label: c.label, value: campoValor(doc, c.keys) }))
    .filter((c) => c.value)

  const headerStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    borderLeft: `4px solid ${sub.cor}`,
    paddingLeft: 14,
  }

  return (
    <article className={embedded ? 'doc-page' : 'doc-page page'}>
      {sidebar || embedded ? null : <div className="kicker">{compendioKicker(doc.type)}</div>}
      {/* Feedback do mestre: a imagem FLUTUA no canto direito e o texto envolve
          ela. O .doc-page é FLEX-column (float é ignorado num flex item), então
          o conteúdo vai num bloco flow-root (.criacao-body) onde o float vale. */}
      <div className="criacao-body">
      {/* Feedback do usuário (r6): SEM espaço pro retrato ao lado do NOME
          (container estreito — sidebar/celular), a imagem desce pra altura do
          ATRIBUTO-CHAVE. Mesma imagem em duas âncoras de float; o container
          query (.criacao-body) mostra uma por vez. */}
      {hero ? <VaultImage target={hero.target} className="criacao-hero criacao-hero--wide" zoom /> : null}
      <header style={headerStyle}>
        <span style={{ fontSize: '2rem', lineHeight: 1, flex: 'none' }} aria-hidden>
          {sub.icon}
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <h1 style={{ margin: 0 }}>{reskinName(doc.basename)}</h1>
          {/* #301: só na CLASSE o kicker mostra apenas a FAMÍLIA (subtype, ex.
              "Marcialista") — o nome da classe já é o h1. Nos demais (Magia ·
              Arcana, Técnica · Adepta) o "Tipo · Subtipo" segue informativo. */}
          <span className="doc-type" style={{ color: sub.cor, fontWeight: 700, letterSpacing: '.06em' }}>
            {reskinText(
              doc.type === 'Classe' && doc.subtype
                ? doc.subtype
                : `${doc.type}${doc.subtype ? ` · ${doc.subtype}` : ''}`,
            )}
          </span>
        </div>
      </header>

      {hero ? (
        <VaultImage target={hero.target} className="criacao-hero criacao-hero--narrow" zoom />
      ) : null}

      {chips.length ? (
        <div className="criacao-chips">
          {chips.map((c) => (
            <span key={c.label} className="criacao-chip">
              <span className="criacao-chip-k">{c.label}</span>
              <span className="criacao-chip-v" style={{ color: sub.cor }}>
                <InlineFieldValue value={c.value!} />
              </span>
            </span>
          ))}
        </div>
      ) : null}

      {resumo ? (
        <p className="criacao-resumo">
          <InlineFieldValue value={resumo} />
        </p>
      ) : null}

      {/* heroTarget: o embed da mesma imagem no corpo é suprimido (não duplica).
          Sempre o slot do FM — com hero do mundo por cima, o embed da arte de
          fantasia no corpo também é redundante. */}
      <MarkdownBody doc={doc} hideLeadingTitle heroTarget={fmHero?.target} />
      </div>

      <DocRuleElements doc={doc} />
    </article>
  )
}
