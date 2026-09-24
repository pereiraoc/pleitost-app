// DANO FINAL com os valores do personagem (#466) — módulo PURO.
//
// As notas da vault escrevem as fórmulas em PROSA com um vocabulário pequeno
// (levantado em docs/plano-dano-final-466.md): "1d6×potência",
// "[1d6+(MOD/2)]×potência", "5×potência", "2 minutos×potência",
// "1d4×(potência+2)", "potência mágica 2 maior", "2d6+MOD", "13+MOD".
// Aqui o texto vira o VALOR do herói, com a expressão original entre
// parênteses (decisão do mestre, 2026-09-24): "1d6×potência" com potência 4
// → "4d6 (potência × 1d6)" — a potência multiplica a QUANTIDADE de dados.
// Sem o valor no contexto, o trecho fica intacto. A fonte de verdade segue
// sendo a prosa da nota; isto é transformação na borda de display, como o
// reskin.
export interface FormulaCtx {
  /** Potência mágica do BLOCO da magia (primário/secundário/aliado). */
  potencia: number | null
  /** Modificador do atributo de conjuração da escola (MOD). */
  mod: number | null
}

export interface Substituicao {
  de: string
  para: string
  motivo: string
}

/** Como um trecho substituído é escrito: default "4d6 (potência × 1d6)". */
export type RenderFormula = (calculado: string, original: string, motivo: string) => string
const renderPadrao: RenderFormula = (calc, orig) => `${calc} (${orig})`

const POT = 'pot[êe]ncia'
// multiplicando: [expr] | (expr) | NdM(±c) | ½ | N( unidade)?
const MULT_RE = new RegExp(
  String.raw`(\[[^\[\]]+\]|\((?:\d*d\d+|\d+|MOD|\(MOD/2\))(?:[+-](?:\d*d\d+|\d+|MOD|\(MOD/2\)))*\)|\d*d\d+(?:[+-]\d+)?|½|\d+(?:\s+\p{L}+)?)\s*[×x*]\s*(?:\(\s*${POT}\s*\+\s*(\d+)\s*\)|${POT})(?![\p{L}])`,
  'giu',
)
const MAIOR_RE = new RegExp(String.raw`${POT}\s+m[áa]gica\s+(\d+)\s+maior`, 'giu')
const MAIS_MOD_RE = /(\d*d\d+|\d+)\+MOD\b/g
const POT_RE = new RegExp(POT, 'giu')

interface Dado {
  n: number
  faces: number
}
interface Avaliado {
  dados: Dado[]
  constante: number
  usaMod: boolean
}

/** Avalia uma expressão de soma (termos: NdM, inteiro, MOD, (MOD/2), MOD/2)
 *  — null se precisa de MOD e não há. */
function avaliar(expr: string, mod: number | null): Avaliado | null {
  const s = expr.replace(/\s+/g, '')
  const out: Avaliado = { dados: [], constante: 0, usaMod: false }
  // divide em termos com sinal
  const termos = s.match(/[+-]?[^+-]+/g) ?? []
  for (const termo of termos) {
    const sinal = termo.startsWith('-') ? -1 : 1
    const corpo = termo.replace(/^[+-]/, '')
    let m: RegExpMatchArray | null
    if ((m = /^(\d*)d(\d+)$/i.exec(corpo))) {
      out.dados.push({ n: sinal * (m[1] ? Number(m[1]) : 1), faces: Number(m[2]) })
    } else if (/^\d+$/.test(corpo)) {
      out.constante += sinal * Number(corpo)
    } else if (/^\(?MOD\/2\)?$/.test(corpo)) {
      if (mod === null) return null
      out.usaMod = true
      out.constante += sinal * Math.floor(mod / 2)
    } else if (/^\(?MOD\)?$/.test(corpo)) {
      if (mod === null) return null
      out.usaMod = true
      out.constante += sinal * mod
    } else {
      return null
    }
  }
  return out
}

/** Escreve dados + constante ("4d6+4", "16", "2d6"). */
function escrever(av: Avaliado, k: number): string {
  const partes: string[] = []
  for (const d of av.dados) {
    const n = d.n * k
    if (n === 0) continue
    partes.push(`${partes.length && n > 0 ? '+' : ''}${n}d${d.faces}`)
  }
  const c = av.constante * k
  if (c !== 0 || !partes.length) partes.push(`${partes.length && c > 0 ? '+' : ''}${c}`)
  return partes.join('')
}

