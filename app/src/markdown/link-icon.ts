// #303: ícone de "supercharged link" de um wikilink — o MESMO emoji que o
// Obsidian mostra antes do link, derivado do DOC-ALVO. NÃO inventa emoji: usa o
// mapa EXTRAÍDO da config do Obsidian (supercharged-links + Style Settings — ver
// supercharged-icons.ts), chaveado pelo VALOR EXATO da faceta (com espaços e
// acentos). Prioridade grupo → subcategoria → categoria (o mais específico
// ganha, como as regras do CSS). Sem casar nenhuma faceta → ''.
//
// Antes derivava do design-system (tokens.emojis) por uma chave "compacta" sem
// espaços — o que quebrava valores multi-palavra (ex.: "Companheiro Animal" não
// batia "CompanheiroAnimal") e não cobria categorias como Combate/Grupo/Aventura.
import type { IndexDocEntry } from '../data/types'
import { SC_CATEGORIA, SC_GRUPO, SC_SUBCATEGORIA } from './supercharged-icons'

/** NFC + trim — bate com as chaves do mapa (valores exatos da vault). */
function norm(s: string): string {
  return s.normalize('NFC').trim()
}

/** Emoji do link a partir da entrada de índice do doc-alvo (síncrono). */
export function linkIconForEntry(entry: IndexDocEntry | undefined): string {
  if (!entry) return ''
  // grupo de arma vem como string ("cac-marcial"); grupo-membership (lista de
  // wikilinks) não casa nenhuma chave e cai fora.
  const grupo = typeof entry.grupo === 'string' ? SC_GRUPO[norm(entry.grupo)] : undefined
  if (grupo) return grupo
  if (entry.subtype) {
    const sub = SC_SUBCATEGORIA[norm(entry.subtype)]
    if (sub) return sub
  }
  if (entry.type) {
    const cat = SC_CATEGORIA[norm(entry.type)]
    if (cat) return cat
  }
  return ''
}
