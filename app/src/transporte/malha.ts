// MALHA DE TRANSPORTES (2026-09-08) — modelo puro do mapa esquemático (estilo
// mapa de metrô). Fonte única: as notas `categoria: Linha` (Paradas em ordem,
// Acesso = plano TRI mínimo, Cor) e o bloco ```malha``` da nota do mapa
// (posição de cada parada numa grade: x cresce pro LESTE, y pro NORTE — a
// direção do traço diz pra onde a linha vai). Baldeação = parada compartilhada.
//
// Traçado entre duas paradas consecutivas: parte diagonal (min(|dx|,|dy|)) e
// parte reta, na ordem que não atravessa parada alheia. Linhas que dividem uma
// aresta unitária correm PARALELAS (deslocamento perpendicular por aresta).
import type { VaultDoc } from '../data/types'
import type { ContextoDef } from '../data/context-def'
import { parseLinha, type Linha } from './parse-linha'

export type TransporteCfg = NonNullable<ContextoDef['transporte']>
export type Traco = TransporteCfg['modos'][number]['traco']

export interface Ponto {
  x: number
  y: number
}
export interface ParadaMalha extends Ponto {
  nome: string
  rotulo?: string
  /** ids das linhas (abertas) que param aqui, na ordem da malha. */
  linhas: string[]
}
export interface LinhaMalha extends Linha {
  cor: string
  fechada: boolean
  /** Nível do plano de acesso (nota Estilo de Vida); null = não aceita TRI (na mão). */
  nivel: number | null
  traco: Traco
  largura: number
}
export interface Malha {
  linhas: LinhaMalha[]
  paradas: Map<string, ParadaMalha>
}

function texto(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

/** Monta a malha a partir dos docs (linhas + nota do mapa) e da config. */
export function montarMalha(
  docs: Iterable<VaultDoc>,
  cfg: TransporteCfg,
  nivelDoPlano: (nomeDoPlano: string) => number | null,
): Malha {
  const linhas: LinhaMalha[] = []
  let mapa: VaultDoc | undefined
  for (const d of docs) {
    if (d.basename === cfg.mapa) mapa = d
    if (d.type !== cfg.categoria) continue
    const l = parseLinha({ ...d, type: 'Linha' })
    if (!l) continue
    const modo = cfg.modos.find((m) => m.nome === l.modo)
    linhas.push({
      ...l,
      cor: texto(d.frontmatter['Cor']) || '#888888',
      fechada: d.frontmatter['Fechada'] === true,
      nivel: l.acessoPlano ? nivelDoPlano(l.acessoPlano) : null,
      traco: modo?.traco ?? 'cheio',
      largura: modo?.largura ?? 4,
    })
  }
  linhas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  const paradas = new Map<string, ParadaMalha>()
  for (const p of mapa?.malha?.paradas ?? []) paradas.set(p.nome, { nome: p.nome, x: p.x, y: p.y, linhas: [], ...(p.rotulo ? { rotulo: p.rotulo } : {}) })
  for (const l of linhas) {
    if (l.fechada) continue
    for (const nome of l.paradas) {
      const p = paradas.get(nome)
      if (p && !p.linhas.includes(l.id)) p.linhas.push(l.id)
    }
  }
  return { linhas, paradas }
}

/** Linhas que um plano de nível `nivel` abre: acesso ≤ nível, ou "na mão"
 *  (sem plano) — sempre; linhas fechadas nunca. */
export function linhasDoNivel(malha: Malha, nivel: number): LinhaMalha[] {
  return malha.linhas.filter((l) => !l.fechada && (l.nivel === null || l.nivel <= nivel))
}

/** FILTRO da aba TRANSPORTE (2026-09-09): o que o mapa desenha e o planejador
 *  usa. `modos` vazio = todos; `exato` troca "o que este cartão abre" (o Ouro
 *  abre o do Prata e o do Bronze) por "só as linhas deste cartão". Linha sem
 *  cartão (`nivel` null) não se paga e entra sempre. */
export interface FiltroMalha {
  modos: string[]
  nivel: number
  exato: boolean
}

export function linhasDoFiltro(malha: Malha, f: FiltroMalha): LinhaMalha[] {
  const modos = new Set(f.modos)
  return malha.linhas.filter((l) => {
    if (l.fechada) return false
    if (modos.size && !modos.has(l.modo)) return false
    if (l.nivel === null) return true
    return f.exato ? l.nivel === f.nivel : l.nivel <= f.nivel
  })
}

/** Modos da malha na ordem do BOLSO: primeiro o que não pede cartão (se paga
 *  na mão), depois pelo cartão mais barato que o modo aceita. É a ordem em
 *  que o filtro os mostra — do que qualquer um paga ao que só o cartão caro
 *  abre. Linha fechada não conta. */
export function modosPorPreco(malha: Malha): string[] {
  const menor = new Map<string, number>()
  for (const l of malha.linhas) {
    if (l.fechada) continue
    const n = l.nivel ?? 0 // sem cartão = mais barato que qualquer cartão
    const atual = menor.get(l.modo)
    if (atual === undefined || n < atual) menor.set(l.modo, n)
  }
  return [...menor.entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0], 'pt-BR')).map(([m]) => m)
}

