// Aba PESSOAS das Anotações (#178/#179) — lista de NPCs que O PERSONAGEM
// conhece, armazenada POR personagem no FM dele (`Pessoas`: [{Nome, Relação,
// Organização, Posição, Detalhes, Alvo?}]). NADA daqui é compartilhado com a
// mesa — são notas pessoais (req 1). Os MEMBROS DOS GRUPOS do personagem
// entram automaticamente (linhas derivadas, badge GRUPO) e abrem a ficha
// RESUMO nos DETALHES (req 2). Adicionar = nova pessoa OU existente (heróis
// locais, companheiros, bestiário) — campos sempre pessoais (req 3).
import { useMemo, useState, type CSSProperties } from 'react'
import type { VaultDoc } from '../../data/types'
import { useCatalog } from '../../data/CatalogContext'
import { useHeroModel } from '../../data/useHeroModel'
import { useDetail } from '../../data/detail-context'
import { useGroupMembers, localEntriesOfKind } from '../../data/local-entities'
import { usePessoaPortrait } from '../../data/images'
import { clip } from './bits'
import { fmPath, wikiTarget } from './hero-model'
import { initials, PessoaForm, type PessoaFields2 } from '../creatures/CreaturesPages'

export interface PessoaRow extends PessoaFields2 {
  /** Doc id de um personagem EXISTENTE (herói/companheiro/monstro) — habilita
   *  a ficha resumo no clique; ausente = pessoa "solta". */
  Alvo?: string
}

const mono = (extra: CSSProperties = {}): CSSProperties => ({ fontFamily: 'var(--mono)', ...extra })

function rowsOf(fm: Record<string, unknown>): PessoaRow[] {
  const raw = fmPath(fm, 'Pessoas')
  return Array.isArray(raw) ? (raw as PessoaRow[]) : []
}

// #445 — agrupamento por tipo de relação, na ordem pedida pelo mestre. "Grupo"
// são os membros de grupo (auto); os demais casam o campo `Relação` (valores
// singulares de PESSOA_RELACOES). Relação vazia/desconhecida cai em Neutro.
const RELACAO_GRUPOS: { label: string; values: string[] }[] = [
  { label: 'Grupo', values: [] }, // membros de grupo (autoMembros)
  { label: 'Família', values: ['Família'] },
  { label: 'Romance', values: ['Romance'] },
  { label: 'Amigos', values: ['Amigo'] },
  { label: 'Conhecidos', values: ['Conhecido'] },
  { label: 'Negócios', values: ['Negócios'] },
  { label: 'Neutro', values: ['Neutro'] },
  { label: 'Inimigos', values: ['Inimigo'] },
]
/** Índice do grupo de relação de uma linha manual (default = Neutro). */
function grupoDaRelacao(relacao: string): number {
  const i = RELACAO_GRUPOS.findIndex((g) => g.values.includes(relacao))
  return i >= 0 ? i : RELACAO_GRUPOS.findIndex((g) => g.label === 'Neutro')
}

function Chip({ label, value }: { label: string; value: string }) {
  if (!value) return null
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 8px',
        background: 'var(--card)',
        border: '1px solid var(--line2)',
        clipPath: clip(4),
      }}
    >
      <span style={mono({ fontSize: 8.5, letterSpacing: '.08em', color: 'var(--muted)' })}>{label}</span>
      <span style={{ fontSize: 11.5, color: 'var(--text)' }}>{value}</span>
    </span>
  )
}

/** Retrato do card (#200): linha com Alvo → retrato do personagem alvo
 *  (local-first, como todo retrato); avulsa → imagem própria (ImgId); sem
 *  imagem → iniciais (mesmo fallback dos cards de criatura). */
function PessoaAvatar({ row }: { row: PessoaRow }) {
  const portrait = usePessoaPortrait(row.Alvo, row.ImgId)
  const frame: CSSProperties = {
    width: 46,
    height: 46,
    flex: 'none',
    border: '1px solid var(--line2)',
    clipPath: clip(8),
  }
  return portrait ? (
    <img src={portrait} alt="" style={{ ...frame, objectFit: 'cover' }} />
  ) : (
    <span
      style={{
        ...frame,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--card)',
        fontFamily: 'var(--mono)',
        fontSize: 15,
        color: 'var(--muted)',
      }}
    >
      {initials(row.Nome)}
    </span>
  )
}

