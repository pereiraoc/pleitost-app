// FRESCOR do cache de vault-data (report 2026-08-15: lista de heróis com o
// Carlos "Trovador" mesmo com o JSON publicado certo). O SW serve vault-data/*
// como StaleWhileRevalidate — bom pra offline, mas um deploy de database só
// aparecia UMA visita depois (a visita corrente lê o cache velho e revalida em
// background). Antes do catálogo carregar, o stamp db-version.json (#190) é
// buscado DIRETO na rede (no-store); mudou desde a última visita → purga o
// cache 'vault-data' inteiro, e a MESMA visita já lê a database nova.
// Offline/erro de rede → mantém o cache (offline-first intacto).
import { vaultUrl } from './base-url'

const DB_VERSION_KEY = 'pleitost.dbVersionVista'

export async function ensureFreshVaultData(): Promise<void> {
  try {
    const res = await fetch(vaultUrl('db-version.json'), { cache: 'no-store' })
    if (!res.ok) return
    const stamp = (await res.json()) as { extractedAt?: unknown }
    const atual = typeof stamp.extractedAt === 'string' ? stamp.extractedAt : ''
    if (!atual) return
    const ls = typeof window !== 'undefined' ? window.localStorage : undefined
    if (ls?.getItem(DB_VERSION_KEY) === atual) return
    if (typeof caches !== 'undefined') {
      await caches.delete('vault-data').catch(() => {})
    }
    ls?.setItem(DB_VERSION_KEY, atual)
  } catch {
    /* rede fora — o cache atual segue valendo */
  }
}
