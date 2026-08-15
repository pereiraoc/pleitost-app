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
      // Sync entre devices (#366 follow-up): com registerType 'prompt', um
      // PWA instalado só descobria versão nova no LOAD — sessões longas (e o
      // hábito de nunca fechar o app) prendiam o aparelho num bundle velho
      // indefinidamente, inclusive com fixes de sync críticos. Checa por
      // update a cada 15 min E ao voltar o foco pro app; o banner continua
      // sendo prompt (nada recarrega sozinho no meio da mesa).
      onRegisteredSW(_url, reg) {
        if (!reg) return
        const check = () => void reg.update().catch(() => {})
        setInterval(check, 15 * 60_000)
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') check()
        })
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

/** Aplica o update: ativa o SW em espera e recarrega a página.
 *
 *  #191 follow-up (bug "Recarregar não recarrega"): NÃO confia no reload
 *  interno do updateSW — o vite-plugin-pwa só recarrega se o evento
 *  'controlling' do workbox-window vier com isUpdate, o que não acontece em
 *  cenários reais: SW já em espera ANTES do register (app reaberto com o
 *  update baixado na sessão anterior), update achado pelo check periódico
 *  (>60s após o register = "externo" pro workbox-window) e página sem
 *  controller (pós hard-reload). Aqui o ciclo fecha por conta própria:
 *  SKIP_WAITING direto no waiting SW da registration (o generateSW sempre
 *  instala esse listener no sw.js), reload no controllerchange (o
 *  clientsClaim do SW novo dispara) e um fallback por timeout pro botão
 *  nunca ficar morto. */
export function applyPwaUpdate(): void {
  void updateSW?.(true)
  const sw = navigator.serviceWorker
  if (!sw) return
  let done = false
  const recarregar = () => {
    if (done) return
    done = true
    ;(reloadForTests ?? (() => window.location.reload()))()
  }
  sw.addEventListener('controllerchange', recarregar, { once: true })
  void sw
    .getRegistration()
    .then((reg) => reg?.waiting?.postMessage({ type: 'SKIP_WAITING' }))
    .catch(() => {})
  // Sem claim em 4s (SKIP_WAITING perdido / nada em espera): recarrega mesmo
  // assim — pior caso é recarregar na versão atual, melhor que botão morto.
  setTimeout(recarregar, 4000)
}

let reloadForTests: (() => void) | null = null

export function __setPwaReloadForTests(fn: (() => void) | null): void {
  reloadForTests = fn
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
