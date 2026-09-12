// Aba BESTIÁRIO de uma Localização (2026-09-12, pedido do mestre) — o que se
// encontra AQUI, no mesmo desenho da aba Serviços: a criatura declara onde
// aparece (FM `Bairros` → faceta `bairros` do índice) e o lugar herda dos
// ancestrais, então um ponto de interesse mostra o bestiário do bairro e o que
// vale pra cidade aparece em todo lugar dela. Só no MODO MESTRE: é informação
// de quem conduz, não de quem joga.
//
// Abaixo das criaturas, os ENCONTROS prontos (`categoria: Combate`) cujo campo
// `Onde` cita este lugar ou um ancestral — dali o mestre abre o registro com o
// roster e a barra de dificuldade.
import { useMemo, type CSSProperties } from 'react'
import type { IndexDocEntry, VaultDoc } from '../../data/types'
import { useCatalog } from '../../data/CatalogContext'
import { useDocs } from '../../data/useDoc'
import { reskinName, reskinText } from '../../data/reskin'
import { DetailLink } from '../DetailLink'
import { clip } from '../ficha/bits'
import { useAtlasRelations } from './AtlasNav'
import { criaturasEm, escoposDoLugar } from '../../mestre/bestiario-local'
import { situacaoDe } from '../../mestre/encontro-meta'

const MONO: CSSProperties = { fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.12em', color: 'var(--muted)' }
const BOX: CSSProperties = { padding: '10px 16px', background: 'var(--panel)', border: '1px solid var(--line2)', clipPath: clip(12) }

const RANK = ['C', 'B', 'A', 'S']

function tierDe(e: IndexDocEntry, docs: Map<string, VaultDoc> | undefined): number {
  const t = docs?.get(e.id)?.frontmatter?.['Tier']
  return typeof t === 'number' ? t : 0
}

function descricaoDe(e: IndexDocEntry, docs: Map<string, VaultDoc> | undefined): string {
  const d = docs?.get(e.id)?.frontmatter?.['Descrição']
  return typeof d === 'string' ? d : ''
}

function classeDe(e: IndexDocEntry, docs: Map<string, VaultDoc> | undefined): string {
  const c = docs?.get(e.id)?.frontmatter?.['Classe']
  if (typeof c !== 'string') return ''
  const m = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/.exec(c)
  return reskinText(m ? (m[2] ?? m[1]!) : c)
}

export function BestiarioTab({ doc }: { doc: VaultDoc }) {
  const catalog = useCatalog()
  const rel = useAtlasRelations(doc)
  const nome = doc.basename ?? doc.id.split('/').pop() ?? doc.id
  const escopos = useMemo(
    () => escoposDoLugar(nome, rel.crumbs.map((c) => c.basename)),
    [nome, rel.crumbs],
  )

  const criaturas = useMemo(
    () => criaturasEm(catalog.docsByType.get('Criatura') ?? [], escopos),
    [catalog, escopos],
  )
  const docsCriaturas = useDocs(useMemo(() => criaturas.map((c) => c.id), [criaturas]))

  // Encontros prontos daqui: o FM `Onde` do Combate cita este lugar ou um
  // ancestral (o campo é texto com wikilinks, então basta conter o nome).
  const idsCombate = useMemo(() => (catalog.docsByType.get('Combate') ?? []).map((e) => e.id), [catalog])
  const docsCombate = useDocs(idsCombate)
  const combatesAqui = useMemo(() => {
    const alvo = [...new Set(escopos)]
    return (catalog.docsByType.get('Combate') ?? []).filter((e) => {
      const onde = String(docsCombate?.get(e.id)?.frontmatter?.['Onde'] ?? '')
      return alvo.some((x) => onde.includes(x))
    })
  }, [catalog, docsCombate, escopos])

  const porTier = useMemo(() => {
    const m = new Map<number, IndexDocEntry[]>()
    for (const c of criaturas) {
      const t = tierDe(c, docsCriaturas)
      m.set(t, [...(m.get(t) ?? []), c])
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0])
  }, [criaturas, docsCriaturas])

  if (criaturas.length === 0) {
    return <p style={{ ...MONO, padding: '12px 0' }}>{'// NENHUMA CRIATURA MAPEADA AQUI'}</p>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }} data-bestiario-local={nome}>
      <div style={{ ...BOX, display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ ...MONO, color: 'var(--text)' }}>{'// O QUE SE ENCONTRA AQUI'}</span>
        <span style={{ flex: 1 }} />
        <span style={MONO}>{criaturas.length} CRIATURAS</span>
      </div>

      {porTier.map(([tier, lista]) => (
        <div key={tier} style={BOX}>
          <div style={{ ...MONO, marginBottom: 8 }}>
            TIER {tier} · RANK {RANK[tier] ?? '?'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {lista.map((c) => (
              <div
                key={c.id}
                data-criatura={c.basename}
                style={{
                  display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 10,
                  alignItems: 'start', padding: '8px 0', borderTop: '1px solid var(--line)',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <DetailLink to={c.id}>{reskinName(c.basename ?? c.id)}</DetailLink>
                  {descricaoDe(c, docsCriaturas) ? (
                    <div style={{ fontSize: 11, lineHeight: 1.35, color: 'var(--muted)', marginTop: 2 }}>
                      {reskinText(descricaoDe(c, docsCriaturas))}
                    </div>
                  ) : null}
                </div>
                <span style={{ ...MONO, fontSize: 10, whiteSpace: 'nowrap' }}>{classeDe(c, docsCriaturas)}</span>
              </div>
            ))}
          </div>
        </div>
      ))}

      {combatesAqui.length ? (
        <div style={BOX}>
          <div style={{ ...MONO, marginBottom: 8 }}>ENCONTROS PRONTOS</div>
          {combatesAqui.map((e) => (
            <div key={e.id} data-encontro={e.basename} style={{ padding: '6px 0', borderTop: '1px solid var(--line)' }}>
              <DetailLink to={e.id}>{reskinName(e.basename ?? e.id)}</DetailLink>
              {/* Descrição breve do encontro (FM `Situação`): o mestre escolhe
                  pelo que acontece, não pelo nome. */}
              {situacaoDe(docsCombate?.get(e.id)) ? (
                <div style={{ fontSize: 11, lineHeight: 1.35, color: 'var(--muted)', marginTop: 2 }}>
                  {reskinText(situacaoDe(docsCombate?.get(e.id)))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
