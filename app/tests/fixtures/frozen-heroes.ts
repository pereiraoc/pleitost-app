import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const heroesDir = path.join(here, 'heroes')

// Heróis CONGELADOS: as fichas do Carlos e do Pind são snapshots FIXOS aqui
// (tests/fixtures/heroes/*.json), não a vault-data viva. Motivo: os testes de
// integração fixam valores COMPUTADOS a partir do estado-de-jogo desses heróis
// (dano, AdO, invocações, EM). Toda vez que uma sessão edita a ficha na vault
// (especializações/maestrias/recursos), o re-extract movia esses números e os
// goldens quebravam. Congelando a ficha, o extract da vault (ex.: novos itens
// como Artefatos) não mexe mais nesses testes. Demais docs (armas, magias,
// regras, condições) continuam lidos da vault-data viva — eles são conteúdo de
// sistema, não estado-de-jogo, e mudam raramente.
const FROZEN: Record<string, string> = {
  'Sistema/Criaturas/Heróis/Carlos Facão de Andradas': 'Carlos Facão de Andradas.json',
  'Sistema/Criaturas/Heróis/Pind Bund': 'Pind Bund.json',
}

/** Resolve um caminho relativo da vault-data (com ou sem `.json`) para o arquivo
 *  em disco: o fixture congelado quando é herói congelado, senão a vault-data
 *  viva em `vaultDataDir`. Usar tanto na leitura direta da ficha quanto no stub
 *  de `fetch` dos testes. */
export function resolveVaultFile(vaultDataDir: string, rel: string): string {
  const id = rel.replace(/\.json$/, '')
  const frozen = FROZEN[id]
  return frozen ? path.join(heroesDir, frozen) : path.join(vaultDataDir, rel)
}
