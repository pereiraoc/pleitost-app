// REGALIAS DE CLASSE (2026-09-08) — cada classe do mundo ganha de TERCEIRO um
// eixo do custo de vida (moradia, transporte, alimentação ou serviço), em três
// degraus de nível, e cada degrau tem um preço escondido. A nota da vault
// (`recursos.regalias` do contexto) é a FONTE: aqui só se lê.
//
// Formato da nota, por classe:
//   #### <Nome no mundo> ([[<Classe canônica>]]) — <subtítulo>
//   <intro em prosa>
//   - **nv <N> · <Título>:** <o que ganha>. *Preço:* <o que custa>.
//
// A chave é a classe CANÔNICA do wikilink (o FM do herói guarda o nome
// canônico; o nome do mundo é reskin), então o lookup nunca depende do rótulo.
import { scanHeadings } from '../aventura/markdown-sections'

export interface DegrauRegalia {
  nivel: number
  /** Título do degrau ("Trainee", "Gerente") — nem toda classe usa. */
  titulo: string | null
  /** O que se ganha, em markdown (wikilinks preservados). */
  texto: string
  /** O preço escondido, quando o degrau declara um. */
  preco: string | null
  /** `*Concede:*` — o que ESTE degrau passa a dar (nomes de notas de Recurso).
   *  A prosa também linka coisas que NÃO são concessão (o endereço fictício,
   *  o aluguel que "não é regalia", a cortesia avulsa), então adivinhar ali
   *  daria erro silencioso: só vale o que o campo declara. */
  concede: string[]
  /** `*Larga:*` — o que este degrau DEVOLVE. O Executivo troca um eixo pelo
   *  outro ("a kitnet passa pro teu bolso"); sem isto, a união dos degraus o
   *  deixaria com os dois. */
  larga: string[]
  /** `*Paga:*` — quem banca este degrau. Muda de degrau pra degrau dentro da
   *  mesma classe (a casa, depois a gravadora, depois a marca). */
  paga: string | null
  /** `*Renda:*` em moeda do mundo — o que cai no bolso ao abrir o mês. */
  renda: number
}

export interface RegaliaDeClasse {
  /** Classe canônica (alvo do wikilink) — a chave do mapa. */
  classe: string
  /** Nome da classe no mundo (o reskin), como a nota escreve. */
  nome: string
  subtitulo: string | null
  intro: string
  degraus: DegrauRegalia[]
}

/** `#### Executivo ([[Caçador]]) — a escada corporativa` */
const CABECALHO = /^(.+?)\s*\(\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]\)\s*(?:[—–-]\s*(.*))?$/
/** `- **nv 4 · Gerente:** …` — o rótulo entre o número e os dois-pontos é
 *  livre (`· Gerente`, `(título da subclasse)`, nada). */
const DEGRAU = /^-\s+\*\*nv\s*(\d+)\s*([^:*]*):\*\*\s*(.+)$/i
/** Campos do degrau: `*Rótulo:* valor`, em QUALQUER ordem, cada um indo até o
 *  próximo campo conhecido ou o fim da linha. O lookahead só reconhece esta
 *  lista de propósito: a nota usa `**Negrito:**` na prosa, e um lookahead
 *  solto truncaria o texto no primeiro deles. */
const ROTULOS = ['Preço', 'Concede', 'Larga', 'Paga', 'Renda'] as const
const campoRe = (r: string) => new RegExp(`\\*${r}:\\*\\s*(.+?)(?=\\s\\*(?:${ROTULOS.join('|')}):\\*|$)`)
const PRECO = campoRe('Preço')
const CONCEDE = campoRe('Concede')
const LARGA = campoRe('Larga')
const PAGA = campoRe('Paga')
const RENDA = campoRe('Renda')

/** Alvo de um wikilink (`[[Caçador|Executivo]]` → `Caçador`); texto cru passa.
 *  A tabela escapa o pipe (`[[Caçador\|Executivo]]`), e a barra tem que sair. */
