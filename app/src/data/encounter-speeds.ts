// Prep de encontro (app-side, por conta): velocidade de iniciativa + estado
// inicial POR MONSTRO. Chave localStorage `pleitost.encounterSpeeds` (sincroniza
// por conta via remote-persist). A vault é read-only — nada disto vai pras notas.
// monsterKey = "<sourcePath|label>#<n>" (instância 1-based).
import { useSyncExternalStore } from 'react'
import { createStoreChannel } from './store-kit'
import type { SpeedTier } from './initiative-blocks'

export interface MonsterPrep {
  tier: SpeedTier | null
  escondido: boolean
  disfarcado: boolean
}
const DEFAULT: MonsterPrep = { tier: null, escondido: false, disfarcado: false }
type All = Record<string, Record<string, MonsterPrep>> // encPath → monsterKey → prep

const KEY = 'pleitost.encounterSpeeds'
const channel = createStoreChannel()
let cache: All | null = null

function load(): All {
  if (cache) return cache
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null
    cache = raw ? (JSON.parse(raw) as All) : {}
  } catch {
    cache = {}
  }
  return cache!
}

function persist(next: All): void {
  cache = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* storage indisponível */
  }
  channel.emit()
}

export function getEncounterPreps(encounterPath: string): Record<string, MonsterPrep> {
  return load()[encounterPath] ?? {}
}

export function getMonsterPrep(encounterPath: string, monsterKey: string): MonsterPrep {
  return { ...DEFAULT, ...(load()[encounterPath]?.[monsterKey] ?? {}) }
}

export function setMonsterPrep(encounterPath: string, monsterKey: string, patch: Partial<MonsterPrep>): void {
  const all = load()
  const enc = { ...(all[encounterPath] ?? {}) }
  enc[monsterKey] = { ...DEFAULT, ...(enc[monsterKey] ?? {}), ...patch }
  persist({ ...all, [encounterPath]: enc })
}

/** Versão reativa (bump a cada escrita) — para re-render dos banners. */
export function useEncounterSpeedsVersion(): number {
  return useSyncExternalStore(channel.subscribe, channel.version, channel.version)
}

export function __resetEncounterSpeedsForTests(): void {
  cache = null
  channel.resetForTests()
}