/** Luminância relativa (WCAG) de um hex `#rrggbb`. */
function luminancia(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return 1
  const n = parseInt(m[1]!, 16)
  const canal = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * canal((n >> 16) & 255) + 0.7152 * canal((n >> 8) & 255) + 0.0722 * canal(n & 255)
}

/** Cor da linha que APARECE no fundo do modo. No claro é a cor da nota, tal
 *  qual. No escuro, cor quase preta (a Linha Executiva é `#111111`) some no
 *  fundo do tema: clareia até passar do mínimo, preservando o matiz. */
export function corVisivel(cor: string, escuro: boolean): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(cor ?? '').trim())
  if (!escuro || !m) return cor
  const MIN = 0.18
  if (luminancia(cor) >= MIN) return cor
  const n = parseInt(m[1]!, 16)
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  // clareia em direção ao branco até passar do mínimo (a busca é curta e exata)
  for (let mistura = 0.1; mistura <= 1; mistura += 0.05) {
    const novo = rgb.map((v) => Math.round(v + (255 - v) * mistura))
    const hex = '#' + novo.map((v) => v.toString(16).padStart(2, '0')).join('')
    if (luminancia(hex) >= MIN) return hex
  }
  return '#ffffff'
}

/** Linhas desenháveis: todas as paradas com posição no mapa. */
export function desenhavel(malha: Malha, l: LinhaMalha): boolean {
  return !l.fechada && l.paradas.length >= 2 && l.paradas.every((p) => malha.paradas.has(p))
}

const sgn = (v: number) => (v > 0 ? 1 : v < 0 ? -1 : 0)
const chave = (p: Ponto) => `${p.x},${p.y}`

/** Pontos INTERMEDIÁRIOS da grade entre `a` e `b` (exclusive). Tenta
 *  diagonal-primeiro e reta-primeiro; devolve o primeiro que não cruza
 *  `ocupados` (posições de outras paradas). Sem saída, diagonal-primeiro. */
export function tracarPasso(a: Ponto, b: Ponto, ocupados: Set<string>): { pontos: Ponto[]; conflito: boolean } {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const diag = Math.min(Math.abs(dx), Math.abs(dy))
  const reta = Math.max(Math.abs(dx), Math.abs(dy)) - diag
  const rota = (diagPrimeiro: boolean): Ponto[] => {
    const seq = diagPrimeiro ? [...Array(diag).fill('d'), ...Array(reta).fill('r')] : [...Array(reta).fill('r'), ...Array(diag).fill('d')]
    const out: Ponto[] = []
    let x = a.x
    let y = a.y
    for (const s of seq) {
      if (s === 'd') {
        x += sgn(dx)
        y += sgn(dy)
      } else if (Math.abs(dx) > Math.abs(dy)) x += sgn(dx)
      else y += sgn(dy)
      out.push({ x, y })
    }
    return out.slice(0, -1)
  }
  for (const pref of [true, false]) {
    const pts = rota(pref)
    if (!pts.some((p) => ocupados.has(chave(p)))) return { pontos: pts, conflito: false }
  }
  return { pontos: rota(true), conflito: true }
}

