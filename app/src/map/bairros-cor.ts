// ÁREAS DE BAIRRO POR COR (2026-09-09) — no mapa de Porto Alegre cada bairro é
// uma REGIÃO PINTADA, não um pino. O marcador `Bairro` do bloco ```leaflet``` é
// a SEMENTE: a cor exatamente sob ele delimita o território daquele bairro,
// então dá pra clicar em qualquer ponto do bairro e abrir a nota dele.
//
// Não existe tabela de cores no app: a fonte é a IMAGEM do mapa + os marcadores
// da vault. É o mesmo contrato de scripts/poa_mapa_bairros.py, que mantém todo
// marcador dentro da região do bairro que a nota declara.
//
// Coordenadas: tudo em FRAÇÃO da imagem (0..1, x pra direita, y pra baixo) — a
// mesma conta que o MapaLocal já usa pra posicionar marcador (`long/longMax`,
// `1 − lat/latMax`), então área e pino falam a mesma língua.

/** Bairro que semeia uma área, na fração da imagem onde o marcador está. */
export interface SementeBairro {
  nome: string
  fx: number
  fy: number
}

export interface AreaBairro {
  nome: string
  /** `#rrggbb` que a imagem usa pra este bairro. */
  cor: string
  /** Quantos px da fonte a área ocupa. */
  px: number
  /** Retângulo que a contém, em px da fonte — diz se cabe um rótulo dentro. */
  caixa: { x: number; y: number; largura: number; altura: number }
}

export interface IndiceBairros {
  largura: number
  altura: number
  /** px → índice em `areas` (posição y*largura+x); −1 = fora de toda área. */
  indice: Int16Array
  areas: AreaBairro[]
  /** Semente cuja cor NÃO é região (papel do mapa) — segue como pino. */
  semArea: string[]
}

/**
 * Diferença mínima entre o canal maior e o menor pra uma cor contar como
 * REGIÃO. O papel do mapa é acromático (branco, e os cinzas 240 e 228, todos
 * com diferença ≤ 1) e o bairro mais apagado que o mestre pintou (Jardim Itu,
 * #8C8790) tem 9 — sem este corte, um bairro que fica na água (Delta
 * Radioativo) reivindicaria o branco inteiro do mapa.
 */
export const CROMA_MIN = 5

/** Cor que aparece em pouquíssimos px não é região — é traço do desenho (uma
 *  região de bairro do mapa da POA tem de 1.500 px pra cima). */
export const MIN_PX = 4

const hex = (r: number, g: number, b: number): string =>
  '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')

/** Fração (0..1) → índice de px. A fração cai no px `floor(f·n)`: `round`
 *  jogaria o centro de cada célula pra célula seguinte. */
function px(fracao: number, tamanho: number): number {
  return Math.min(tamanho - 1, Math.max(0, Math.floor(fracao * tamanho)))
}

/**
 * Indexa as áreas: pra cada semente lê a cor exata sob ela e marca todo pixel
 * daquela cor como território do bairro. Casamento EXATO de cor de propósito —
 * as regiões são preenchimento chapado, e com tolerância a Praia de Belas
 * (#AE99A5) engoliria o Passo d'Areia (#AC8DB0). O casamento exato também
 * resolve ENCLAVE de graça: a Restinga é uma ilha de outra cor no meio da Zona
 * Deserta e cada px fica com a sua. Semente sem matiz, sobre traço do desenho
 * ou repetindo cor de outra entra em `semArea` — segue como pino.
 */