export function interpolarFormulas(
  texto: string,
  ctx: FormulaCtx,
  render: RenderFormula = renderPadrao,
): { texto: string; substituicoes: Substituicao[] } {
  const substituicoes: Substituicao[] = []
  let s = texto

  // MOD solto ("2d6+MOD", "13+MOD") PRIMEIRO, com os colchetes mascarados:
  // o MOD dentro de "[1d6+MOD]×potência" é da passada de potência (que o
  // avalia junto), e o original que ela escreve entre parênteses não pode
  // ser reprocessado.
  if (ctx.mod !== null) {
    const mod = ctx.mod
    const colchetes: string[] = []
    const mascarado = s.replace(/\[[^\[\]]+\]/g, (m) => {
      colchetes.push(m)
      return `\u0000${colchetes.length - 1}\u0000`
    })
    const trocado = mascarado.replace(MAIS_MOD_RE, (todo: string, base: string) => {
      const av = avaliar(`${base}+MOD`, mod)
      if (!av) return todo
      const calc = escrever(av, 1)
      substituicoes.push({ de: todo, para: calc, motivo: `MOD ${mod}` })
      return render(calc, todo, `MOD ${mod}`)
    })
    s = trocado.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => colchetes[Number(i)]!)
  }

  if (ctx.potencia !== null && ctx.potencia > 0) {
    const p = ctx.potencia
    s = s.replace(MULT_RE, (todo: string, mult: string, extra: string | undefined) => {
      const k = p + (extra ? Number(extra) : 0)
      const rotulo = extra ? `potência+${extra}` : 'potência'
      let calc: string | null = null
      let usaMod = false
      if (mult.startsWith('[') || mult.startsWith('(')) {
        const av = avaliar(mult.slice(1, -1), ctx.mod)
        if (!av) return todo
        usaMod = av.usaMod
        calc = escrever(av, k)
      } else if (mult === '½') {
        calc = `${Math.floor(k / 2)}`
      } else if (/d/i.test(mult)) {
        const av = avaliar(mult, ctx.mod)
        if (!av) return todo
        calc = escrever(av, k)
      } else {
        const m = /^(\d+)(\s+\p{L}+)?$/u.exec(mult.trim())
        if (!m) return todo
        calc = `${Number(m[1]) * k}${m[2] ?? ''}`
      }
      const motivo = `${rotulo.replace('potência', `potência ${p}`)}${usaMod ? ` · MOD ${ctx.mod}` : ''}`
      substituicoes.push({ de: todo, para: calc, motivo })
      return render(calc, `${rotulo} × ${mult.trim()}`, motivo)
    })
    s = s.replace(MAIOR_RE, (todo: string, n: string) => {
      const valor = p + Number(n)
      substituicoes.push({ de: todo, para: `${valor}`, motivo: `potência ${p}+${n}` })
      return `${todo} (${valor})`
    })
  }

  return { texto: s, substituicoes }
}

/** Trechos com "potência" que NENHUM padrão reconhece (fora de wikilinks) —
 *  pro teste de cobertura sobre o dataset: frase fora do padrão vira
 *  pendência visível de vault, não bug silencioso. */
export function ocorrenciasNaoReconhecidas(texto: string): string[] {
  // mascara wikilinks preservando índices
  const mascarado = texto.replace(/\[\[[^\]]*\]\]/g, (m) => ' '.repeat(m.length))
  const cobertos: Array<[number, number]> = []
  for (const re of [MULT_RE, MAIOR_RE]) {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(mascarado))) cobertos.push([m.index, m.index + m[0].length])
  }
  const out: string[] = []
  POT_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = POT_RE.exec(mascarado))) {
    const i = m.index
    if (cobertos.some(([a, b]) => i >= a && i < b)) continue
    out.push(
      texto
        .slice(Math.max(0, i - 30), i + 30)
        .replace(/\s+/g, ' ')
        .trim(),
    )
  }
  return out
}
