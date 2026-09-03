// FRESCOR do cache de vault-data (report 2026-08-15: lista de heróis com o
// Carlos "Trovador" mesmo com o JSON publicado certo). O SW serve vault-data/*
// como StaleWhileRevalidate — bom pra offline, mas um deploy de database só
// aparecia UMA visita depois (a visita corrente lê o cache velho e revalida em
// background). Antes do catálogo carregar, o stamp db-version.json (#190) é
// buscado DIRETO na rede (no-store); mudou desde a última visita → purga o
// cache 'vault-data' inteiro, e a MESMA visita já lê a database nova.
// Offline/erro de rede → mantém o cache (offline-first intacto).
import { withBase } from './base-url'
import { WORLD_DATA_DIR, type WorldId } from './world'
import { dbStampKey } from './world-dataset'

/** Stamp/purge POR MUNDO (#519 G2): cada dataset tem seu db-version e seu
 *  bucket de cache no SW — deploy de um mundo não derruba o cache do outro.
 *  Fantasia usa chave/bucket legados (sem sufixo). URL explícita do diretório
 *  (não passa pelo vaultUrl ambiente: o registro do dataset ainda não
 *  carregou neste ponto do boot). */
export async function ensureFreshVaultData(world: WorldId = 'fantasia'): Promise<void> {
  const dir = WORLD_DATA_DIR[world]
  const stampKey = dbStampKey(world)
  try {
    const res = await fetch(withBase(`${dir}/db-version.json`), { cache: 'no-store' })
    if (!res.ok) return
    const stamp = (await res.json()) as { extractedAt?: unknown }
    const atual = typeof stamp.extractedAt === 'string' ? stamp.extractedAt : ''
    if (!atual) return
    const ls = typeof window !== 'undefined' ? window.localStorage : undefined
    if (ls?.getItem(stampKey) === atual) return
    if (typeof caches !== 'undefined') {
      await caches.delete(dir).catch(() => {})
    }
    ls?.setItem(stampKey, atual)
  } catch {
    /* rede fora — o cache atual segue valendo */
  }
}
