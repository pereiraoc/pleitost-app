// Conteúdo EM DESENVOLVIMENTO oculto do usuário (pedido 2026-08-15,
// TEMPORÁRIO): o sistema de TRAÇOS ELEMENTAIS ainda não está implementado —
// nos quatro docs de Sintonia "Traço Elemental da/do <Elemento>", o corpo
// renderiza só até a barra horizontal: fica o texto de personalidade, some a
// tabela dataview dos traços por nível. REMOVER quando o sistema lançar.
import type { VaultDoc } from '../data/types'

const TRACO_ELEMENTAL_RE = /^Traço Elemental d[aeo] /
/** Thematic break do markdown (linha só de --- / *** / ___). */
const HR_RE = /^[ \t]*(?:-{3,}|\*{3,}|_{3,})[ \t]*$/m

export function truncarCorpoEmDesenvolvimento(
  doc: Pick<VaultDoc, 'type' | 'basename'>,
  body: string,
): string {
  if (doc.type !== 'Sintonia' || !TRACO_ELEMENTAL_RE.test(doc.basename)) return body
  const m = HR_RE.exec(body)
  return m ? body.slice(0, m.index) : body
}
