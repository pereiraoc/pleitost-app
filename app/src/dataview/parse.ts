// Parser das queries dataview usadas na vault. Cobre o corpus real (247
// queries): TABLE/LIST [WITHOUT ID], colunas com `expr [AS "Label"]`,
// FROM "pasta" | [[]] | outgoing([[]]) combinados com AND/!, WHERE com
// = != < > <= >= and/or/! e chamadas (contains/link), SORT multi-chave.
// Query fora disso lança — o componente cai no fallback colapsado.

export type Expr =
  | { kind: 'field'; path: string }
  | { kind: 'lit'; value: string | number | boolean | null }
  | { kind: 'call'; fn: string; args: Expr[] }
  | { kind: 'bin'; op: BinOp; left: Expr; right: Expr }
  | { kind: 'not'; inner: Expr }

export type BinOp = '=' | '!=' | '>' | '<' | '>=' | '<=' | 'and' | 'or'

export type FromTerm =
  | { kind: 'folder'; path: string; negated: boolean }
  | { kind: 'inlinks'; negated: boolean }
  | { kind: 'outlinks'; negated: boolean }

export interface SortKey {
  expr: Expr
  desc: boolean
}

export interface Query {
  kind: 'TABLE' | 'LIST'
  withoutId: boolean
  columns: { expr: Expr; label: string }[]
  from: FromTerm[]
  where?: Expr
  sort: SortKey[]
}

// ---------- tokenizer ----------

interface Token {
  kind: 'ident' | 'string' | 'number' | 'link' | 'punct'
  text: string
}

const PUNCT = ['!=', '>=', '<=', '=', '>', '<', '(', ')', ',', '!']

function tokenize(src: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < src.length) {
    const ch = src[i]
    if (/\s/.test(ch)) {
      i++
      continue
    }
    if (ch === '"') {
      const end = src.indexOf('"', i + 1)
      if (end === -1) throw new Error(`string sem fechamento em ${i}`)
      tokens.push({ kind: 'string', text: src.slice(i + 1, end) })
      i = end + 1
      continue
    }
    if (src.startsWith('[[', i)) {
      const end = src.indexOf(']]', i)
      if (end === -1) throw new Error(`link sem fechamento em ${i}`)
      tokens.push({ kind: 'link', text: src.slice(i + 2, end) })
      i = end + 2
      continue
    }
    const punct = PUNCT.find((p) => src.startsWith(p, i))
    if (punct) {
      tokens.push({ kind: 'punct', text: punct })
      i += punct.length
      continue
    }
    const num = /^-?\d+(\.\d+)?/.exec(src.slice(i))
    if (num) {
      tokens.push({ kind: 'number', text: num[0] })
      i += num[0].length
      continue
    }
    const ident = /^[\p{L}_][\p{L}\p{N}_.-]*/u.exec(src.slice(i))
    if (ident) {
      tokens.push({ kind: 'ident', text: ident[0] })
      i += ident[0].length
      continue
    }
    throw new Error(`caractere inesperado "${ch}" em ${i}`)
  }
  return tokens
}

// ---------- parser ----------

class Parser {
  private pos = 0
  constructor(private tokens: Token[]) {}

  peek(): Token | undefined {
    return this.tokens[this.pos]
  }

  next(): Token {
    const tok = this.tokens[this.pos++]
    if (!tok) throw new Error('fim inesperado da query')
    return tok
  }

  atKeyword(...words: string[]): boolean {
    const tok = this.peek()
    return tok?.kind === 'ident' && words.includes(tok.text.toUpperCase())
  }

  expectKeyword(word: string) {
    if (!this.atKeyword(word)) throw new Error(`esperava ${word}`)
    this.next()
  }

  done(): boolean {
    return this.pos >= this.tokens.length
  }

  // expressões — precedência: or < and < not < cmp < primary
  parseExpr(): Expr {
    return this.parseOr()
  }

  private parseOr(): Expr {
    let left = this.parseAnd()
    while (this.atKeyword('OR')) {
      this.next()
      left = { kind: 'bin', op: 'or', left, right: this.parseAnd() }
    }
    return left
  }

  private parseAnd(): Expr {
    let left = this.parseNot()
    while (this.atKeyword('AND')) {
      this.next()
      left = { kind: 'bin', op: 'and', left, right: this.parseNot() }
    }
    return left
  }

  private parseNot(): Expr {
    if (this.peek()?.kind === 'punct' && this.peek()!.text === '!') {
      this.next()
      return { kind: 'not', inner: this.parseNot() }
    }
    return this.parseCmp()
  }

  private parseCmp(): Expr {
    const left = this.parsePrimary()
    const tok = this.peek()
    if (tok?.kind === 'punct' && ['=', '!=', '>', '<', '>=', '<='].includes(tok.text)) {
      this.next()
      return { kind: 'bin', op: tok.text as BinOp, left, right: this.parsePrimary() }
    }
    return left
  }

