// VISUALIZADOR DE AVENTURA (#248, F4 do épico #243) — mostra um doc
// `type: Aventura` como a MESMA carta de bounty que o pleitost-views renderiza
// no Obsidian (título/rank/subcat/recompensa/objetivos/local), agora em página,
// mais os LOCAIS onde a aventura está disponível (FM.disponivel). A grade da
// folha Aventuras repete a carta. NADA de layout novo: reusa a BountyCard
// (espelho de render-bounty.ts) e a fence ```bounty``` registrada em FENCES.
//
// Fontes do bounty:
//   • aventura DA VAULT → o corpo tem ```bounty ...``` (data via parseBountyBlock)
//   • aventura LOCAL (#248, criada no Modo Mestre) → corpo vazio; os campos do
//     bounty vivem no FRONTMATTER (bountyDataFromFm). A meta (rank/subcat) sai
//     do FM nos dois casos (bountyMetaFromDoc).
//
// Registro: registerDocView({id:'aventura'}) + registerLeafView('Aventura').
import { Link } from 'react-router-dom'
import type { CSSProperties } from 'react'
import type { IndexDocEntry, VaultDoc } from '../../data/types'
import { useDocs } from '../../data/useDoc'
import { docPath } from '../../paths'
import { COMPENDIO_KICKER } from '../layout/design-nav'
import { BountyCard } from '../../markdown/bounty/BountyCard'
import { bountyMetaFromDoc } from '../../markdown/bounty/BountyFence'
import { BountyText } from '../../markdown/bounty/BountyText'
import { parseBountyBlock, type BountyData } from '../../markdown/bounty/parse-bounty'
import { bountyDataFromFm } from '../../markdown/bounty/bounty-fm'
import { AventuraForm } from '../mestre/AventuraForm'
import { registerDocView } from './doc-view-registry'
import { registerLeafView } from './leaf-view-registry'

export const AVENTURA_TYPE = 'Aventura'

export function isAventura(doc: VaultDoc): boolean {
  return doc.type === AVENTURA_TYPE
}

/** Extrai o source do 1º fence ```bounty``` do corpo (aventura da vault). */
function bountyFenceSource(body: string): string | null {
  const m = body.match(/```bounty\r?\n([\s\S]*?)```/)
  return m ? m[1] : null
}

/** BountyData do doc: fence do corpo (vault) OU frontmatter (aventura local). */
export function bountyDataForDoc(doc: VaultDoc): BountyData {
  const src = bountyFenceSource(doc.body)
  if (src != null) return parseBountyBlock(src)
  return bountyDataFromFm(doc.frontmatter)
}

/** Wikilinks de FM.disponivel (locais onde a aventura está disponível). */
function disponivelDe(doc: VaultDoc): string[] {
  const v = doc.frontmatter['disponivel']
  if (Array.isArray(v)) return v.map(String).filter((s) => s.trim())
  if (typeof v === 'string' && v.trim()) return [v]
  return []
}

const availStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: '3px 9px',
  fontSize: 12,
  background: 'var(--card)',
  border: '1px solid var(--line2)',
  borderRadius: 5,
}

// ─────────────────────────── página de uma Aventura ───────────────────────────

export function AventuraSheet({ doc }: { doc: VaultDoc }) {
  const data = bountyDataForDoc(doc)
  const meta = bountyMetaFromDoc(doc)
  const disponivel = disponivelDe(doc)
  return (
    <section className="page aventura-page">
      <div className="kicker">{COMPENDIO_KICKER}</div>
      <BountyCard data={data} meta={meta} />
      {disponivel.length ? (
        <div className="aventura-disponivel" style={{ marginTop: 16 }}>
          <div
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: '.08em',
              textTransform: 'uppercase',
              color: 'var(--muted)',
              marginBottom: 8,
            }}
          >
            Disponível em
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {disponivel.map((d, i) => (
              <span key={i} style={availStyle}>
                <span aria-hidden>📌</span>
                <BountyText text={d} />
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}

// ─────────────────────── grade de cartas de uma pasta ───────────────────────

export function AventuraGrid({ entries }: { entries: IndexDocEntry[] }) {
  const docs = useDocs(entries.map((e) => e.id))
  if (!entries.length) return null
  return (
    <div
      className="aventura-grid"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
        gap: 14,
      }}
    >
      {entries.map((entry) => {
        const doc = docs?.get(entry.id)
        return (
          <Link
            key={entry.id}
            to={docPath(entry.id)}
            className="aventura-grid-cell"
            style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
          >
            {doc ? (
              <BountyCard data={bountyDataForDoc(doc)} meta={bountyMetaFromDoc(doc)} />
            ) : (
              <span style={{ color: 'var(--muted)' }}>{entry.basename ?? entry.id}</span>
            )}
          </Link>
        )
      })}
    </div>
  )
}

// ─────────────────────────── registro (side-effect) ───────────────────────────

registerDocView({
  id: 'aventura',
  match: isAventura,
  view: (doc) => <AventuraSheet doc={doc} />,
})

// A folha Campanhas/Aventuras: grade de cartas de bounty (vault + locais), com
// o afixo de criação (mestre-gated) acima. O FolderView lê localKind/creator
// do registro — não conhece 'Aventura' por nome.
registerLeafView({
  type: AVENTURA_TYPE,
  view: (entries) => <AventuraGrid entries={entries} />,
  localKind: 'Aventura',
  creator: () => <AventuraForm />,
})