export function indexarBairros(
  pixels: Uint8ClampedArray,
  largura: number,
  altura: number,
  sementes: readonly SementeBairro[],
): IndiceBairros {
  // 1. quantos px de cada cor a imagem tem (as regiões são chapadas, então
  //    isto é curto) — serve pra descartar semente que caiu num detalhe do
  //    desenho em vez de numa região.
  const quantos = new Map<number, number>()
  for (let i = 0; i < pixels.length; i += 4) {
    const chave = ((pixels[i] ?? 0) << 16) | ((pixels[i + 1] ?? 0) << 8) | (pixels[i + 2] ?? 0)
    quantos.set(chave, (quantos.get(chave) ?? 0) + 1)
  }

  // 2. cor de cada semente → área (ou pino, quando a cor não é região)
  const areas: AreaBairro[] = []
  const semArea: string[] = []
  const daCor = new Map<number, number>()
  for (const s of sementes) {
    const x = px(s.fx, largura)
    const y = px(s.fy, altura)
    const i = (y * largura + x) * 4
    const r = pixels[i] ?? 0
    const g = pixels[i + 1] ?? 0
    const b = pixels[i + 2] ?? 0
    const chave = (r << 16) | (g << 8) | b
    const cromatica = Math.max(r, g, b) - Math.min(r, g, b) >= CROMA_MIN
    if (!cromatica || (quantos.get(chave) ?? 0) < MIN_PX || daCor.has(chave)) {
      semArea.push(s.nome)
      continue
    }
    daCor.set(chave, areas.length)
    areas.push({
      nome: s.nome,
      cor: hex(r, g, b),
      px: quantos.get(chave) ?? 0,
      caixa: { x: 0, y: 0, largura: 0, altura: 0 },
    })
  }

  // 3. índice px → área + caixa de cada uma
  const indice = new Int16Array(largura * altura).fill(-1)
  const x0 = new Int32Array(areas.length).fill(largura)
  const x1 = new Int32Array(areas.length).fill(-1)
  const y0 = new Int32Array(areas.length).fill(altura)
  const y1 = new Int32Array(areas.length).fill(-1)
  for (let p = 0, i = 0; p < indice.length; p++, i += 4) {
    const chave = ((pixels[i] ?? 0) << 16) | ((pixels[i + 1] ?? 0) << 8) | (pixels[i + 2] ?? 0)
    const a = daCor.get(chave)
    if (a === undefined) continue
    indice[p] = a
    const x = p % largura
    const y = (p - x) / largura
    if (x < x0[a]!) x0[a] = x
    if (x > x1[a]!) x1[a] = x
    if (y < y0[a]!) y0[a] = y
    if (y > y1[a]!) y1[a] = y
  }
  for (let a = 0; a < areas.length; a++) {
    if (x1[a]! < 0) continue
    areas[a]!.caixa = {
      x: x0[a]!,
      y: y0[a]!,
      largura: x1[a]! - x0[a]! + 1,
      altura: y1[a]! - y0[a]! + 1,
    }
  }
  return { largura, altura, indice, areas, semArea }
}

/** Bairro sob um ponto da imagem (fração 0..1), ou null fora de toda área. */
export function bairroEmFracao(idx: IndiceBairros, fx: number, fy: number): string | null {
  if (fx < 0 || fy < 0 || fx > 1 || fy > 1) return null
  const p = px(fy, idx.altura) * idx.largura + px(fx, idx.largura)
  const a = idx.indice[p] ?? -1
  return a >= 0 ? (idx.areas[a]?.nome ?? null) : null
}

/** Área por nome, ou null. */
export function areaDeBairro(idx: IndiceBairros, nome: string): AreaBairro | null {
  return idx.areas.find((a) => a.nome === nome) ?? null
}

/**
 * RGBA de realce de uma área: pixels da área na cor pedida, o resto
 * transparente. É o que o canvas de realce desenha por cima do mapa — a
 * "marcação real das cores", não um contorno aproximado.
 */
export function realceDaArea(
  idx: IndiceBairros,
  nome: string,
  rgba: readonly [number, number, number, number],
): Uint8ClampedArray | null {
  const a = idx.areas.findIndex((x) => x.nome === nome)
  if (a < 0) return null
  const out = new Uint8ClampedArray(idx.largura * idx.altura * 4)
  for (let p = 0, i = 0; p < idx.indice.length; p++, i += 4) {
    if (idx.indice[p] !== a) continue
    out[i] = rgba[0]
    out[i + 1] = rgba[1]
    out[i + 2] = rgba[2]
    out[i + 3] = rgba[3]
  }
  return out
}
