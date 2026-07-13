// Ficha RESUMO na sidebar DETALHES (#180) — visão compacta do personagem,
// espelho do modo Resumo do pleitost-autosheet: cabeçalho (retrato/nome/
// classe/nível), vida (vit/moral/temp do volátil REAL), chips de defesas/
// sentidos/movimento (memberStats — mesma fonte da tabela do GRUPO) e listas
// compactas de habilidades/técnicas/magias. Somente leitura.
import { useMemo, type CSSProperties } from 'react'
import type { VaultDoc } from '../../data/types'
import { useDoc } from '../../data/useDoc'
import { synthDocFromCharacter, useLiveSession } from '../../data/session-repo/live-session'
import { useAssetIndex } from '../../data/assets'
import { creatureImageUrl } from '../../data/creature-image'
import { linkLabel } from '../../markdown/dataview-value'
import { fmPath, listaEntries, num, str } from '../ficha/hero-model'
import { useVidaLocal } from '../ficha/pop-panels'
import { fmtPlain, fmtSigned, memberStats } from '../../grupo/stats'
import { magiaGroups } from '../ficha/CombateTab'

const mono = (extra: CSSProperties = {}): CSSProperties => ({ fontFamily: 'var(--mono)', ...extra })

const CHIPS: Array<{ ic: string; n: string; v: (s: ReturnType<typeof memberStats>) => string }> = [
  { ic: '🛡️', n: 'DEF', v: (s) => (s.defs['Defesa'] != null ? fmtPlain(s.defs['Defesa']) : '—') },
  { ic: '🔥', n: 'ÍMP', v: (s) => (s.defs['Ímpeto'] != null ? fmtPlain(s.defs['Ímpeto']) : '—') },
  { ic: '❤️', n: 'VIG', v: (s) => (s.defs['Vigor'] != null ? fmtPlain(s.defs['Vigor']) : '—') },
  { ic: '⚡', n: 'REF', v: (s) => (s.defs['Reflexo'] != null ? fmtPlain(s.defs['Reflexo']) : '—') },
  { ic: '👁️', n: 'PER', v: (s) => (s.sns['Percepção'] != null ? fmtSigned(s.sns['Percepção']) : '—') },
  { ic: '💡', n: 'ITU', v: (s) => (s.sns['Intuição'] != null ? fmtSigned(s.sns['Intuição']) : '—') },
  { ic: '👟', n: 'MOV', v: (s) => (s.sp != null ? `${fmtPlain(s.sp)}m` : '—') },
]

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <div style={mono({ fontSize: 9.5, letterSpacing: '.14em', color: 'var(--muted)' })}>{label}</div>
      {children}
    </div>
  )
}

function ResumoBody({ doc }: { doc: VaultDoc }) {
  const assets = useAssetIndex()
  const vida = useVidaLocal(doc, 'resumo')
  const stats = memberStats(doc.frontmatter)
  const fm = doc.frontmatter as Record<string, unknown>
  const portrait = creatureImageUrl(doc, assets)
  const classe = linkLabel(str(fm['Classe']))
  const nivel = num(fm['Nível'])
  const tier = fm['Tier']

  const habs = listaEntries(fmPath(fm, 'Habilidades', 'Lista')).map((e) => e.label)
  const tecs = listaEntries(fmPath(fm, 'Tecnicas', 'Lista')).map((e) => e.label)
  const grupos = useMemo(() => magiaGroups(fm, () => undefined), [fm])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '4px 2px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {portrait ? (
          <div
            style={{
              width: 52,
              height: 52,
              flex: 'none',
              backgroundImage: `url("${portrait}")`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              border: '1px solid var(--line2)',
              clipPath: 'polygon(0 0,calc(100% - 10px) 0,100% 10px,100% 100%,10px 100%,0 calc(100% - 10px))',
            }}
          />
        ) : null}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{doc.basename}</div>
          <div style={mono({ fontSize: 10.5, color: 'var(--muted)', marginTop: 2 })}>
            {[classe, nivel ? `Nível ${nivel}` : tier != null && tier !== '' ? `Tier ${tier}` : '']
              .filter(Boolean)
              .join(' · ')}
          </div>
        </div>
      </div>

      <Section label="// VIDA">
        <div style={mono({ fontSize: 12, color: 'var(--text)' })}>
          {`❤️ ${vida.vit}/${vida.vitMax} · 💙 ${vida.moral}/${vida.moralMax}${vida.temp > 0 ? ` · 💚 +${vida.temp}` : ''}`}
        </div>
      </Section>

      <Section label="// DEFESAS · SENTIDOS · MOVIMENTO">
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {CHIPS.map((c) => (
            <span
              key={c.n}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '3px 7px',
                background: 'var(--panel)',
                border: '1px solid var(--line2)',
              }}
            >
              <span style={{ fontSize: 10 }}>{c.ic}</span>
              <span style={mono({ fontSize: 8.5, letterSpacing: '.06em', color: 'var(--muted)' })}>{c.n}</span>
              <span style={mono({ fontSize: 10.5, fontWeight: 700 })}>{c.v(stats)}</span>
            </span>
          ))}
        </div>
      </Section>

      {habs.length ? (
        <Section label="// HABILIDADES">
          <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--text)' }}>{habs.join(' · ')}</div>
        </Section>
      ) : null}
      {tecs.length ? (
        <Section label="// TÉCNICAS">
          <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--text)' }}>{tecs.join(' · ')}</div>
        </Section>
      ) : null}
      {grupos.length ? (
        <Section label="// MAGIAS">
          {grupos.map((g) => (
            <div key={g.titulo} style={{ fontSize: 12, lineHeight: 1.6 }}>
              <span style={mono({ fontSize: 9, letterSpacing: '.1em', color: g.cor })}>{g.titulo}</span>{' '}
              {g.magias.map((m) => m.n).join(' · ')}
            </div>
          ))}
        </Section>
      ) : null}
    </div>
  )
}

export function ResumoDetail({ id }: { id: string }) {
  const { doc } = useDoc(id)
  if (!doc) return <div className="loading">Carregando resumo…</div>
  return <ResumoBody doc={doc} />
}

/** Resumo de personagem REMOTO da sala (#186): doc sintético do fmBlob +
 *  vida do state (live-session) — mesmo corpo do resumo local. */
export function ResumoSessaoDetail({ charId }: { charId: string }) {
  const live = useLiveSession()
  const c = live?.characters.find((x) => x.id === charId) ?? null
  if (!c) return <div className="detail-empty">Personagem fora da sala.</div>
  return <ResumoBody doc={synthDocFromCharacter(c)} />
}
