// REGISTRO DOS CAMPOS-NÚCLEO do formato de aventura (aprovado 2026-09-05):
// ordem/destaque fixos por tipo de registro. Rótulo extra (qualquer outro
// `**Rótulo:**` da nota) rende DEPOIS dos núcleo, na ordem da nota — é assim
// que uma aventura complementa a outra sem schema novo. Nunca inventar rótulo
// aqui: só os que a nota já escreve.
import type { CalloutField } from '../components/compendium/callout-template-fields'

export const PERSONAGEM_NUCLEO = [
  'Nota',
  'Organização',
  'Função',
  'Papel',
  'Personalidade',
  'Aparência',
  'Objetivo de Longo Prazo',
  'Objetivo Imediato',
  'O que sabe',
  'Como usar',
  'Entrada',
] as const
/** Campo de LISTA renderizado em destaque (balões), fora da pilha de campos. */
export const PERSONAGEM_FRASES = 'Frases'

/** Campo de LISTA com os MAPAS DE MESA do local (embeds de imagem): rende como
 *  figura, não como texto, e é o que a página de impressão leva pro papel. */
export const LOCAL_MAPAS = 'Mapas de mesa'

export const LOCAL_NUCLEO = [
  'Atlas',
  'Contexto',
  'Descrição',
  'Aparência',
  'Influências',
  'Quem está lá',
  'Zonas',
  'Elementos de cena',
  'Cenas',
] as const

export const CENA_NUCLEO = ['Tipo', 'Local', 'Personagens', 'Objetivo', 'Duração', 'Combates'] as const
export const COMBATE_NUCLEO = ['Cena', 'Quando', 'Inimigos', 'Velocidades', 'Função dramática', 'Elementos de cenário', 'Preparar'] as const
export const ABERTURA_NUCLEO = ['Situação', 'Gancho', 'Contrato', 'Início'] as const
export const DESFECHO_NUCLEO = ['Decide'] as const

/** Campos que a UI renderiza por conta própria (chips/refs), fora da pilha. */
export const CAMPOS_REF: ReadonlySet<string> = new Set(['nota', 'atlas', 'local', 'personagens', 'cenas', 'entrada', 'combates', 'cena'])

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[\s_]+/g, ' ').trim()
}

/** Campos na ordem de render: núcleo (na ordem do registro, só os presentes)
 *  + extras (ordem da nota), excluindo `omitir` (renderizados à parte). */
export function ordenarCampos(
  campos: readonly CalloutField[],
  nucleo: readonly string[],
  omitir: ReadonlySet<string> = new Set(),
): CalloutField[] {
  const byNorm = new Map<string, CalloutField>()
  for (const c of campos) if (!byNorm.has(norm(c.label))) byNorm.set(norm(c.label), c)
  const out: CalloutField[] = []
  const usados = new Set<string>()
  for (const n of nucleo) {
    const c = byNorm.get(norm(n))
    if (c && !omitir.has(norm(n))) {
      out.push(c)
      usados.add(norm(n))
    }
  }
  for (const c of campos) {
    const k = norm(c.label)
    if (usados.has(k) || omitir.has(k)) continue
    usados.add(k)
    out.push(c)
  }
  return out
}
