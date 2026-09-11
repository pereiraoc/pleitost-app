// PLANEJADOR DE TRAJETO (2026-09-08b) — modelo puro: dado de onde e pra onde,
// as linhas que o cartão abre e os parâmetros de tempo do contexto, enumera
// os trajetos possíveis com até DUAS baldeações e estima os minutos de cada um.
//
// Tempo de uma perna numa linha = Σ por segmento (distância real entre paradas
// consecutivas pelo mapa da cidade × sinuosidade ÷ velocidade do modo × atraso
// pela Qualidade da linha × trânsito do período, só pra modos de rua) + parada
// por parada intermediária; embarcar custa a espera média do modo; trocar de
// linha custa a baldeação + a espera da próxima. Nada disto é inventado aqui:
// velocidades, esperas, fatores e a escala do mapa vêm do Contexto e da vault.
import type { ContextoDef } from '../data/context-def'
import type { LinhaMalha, Malha } from './malha'

export type TransporteCfg = NonNullable<ContextoDef['transporte']>

/** Posição real de uma parada (unidades do bounds do mapa da cidade). */
export interface PosicaoReal {
  lat: number
  long: number
}

export interface Perna {
  linha: LinhaMalha
  /** Paradas percorridas, inclusive as pontas, na ordem da viagem. */
  paradas: string[]
  /** Minutos em movimento (+ paradas intermediárias). */
  viagem: number
  /** Minutos esperando a linha (embarque). */
  espera: number
  /** Minutos de baldeação ANTES desta perna (0 na primeira). */
  baldeacao: number
  /** Quilômetros percorridos nesta perna (parada a parada). */
  km: number
}
/** Pedaço do caminho que o cartão do jogador NÃO abre: a linha existe e faria
 *  o trecho, mas ele não pode embarcar. Resolve-se a pé ou de táxi, e a tela
 *  mostra os dois tempos pra ele escolher (ou entender o que perde). */
export interface TrechoSemAcesso {
  de: string
  ate: string
  /** id da linha que faria o trecho, se o cartão abrisse. */
  bloqueada: string
  /** Cartão que ela pede (pra dizer o que faltou). */
  nivel: number | null
  aPe: number
  taxi: number
  km: number
}

export interface Rota {
  pernas: Perna[]
  /** Trechos sem acesso, na ordem — a rota é MISTA (parte de transporte,
   *  parte a pé ou de táxi). Vazio numa rota que o cartão abre inteira. */
  trechos?: TrechoSemAcesso[]
  /** Trecho feito A PÉ: não há caminho com as linhas do filtro. Sem pernas. */
  aPe?: true
  /** Total em minutos (arredondado). */
  minutos: number
  /** Quilômetros percorridos (aproximado). */
  km: number
  /** ids das linhas, na ordem. */
  linhas: string[]
  /** Todas as paradas do trajeto, na ordem. */
  paradas: string[]
}

export interface Parametros {
  cfg: TransporteCfg
  /** metros por unidade do mapa da cidade (scale do leaflet). */
  metrosPorUnidade: number
  posicoes: Map<string, PosicaoReal>
  /** fator de trânsito do período escolhido (1 = normal). */
  transito: number
}

/**
 * Quilômetros entre duas paradas pelo mapa da cidade. Quem anda na RUA paga a
 * sinuosidade (rua não é reta); quem não anda — o Aeromóvel, que corre em
 * viaduto reto, e a balsa, que corre em água aberta — vai pela linha reta
 * mesmo. Era global antes, e cobrava do trilho elevado o desvio das esquinas
 * (report 2026-09-10: a L1 leva "doze minutos" na própria nota e o app dava
 * 28). A pé também é rua: quem caminha dobra as mesmas quinas.
 */
export function distanciaKm(a: string, b: string, p: Parametros, naRua = true): number | null {
  const pa = p.posicoes.get(a)
  const pb = p.posicoes.get(b)
  if (!pa || !pb) return null
  const metros = Math.hypot(pa.lat - pb.lat, pa.long - pb.long) * p.metrosPorUnidade
  return (metros / 1000) * (naRua ? (p.cfg.sinuosidade ?? 1) : 1)
}

function modoDe(cfg: TransporteCfg, l: LinhaMalha) {
  return cfg.modos.find((m) => m.nome === l.modo)
}

/** Minutos pra ir da parada i à j numa linha (índices na ordem da nota).
 *  Circular anda nos dois sentidos; linha comum também (ida e volta). */