function PessoaCard({
  row,
  badge,
  onResumo,
  onEdit,
  onDelete,
}: {
  row: PessoaRow
  badge?: string
  onResumo?: () => void
  onEdit?: () => void
  onDelete?: () => void
}) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        padding: '12px 15px',
        background: 'var(--panel)',
        border: '1px solid var(--line2)',
        clipPath: clip(10),
      }}
    >
      <PessoaAvatar row={row} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
        {onResumo ? (
          <button
            onClick={onResumo}
            title="Ver ficha resumo nos detalhes"
            style={{
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              fontSize: 14.5,
              fontWeight: 700,
              color: 'var(--blue)',
            }}
          >
            {row.Nome}
          </button>
        ) : (
          <span style={{ fontSize: 14.5, fontWeight: 700 }}>{row.Nome}</span>
        )}
        {badge ? (
          <span
            style={mono({
              fontSize: 8.5,
              letterSpacing: '.1em',
              color: 'var(--accent)',
              border: '1px solid color-mix(in srgb,var(--accent) 45%,transparent)',
              padding: '2px 6px',
            })}
          >
            {badge}
          </span>
        ) : null}
        <span style={{ flex: 1 }} />
        {onEdit ? (
          <button
            onClick={onEdit}
            aria-label={`Editar ${row.Nome}`}
            style={mono({
              padding: '4px 9px',
              background: 'var(--card)',
              border: '1px solid var(--line2)',
              color: 'var(--muted)',
              cursor: 'pointer',
              fontSize: 10,
            })}
          >
            ✎
          </button>
        ) : null}
        {onDelete ? (
          <button
            onClick={onDelete}
            aria-label={`Remover ${row.Nome}`}
            style={mono({
              padding: '4px 9px',
              background: 'color-mix(in srgb,var(--red) 10%,var(--card))',
              border: '1px solid color-mix(in srgb,var(--red) 38%,var(--line2))',
              color: '#d8695c',
              cursor: 'pointer',
              fontSize: 10,
            })}
          >
            🗑
          </button>
        ) : null}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <Chip label="RELAÇÃO" value={row['Relação']} />
        <Chip label="ORGANIZAÇÃO" value={row['Organização']} />
        <Chip label="POSIÇÃO" value={row['Posição']} />
      </div>
      {row.Detalhes ? (
        <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.55 }}>{row.Detalhes}</div>
      ) : null}
      </div>
    </div>
  )
}

/** Picker de personagem EXISTENTE (req 3): heróis do usuário, companheiros
 *  animais e bestiário acessível. */