/** Caminho completo de uma linha na grade (paradas + intermediários). */
export function caminhoDaLinha(malha: Malha, l: LinhaMalha): { pontos: Ponto[]; conflitos: string[] } {
  const todas = new Set([...malha.paradas.values()].map(chave))
  const seq = l.circular && l.paradas.length > 2 ? [...l.paradas, l.paradas[0]!] : l.paradas
  const pontos: Ponto[] = []
  const conflitos: string[] = []
  for (let i = 0; i < seq.length - 1; i++) {
    const a = malha.paradas.get(seq[i]!)
    const b = malha.paradas.get(seq[i + 1]!)
    if (!a || !b) continue
    const ocupados = new Set(todas)
    ocupados.delete(chave(a))
    ocupados.delete(chave(b))
    const { pontos: meio, conflito } = tracarPasso(a, b, ocupados)
    if (conflito) conflitos.push(`${seq[i]} → ${seq[i + 1]}`)
    if (pontos.length === 0) pontos.push({ x: a.x, y: a.y })
    pontos.push(...meio, { x: b.x, y: b.y })
  }
  return { pontos, conflitos }
}

export interface TracoDesenhado {
  id: string
  nome: string
  cor: string
  traco: Traco
  largura: number
  /** path SVG (em px). */
  d: string
}
export interface ParadaDesenhada {
  nome: string
  cx: number
  cy: number
  /** ≥ 2 linhas visíveis param aqui. */
  baldeacao: boolean
  /** ids das linhas visíveis que param aqui. */
  linhas: string[]
  /** cor da única linha (parada simples) ou null (baldeação). */
  cor: string | null
  rotulo: { x: number; y: number; anchor: 'start' | 'end'; rotacao: number }
}
export interface Desenho {
  largura: number
  altura: number
  /** px por célula da grade (pra desenhar zonas e folgas). */
  unidade: number
  tracos: TracoDesenhado[]
  paradas: ParadaDesenhada[]
}
/** Zona de um bairro: as CÉLULAS da grade (centros em px) que ficam mais
 *  perto de uma parada dele — território sem sobreposição — e onde vai o nome. */
export interface ZonaBairro {
  nome: string
  celulas: { x: number; y: number }[]
  rotulo: { x: number; y: number }
  paradas: string[]
}

/** Onde vai o nome da parada. Sem vizinha na mesma fileira: horizontal, do
 *  lado pedido (`rotulo`, padrão direita). Com vizinha só de um lado e o
 *  outro livre: horizontal pro lado livre. Senão inclinado 45°, na diagonal
 *  cuja célula diagonal e a seguinte na mesma direção estão livres —
 *  cima-direita, cima-esquerda, baixo-direita, baixo-esquerda, nesta ordem. */
export function posicionarRotulo(p: ParadaMalha, cx: number, cy: number, ocupadas: Set<string>): ParadaDesenhada['rotulo'] {
  const tem = (dx: number, dy: number) => ocupadas.has(chave({ x: p.x + dx, y: p.y + dy }))
  const esquerda = p.rotulo === 'esquerda'
  const dir = { x: cx + 11, y: cy + 4, anchor: 'start' as const, rotacao: 0 }
  const esq = { x: cx - 11, y: cy + 4, anchor: 'end' as const, rotacao: 0 }
  // horizontal só com DUAS células livres daquele lado (o nome é comprido);
  // `inclinado` na nota pula o horizontal (nomes que se encaram na fileira)
  const livreDir = p.rotulo !== 'inclinado' && !tem(1, 0) && !tem(2, 0)
  const livreEsq = p.rotulo !== 'inclinado' && !tem(-1, 0) && !tem(-2, 0)
  if (livreEsq && livreDir) return esquerda ? esq : dir
  if (livreDir && !esquerda) return dir
  if (livreEsq && esquerda) return esq
  if (livreDir) return dir
  if (livreEsq) return esq
  // inclinado: a diagonal e a célula seguinte na mesma direção livres
  const opcoes: [number, number, ParadaDesenhada['rotulo']][] = [
    [1, 1, { x: cx + 7, y: cy - 8, anchor: 'start', rotacao: -45 }],
    [-1, 1, { x: cx - 7, y: cy - 8, anchor: 'end', rotacao: 45 }],
    [1, -1, { x: cx + 7, y: cy + 12, anchor: 'start', rotacao: 45 }],
    [-1, -1, { x: cx - 7, y: cy + 12, anchor: 'end', rotacao: -45 }],
  ]
  for (const [dx, dy, r] of opcoes) if (!tem(dx, dy) && !tem(2 * dx, 2 * dy)) return r
  return opcoes[0]![2]
}

