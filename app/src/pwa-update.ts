/// <reference types="vite-plugin-pwa/client" />
// UPDATE DO PWA (issue #191) — registerType 'prompt' no vite.config: quando
// um deploy novo sobe, o service worker novo fica EM ESPERA e onNeedRefresh
// dispara. Aqui isso vira um estado global simples (useSyncExternalStore,
// mesmo padrão do theme.ts/hero-store): o AppShell mostra o toast
// "Atualização disponível — Recarregar" e recarregar chama updateSW(true),
// que ativa o SW novo e recarrega a página.
import { useSyncExternalStore } from 'react'

type UpdateSW = (reloadPage?: boolean) => Promise<void>

let needRefresh = false
let updateSW: UpdateSW | null = null
let started = false
const listeners = new Set<() => void>()

function emit() {
  for (const cb of listeners) cb()
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

/** Registra o SW e liga o onNeedRefresh no estado global. Idempotente —
 *  o AppShell chama no mount; chamadas seguintes são no-op. */
export async function initPwaUpdate(): Promise<void> {
  if (started) return
  started = true
  try {
    // virtual:pwa-register é do vite-plugin-pwa: real no build, stub no-op
    // em dev (devOptions desligado). Import dinâmico pra ambientes sem o
    // plugin (ex.: vitest) caírem no catch em vez de quebrar o bundle.
    const { registerSW } = await import('virtual:pwa-register')
    updateSW = registerSW({
      onNeedRefresh() {
        needRefresh = true
        emit()
      },
    })
  } catch {
    /* módulo virtual indisponível — sem fluxo de update (dev/teste) */
  }
}

/** true quando há versão nova publicada esperando ativação (toast visível). */
export function usePwaNeedRefresh(): boolean {
  return useSyncExternalStore(subscribe, () => needRefresh)
}

/** Aplica o update: ativa o SW em espera e recarrega a página. */
export function applyPwaUpdate(): void {
  void updateSW?.(true)
}

export function __resetPwaUpdateForTests(): void {
  needRefresh = false
  updateSW = null
  started = false
}

// Versão do app (#191), visível no CONFIG: injetada pelo `define` do
// vite.config a partir do package.json do app. O typeof protege ambientes
// sem define (ex.: node puro importando o módulo).
declare const __APP_VERSION__: string
export const APP_VERSION: string =
  typeof __APP_VERSION__ === 'undefined' ? 'dev' : __APP_VERSION__
