// #275: transclusão de NOTA `![[Alvo#Seção]]` → renderiza o CONTEÚDO da nota
// Alvo embutido (a descrição real), não o texto cru. Usado nas folder-notes
// genéricas (Armaduras embute Sem Armadura / Armadura Leve / Armadura Pesada).
// A seção `#\`= this.file.name\`` na prática só aponta pro heading-título da
// nota — como o alvo tem 1 heading só (o título), embutir a nota inteira sem o
// %%…%% e sem o heading-título já entrega a descrição. Guarda contra recursão
// (nota que embute a si mesma / ciclos) via contexto de ancestrais.
import { createContext, useContext, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useDoc } from '../data/useDoc'
import { docPath } from '../paths'
import { MarkdownBody } from './MarkdownBody'

/** Ids das notas já sendo renderizadas na cadeia atual (raiz + transclusões).
 *  Um alvo já presente = ciclo → cai no link em vez de re-embutir. */
const TransclusionContext = createContext<ReadonlySet<string>>(new Set())

/** Envolve o render de um doc, empilhando seu id na cadeia de transclusão pra
 *  detecção de ciclo nas transclusões filhas. */
export function TransclusionScope({
  id,
  children,
}: {
  id: string
  children: React.ReactNode
}) {
  const ancestors = useContext(TransclusionContext)
  const next = useMemo(() => {
    const s = new Set(ancestors)
    s.add(id)
    return s
  }, [ancestors, id])
  return <TransclusionContext.Provider value={next}>{children}</TransclusionContext.Provider>
}

/** Renderiza o corpo da nota-alvo. Props chegam como atributos (hProperties do
 *  nó custom): `data-target-id` (id resolvido) e `data-label` (texto de queda). */
export function NoteTransclusion({
  'data-target-id': targetId,
  'data-label': label,
}: {
  'data-target-id'?: string
  'data-label'?: string
}) {
  const ancestors = useContext(TransclusionContext)
  const id = targetId ?? ''
  const cyclic = id !== '' && ancestors.has(id)
  // Não dispara fetch quando é ciclo (ou sem id) — evita loop e trabalho inútil.
  const { doc } = useDoc(cyclic ? '' : id)

  // Ciclo (nota que se embute) → link em vez de re-embutir, sem recursão.
  if (cyclic) {
    return (
      <Link to={docPath(id)} className="note-embed-cycle">
        {label ?? id}
      </Link>
    )
  }
  // Enquanto carrega, nada visível (o corpo do pai já apareceu).
  if (!doc) return null
  return (
    <TransclusionScope id={id}>
      <div className="note-embed">
        <MarkdownBody doc={doc} hideLeadingTitle />
      </div>
    </TransclusionScope>
  )
}