const arestaChave = (p: Ponto, q: Ponto) => (p.x < q.x || (p.x === q.x && p.y < q.y) ? `${chave(p)}|${chave(q)}` : `${chave(q)}|${chave(p)}`)

/** Projeta as linhas visíveis em coordenadas de tela. */
export function desenharMalha(
  malha: Malha,
  visiveis: LinhaMalha[],
  opts: { unidade?: number; margem?: number; folga?: number; margemRotulo?: number } = {},
): Desenho {
  const unidade = opts.unidade ?? 56
  const margem = opts.margem ?? 40
  const folga = opts.folga ?? 5
  const margemRotulo = opts.margemRotulo ?? 170
  const linhas = visiveis.filter((l) => desenhavel(malha, l))
  const usadas = new Set(linhas.flatMap((l) => l.paradas))
  const paradas = [...malha.paradas.values()].filter((p) => usadas.has(p.nome))
  if (paradas.length === 0) return { largura: 0, altura: 0, unidade, tracos: [], paradas: [] }
  const minX = Math.min(...paradas.map((p) => p.x))
  const maxX = Math.max(...paradas.map((p) => p.x))
  const minY = Math.min(...paradas.map((p) => p.y))
  const maxY = Math.max(...paradas.map((p) => p.y))
  // rótulos podem sair pra esquerda ou pra direita: folga dos dois lados
  const px = (p: Ponto) => ({ x: margemRotulo + (p.x - minX) * unidade, y: margem + (maxY - p.y) * unidade })

  // 1. caminhos + arestas unitárias compartilhadas (ordem estável = ordem das linhas)
  const caminhos = new Map<string, Ponto[]>()
  const arestas = new Map<string, string[]>()
  for (const l of linhas) {
    const { pontos } = caminhoDaLinha(malha, l)
    caminhos.set(l.id, pontos)
    for (let i = 0; i < pontos.length - 1; i++) {
      const k = arestaChave(pontos[i]!, pontos[i + 1]!)
      const lst = arestas.get(k) ?? []
      if (!lst.includes(l.id)) lst.push(l.id)
      arestas.set(k, lst)
    }
  }
  // 2. cada linha vira um path com deslocamento perpendicular por aresta
  const tracos: TracoDesenhado[] = linhas.map((l) => {
    const pontos = caminhos.get(l.id) ?? []
    const partes: string[] = []
    for (let i = 0; i < pontos.length - 1; i++) {
      const a = px(pontos[i]!)
      const b = px(pontos[i + 1]!)
      const lst = arestas.get(arestaChave(pontos[i]!, pontos[i + 1]!)) ?? [l.id]
      const k = lst.indexOf(l.id)
      const n = lst.length
      const off = (k - (n - 1) / 2) * folga
      const vx = b.x - a.x
      const vy = b.y - a.y
      const len = Math.hypot(vx, vy) || 1
      const nx = -vy / len
      const ny = vx / len
      const ax = a.x + nx * off
      const ay = a.y + ny * off
      const bx = b.x + nx * off
      const by = b.y + ny * off
      partes.push(`${i === 0 ? 'M' : 'L'}${ax.toFixed(1)} ${ay.toFixed(1)} L${bx.toFixed(1)} ${by.toFixed(1)}`)
    }
    return { id: l.id, nome: l.nome, cor: l.cor, traco: l.traco, largura: l.largura, d: partes.join(' ') }
  })
  // 3. paradas: baldeação = ≥ 2 linhas visíveis; rótulo inclinado quando há vizinha na mesma fileira
  const porPos = new Set(paradas.map(chave))
  const idsVisiveis = new Set(linhas.map((l) => l.id))
  const desenhadas: ParadaDesenhada[] = paradas.map((p) => {
    const { x: cx, y: cy } = px(p)
    const ls = p.linhas.filter((id) => idsVisiveis.has(id))
    const rotulo = posicionarRotulo(p, cx, cy, porPos)
    const unica = ls.length === 1 ? linhas.find((l) => l.id === ls[0]) : undefined
    return { nome: p.nome, cx, cy, baldeacao: ls.length >= 2, linhas: ls, cor: unica?.cor ?? null, rotulo }
  })
  return {
    largura: (maxX - minX) * unidade + 2 * margemRotulo,
    altura: (maxY - minY) * unidade + 2 * margem + 40,
    unidade,
    tracos,
    paradas: desenhadas,
  }
}

