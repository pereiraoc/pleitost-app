// ESCUDO DO MESTRE — card de UM combatente nas sub-abas de ficha (Defesas,
// Ataques, Magias, Perícias, Habilidades, Pertences): retrato, nome, lado
// (azul jogador / vermelho inimigo), tag VEZ e o conteúdo da sub-aba embaixo.
// Mesmo vocabulário da linha do CombateDaSala e dos cards do resumo.
import type { CSSProperties, ReactNode } from 'react'
import { useAssetIndex } from '../../../data/assets'
import { creatureImageUrl } from '../../../data/creature-image'
import { nomeDeIniciativa } from '../../../data/session-repo/group-name'
import { clip } from '../../ficha/bits'
import { ZoomPortrait } from '../../detail/ResumoDetail'
import type { CombatenteVM } from './useCombatentes'

const mono = (extra: CSSProperties = {}): CSSProperties => ({ fontFamily: 'var(--mono)', ...extra })

const sigOf = (nome: string) =>
  nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('')

export function CombatenteCard({ vm, children }: { vm: CombatenteVM; children: ReactNode }) {
  const assets = useAssetIndex()
  const { c, doc, lado, vezAtual, escondido, semFicha } = vm
  const cor = lado === 'jogador' ? 'var(--blue)' : 'var(--red)'
  const nome = nomeDeIniciativa(c.summary.nome, c.fmBlob)
  const portrait = c.summary.retrato ?? creatureImageUrl(doc, assets, true)
  return (
    <div
      data-escudo-combatente={c.id}
      data-escudo-lado={lado}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: '10px 12px 12px',
        background: `color-mix(in srgb,var(--accent) ${vezAtual ? 6 : 0}%,var(--card))`,
        border: `1px solid color-mix(in srgb,${vezAtual ? 'var(--accent)' : cor} ${vezAtual ? 55 : 35}%,var(--line2))`,
        borderLeft: `4px solid ${cor}`,
        opacity: escondido ? 0.6 : 1,
        clipPath: clip(10),
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        {portrait ? (
          <ZoomPortrait
            thumb={portrait}
            full={c.summary.retrato ? null : creatureImageUrl(doc, assets, false)}
            alt={nome}
            frame={{ width: 36, height: 36, flex: 'none', border: '1px solid var(--line2)', clipPath: clip(7) }}
          />
        ) : (
          <span
            aria-hidden
            style={{
              width: 36,
              height: 36,
              flex: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--panel)',
              border: '1px solid var(--line2)',
              clipPath: clip(7),
              fontFamily: 'var(--mono)',
              fontSize: 11,
              color: 'var(--muted)',
            }}
          >
            {sigOf(nome)}
          </span>
        )}
        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 14,
            fontWeight: 700,
            color: cor,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {nome}
        </span>
        {escondido ? <span title="Escondido dos jogadores" style={{ fontSize: 13 }}>🙈</span> : null}
        {vezAtual ? (
          <span
            data-escudo-vez-tag=""
            style={mono({
              fontSize: 9.5,
              fontWeight: 700,
              letterSpacing: '.12em',
              color: 'var(--accent)',
              background: 'color-mix(in srgb,var(--accent) 14%,transparent)',
              border: '1px solid color-mix(in srgb,var(--accent) 40%,transparent)',
              padding: '2px 8px',
              clipPath: clip(5),
              flex: 'none',
            })}
          >
            VEZ
          </span>
        ) : null}
      </div>
      {semFicha ? (
        <div data-escudo-sem-ficha="" style={mono({ fontSize: 10.5, color: 'var(--muted)', fontStyle: 'italic' })}>
          Sem ficha neste aparelho — o segredo do disfarce vive no aparelho que adicionou o combatente;
          re-adicione pelo bestiário pra ver a ficha aqui.
        </div>
      ) : null}
      {children}
    </div>
  )
}
