// MODO DEBUG (pedido do usuário na sessão 2026-07-20): "um botão de modo debug,
// pra quando ativado salvar logs relativos a coisas que tu vai instrumentar pra
// conseguir pegar problemas, aí tem que ter uma forma de subir logs junto com um
// bug report pra ele entrar junto na issue".
//
// Como funciona: um RING BUFFER em memória (últimos N eventos). Quando o modo
// debug está LIGADO, os pontos instrumentados (salvamento/publicação/sync/pull)
// chamam `pushLog(...)` e erros do console/janela são capturados. No REPORTAR
// BUG, se houver logs, eles vão ANEXADOS no `contexto.logs` do report (mesma
// tabela `bug_reports`, sem mudança de schema — `contexto` já é jsonb). Quem lê
// o report no dashboard vê exatamente o rastro do que aconteceu antes do bug.
//
// Só captura quando LIGADO (o usuário liga, reproduz, reporta) — sem overhead
// nem dados sensíveis quando desligado.

const FLAG_KEY = 'pleitost.debug'
const CAP = 400 // teto do ring buffer — descarta o mais antigo
const CHANGE_EVENT = 'pleitost:debug-change'

export interface DebugEntry {
  /** epoch ms — quando o evento foi registrado. */
  t: number
  /** categoria curta do ponto instrumentado (ex.: 'save', 'sync', 'error'). */
  tag: string
  /** mensagem legível já resumida (sem PII bruta além do necessário). */
  msg: string
}

const buffer: DebugEntry[] = []
let hooksInstalled = false
// originais preservados pra DESINSTALAR ao desligar (review: o override não
// pode ficar pra sempre na sessão depois de um liga/desliga).
let origConsole: { error: typeof console.error; warn: typeof console.warn } | null = null
let winErrorHandler: ((e: ErrorEvent) => void) | null = null
let winRejectionHandler: ((e: Event) => void) | null = null

function readFlag(): boolean {
  try {
    return localStorage.getItem(FLAG_KEY) === '1'
  } catch {
    return false
  }
}

/** Modo debug está ligado? (persistido em localStorage entre reloads.) */
export function isDebugOn(): boolean {
  return readFlag()
}

/** Liga/desliga o modo debug. Dispara um evento pra UI reagir na hora. */
export function setDebugOn(on: boolean): void {
  try {
    if (on) localStorage.setItem(FLAG_KEY, '1')
    else localStorage.removeItem(FLAG_KEY)
  } catch {
    /* modo privado / storage cheio — segue sem persistir */
  }
  if (on) installHooks()
  else uninstallHooks()
  try {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT))
  } catch {
    /* SSR/teste sem window */
  }
}

/** Assina mudanças de estado do modo debug (retorna o cancelador). */
export function onDebugChange(cb: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, cb)
  return () => window.removeEventListener(CHANGE_EVENT, cb)
}

/** Registra um evento no ring buffer — NO-OP quando o modo debug está desligado.
 *  `data`, se vier, é resumido em JSON curto e anexado à mensagem. */
export function pushLog(tag: string, msg: string, data?: unknown): void {
  if (!readFlag()) return
  let linha = msg
  if (data !== undefined) {
    try {
      const json = JSON.stringify(data)
      linha += ' ' + (json.length > 300 ? json.slice(0, 300) + '…' : json)
    } catch {
      /* dado circular/não-serializável — ignora o anexo */
    }
  }
  buffer.push({ t: Date.now(), tag, msg: linha })
  if (buffer.length > CAP) buffer.splice(0, buffer.length - CAP)
}

/** Cópia dos logs capturados (mais antigo → mais novo). */
export function getLogs(): DebugEntry[] {
  return buffer.slice()
}

/** Quantos logs estão no buffer agora. */
export function logCount(): number {
  return buffer.length
}

/** Zera o buffer (ex.: depois de anexar num report). */
export function clearLogs(): void {
  buffer.length = 0
}

/** Captura console.error/warn + erros não tratados da janela quando ligado.
 *  Idempotente: instala uma vez só. Só EMPILHA quando o flag está ligado. */
function installHooks(): void {
  if (hooksInstalled) return
  hooksInstalled = true
  const fmt = (args: unknown[]) =>
    args
      .map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : typeof a === 'string' ? a : safeJson(a)))
      .join(' ')
  origConsole = { error: console.error.bind(console), warn: console.warn.bind(console) }
  for (const level of ['error', 'warn'] as const) {
    const orig = origConsole[level]
    console[level] = (...args: unknown[]) => {
      pushLog(`console.${level}`, fmt(args))
      orig(...args)
    }
  }
  winErrorHandler = (e: ErrorEvent) => {
    pushLog('window.error', `${e.message} @ ${e.filename}:${e.lineno}`)
  }
  winRejectionHandler = (e: Event) => {
    const r = (e as PromiseRejectionEvent).reason
    pushLog('unhandledrejection', r instanceof Error ? `${r.name}: ${r.message}` : safeJson(r))
  }
  window.addEventListener('error', winErrorHandler)
  window.addEventListener('unhandledrejection', winRejectionHandler)
}

/** Restaura console/window ao DESLIGAR o modo debug — sem override residual. */
function uninstallHooks(): void {
  if (!hooksInstalled) return
  hooksInstalled = false
  if (origConsole) {
    console.error = origConsole.error
    console.warn = origConsole.warn
    origConsole = null
  }
  if (winErrorHandler) window.removeEventListener('error', winErrorHandler)
  if (winRejectionHandler) window.removeEventListener('unhandledrejection', winRejectionHandler)
  winErrorHandler = null
  winRejectionHandler = null
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

// Se o app abre já com debug ligado (persistido), instala os hooks de imediato.
if (typeof window !== 'undefined' && readFlag()) installHooks()
