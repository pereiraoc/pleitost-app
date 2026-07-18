// Modelo PURO dos blocos de iniciativa (house-rule do app, não existe na vault):
// velocidade Super/Rápido/Lento × lado Jogador/Inimigo. O LADO é sempre derivado
// da família (nunca armazenado). Fonte de verdade única dos labels/emojis de
// velocidade — o registro `tokens` é gerado do plugin e não conhece isto.
export type SpeedTier = 'super' | 'rapido' | 'lento'
export type Lado = 'jogador' | 'inimigo'

export const SPEED_ORDER: SpeedTier[] = ['super', 'rapido', 'lento']
export const SPEED_EMOJI: Record<SpeedTier, string> = { super: '⚡', rapido: '🏃', lento: '🐢' }
export const SPEED_LABEL: Record<SpeedTier, string> = {
  super: 'Super Rápido',
  rapido: 'Rápido',
  lento: 'Lento',
}
const LADO_LABEL: Record<Lado, string> = { jogador: 'Jogadores', inimigo: 'Inimigos' }

// famílias/subcategorias que contam como lado JOGADOR (herói ou jogador).
const JOGADOR = new Set(['Heroi', 'Herói', 'Jogador'])

export function ladoDe(family: string): Lado {
  return JOGADOR.has(String(family).trim()) ? 'jogador' : 'inimigo'
}

/** "Jogadores Super Rápidos" / "Inimigos Lentos" etc. (label plural do bloco). */
export function blocoLabel(tier: SpeedTier, lado: Lado): string {
  const speed = tier === 'lento' ? 'Lentos' : tier === 'super' ? 'Super Rápidos' : 'Rápidos'
  return `${LADO_LABEL[lado]} ${speed}`
}

export interface BlocoView<T> {
  tier: SpeedTier
  lado: Lado
  label: string
  itens: T[]
}

/** Agrupa nos 6 blocos na ordem canônica (Jog/Ini × Super/Rápido/Lento),
 *  devolve só os não-vazios, os sem-bloco (tier null) e a sequência flat
 *  (concatenação dos blocos) que preserva "a vez de cada um". */
export function agruparEmBlocos<T>(
  itens: T[],
  keyOf: (t: T) => { tier: SpeedTier | null; lado: Lado },
): { blocos: BlocoView<T>[]; semBloco: T[]; sequencia: T[] } {
  const semBloco: T[] = []
  // bucket[tier:lado] preservando inserção
  const buckets = new Map<string, T[]>()
  const bk = (tier: SpeedTier, lado: Lado) => `${tier}:${lado}`
  for (const it of itens) {
    const { tier, lado } = keyOf(it)
    if (tier == null) {
      semBloco.push(it)
      continue
    }
    const k = bk(tier, lado)
    const arr = buckets.get(k)
    if (arr) arr.push(it)
    else buckets.set(k, [it])
  }
  const blocos: BlocoView<T>[] = []
  const sequencia: T[] = []
  for (const tier of SPEED_ORDER) {
    for (const lado of ['jogador', 'inimigo'] as Lado[]) {
      const arr = buckets.get(bk(tier, lado))
      if (!arr || arr.length === 0) continue
      blocos.push({ tier, lado, label: blocoLabel(tier, lado), itens: arr })
      sequencia.push(...arr)
    }
  }
  return { blocos, semBloco, sequencia }
}