function ExistentePicker({
  onPick,
  onClose,
  currentHeroId,
}: {
  onPick: (id: string, nome: string) => void
  onClose: () => void
  /** Herói sendo editado — excluído da lista (não faz sentido se conhecer). */
  currentHeroId?: string
}) {
  const groups = useMemo(() => {
    // #442: SÓ entidades do PRÓPRIO usuário (as que ele cadastrou em
    // Criaturas/Pessoas ou como heróis/companheiros/monstros locais). Nada do
    // BESTIÁRIO da vault (era spoiler pros jogadores) e nada do herói atual.
    return [
      {
        label: 'Heróis',
        entries: localEntriesOfKind('Heroi').filter((e) => e.id !== currentHeroId),
      },
      { label: 'Pessoas', entries: localEntriesOfKind('Pessoa') },
      { label: 'Companheiros Animais', entries: localEntriesOfKind('CompanheiroAnimal') },
      { label: 'Monstros', entries: localEntriesOfKind('Monstro') },
    ].filter((g) => g.entries.length > 0)
  }, [currentHeroId])
  const [sel, setSel] = useState('')
  const nomeOf = (id: string) =>
    groups.flatMap((g) => g.entries).find((e) => e.id === id)?.basename ?? id
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 55, background: 'rgba(0,0,0,.5)' }} />
      <div
        role="dialog"
        aria-label="Adicionar Existente"
        style={{
          position: 'fixed',
          zIndex: 56,
          top: '30%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'min(480px, 92vw)',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          padding: 18,
          background: 'var(--panel)',
          border: '1px solid var(--line2)',
          clipPath: clip(12),
        }}
      >
        <div style={mono({ fontSize: 10.5, letterSpacing: '.14em', color: 'var(--muted)' })}>
          ADICIONAR PERSONAGEM EXISTENTE
        </div>
        <select
          aria-label="Personagem existente"
          value={sel}
          onChange={(e) => setSel(e.target.value)}
          style={mono({
            padding: '10px 12px',
            background: 'var(--card)',
            border: '1px solid var(--line2)',
            color: 'var(--text)',
            fontSize: 12,
          })}
        >
          <option value="">— selecionar —</option>
          {groups.map((g) =>
            g.entries.length ? (
              <optgroup key={g.label} label={g.label}>
                {g.entries.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.basename}
                  </option>
                ))}
              </optgroup>
            ) : null,
          )}
        </select>
        <button
          disabled={!sel}
          onClick={() => sel && onPick(sel, nomeOf(sel))}
          style={{
            padding: '10px 16px',
            background: sel ? 'var(--accent)' : 'var(--card)',
            color: sel ? 'var(--ink)' : 'var(--muted)',
            border: 'none',
            cursor: sel ? 'pointer' : 'not-allowed',
            fontWeight: 700,
            fontSize: 13,
            clipPath: clip(8),
          }}
        >
          Continuar →
        </button>
      </div>
    </>
  )
}

