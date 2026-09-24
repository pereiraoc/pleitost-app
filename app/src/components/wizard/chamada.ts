// CHAMADAS do wizard (2026-09-23): o texto-resumo curto que ajuda quem está
// escolhendo Sintonia/Classe pela primeira vez. FONTE: o FM da nota na vault
// (`Chamada` na classe e nas opções de subclasse de nível 1; `Chamada_Sintonia`
// por elemento nas classes cujo jeito de jogar muda com a sintonia — Monge e
// Animista; `Tendencias` nos Traços Elementais). O MUNDO pode sobrescrever
// via Contexto-Def (`reskin.chamadas` / `chamadas_sintonia`, mesmo idioma do
// `descricoes` #538); sem override, o canônico passa pela cascata de termos.
// Nada aqui inventa texto: FM ausente = nada a exibir.
import type { VaultDoc } from '../../data/types'
import { reskinChamada, reskinChamadaSintonia, reskinText } from '../../data/reskin'

type Fm = Record<string, unknown> | undefined

const fmDe = (doc: VaultDoc | undefined): Fm => doc?.frontmatter as Fm

const texto = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : ''
  return s ? s : null
}

/** Chamada de uma nota (classe/opção de subclasse) no mundo ativo. */
export function chamadaDe(doc: VaultDoc | undefined): string | null {
  if (!doc) return null
  const mundo = doc.basename ? reskinChamada(doc.basename) : null
  if (mundo) return mundo
  const canonico = texto(fmDe(doc)?.['Chamada'])
  return canonico ? reskinText(canonico) : null
}

/** Chamada da classe pra UM elemento de sintonia ("Água"…). */
export function chamadaSintoniaDe(doc: VaultDoc | undefined, elemento: string): string | null {
  if (!doc || !elemento) return null
  const mundo = doc.basename ? reskinChamadaSintonia(doc.basename, elemento) : null
  if (mundo) return mundo
  const mapa = fmDe(doc)?.['Chamada_Sintonia']
  const canonico =
    mapa && typeof mapa === 'object' ? texto((mapa as Record<string, unknown>)[elemento]) : null
  return canonico ? reskinText(canonico) : null
}

/** Tendências de um Traço Elemental (FM `Tendencias`), já no vocabulário do mundo. */
export function tendenciasDe(doc: VaultDoc | undefined): string[] {
  const v = fmDe(doc)?.['Tendencias']
  const lista = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : []
  return lista.map((t) => reskinText(String(t).trim())).filter((t) => t !== '')
}