  private parsePrimary(): Expr {
    const tok = this.next()
    if (tok.kind === 'string') return { kind: 'lit', value: tok.text }
    if (tok.kind === 'number') return { kind: 'lit', value: Number(tok.text) }
    if (tok.kind === 'link') {
      // [[Alvo]] como valor de comparação
      return { kind: 'lit', value: tok.text }
    }
    if (tok.kind === 'punct' && tok.text === '(') {
      const inner = this.parseExpr()
      const close = this.next()
      if (close.kind !== 'punct' || close.text !== ')') throw new Error('esperava )')
      return inner
    }
    if (tok.kind === 'ident') {
      const upper = tok.text.toUpperCase()
      if (upper === 'NULL') return { kind: 'lit', value: null }
      if (upper === 'TRUE') return { kind: 'lit', value: true }
      if (upper === 'FALSE') return { kind: 'lit', value: false }
      if (upper === 'AND' || upper === 'OR') throw new Error(`expressão vazia antes de ${upper}`)
      if (this.peek()?.kind === 'punct' && this.peek()!.text === '(') {
        this.next()
        const args: Expr[] = []
        if (!(this.peek()?.kind === 'punct' && this.peek()!.text === ')')) {
          args.push(this.parseExpr())
          while (this.peek()?.kind === 'punct' && this.peek()!.text === ',') {
            this.next()
            args.push(this.parseExpr())
          }
        }
        const close = this.next()
        if (close.kind !== 'punct' || close.text !== ')') throw new Error('esperava )')
        return { kind: 'call', fn: tok.text.toLowerCase(), args }
      }
      return { kind: 'field', path: tok.text }
    }
    throw new Error(`token inesperado "${tok.text}"`)
  }
}

function isClauseKeyword(tok: Token | undefined): boolean {
  return (
    tok?.kind === 'ident' && ['FROM', 'WHERE', 'SORT'].includes(tok.text.toUpperCase())
  )
}

export function parseQuery(src: string): Query {
  const tokens = tokenize(src)
  const parser = new Parser(tokens)

  const head = parser.next()
  if (head.kind !== 'ident' || !['TABLE', 'LIST'].includes(head.text.toUpperCase())) {
    throw new Error('query precisa começar com TABLE ou LIST')
  }
  const kind = head.text.toUpperCase() as 'TABLE' | 'LIST'

  let withoutId = false
  if (parser.atKeyword('WITHOUT')) {
    parser.next()
    parser.expectKeyword('ID')
    withoutId = true
  }

  // colunas do TABLE (até o primeiro FROM/WHERE/SORT)
  const columns: Query['columns'] = []
  if (kind === 'TABLE') {
    while (!parser.done() && !isClauseKeyword(parser.peek())) {
      const expr = parser.parseExpr()
      let label: string | undefined
      if (parser.atKeyword('AS')) {
        parser.next()
        const lab = parser.next()
        if (lab.kind !== 'string' && lab.kind !== 'ident') throw new Error('esperava label após AS')
        label = lab.text
      }
      columns.push({ expr, label: label ?? exprText(expr) })
      if (parser.peek()?.kind === 'punct' && parser.peek()!.text === ',') parser.next()
    }
    if (!columns.length) throw new Error('TABLE sem colunas')
  }

  const query: Query = { kind, withoutId, columns, from: [], sort: [] }

  while (!parser.done()) {
    const clause = parser.next()
    const upper = clause.kind === 'ident' ? clause.text.toUpperCase() : ''
    if (upper === 'FROM') {
      query.from = parseFrom(parser)
    } else if (upper === 'WHERE') {
      // #291: WHERE repetido combina com AND (semântica do dataview real), não
      // sobrescreve — senão o 2º WHERE apaga o 1º (ex.: Duas-mãos.md perdia
      // `categoria="Item"`).
      const expr = parser.parseExpr()
      query.where = query.where ? { kind: 'bin', op: 'and', left: query.where, right: expr } : expr
    } else if (upper === 'SORT') {
      do {
        const expr = parser.parseExpr()
        let desc = false
        if (parser.atKeyword('ASC', 'DESC')) desc = parser.next().text.toUpperCase() === 'DESC'
        query.sort.push({ expr, desc })
      } while (
        parser.peek()?.kind === 'punct' &&
        parser.peek()!.text === ',' &&
        (parser.next(), true)
      )
    } else {
      throw new Error(`cláusula inesperada "${clause.text}"`)
    }
  }

  return query
}

function parseFrom(parser: Parser): FromTerm[] {
  const terms: FromTerm[] = []
  for (;;) {
    let negated = false
    if (parser.peek()?.kind === 'punct' && parser.peek()!.text === '!') {
      parser.next()
      negated = true
    }
    const tok = parser.next()
    if (tok.kind === 'string') {
      terms.push({ kind: 'folder', path: tok.text, negated })
    } else if (tok.kind === 'link' && tok.text === '') {
      terms.push({ kind: 'inlinks', negated })
    } else if (tok.kind === 'ident' && tok.text.toLowerCase() === 'outgoing') {
      const open = parser.next()
      const link = parser.next()
      const close = parser.next()
      if (
        open.text !== '(' ||
        link.kind !== 'link' ||
        link.text !== '' ||
        close.text !== ')'
      ) {
        throw new Error('só suportamos outgoing([[]])')
      }
      terms.push({ kind: 'outlinks', negated })
    } else {
      throw new Error(`fonte FROM não suportada: "${tok.text}"`)
    }
    if (parser.atKeyword('AND')) {
      parser.next()
      continue
    }
    return terms
  }
}

function exprText(expr: Expr): string {
  switch (expr.kind) {
    case 'field':
      return expr.path
    case 'lit':
      return String(expr.value)
    case 'call':
      return `${expr.fn}(${expr.args.map(exprText).join(', ')})`
    case 'not':
      return `!${exprText(expr.inner)}`
    case 'bin':
      return `${exprText(expr.left)} ${expr.op} ${exprText(expr.right)}`
  }
}
