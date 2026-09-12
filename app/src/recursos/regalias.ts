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
const PRECO = /\*Preço:\*\s*(.+)$/

/** Alvo de um wikilink (`[[Caçador|Executivo]]` → `Caçador`); texto cru passa. */
function alvo(s: string): string {
  const m = /\[\[([^\]|#]+)/.exec(s)
  return (m ? m[1]! : s).trim()
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
      degraus.push({
        nivel: Number(d[1]),
        titulo: (d[2] ?? '').replace(/^[·:\-\s]+/, '').replace(/^\(|\)$/g, '').trim() || null,
        texto: (p ? resto.slice(0, p.index) : resto).replace(/\s*[—-]\s*$/, '').trim(),
        preco: p ? p[1]!.trim() : null,
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
  const chave = alvo(String(classeFm ?? ''))
  return chave ? (mapa.get(chave) ?? null) : null
}