export function tempoNaLinha(l: LinhaMalha, i: number, j: number, p: Parametros): { minutos: number; km: number; paradas: string[] } | null {
  if (i === j) return null
  const modo = modoDe(p.cfg, l)
  if (!modo?.velocidade) return null
  const n = l.paradas.length
  const fatorQ = p.cfg.atrasoPorQualidade?.[Math.max(1, Math.min(5, l.qualidade || 3)) - 1] ?? 1
  const fatorT = modo.rua ? p.transito : 1
  const caminhoIdx = (de: number, ate: number, passo: 1 | -1): number[] => {
    const out = [de]
    let k = de
    while (k !== ate) {
      k = (k + passo + n) % n
      out.push(k)
    }
    return out
  }
  const opcoes: number[][] = l.circular ? [caminhoIdx(i, j, 1), caminhoIdx(i, j, -1)] : [i < j ? caminhoIdx(i, j, 1) : caminhoIdx(i, j, -1)]
  let melhor: { minutos: number; km: number; paradas: string[] } | null = null
  for (const idx of opcoes) {
    let km = 0
    let ok = true
    for (let k = 0; k < idx.length - 1; k++) {
      const d = distanciaKm(l.paradas[idx[k]!]!, l.paradas[idx[k + 1]!]!, p, !!modo.rua)
      if (d === null) {
        ok = false
        break
      }
      km += d
    }
    if (!ok) continue
    const minutos = (km / modo.velocidade) * 60 * fatorQ * fatorT + (idx.length - 2) * (p.cfg.parada ?? 0)
    if (!melhor || minutos < melhor.minutos) melhor = { minutos, km, paradas: idx.map((k) => l.paradas[k]!) }
  }
  return melhor
}

/** Minutos pra vencer `km` a pé. */
export function minutosAPe(km: number, aPe: NonNullable<TransporteCfg['aPe']>): number {
  return (km / aPe.velocidade) * 60 * (aPe.fator ?? 1)
}

function espera(l: LinhaMalha, cfg: TransporteCfg): number {
  return modoDe(cfg, l)?.espera ?? 0
}

/** Todas as posições de uma parada numa linha (circular pode repetir; aqui, a primeira). */
function indice(l: LinhaMalha, parada: string): number {
  return l.paradas.indexOf(parada)
}

/** Enumera trajetos de `origem` a `destino` com até duas baldeações entre as
 *  `linhas` dadas, devolve os `quantos` mais rápidos com sequências de linhas
 *  DISTINTAS. */
export function calcularRotas(_malha: Malha, linhas: LinhaMalha[], origem: string, destino: string, p: Parametros, quantos = 3): Rota[] {
  if (!origem || !destino || origem === destino) return []
  const usaveis = linhas.filter((l) => !l.fechada && l.paradas.length >= 2)
  const porParada = new Map<string, LinhaMalha[]>()
  for (const l of usaveis) for (const s of l.paradas) porParada.set(s, [...(porParada.get(s) ?? []), l])
  const baldeacaoMin = p.cfg.baldeacao ?? 0
  const candidatas: Rota[] = []
  type PernaKm = Perna
  const fechar = (pernas: PernaKm[]) => {
    const minutos = pernas.reduce((a, x) => a + x.viagem + x.espera + x.baldeacao, 0)
    const km = pernas.reduce((a, x) => a + x.km, 0)
    const paradas = pernas.flatMap((x, i) => (i === 0 ? x.paradas : x.paradas.slice(1)))
    candidatas.push({ pernas: [...pernas], minutos: Math.round(minutos), km: Math.round(km * 10) / 10, linhas: pernas.map((x) => x.linha.id), paradas })
  }
  const perna = (l: LinhaMalha, de: string, ate: string, primeira: boolean): PernaKm | null => {
    const t = tempoNaLinha(l, indice(l, de), indice(l, ate), p)
    if (!t) return null
    return { linha: l, paradas: t.paradas, viagem: t.minutos, espera: espera(l, p.cfg), baldeacao: primeira ? 0 : baldeacaoMin, km: t.km }
  }
  const linhasO = porParada.get(origem) ?? []
  const linhasD = new Set(porParada.get(destino) ?? [])
  // direto
  for (const A of linhasO) if (linhasD.has(A)) {
    const pa = perna(A, origem, destino, true)
    if (pa) fechar([pa])
  }
  // uma baldeação: A (origem→X) + B (X→destino)
  for (const A of linhasO) {
    for (const X of A.paradas) {
      if (X === origem) continue
      for (const B of porParada.get(X) ?? []) {
        if (B === A || !linhasD.has(B) || X === destino) continue
        const p1 = perna(A, origem, X, true)
        const p2 = perna(B, X, destino, false)
        if (p1 && p2) fechar([p1, p2])
      }
    }
  }
  // duas baldeações: A (origem→X) + B (X→Y) + C (Y→destino)
  for (const A of linhasO) {
    for (const X of A.paradas) {
      if (X === origem || X === destino) continue
      for (const B of porParada.get(X) ?? []) {
        if (B === A) continue
        for (const Y of B.paradas) {
          if (Y === X || Y === origem || Y === destino) continue
          for (const C of porParada.get(Y) ?? []) {
            if (C === B || C === A || !linhasD.has(C)) continue
            const p1 = perna(A, origem, X, true)
            const p2 = perna(B, X, Y, false)
            const p3 = perna(C, Y, destino, false)
            if (p1 && p2 && p3) fechar([p1, p2, p3])
          }
        }
      }
    }
  }
  // ranking: menor tempo; uma rota por sequência de linhas; sem repetir parada
  candidatas.sort((a, b) => a.minutos - b.minutos || a.pernas.length - b.pernas.length)
  const vistas = new Set<string>()
  const out: Rota[] = []
  for (const r of candidatas) {
    if (new Set(r.paradas).size !== r.paradas.length) continue
    const k = r.linhas.join('>')
    if (vistas.has(k)) continue
    vistas.add(k)
    out.push(r)
    if (out.length >= quantos) break
  }
  return out
}