export function alvoDoLink(s: string): string {
  const m = /\[\[([^\]|#]+)/.exec(s)
  return (m ? m[1]! : s).replace(/\\$/, '').trim()
}

/** Lista de um campo: separadores `,`, `;` e ` e `. Cada item vira alvo. */
export function listaDeLinks(valor: string): string[] {
  return valor
    .split(/\s*[,;]\s*|\s+e\s+/)
    .map((s) => alvoDoLink(s.replace(/\.$/, '')))
    .filter(Boolean)
}

/** `Cz$ 40.000/mês` → 40000. Ponto e espaço são separador de milhar; o resto
 *  da frase é prosa. Sem número, zero. */
export function precoInteiro(s: string): number {
  const m = /(\d[\d.\s]*)/.exec(s)
  return m ? Number(m[1]!.replace(/[.\s]/g, '')) || 0 : 0
}

/** Alvo de um wikilink (`[[Caçador|Executivo]]` → `Caçador`); texto cru passa. */
/** Classe CANÔNICA a partir do FM (wikilink ou texto) — a chave das tabelas
 *  por classe (regalias, tendência de classe social). */
export function classeCanonica(s: string): string {
  return alvoDoLink(s)
}

/** Corpo da nota → regalia por classe canônica. Heading sem wikilink de classe
 *  (ex.: "Como se usa") não é classe e fica de fora. */
/** Um nível de citação (`> `) é APRESENTAÇÃO, não dado: desde 2026-09-12 a
 *  nota guarda as classes dentro de um callout dobrável pra continuar
 *  parecida com as outras de Contexto Atual. Fora isso a linha é intocada. */
const semCitacao = (l: string) => l.replace(/^>[ \t]?/, '')

export function parseRegalias(body: string): Map<string, RegaliaDeClasse> {
  const linhas = String(body ?? '').split('\n').map(semCitacao)
  const headings = scanHeadings(linhas)
  const mapa = new Map<string, RegaliaDeClasse>()
  headings.forEach((h, i) => {
    const m = CABECALHO.exec(h.text)
    if (!m) return
    const fim = headings[i + 1]?.line ?? linhas.length
    const corpo = linhas.slice(h.line + 1, fim)
    const degraus: DegrauRegalia[] = []
    const intro: string[] = []
    for (const l of corpo) {
      const d = DEGRAU.exec(l)
      if (!d) {
        if (!degraus.length && l.trim()) intro.push(l.trim())
        continue
      }
      const resto = d[3]!.trim()
      const p = PRECO.exec(resto)
      const c = CONCEDE.exec(resto)
      const lg = LARGA.exec(resto)
      const pg = PAGA.exec(resto)
      const rd = RENDA.exec(resto)
      // o texto vai até o PRIMEIRO campo declarado, seja ele qual for
      const corte = [p, c, lg, pg, rd].reduce((menor, m) => (m && m.index < menor ? m.index : menor), resto.length)
      degraus.push({
        nivel: Number(d[1]),
        titulo: (d[2] ?? '').replace(/^[·:\-\s]+/, '').replace(/^\(|\)$/g, '').trim() || null,
        texto: resto.slice(0, corte).replace(/\s*[—-]\s*$/, '').trim(),
        preco: p ? p[1]!.trim() : null,
        concede: c ? listaDeLinks(c[1]!) : [],
        larga: lg ? listaDeLinks(lg[1]!) : [],
        paga: pg ? pg[1]!.trim().replace(/\.$/, '') : null,
        renda: rd ? precoInteiro(rd[1]!) : 0,
      })
    }
    if (!degraus.length) return
    mapa.set(m[2]!.trim(), {
      classe: m[2]!.trim(),
      nome: m[1]!.trim(),
      subtitulo: m[3]?.trim() || null,
      intro: intro.join(' '),
      degraus: degraus.sort((a, b) => a.nivel - b.nivel),
    })
  })
  return mapa
}

/** Regalia da classe do herói (FM `Classe`, wikilink ou texto). */
export function regaliaDaClasse(mapa: Map<string, RegaliaDeClasse>, classeFm: string): RegaliaDeClasse | null {
  const chave = classeCanonica(String(classeFm ?? ''))
  return chave ? (mapa.get(chave) ?? null) : null
}
