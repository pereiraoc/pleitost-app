// Configurações app-level da tela CONFIG (issue #35) — estado de MÓDULO
// compartilhado via useSyncExternalStore (mesmo padrão do theme/hero-store):
// a tela CONFIG escreve e os consumidores (ex. gating do BESTIÁRIO em
// CreaturesPages) refletem sem reload. Persistência por chave própria no
// localStorage (`pleitost.settings.<nome>`).
import { useSyncExternalStore } from 'react'
import {
  cloneMatrix,
  DEFAULT_MATRIX,
  LOCAL_TYPES,
  TIERS,
  type AvailabilityMatrix,
  type LocalType,
  type Tier,
} from './data/commerce'

const MESTRE_KEY = 'pleitost.settings.mestre'
// Override da matriz de Disponibilidade de Tesouros editada pelo GM no CONFIG
// (issue #72). Default = a tabela da nota real (DEFAULT_MATRIX, espelho do
// body); quando o GM edita, o override completo é persistido aqui e a rolagem
// da loja passa a usá-lo.
const DISPONIBILIDADE_KEY = 'pleitost.settings.disponibilidade'

export interface Settings {
  /** Modo Mestre: ON libera o BESTIÁRIO dos NPCs; OFF bloqueia a aba. */
  mestre: boolean
  /** Matriz de disponibilidade (% por tipo de local × tier) que a loja usa. */
  disponibilidade: AvailabilityMatrix
}

/** Carrega o override da matriz do localStorage, tolerante a chaves ausentes/
 *  corrompidas — cai no DEFAULT_MATRIX por célula, nunca crasha. */
function loadDisponibilidade(): AvailabilityMatrix {
  const base = cloneMatrix(DEFAULT_MATRIX)
  try {
    const raw = localStorage.getItem(DISPONIBILIDADE_KEY)
    if (!raw) return base
    const parsed = JSON.parse(raw) as Partial<Record<LocalType, Partial<Record<Tier, unknown>>>>
    for (const lt of LOCAL_TYPES) {
      const row = parsed?.[lt]
      if (!row) continue
      for (const tier of TIERS) {
        const v = row[tier]
        if (v === null) base[lt][tier] = null
        else if (typeof v === 'number' && Number.isFinite(v)) base[lt][tier] = v
      }
    }
  } catch {
    /* corrompido → defaults */
  }
  return base
}

function loadSettings(): Settings {
  try {
    return { mestre: localStorage.getItem(MESTRE_KEY) === 'true', disponibilidade: loadDisponibilidade() }
  } catch {
    return { mestre: false, disponibilidade: cloneMatrix(DEFAULT_MATRIX) }
  }
}

let state: Settings | null = null
const listeners = new Set<() => void>()

function getSettings(): Settings {
  state ??= loadSettings()
  return state
}

function setMestre(mestre: boolean) {
  state = { ...getSettings(), mestre }
  try {
    localStorage.setItem(MESTRE_KEY, String(mestre))
  } catch {
    /* memória continua a fonte da sessão */
  }
  for (const cb of listeners) cb()
}

/** Grava uma célula da matriz (tipo × tier) — número (%) ou null (indisponível)
 *  — e persiste a matriz inteira. A loja reflete na próxima rolagem. */
function setDisponibilidadeCell(localType: LocalType, tier: Tier, value: number | null) {
  const cur = getSettings()
  const next = cloneMatrix(cur.disponibilidade)
  next[localType][tier] = value
  state = { ...cur, disponibilidade: next }
  try {
    localStorage.setItem(DISPONIBILIDADE_KEY, JSON.stringify(next))
  } catch {
    /* memória continua a fonte da sessão */
  }
  for (const cb of listeners) cb()
}

/** Restaura a matriz de disponibilidade para os defaults da nota. */
function resetDisponibilidade() {
  const cur = getSettings()
  state = { ...cur, disponibilidade: cloneMatrix(DEFAULT_MATRIX) }
  try {
    localStorage.removeItem(DISPONIBILIDADE_KEY)
  } catch {
    /* noop */
  }
  for (const cb of listeners) cb()
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

export function useSettings() {
  const settings = useSyncExternalStore(subscribe, getSettings)
  return { ...settings, setMestre, setDisponibilidadeCell, resetDisponibilidade }
}

/** Snapshot não-reativo da matriz (para módulos fora de React, ex. rolagem). */
export function getDisponibilidadeMatrix(): AvailabilityMatrix {
  return getSettings().disponibilidade
}

/** SÓ testes: zera o cache em memória (simula reload). */
export function __resetSettingsForTests(): void {
  state = null
}
