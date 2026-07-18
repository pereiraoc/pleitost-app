// #303: ícone de "supercharged link" de um wikilink — o mesmo emoji que o
// Obsidian mostra antes do link, derivado do DOC-ALVO. NÃO inventa emoji: lê o
// registro central (tokens.emojis) pelas MESMAS facetas em que o CSS
// supercharged da vault chaveia os ícones (supercharged-links-gen.css):
//   data-link-grupo        → grupoArma (armas)      ex.: ⚔️ cac-marcial
//   data-link-subcategoria → subcategoria           ex.: 💍 Tesouro, 👤 Heroi
//   data-link-categoria    → categoria (type)       ex.: 👑 Classe, 📕 Habilidade
// Prioridade grupo → subcategoria → categoria (a mais específica ganha), como as
// regras do CSS. Sem casar nenhuma faceta → '' (link sem ícone).
import type { IndexDocEntry } from '../data/types'
import { grupoArmaEmoji, tokens } from '../components/ficha/registry'

const CATEGORIA = tokens.emojis.categoria as Record<string, string>
const SUBCATEGORIA = tokens.emojis.subcategoria as Record<string, string>

/** Chave do registro = valor sem diacríticos (as chaves são ASCII: "Técnica" →
 *  "Tecnica", "Consumível" → "Consumivel", "Percepção" → "Percepcao"). */
function regKey(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

/** Emoji do link a partir da entrada de índice do doc-alvo (síncrono). */
export function linkIconForEntry(entry: IndexDocEntry | undefined): string {
  if (!entry) return ''
  const arma = grupoArmaEmoji(typeof entry.grupo === 'string' ? entry.grupo : '')
  if (arma) return arma
  if (entry.subtype) {
    const sub = SUBCATEGORIA[regKey(entry.subtype)]
    if (sub) return sub
  }
  if (entry.type) {
    const cat = CATEGORIA[regKey(entry.type)]
    if (cat) return cat
  }
  return ''
}
