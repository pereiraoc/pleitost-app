// SENHA POR AVENTURA — lado do app (docs/plano-aventuras-na-sessao.md §2.5).
// O extract (extractor/cifra-doc.mjs) publica docs com FM `Senha:` como
// ENVELOPE: campos públicos + `protegido` {iv, cifra, chaves.{senha,dev}}.
// Aqui: (1) destravar com a senha da aventura (PBKDF2 → desembrulha K →
// decifra em memória); (2) destravar tudo com a CHAVE DO DEV, derivada UMA vez
// quando a senha do Modo Desenvolvedor é digitada no Config (salt fixo, igual
// ao extractor) e guardada por aparelho; (3) lembrar K por doc neste aparelho
// ("lembrar neste aparelho") e trancar de volta. Reativo via useSyncExternalStore
// (mesmo store-kit dos outros stores). Parâmetros ESPELHAM o extractor —
// paridade garantida por teste de ida-e-volta com a saída real do cifrarDoc.
import { useSyncExternalStore } from 'react'
import type { VaultDoc } from './types'
import { createStoreChannel } from './store-kit'

export const PBKDF2_ITER = 100000
/** Salt FIXO da chave do dev (extractor: SALT_DEV). */
export const SALT_DEV = 'pleitost-dev-v1'

const KEYS_KEY = 'pleitost.docLocks' // Record<docId, K base64> — "lembrar neste aparelho"
const DEV_KEY = 'pleitost.settings.devKey' // chave do dev derivada (base64)

const channel = createStoreChannel()
let mem: Map<string, string> | null = null // docId → K (b64), inclui os NÃO lembrados
let devKeyB64: string | null | undefined

const enc = new TextEncoder()
const dec = new TextDecoder()

function b64ToBytes(s: string): Uint8Array {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
function bytesToB64(b: Uint8Array): string {
  let s = ''
  for (const x of b) s += String.fromCharCode(x)
  return btoa(s)
}

export interface Envelope {
  v: number
  alg: string
  kdf: string
  iter: number
  iv: string
  cifra: string
  chaves: { senha: Wrapped; dev?: Wrapped }
}
interface Wrapped {
  salt: string
  iv: string
  cifra: string
}

async function deriveKey(senha: string, salt: Uint8Array, iter = PBKDF2_ITER): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(senha), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: iter, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  )
}

async function gcmDecrypt(key: CryptoKey, iv: string, cifra: string): Promise<Uint8Array> {
  const out = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(iv) as BufferSource }, key, b64ToBytes(cifra) as BufferSource)
  return new Uint8Array(out)
}

/** Desembrulha K com a senha da aventura. Lança em senha errada (GCM). */
async function unwrapWithSenha(w: Wrapped, senha: string, iter: number): Promise<Uint8Array> {
  const kek = await deriveKey(senha, b64ToBytes(w.salt), iter)
  return gcmDecrypt(kek, w.iv, w.cifra)
}

async function unwrapWithDevKey(w: Wrapped, devKey: string): Promise<Uint8Array> {
  const kek = await crypto.subtle.importKey('raw', b64ToBytes(devKey) as BufferSource, 'AES-GCM', false, ['decrypt'])
  return gcmDecrypt(kek, w.iv, w.cifra)
}

/** Decifra o envelope com K e devolve o doc COMPLETO (público ⊕ privado). */
export async function decryptDoc(pub: VaultDoc, kB64: string): Promise<VaultDoc> {
  const p = pub.protegido
  if (!p) return pub
  const key = await crypto.subtle.importKey('raw', b64ToBytes(kB64) as BufferSource, 'AES-GCM', false, ['decrypt'])
  const bytes = await gcmDecrypt(key, p.iv, p.cifra)
  const privado = JSON.parse(dec.decode(bytes)) as Partial<VaultDoc> & { frontmatter: Record<string, unknown> }
  const { protegido: _p, ...base } = pub
  void _p
  return { ...base, ...privado, frontmatter: { ...base.frontmatter, ...privado.frontmatter } } as VaultDoc
}

/* ── store de chaves por aparelho ───────────────────────────────────── */

