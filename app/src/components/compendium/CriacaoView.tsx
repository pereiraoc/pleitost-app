// VISUALIZADOR de Criação de Personagem por SUBTIPO (#246, F2 do épico #243).
// Magia / Técnica / Habilidade / Classe / Sintonia — cada um com identidade
// visual distinta (ícone/cor/campos do registro criacao-subtipos.ts), o
// resumo em destaque, a imagem (se houver) e o corpo, com os elementos de
// regra no fim (mestre). Registrado no barrel; não toca o DocView.
import type { CSSProperties } from 'react'
import type { VaultDoc } from '../../data/types'
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
  const hero = doc.images.find((img) => img.from.startsWith('frontmatter:'))
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

  // Layout ESPECÍFICO da CLASSE (feedback do usuário — a imagem flutuada
  // sobrepunha o NOME, porque o header é flex e flex ignora float): o nome
  // ocupa a largura inteira; abaixo, uma FILEIRA com [família + chip
  // empilhado] à esquerda e a imagem QUADRADA à direita, esticada do topo da
  // família até a base do atributo-chave (altura da fileira = lado do
  // quadrado, homogêneo porque o chip quebra linha entre rótulo e valor).
  const ehClasse = doc.type === 'Classe'

  const chipsEl = chips.length ? (
    <div className="criacao-chips">
      {chips.map((c) => (
        <span key={c.label} className={ehClasse ? 'criacao-chip criacao-chip--stack' : 'criacao-chip'}>
          <span className="criacao-chip-k">{c.label}</span>
          <span className="criacao-chip-v" style={{ color: sub.cor }}>
            <InlineFieldValue value={c.value!} />
          </span>
        </span>
      ))}
    </div>
  ) : null

  const subtitulo = (
    <span className="doc-type" style={{ color: sub.cor, fontWeight: 700, letterSpacing: '.06em' }}>
      {ehClasse && doc.subtype
        ? doc.subtype
        : `${doc.type}${doc.subtype ? ` · ${doc.subtype}` : ''}`}
    </span>
  )

  return (
    <article className={embedded ? 'doc-page' : 'doc-page page'}>
      {sidebar || embedded ? null : <div className="kicker">{compendioKicker(doc.type)}</div>}
      {/* Feedback do mestre: a imagem FLUTUA no canto direito e o texto envolve
          ela. O .doc-page é FLEX-column (float é ignorado num flex item), então
          o conteúdo vai num bloco flow-root (.criacao-body) onde o float vale. */}
      <div className="criacao-body">
      {hero && !ehClasse ? <VaultImage target={hero.target} className="criacao-hero" zoom /> : null}
      <header style={headerStyle}>
        <span style={{ fontSize: '2rem', lineHeight: 1, flex: 'none' }} aria-hidden>
          {sub.icon}
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <h1 style={{ margin: 0 }}>{doc.basename}</h1>
          {/* #301: só na CLASSE o kicker mostra apenas a FAMÍLIA (subtype, ex.
              "Marcialista") — o nome da classe já é o h1 (na fileira abaixo).
              Nos demais (Magia · Arcana) o "Tipo · Subtipo" segue aqui. */}
          {ehClasse ? null : subtitulo}
        </div>
      </header>

      {ehClasse ? (
        <div className="classe-header-row">
          <div className="classe-header-info">
            {subtitulo}
            {chipsEl}
          </div>
          {hero ? (
            <span className="classe-hero-box">
              <VaultImage target={hero.target} className="classe-hero-img" zoom />
            </span>
          ) : null}
        </div>
      ) : (
        chipsEl
      )}

      {resumo ? (
        <p className="criacao-resumo">
          <InlineFieldValue value={resumo} />
        </p>
      ) : null}

      {/* heroTarget: o embed da mesma imagem no corpo é suprimido (não duplica). */}
      <MarkdownBody doc={doc} hideLeadingTitle heroTarget={hero?.target} />
      </div>

      <DocRuleElements doc={doc} />
    </article>
  )
}
