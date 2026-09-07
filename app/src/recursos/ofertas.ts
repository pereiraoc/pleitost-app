// OFERTAS de um estabelecimento (2026-09-07b): uma Localização lista no FM
// (`cfg.ofertas.campo`, POA: `Serviços`) o que vende ou aluga — wikilinks pra
// notas de Recurso, com sufixo `usado` quando é o preço de usado. O app rola
// QUANTIDADE e DISPONIBILIDADE conforme a linha da régua do bairro
// (`cfg.disponibilidade`): fora da faixa de níveis da linha a chance cai;
// a quantidade escala pelo fator da linha. Rolagem DETERMINÍSTICA por
// semente (estabelecimento + dia) — a vitrine não muda a cada render.
import type { Recurso, RecursosCfg } from './types'
import { acaoDe, precoNaRegua, type Acao } from './hero-recursos'
import { linkTarget } from './parse-recurso'

export interface Oferta {
  nome: string
  estado?: 'novo' | 'usado'
}

/** Lê a lista de ofertas do FM de uma Localização. */
export function parseOfertas(fm: Record<string, unknown>, campo: string): Oferta[] {
  const raw = fm[campo]
  const arr = Array.isArray(raw) ? raw : typeof raw === 'string' && raw.trim() ? [raw] : []
  const out: Oferta[] = []
  for (const x of arr) {
    if (typeof x !== 'string') continue
    const m = /^\s*(\[\[[^\]]+\]\])\s*(usado|novo)?\s*$/i.exec(x)
    if (!m) continue
    const nome = linkTarget(m[1]!)
    if (!nome) continue
    const estado = m[2]?.toLowerCase()
    out.push(estado === 'usado' ? { nome, estado: 'usado' } : estado === 'novo' ? { nome, estado: 'novo' } : { nome })
  }
  return out
}

export interface OfertaRolada {
  /** `${nome}#${estado ?? ''}` — chave estável pra contar vendas. */
  key: string
  recurso: Recurso
  estado?: 'novo' | 'usado'
  /** null = ilimitado (passagens, recarga, diária de serviço). */
  qtd: number | null
  /** Preço unitário JÁ com a régua do bairro (moeda do mundo). */
  preco: number
  acao: Acao
  /** false = o estabelecimento não tem hoje (fica na vitrine, riscado). */
  disponivel: boolean
}

/* PRNG determinístico (xmur3 + mulberry32) — sem dependência. */
function seedHash(s: string): number {
  let h = 1779033703 ^ s.length
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  return (h ^= h >>> 16) >>> 0
}
export function rngDe(seed: string): () => number {
  let a = seedHash(seed)
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Quantidade-base por forma de cobrança (antes do fator da linha e do dado). */
function qtdBase(r: Recurso, estado: 'novo' | 'usado' | undefined, acao: Acao): number | null {
  if (acao === 'tri' || acao === 'recarga' || acao === 'diaria') return null
  switch (r.cobranca) {
    case 'viagem':
      return null
    case 'unidade':
      return 8
    case 'litro':
      return 20
    case 'noite':
      return 3
    case 'mês':
      return 2 // vagas
    case 'única':
      return estado === 'usado' ? 2 : 1
    default:
      return 1
  }
}

/** Chance por distância da faixa de níveis da linha: dentro 100%, um nível
 *  fora 50%, dois ou mais 20%. */
const CHANCE = [1, 0.5, 0.2]

export function rollOfertas(
  ofertas: Oferta[],
  porNome: Map<string, Recurso>,
  linha: string | null,
  cfg: RecursosCfg,
  fator: number,
  mult: number,
  seed: string,
): OfertaRolada[] {
  const rng = rngDe(seed)
  const disp = (linha && cfg.disponibilidade[linha]) || { niveis: [1, 6] as [number, number], quantidade: 1 }
  const out: OfertaRolada[] = []
  for (const o of ofertas) {
    const r = porNome.get(o.nome)
    if (!r || r.tipo === cfg.tipos.estilo) continue
    const acao = acaoDe(cfg, r, fator)
    const nivel = Math.max(1, (r.nivel ?? 3) - (o.estado === 'usado' ? 1 : 0))
    const [min, max] = disp.niveis
    const dist = nivel < min ? min - nivel : nivel > max ? nivel - max : 0
    const chance = CHANCE[Math.min(dist, CHANCE.length - 1)]!
    const sorte = rng()
    const disponivel = sorte < chance
    const base = qtdBase(r, o.estado, acao)
    const qtd = base === null ? null : Math.max(1, Math.round(base * disp.quantidade * (0.5 + rng())))
    const precoBase = o.estado === 'usado' ? (r.usado ?? r.preco) : r.preco
    out.push({
      key: `${o.nome}#${o.estado ?? ''}`,
      recurso: r,
      estado: o.estado,
      qtd: disponivel ? qtd : 0,
      preco: precoNaRegua(precoBase, mult),
      acao,
      disponivel,
    })
  }
  return out
}
