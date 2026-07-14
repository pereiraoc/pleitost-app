// IDENTIDADE VISUAL POR SUBTIPO de Criação de Personagem (#246, F2 do épico
// #243). O usuário pediu AS-IS: "A forma que tu vai mostrar cada tipo aqui é
// DIFERENTE pra cada tipo de subitem... de forma que fique fácil identificar
// que tipo de questão está sendo mostrada."
//
// Uma única CriacaoView parametrizada por ESTE registro (a fonte de verdade da
// identidade) fica visualmente distinta por subtipo — sem 6 componentes
// separados nem if-por-string no render. Os CAMPOS-CHAVE vêm ora do FM, ora
// dos inline fields (o extractor guarda os dois); a view lê de ambos.

export interface CampoChave {
  /** Rótulo do chip. */
  label: string
  /** Chaves candidatas (FM ou inline field), na ordem de preferência. */
  keys: string[]
}

export interface SubtipoCriacao {
  /** Ícone do cabeçalho (fonte de verdade desta view — conceito do app). */
  icon: string
  /** Cor de acento do subtipo (var CSS existente do tema). */
  cor: string
  /** Campos-chave exibidos como chips, na ordem. */
  campos: CampoChave[]
}

/** Registro por `doc.type` (espelha `frontmatter.categoria` do extractor). */
export const CRIACAO_SUBTIPOS: Record<string, SubtipoCriacao> = {
  Magia: {
    icon: '✨',
    cor: 'var(--blue)',
    campos: [
      { label: 'Escola', keys: ['escola'] },
      { label: 'Rank', keys: ['rank'] },
      { label: 'Custo', keys: ['custo'] },
    ],
  },
  Técnica: {
    icon: '🎯',
    cor: 'var(--accent)',
    campos: [
      { label: 'Classe', keys: ['classe'] },
      { label: 'Rank', keys: ['rank'] },
      { label: 'Custo', keys: ['custo'] },
    ],
  },
  Habilidade: {
    icon: '💫',
    cor: 'var(--gold)',
    campos: [
      { label: 'Classe', keys: ['classe'] },
      { label: 'Rank', keys: ['rank'] },
    ],
  },
  Classe: {
    icon: '🎓',
    cor: 'var(--accent)',
    campos: [
      { label: 'Tipo', keys: ['subcategoria'] },
      { label: 'Atributo-chave', keys: ['atributo-chave', 'atributo_chave'] },
    ],
  },
  Sintonia: {
    icon: '🌀',
    cor: 'var(--blue)',
    campos: [
      { label: 'Sintonia', keys: ['sintonia'] },
      { label: 'Nível', keys: ['nível', 'nivel'] },
    ],
  },
}

/** Os tipos de doc que a CriacaoView atende. */
export function isCriacaoSubtipo(type: string | null | undefined): type is string {
  return !!type && type in CRIACAO_SUBTIPOS
}
