// PLURAL pt-BR de um rótulo curto (2026-09-09). Serve pra nomear uma aba/seção
// pelo SUBTIPO que o dado declara: os filhos de Porto Alegre são `Bairro`, logo
// a aba é "Bairros"; dentro do bairro são `Ponto de Interesse`, logo "Pontos de
// Interesse". É transformação do dado, não rótulo inventado — nada de
// `if (tipo === 'Bairro') return 'Bairros'` no call site.
//
// Só o NÚCLEO flexiona: preposição em diante fica como está ("Ponto de
// Interesse" → "Pontos de Interesse", não "Pontos de Interesses").

/** Palavras que encerram o núcleo do rótulo. */
const PREPOSICOES = new Set(['de', 'do', 'da', 'dos', 'das', 'e', 'em', 'no', 'na', 'nos', 'nas', 'a', 'ao', 'à'])

/** Plural de UMA palavra, pelas terminações do português. */
function pluralPalavra(p: string): string {
  if (p === '') return p
  const min = p.toLocaleLowerCase('pt-BR')
  // ão → ões (Região → Regiões). Casos em -ãos/-ães existem (mão, pão), mas
  // não em rótulo de categoria; -ões é a regra produtiva.
  if (min.endsWith('ão')) return p.slice(0, -2) + 'ões'
  // -al/-el/-ol/-ul → -ais/-eis/-óis/-uis (Local → Locais, Hotel → Hotéis)
  if (/[aeou]l$/.test(min)) {
    const v = min.at(-2)!
    const troca: Record<string, string> = { a: 'ais', e: 'éis', o: 'óis', u: 'uis' }
    return p.slice(0, -2) + (p.at(-2) === p.at(-2)!.toLocaleUpperCase('pt-BR') ? troca[v]!.toLocaleUpperCase('pt-BR') : troca[v]!)
  }
  if (min.endsWith('il')) return p.slice(0, -2) + 'is'
  if (min.endsWith('m')) return p.slice(0, -1) + 'ns'
  // -r, -z e -s tônico ganham -es; -s átono (Interesse não é -s) fica igual
  if (/[rz]$/.test(min)) return p + 'es'
  if (min.endsWith('s')) return p
  if (/[aeiouáéíóúâêôãõ]$/.test(min)) return p + 's'
  return p + 's'
}

/** Rótulo no plural: flexiona o núcleo e para na primeira preposição. */
export function pluralPt(rotulo: string): string {
  const palavras = String(rotulo ?? '').trim().split(/\s+/)
  if (palavras.length === 1 && palavras[0] === '') return ''
  let nucleo = true
  return palavras
    .map((p) => {
      if (!nucleo) return p
      if (PREPOSICOES.has(p.toLocaleLowerCase('pt-BR'))) {
        nucleo = false
        return p
      }
      return pluralPalavra(p)
    })
    .join(' ')
}