/** Trecho A PÉ (2026-09-09) — o que sobra quando o filtro do jogador não deixa
 *  caminho entre dois pontos. Em vez de traçar rota de pedestre (que exigiria
 *  uma malha de calçadas que a vault não tem), usa o CAMINHO que a malha faz
 *  entre os dois pontos (parada a parada, já com a sinuosidade da rua) e anda
 *  esses quilômetros na `velocidade` de quem caminha, × `fator` (esquina,
 *  sinaleira, cansaço). Sem rota nenhuma, cai na distância direta do mapa.
 *
 *  Era um MÚLTIPLO DO TEMPO da malha (2026-09-10): quem caminha andava mais
 *  devagar quando o ônibus era ruim e mais rápido quando o Aeromóvel era bom,
 *  o que não faz sentido — a perna é a mesma. Com o tempo da malha corrigido,
 *  aquele fator 4 dava 13 km/h de caminhada.
 *
 *  `todas` = a malha sem filtro; passar as linhas já filtradas anula a graça. */
export function rotaAPe(todas: LinhaMalha[], origem: string, destino: string, p: Parametros): Rota | null {
  const aPe = p.cfg.aPe
  if (!aPe || !origem || !destino || origem === destino) return null
  // Pela RUA, direto (distância × sinuosidade) — não pelo quilômetro da
  // melhor rota de linha, que dá a volta pelo terminal (report 2026-09-10:
  // Zaffari → Jardim Botânico dava 6h13; a pé são ~3h).
  const km = distanciaKm(origem, destino, p)
  if (km === null) return null
  return {
    aPe: true,
    pernas: [],
    minutos: Math.round(minutosAPe(km, aPe)),
    km: Math.round(km * 10) / 10,
    linhas: [],
    paradas: [origem, destino],
  }
}

/** ROTA MISTA (2026-09-09) — o que o jogador vê quando o cartão dele não abre
 *  o caminho inteiro. Tenta primeiro só com as linhas do FILTRO; não achando,
 *  refaz com a malha inteira e converte cada perna que ele não pode pegar num
 *  TRECHO a pé ou de táxi, estimado pelo tempo daquela mesma perna (× o fator
 *  de cada um, do contexto). O total conta a alternativa mais rápida.
 *
 *  É o pedido do mestre: "se tiver um TRI ruim, mostra que algumas partes tem
 *  que caminhar (X min) ou pegar táxi (Y min)". */
export function calcularRotasComAcesso(
  filtradas: LinhaMalha[],
  todas: LinhaMalha[],
  origem: string,
  destino: string,
  p: Parametros,
  quantos = 3,
): Rota[] {
  const comFiltro = calcularRotas({} as Malha, filtradas, origem, destino, p, quantos)
  if (comFiltro.length) return comFiltro
  const aPeCfg = p.cfg.aPe
  const taxiCfg = p.cfg.taxi
  if (!aPeCfg || !taxiCfg) return []
  const abertas = new Set(filtradas.map((l) => l.id))
  const completas = calcularRotas({} as Malha, todas, origem, destino, p, quantos)
  const out: Rota[] = []
  for (const r of completas) {
    const pernas: Perna[] = []
    const trechos: TrechoSemAcesso[] = []
    let minutos = 0
    for (const perna of r.pernas) {
      if (abertas.has(perna.linha.id)) {
        pernas.push(perna)
        minutos += perna.viagem + perna.espera + perna.baldeacao
        continue
      }
      const de = perna.paradas[0]!
      const ate = perna.paradas[perna.paradas.length - 1]!
      // a pé se mede em QUILÔMETRO (a perna é a mesma, o ônibus dela sendo bom
      // ou ruim); o táxi, sim, é um fator sobre o tempo da linha — ele faz o
      // mesmo caminho, só que sem parar e sem esperar.
      const km = perna.km || (distanciaKm(de, ate, p) ?? 0)
      const aPe = Math.round(minutosAPe(km, aPeCfg))
      const taxi = Math.round(perna.viagem * taxiCfg.fator)
      trechos.push({ de, ate, bloqueada: perna.linha.id, nivel: perna.linha.nivel, aPe, taxi, km: Math.round(km * 10) / 10 })
      minutos += Math.min(aPe, taxi)
    }
    out.push({ ...r, pernas, trechos, minutos: Math.round(minutos) })
  }
  return out
}

/** Formata minutos como "1h05" / "35 min". */
export function formatarMinutos(min: number): string {
  const m = Math.max(0, Math.round(min))
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const r = m % 60
  return `${h}h${String(r).padStart(2, '0')}`
}
