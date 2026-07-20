// Overrides das TABELAS DE SISTEMA da loja (#202) — req 10 do usuário: as
// configs de tesouro do CONFIG/SISTEMA são EDITÁVEIS, com RESTAURAR PADRÃO
// por seção, e os PADRÕES em si nunca mudam.
//
// Padrão de implementação (documentado de propósito): as tabelas exportadas
// pelo commerce.ts (TIER_PRICE_MULT/POCAO_DICE/RARIDADE_MULT/COMBO_MULT) são
// objetos VIVOS consumidos por toda a loja (candidates/pricing/cards). Em vez
// de enfiar parâmetro em dezenas de call sites, este módulo:
//   1. congela uma CÓPIA dos defaults no primeiro import (fonte do reset);
//   2. aplica o override do localStorage POR CIMA do objeto vivo (mutação
//      controlada — só aqui, nunca nos consumidores);
//   3. expõe setters/resets + versão observável pro React re-renderizar.
import {
  COMBO_MULT,
  LOCAL_TYPES,
  POCAO_DICE,
  RARIDADE_MULT,
  TESOUROS_BASICOS,
  TIERS,
  TIER_PRICE_MULT,
  type LocalType,
  type Raridade,
  type Tier,
} from './commerce'

type ComboKey = keyof typeof COMBO_MULT

// Defaults congelados ANTES de qualquer override (imutáveis — req 10).
const DEFAULT_TIER_MULT = Object.freeze({ ...TIER_PRICE_MULT })
const DEFAULT_COMBO = Object.freeze({ ...COMBO_MULT })
const DEFAULT_RARIDADE = Object.freeze({ ...RARIDADE_MULT })
const DEFAULT_POCAO: Readonly<Record<LocalType, Readonly<Record<Tier, string>>>> = Object.freeze(
  Object.fromEntries(LOCAL_TYPES.map((lt) => [lt, Object.freeze({ ...POCAO_DICE[lt] })])),
) as never
// Lista PADRÃO de básicos — cópia congelada do espelho da nota (fonte do reset).
const DEFAULT_BASICOS: readonly string[] = Object.freeze([...TESOUROS_BASICOS])

// Taxa de revenda (#300): fração do valor de mercado devolvida em Ouro ao VENDER
// um item (arma/tesouro) na ficha. Default metade; ajustável no CONFIG/SISTEMA
// junto das demais opções de tesouro.
const DEFAULT_REVENDA = 0.5

const KEY = 'pleitost.settings.sistema'

interface SistemaOverrides {
  tierMult?: Partial<Record<Tier, number>>
  combo?: Partial<Record<ComboKey, number>>
  raridade?: Partial<Record<Raridade, number>>
  pocao?: Partial<Record<LocalType, Partial<Record<Tier, string>>>>
  revenda?: number
  /** Lista de tesouros básicos (nomes) — substitui DEFAULT_BASICOS por inteiro. */
  basicos?: string[]
}

// Valor VIVO da taxa de revenda (escalar; não vive numa tabela do commerce.ts).
let revendaTaxa = DEFAULT_REVENDA

let version = 0
const listeners = new Set<() => void>()
function bump() {
  version++
  for (const l of listeners) l()
}

function load(): SistemaOverrides {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as SistemaOverrides) : {}
  } catch {
    return {}
  }
}

function persist(ov: SistemaOverrides) {
  try {
    localStorage.setItem(KEY, JSON.stringify(ov))
  } catch {
    /* sem storage — vive em memória */
  }
}

/** Aplica overrides nas tabelas vivas (defaults por baixo). */
function apply(ov: SistemaOverrides) {
  for (const t of TIERS) TIER_PRICE_MULT[t] = ov.tierMult?.[t] ?? DEFAULT_TIER_MULT[t]
  for (const k of Object.keys(DEFAULT_COMBO) as ComboKey[]) {
    COMBO_MULT[k] = ov.combo?.[k] ?? DEFAULT_COMBO[k]
  }
  for (const r of Object.keys(DEFAULT_RARIDADE) as Raridade[]) {
    RARIDADE_MULT[r] = ov.raridade?.[r] ?? DEFAULT_RARIDADE[r]
  }
  for (const lt of LOCAL_TYPES) {
    for (const t of TIERS) POCAO_DICE[lt][t] = ov.pocao?.[lt]?.[t] ?? DEFAULT_POCAO[lt][t]
  }
  // Muta o array VIVO no lugar (mesma referência lida por raridadeTesouro).
  TESOUROS_BASICOS.splice(0, TESOUROS_BASICOS.length, ...(ov.basicos ?? DEFAULT_BASICOS))
  revendaTaxa = ov.revenda ?? DEFAULT_REVENDA
  bump()
}

// boot: aplica o que estiver salvo
apply(load())

function mutate(fn: (ov: SistemaOverrides) => void) {
  const ov = load()
  fn(ov)
  persist(ov)
  apply(ov)
}

export const sistemaConfig = {
  defaults: {
    tierMult: DEFAULT_TIER_MULT,
    combo: DEFAULT_COMBO,
    raridade: DEFAULT_RARIDADE,
    pocao: DEFAULT_POCAO,
    revenda: DEFAULT_REVENDA,
    basicos: DEFAULT_BASICOS,
  },
  setTierMult(tier: Tier, value: number) {
    mutate((ov) => {
      ov.tierMult = { ...ov.tierMult, [tier]: value }
    })
  },
  setCombo(key: ComboKey, value: number) {
    mutate((ov) => {
      ov.combo = { ...ov.combo, [key]: value }
    })
  },
  setRaridade(r: Raridade, value: number) {
    mutate((ov) => {
      ov.raridade = { ...ov.raridade, [r]: value }
    })
  },
  setPocao(lt: LocalType, tier: Tier, dice: string) {
    mutate((ov) => {
      ov.pocao = { ...ov.pocao, [lt]: { ...ov.pocao?.[lt], [tier]: dice } }
    })
  },
  resetMultiplicadores() {
    mutate((ov) => {
      delete ov.tierMult
    })
  },
  resetRegiao() {
    mutate((ov) => {
      delete ov.combo
      delete ov.raridade
      delete ov.basicos
    })
  },
  resetPocao() {
    mutate((ov) => {
      delete ov.pocao
    })
  },
  /** Lista corrente de tesouros básicos (nomes). */
  getBasicos(): readonly string[] {
    return TESOUROS_BASICOS
  },
  /** Adiciona um nome à lista (no-op se já existe). */
  addBasico(nome: string) {
    const n = nome.trim()
    if (!n || TESOUROS_BASICOS.includes(n)) return
    mutate((ov) => {
      ov.basicos = [...(ov.basicos ?? DEFAULT_BASICOS), n]
    })
  },
  /** Remove um nome da lista. */
  removeBasico(nome: string) {
    mutate((ov) => {
      ov.basicos = (ov.basicos ?? DEFAULT_BASICOS).filter((b) => b !== nome)
    })
  },
  resetBasicos() {
    mutate((ov) => {
      delete ov.basicos
    })
  },
  /** Taxa de revenda corrente (fração 0..1). */
  getRevenda(): number {
    return revendaTaxa
  },
  setRevenda(value: number) {
    mutate((ov) => {
      ov.revenda = value
    })
  },
  resetRevenda() {
    mutate((ov) => {
      delete ov.revenda
    })
  },
  subscribe(cb: () => void): () => void {
    listeners.add(cb)
    return () => listeners.delete(cb)
  },
  getVersion(): number {
    return version
  },
  __resetForTests() {
    try {
      localStorage.removeItem(KEY)
    } catch {
      /* noop */
    }
    apply({})
  },
}
