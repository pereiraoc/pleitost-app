// Vendas do dia por estabelecimento (2026-09-07b): a vitrine é rolada por
// semente (estabelecimento + dia); o que foi vendido hoje sai da quantidade
// até virar o dia. localStorage por mundo é desnecessário — a chave já leva
// o id do doc (que é do mundo). Falha de storage = memória só.
import { useSyncExternalStore } from 'react'

const KEY = 'pleitost.ofertasVendidas'

interface Registro {
  dia: string
  vendidas: Record<string, number>
}

let memoria: Record<string, Registro> | null = null
let versao = 0
const ouvintes = new Set<() => void>()

export function diaDeHoje(): string {
  return new Date().toISOString().slice(0, 10)
}

function carregar(): Record<string, Registro> {
  if (memoria) return memoria
  try {
    memoria = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, Registro>
  } catch {
    memoria = {}
  }
  return memoria!
}
function gravar() {
  versao++
  try {
    localStorage.setItem(KEY, JSON.stringify(memoria ?? {}))
  } catch {
    /* sem storage: fica na memória */
  }
  for (const cb of ouvintes) cb()
}

export function vendidasHoje(docId: string): Record<string, number> {
  const reg = carregar()[docId]
  return reg && reg.dia === diaDeHoje() ? reg.vendidas : {}
}

export function registrarVenda(docId: string, key: string, n: number): void {
  const tudo = carregar()
  const hoje = diaDeHoje()
  const reg = tudo[docId] && tudo[docId]!.dia === hoje ? tudo[docId]! : { dia: hoje, vendidas: {} }
  reg.vendidas[key] = (reg.vendidas[key] ?? 0) + n
  tudo[docId] = reg
  gravar()
}

export function useVendidasHoje(docId: string): Record<string, number> {
  useSyncExternalStore(
    (cb) => {
      ouvintes.add(cb)
      return () => ouvintes.delete(cb)
    },
    () => versao,
    () => versao,
  )
  return vendidasHoje(docId)
}

/** SÓ testes. */
export function __resetOfertasStoreForTests(): void {
  memoria = null
  versao++
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