function load(): Map<string, string> {
  if (mem) return mem
  mem = new Map()
  try {
    const raw = localStorage.getItem(KEYS_KEY)
    if (raw) for (const [k, v] of Object.entries(JSON.parse(raw) as Record<string, string>)) mem.set(k, v)
  } catch {
    /* sem storage */
  }
  return mem
}
function persistRemembered(): void {
  try {
    localStorage.setItem(KEYS_KEY, JSON.stringify(Object.fromEntries(load())))
  } catch {
    /* sem storage */
  }
}

export function loadDevKey(): string | null {
  if (devKeyB64 !== undefined) return devKeyB64
  try {
    devKeyB64 = localStorage.getItem(DEV_KEY)
  } catch {
    devKeyB64 = null
  }
  return devKeyB64
}

/** Deriva e GUARDA a chave do dev (chamado pelo Config ao ativar o modo com a
 *  senha certa). Guardar a derivada ≠ guardar a senha. */
export async function setDevSenha(senha: string): Promise<void> {
  const key = await deriveKey(senha, enc.encode(SALT_DEV))
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', key))
  devKeyB64 = bytesToB64(raw)
  try {
    localStorage.setItem(DEV_KEY, devKeyB64)
  } catch {
    /* memória */
  }
  channel.emit()
}
export function clearDevKey(): void {
  devKeyB64 = null
  try {
    localStorage.removeItem(DEV_KEY)
  } catch {
    /* memória */
  }
  channel.emit()
}

/** K deste doc, se destravado (lembrado ou nesta sessão). */
export function keyFor(docId: string): string | null {
  return load().get(docId) ?? null
}
export function isUnlocked(docId: string): boolean {
  return load().has(docId)
}

/** Destrava com a senha da aventura. false = senha errada. `lembrar` persiste
 *  K neste aparelho; senão fica só em memória (até recarregar). */
export async function unlockWithSenha(pub: VaultDoc, senha: string, lembrar: boolean): Promise<boolean> {
  const p = pub.protegido
  if (!p) return true
  try {
    const k = await unwrapWithSenha(p.chaves.senha, senha, p.iter ?? PBKDF2_ITER)
    load().set(pub.id, bytesToB64(k))
    if (lembrar) persistRemembered()
    channel.emit()
    return true
  } catch {
    return false
  }
}

/** Destrava com a chave do dev guardada (Modo Desenvolvedor). false = sem
 *  chave/dev não bate (doc extraído sem senha de dev). Não persiste K: o dev
 *  reabre sempre pela chave dele. */
export async function unlockWithDev(pub: VaultDoc): Promise<boolean> {
  const p = pub.protegido
  if (!p) return true
  const dk = loadDevKey()
  if (!dk || !p.chaves.dev) return false
  try {
    const k = await unwrapWithDevKey(p.chaves.dev, dk)
    load().set(pub.id, bytesToB64(k))
    channel.emit()
    return true
  } catch {
    return false
  }
}

/** 🔒 Bloquear: esquece K (memória e aparelho). */
export function lock(docId: string): void {
  load().delete(docId)
  persistRemembered()
  channel.emit()
}

/** Doc efetivo: decifrado se houver K; senão o próprio envelope público
 *  (`protegido` presente = trancado, a view gateia). */
export async function unlockedDoc(pub: VaultDoc): Promise<VaultDoc> {
  if (!pub.protegido) return pub
  const k = keyFor(pub.id)
  if (!k) return pub
  try {
    return await decryptDoc(pub, k)
  } catch {
    // K inválido (dataset re-extraído com chave nova) → esquece e fica trancado
    lock(pub.id)
    return pub
  }
}

export function useDocLockVersion(): number {
  return useSyncExternalStore(channel.subscribe, channel.version, channel.version)
}

/** SÓ testes. */
export function __resetDocLocksForTests(): void {
  mem = null
  devKeyB64 = undefined
  try {
    localStorage.removeItem(KEYS_KEY)
    localStorage.removeItem(DEV_KEY)
  } catch {
    /* */
  }
  channel.emit()
}
