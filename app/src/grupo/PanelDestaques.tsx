// Painel "DESTAQUES" (aba PERÍCIAS) — markup/estilos VERBATIM do design
// (Companion App.dc.html, linhas 1206-1252): perícias por atributo à
// esquerda, PROF. EQUIPAMENTO + MAGIAS à direita. Dados espelham o plugin
// (section-pericia / section-equip-prof / section-magias); emojis e cores
// de proficiência vêm do registro central (tokens.emojis.* /
// tokens.colors.rank — espelho do EMOJI/PALETTE do plugin).
import type { ReactNode } from 'react'
import type { IndexDocEntry, VaultDoc } from '../data/types'
import { tokens } from '../generated/tokens'
import { equipCards, magiaHighlights, skillHighlights, type SkillTop } from './destaques'
import { fmtSigned } from './stats'
import { sectionTitleStyle } from './panel-ui'

const CARD_CLIP = 'polygon(0 0,calc(100% - 7px) 0,100% 7px,100% 100%,7px 100%,0 calc(100% - 7px))'

/** Cor da proficiência — registro central tokens.colors.rank (PALETTE.rank). */
const rankColor = (prof: string): string =>
  (tokens.colors.rank as Record<string, string>)[prof] ?? tokens.colors.rank.N

function TopSpan({ top }: { top: SkillTop }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
      <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: rankColor(top.prof) }}>
        {fmtSigned(top.mod)} ({top.prof})
      </span>
      <span
        style={{
          color: 'var(--blue)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: 104,
        }}
      >
        {top.who}
      </span>
    </span>
  )
}

/** Cartão de linha (perícia/equipamento) — verbatim do design. */
function LineCard({ ic, nome, right }: { ic: string; nome: string; right: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexWrap: 'wrap',
        padding: '6px 11px',
        background: 'var(--panel)',
        border: '1px solid var(--line)',
        clipPath: CARD_CLIP,
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 'none', minWidth: 108 }}>
        <span style={{ fontSize: 11, flex: 'none' }}>{ic}</span>
        <span style={{ fontWeight: 700, fontSize: 12.5 }}>{nome}</span>
      </span>
      <span
        style={{
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          flex: 1,
          minWidth: 0,
          justifyContent: 'flex-end',
        }}
      >
        {right}
      </span>
    </div>
  )
}

export function PanelDestaques({
  members,
  docs,
}: {
  members: IndexDocEntry[]
  docs: Map<string, VaultDoc> | undefined
}) {
  const groups = skillHighlights(members, docs)
  const equips = equipCards(members, docs, tokens.emojis.glyph.Star)
  const magias = magiaHighlights(members, docs)
  const attrEmoji = (attr: string) =>
    (tokens.emojis.atributo as Record<string, string>)[attr] ?? tokens.emojis.glyph.Bolt

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={sectionTitleStyle}>
        {'// DESTAQUES DE PROFICIÊNCIAS, PERÍCIAS, OFÍCIOS E MAGIAS'}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))',
          gap: 14,
          alignItems: 'start',
        }}
      >
        {/* LEFT: perícias por atributo */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
          {groups.map((grp) => (
            <div key={grp.attr} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  fontFamily: 'var(--mono)',
                  fontSize: 9.5,
                  letterSpacing: '.12em',
                  color: 'var(--muted)',
                }}
              >
                <span style={{ fontSize: 12 }}>{attrEmoji(grp.attr)}</span>
                {grp.attr}
              </div>
              {grp.skills.map((sk) => (
                <LineCard
                  key={sk.key}
                  ic={attrEmoji(grp.attr)}
                  nome={sk.key}
                  right={sk.tops.map((top, i) => (
                    <TopSpan key={`${top.who}-${i}`} top={top} />
                  ))}
                />
              ))}
            </div>
          ))}
        </div>
        {/* RIGHT: equip + magias */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <div
              style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.12em', color: 'var(--muted)' }}
            >
              PROF. EQUIPAMENTO
            </div>
            {equips.map((eq) => (
              <LineCard
                key={eq.emojiKey}
                ic={tokens.emojis.partyEquip[eq.emojiKey]}
                nome={eq.label}
                right={eq.members.map((m) => (
                  <span
                    key={m.who}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12 }}
                  >
                    <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--accent2)' }}>
                      {m.mark}
                    </span>
                    <span
                      style={{
                        color: 'var(--blue)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: 104,
                      }}
                    >
                      {m.who}
                    </span>
                  </span>
                ))}
              />
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <div
              style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.12em', color: 'var(--muted)' }}
            >
              MAGIAS
            </div>
            {magias.map((mg) => (
              <div
                key={mg.nome}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 11px',
                  background: 'var(--panel)',
                  border: '1px solid var(--line)',
                  clipPath: CARD_CLIP,
                }}
              >
                <span style={{ fontSize: 11, flex: 'none' }}>{tokens.emojis.escola[mg.emojiKey]}</span>
                <span style={{ fontWeight: 700, fontSize: 12.5, flex: 'none' }}>{mg.nome}</span>
                {mg.warn ? (
                  <span style={{ flex: 'none', fontSize: 11 }}>{tokens.emojis.glyph.Warning}</span>
                ) : null}
                <span style={{ flex: 1 }} />
                {mg.top ? <TopSpan top={mg.top} /> : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
