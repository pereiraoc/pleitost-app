// CHIP DE REFERÊNCIA com EXPANSÃO INLINE (pedido do user: "quando eu tiver
// numa cena que vai pra um lugar, apareça a possibilidade de expandir o
// contexto ali embaixo, como nas notas de Contexto Atual"). `[[#Nome]]` abre o
// REGISTRO da própria aventura (Personagem/Local); `[[Nota]]` abre a view do
// compêndio (Localização/Pessoa/Organização) embutida; ref a cena rola até
// ela. <details> nativo — mesma linguagem dos cards do Contexto Atual.
import { useState } from 'react'
import type { VaultDoc } from '../../../data/types'
import { useCatalog } from '../../../data/CatalogContext'
import { useDoc } from '../../../data/useDoc'
import { reskinName } from '../../../data/reskin'
import { DocView } from '../DocPage'
import type { AventuraModel, Ref, Registro } from '../../../aventura/types'
import { RegistroCard } from './RegistroCard'

export function cenaAnchorId(slug: string): string {
  return `av-cena-${slug}`
}

/** Registro (personagem ou local) da aventura com esse nome. */
export function registroPorNome(model: AventuraModel, nome: string): { reg: Registro; tipo: 'personagem' | 'local' } | null {
  const p = model.personagens.find((r) => r.nome === nome)
  if (p) return { reg: p, tipo: 'personagem' }
  const l = model.locais.find((r) => r.nome === nome)
  if (l) return { reg: l, tipo: 'local' }
  return null
}

function DocExpand({ id }: { id: string }) {
  const { doc, error } = useDoc(id)
  if (error) return <p className="ctx-acc-vazio">Não foi possível abrir: {error.message}</p>
  if (!doc) return <p className="loading">Carregando…</p>
  return <DocView doc={doc} embedded sidebar />
}

export function RefChip({ r, model, doc }: { r: Ref; model: AventuraModel; doc: VaultDoc }) {
  const catalog = useCatalog()
  const [aberto, setAberto] = useState(false)
  // ref interna a uma CENA ("Cena N — Título") → rola até ela
  const cena = r.interno ? model.cenas.find((c) => r.alvo === `Cena ${c.n} — ${c.titulo}`) : null
  if (cena) {
    return (
      <button
        type="button"
        className="av-chip is-cena"
        onClick={() => document.getElementById(cenaAnchorId(cena.slug))?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
      >
        ▸ {r.label}
      </button>
    )
  }
  const reg = r.interno ? registroPorNome(model, r.alvo) : null
  const res = r.interno ? null : catalog.resolve(r.alvo)
  const docId = res?.kind === 'doc' ? res.id : null
  if (!reg && !docId) {
    return <span className="av-chip is-morto">{reskinName(r.label)}</span>
  }
  return (
    <details className="ctx-acc av-ref" open={aberto} onToggle={(e) => setAberto((e.currentTarget as HTMLDetailsElement).open)}>
      <summary className="ctx-acc-head av-chip-head">
        <span className="ctx-acc-title">{reskinName(r.label)}</span>
        <span className="av-chip-tipo">{reg ? (reg.tipo === 'personagem' ? 'personagem' : 'local') : 'compêndio'}</span>
      </summary>
      {aberto ? (
        <div className="ctx-acc-body">
          {reg ? <RegistroCard reg={reg.reg} tipo={reg.tipo} model={model} doc={doc} embedded /> : <DocExpand id={docId!} />}
        </div>
      ) : null}
    </details>
  )
}

/** Linha de chips de um campo de referências. */
export function RefRow({ label, refs, model, doc }: { label: string; refs: Ref[]; model: AventuraModel; doc: VaultDoc }) {
  if (!refs.length) return null
  return (
    <div className="av-refrow" data-av-refrow={label}>
      <span className="local-field-label">{label.toUpperCase()}</span>
      <div className="av-refrow-chips">
        {refs.map((r, i) => (
          <RefChip key={`${r.alvo}-${i}`} r={r} model={model} doc={doc} />
        ))}
      </div>
    </div>
  )
}