export function PessoasPanel({ doc }: { doc: VaultDoc }) {
  const catalog = useCatalog()
  const detail = useDetail()
  const model = useHeroModel(doc, 'anotacoes')
  const rows = rowsOf(model.fm)
  const [modal, setModal] = useState<
    | { t: 'nova' }
    | { t: 'existente' }
    | { t: 'campos'; alvo: string; nome: string }
    | { t: 'editar'; idx: number }
    | null
  >(null)

  // Membros dos GRUPOS do personagem — entram automaticamente (req 1),
  // linhas derivadas (não são gravadas; sem duplicar com entradas manuais).
  const groupIds = useMemo(() => {
    const raw = doc.grupo
    const list = Array.isArray(raw) ? raw : raw ? [raw] : []
    const ids: string[] = []
    for (const value of list) {
      const res = catalog.resolve(wikiTarget(value))
      if (res.kind === 'doc' && !ids.includes(res.id)) ids.push(res.id)
    }
    return ids
  }, [catalog, doc])
  const membros0 = useGroupMembers(catalog, groupIds[0] ?? '')
  const membros1 = useGroupMembers(catalog, groupIds[1] ?? '')
  const manuais = new Set(rows.map((r) => r.Alvo ?? `nome:${r.Nome}`))
  // #444: exclui o PRÓPRIO herói (por id OU nome — o membro pode ser o doc da
  // VAULT e o atual o herói LOCAL: ids diferentes, mesma pessoa) e DEDUPLICA
  // (o mesmo membro em 2 grupos aparecia 2x).
  const selfNome = (doc.basename ?? '').trim().toLowerCase()
  const seenAuto = new Set<string>()
  const autoMembros = [...membros0, ...membros1].filter((m) => {
    const nome = (m.basename ?? '').trim().toLowerCase()
    if (m.id === doc.id || (!!nome && nome === selfNome)) return false
    if (seenAuto.has(m.id) || (!!nome && seenAuto.has('n:' + nome))) return false
    seenAuto.add(m.id)
    if (nome) seenAuto.add('n:' + nome)
    return !manuais.has(m.id)
  })

  const save = (next: PessoaRow[]) => model.set('Pessoas', next)
  const abrirResumo = (id: string) => detail?.open({ kind: 'resumo', id })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          onClick={() => setModal({ t: 'nova' })}
          style={{
            padding: '8px 14px',
            background: 'color-mix(in srgb,var(--accent) 16%,var(--card))',
            border: '1px solid color-mix(in srgb,var(--accent) 45%,var(--line2))',
            color: 'var(--accent)',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: 12.5,
            clipPath: clip(7),
          }}
        >
          + Nova Pessoa
        </button>
        <button
          onClick={() => setModal({ t: 'existente' })}
          style={{
            padding: '8px 14px',
            background: 'transparent',
            border: '1px solid var(--accent)',
            color: 'var(--accent)',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: 12.5,
            clipPath: clip(7),
          }}
        >
          + Existente
        </button>
      </div>

      {/* #445 — agrupado por relação, na ordem do mestre. "Grupo" = membros de
          grupo; cada bloco tem um cabeçalho e some quando vazio. */}
      {RELACAO_GRUPOS.map((g, gi) => {
        const isGrupo = g.label === 'Grupo'
        const cards = isGrupo
          ? autoMembros.map((m) => (
              <PessoaCard
                key={`auto-${m.id}`}
                row={{ Nome: m.basename ?? m.id, Relação: '', Organização: '', Posição: '', Detalhes: '', Alvo: m.id }}
                badge="GRUPO"
                onResumo={() => abrirResumo(m.id)}
              />
            ))
          : rows
              .map((r, idx) => ({ r, idx }))
              .filter(({ r }) => grupoDaRelacao(r.Relação ?? '') === gi)
              .map(({ r, idx }) => (
                <PessoaCard
                  key={`${r.Alvo ?? r.Nome}-${idx}`}
                  row={r}
                  badge={r.Alvo ? 'CONHECIDO' : undefined}
                  onResumo={r.Alvo ? () => abrirResumo(r.Alvo!) : undefined}
                  onEdit={() => setModal({ t: 'editar', idx })}
                  onDelete={() => save(rows.filter((_, i) => i !== idx))}
                />
              ))
        if (cards.length === 0) return null
        return (
          <div key={g.label} data-pessoa-grupo={g.label} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={mono({ fontSize: 9.5, letterSpacing: '.14em', color: 'var(--muted)', marginTop: gi > 0 ? 4 : 0 })}>
              {`// ${g.label.toUpperCase()}`}
            </div>
            {cards}
          </div>
        )
      })}
      {rows.length === 0 && autoMembros.length === 0 ? (
        <div style={mono({ fontSize: 11, color: 'var(--muted)', padding: 8 })}>
          Ninguém conhecido ainda — adicione uma pessoa nova ou um personagem existente.
        </div>
      ) : null}

      {modal?.t === 'nova' ? (
        <PessoaForm
          withImage
          onClose={() => setModal(null)}
          onSubmit={(f) => {
            save([...rows, f])
            setModal(null)
          }}
        />
      ) : null}
      {modal?.t === 'existente' ? (
        <ExistentePicker
          currentHeroId={doc.id}
          onClose={() => setModal(null)}
          onPick={(id, nome) => setModal({ t: 'campos', alvo: id, nome })}
        />
      ) : null}
      {modal?.t === 'campos' ? (
        <PessoaForm
          initial={{ Nome: modal.nome }}
          lockNome
          onClose={() => setModal(null)}
          onSubmit={(f) => {
            save([...rows, { ...f, Alvo: modal.alvo }])
            setModal(null)
          }}
        />
      ) : null}
      {modal?.t === 'editar' ? (
        <PessoaForm
          initial={rows[modal.idx]}
          lockNome={Boolean(rows[modal.idx]?.Alvo)}
          // Imagem própria só pra pessoa AVULSA (#200): linha com Alvo usa o
          // retrato do personagem alvo — sem upload/remover aqui.
          withImage={!rows[modal.idx]?.Alvo}
          onClose={() => setModal(null)}
          onSubmit={(f) => {
            save(rows.map((r, i) => (i === modal.idx ? { ...r, ...f } : r)))
            setModal(null)
          }}
        />
      ) : null}
    </div>
  )
}