/** Bairros no mapa esquemático (2026-09-08b): cada célula da grade num raio
 *  de `alcance` células de alguma parada pertence ao bairro da parada MAIS
 *  PRÓXIMA — territórios contíguos, sem sobreposição (antes eram caixas em
 *  volta das paradas: uma caixa grande engolia paradas de outro bairro e um
 *  bairro de uma parada só ficava invisível). `bairroDe` vem do Atlas (a
 *  pasta da parada); parada sem bairro não reivindica célula. O nome vai no
 *  centro das células. */
export function zonasDeBairro(desenho: Desenho, bairroDe: (parada: string) => string | null, alcance = 1.5): ZonaBairro[] {
  const u = desenho.unidade
  if (!u || !desenho.paradas.length) return []
  const paradas = desenho.paradas.map((p) => ({ p, bairro: bairroDe(p.nome) })).filter((x): x is { p: ParadaDesenhada; bairro: string } => !!x.bairro)
  if (!paradas.length) return []
  // grade em px: as paradas estão em centros de célula (cx = origem + i·u)
  const x0 = Math.min(...paradas.map((x) => x.p.cx))
  const y0 = Math.min(...paradas.map((x) => x.p.cy))
  const cols = Math.round((Math.max(...paradas.map((x) => x.p.cx)) - x0) / u)
  const rows = Math.round((Math.max(...paradas.map((x) => x.p.cy)) - y0) / u)
  const zonas = new Map<string, ZonaBairro>()
  for (let i = -1; i <= cols + 1; i++) {
    for (let j = -1; j <= rows + 1; j++) {
      const cx = x0 + i * u
      const cy = y0 + j * u
      let melhor: { p: ParadaDesenhada; bairro: string } | null = null
      let d0 = Infinity
      for (const x of paradas) {
        const d = Math.hypot(x.p.cx - cx, x.p.cy - cy) / u
        if (d < d0) {
          d0 = d
          melhor = x
        }
      }
      if (!melhor || d0 > alcance) continue
      const z = zonas.get(melhor.bairro) ?? { nome: melhor.bairro, celulas: [], rotulo: { x: 0, y: 0 }, paradas: [] }
      z.celulas.push({ x: cx, y: cy })
      zonas.set(melhor.bairro, z)
    }
  }
  for (const z of zonas.values()) {
    z.paradas = paradas.filter((x) => x.bairro === z.nome).map((x) => x.p.nome)
    // rótulo: a célula mais alta (menor y) e, entre elas, a mais à esquerda
    const topo = Math.min(...z.celulas.map((c) => c.y))
    const linhaTopo = z.celulas.filter((c) => c.y === topo)
    z.rotulo = { x: Math.min(...linhaTopo.map((c) => c.x)) - u / 2 + 6, y: topo - u / 2 + 14 }
  }
  return [...zonas.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

/** Parada a parada de uma linha, com as outras linhas de cada parada (baldeação). */
export function paradasComBaldeacao(malha: Malha, l: LinhaMalha, entre?: LinhaMalha[]): { nome: string; baldeacoes: LinhaMalha[] }[] {
  const universo = entre ?? malha.linhas.filter((x) => !x.fechada)
  const porId = new Map(universo.map((x) => [x.id, x]))
  return l.paradas.map((nome) => {
    const p = malha.paradas.get(nome)
    const outras = (p?.linhas ?? []).filter((id) => id !== l.id).map((id) => porId.get(id)).filter((x): x is LinhaMalha => !!x)
    return { nome, baldeacoes: outras }
  })
}
