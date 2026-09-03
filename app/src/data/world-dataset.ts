// Registro do DATASET do mundo ativo (#519): quais rels existem no diretório
// do mundo (docs `<id>.json`, assets, meta). O vaultUrl consulta aqui — rel
// presente no dataset do mundo resolve pro diretório dele; ausente cai na
// FANTASIA (fallback em camadas: imagem/doc sem versão cyberpunk usa a base).
// Populado pelo CatalogProvider ao carregar o manifest do mundo.
import { activeWorld, WORLD_DATA_DIR, type WorldId } from './world'

let mundoCarregado: WorldId | null = null
let rels: Set<string> | null = null

/** Normaliza um rel possivelmente ENCODADO pros lookups (os call sites do
 *  vaultUrl encodam por segmento). */
function chave(rel: string): string {
  return rel
    .split('/')
    .map((s) => {
      try {
        return decodeURIComponent(s)
      } catch {
        return s
      }
    })
    .join('/')
}

/** CatalogProvider registra os rels do dataset do mundo (null = ausente). */
export function setWorldDataset(world: WorldId, disponiveis: Iterable<string> | null): void {
  mundoCarregado = world
  rels = disponiveis ? new Set([...disponiveis].map(chave)) : null
}

/** SÓ testes. */
export function __resetWorldDatasetForTests(): void {
  mundoCarregado = null
  rels = null
}

/** Diretório de dados pra um rel no mundo ativo (fallback fantasia). */
export function dataDirFor(rel: string): string {
  const world = activeWorld()
  if (world === 'fantasia') return WORLD_DATA_DIR.fantasia
  if (mundoCarregado === world && rels?.has(chave(rel))) return WORLD_DATA_DIR[world]
  return WORLD_DATA_DIR.fantasia
}

/** O mundo ativo tem dataset próprio publicado? (banner de "em preparação") */
export function worldDatasetDisponivel(): boolean {
  const world = activeWorld()
  if (world === 'fantasia') return true
  return mundoCarregado === world && rels !== null
}

/** Chave do CARIMBO de frescor visto (db-version) por mundo — fonte única;
 *  o ensureFreshVaultData grava, o vaultUrl lê pra versionar URLs. */
export function dbStampKey(world: WorldId): string {
  return world === 'fantasia' ? 'pleitost.dbVersionVista' : `pleitost.dbVersionVista.${world}`
}

/** Carimbo visto do dataset que serve `dir` ('vault-data'/'vault-data-cyberpunk'),
 *  ou null (1ª visita / sem storage). */
export function stampForDir(dir: string): string | null {
  const world = (Object.keys(WORLD_DATA_DIR) as WorldId[]).find((w) => WORLD_DATA_DIR[w] === dir)
  if (!world) return null
  try {
    return localStorage.getItem(dbStampKey(world))
  } catch {
    return null
  }
}
