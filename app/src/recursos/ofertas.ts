// OFERTAS de um lugar (2026-09-07b/v3): uma Localização lista no FM
// (`cfg.ofertas.campo`, POA: `Serviços`) o que vende ou aluga — wikilinks pra
// notas de Recurso, com sufixo `usado` quando é o preço de usado. Duas formas:
//   - LISTA: o próprio lugar é o estabelecimento (Concessionária Gurgel);
//   - MAPA "tipo de estabelecimento" → lista: o comércio de RUA de um bairro
//     (Boteco de esquina, Banca de jornal…) — cada chave vira uma vitrine.
// O app rola QUANTIDADE e DISPONIBILIDADE conforme a linha da régua do bairro
// (`cfg.disponibilidade`) com semente determinística (lugar + dia).
import type { Recurso, RecursosCfg } from './types'
import { acaoDe, precoDeCompra, precoNaRegua, type Acao } from './hero-recursos'
import { linkTarget } from './parse-recurso'

export interface Oferta {
  nome: string
  estado?: 'novo' | 'usado'
}
export interface OfertaGrupo {
  /** null = o próprio lugar; string = tipo de estabelecimento genérico do bairro. */
  estabelecimento: string | null
  ofertas: Oferta[]
}

function parseLista(raw: unknown): Oferta[] {
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

/** Ofertas AGRUPADAS por estabelecimento (lista → um grupo do próprio lugar). */
export function parseOfertasAgrupadas(fm: Record<string, unknown>, campo: string): OfertaGrupo[] {
  const raw = fm[campo]
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const out: OfertaGrupo[] = []
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      const ofertas = parseLista(v)
      if (ofertas.length && k.trim()) out.push({ estabelecimento: k.trim(), ofertas })
    }
    return out
  }
  const ofertas = parseLista(raw)
  return ofertas.length ? [{ estabelecimento: null, ofertas }] : []
}

/** Todas as ofertas do lugar, sem agrupar. */
export function parseOfertas(fm: Record<string, unknown>, campo: string): Oferta[] {
  return parseOfertasAgrupadas(fm, campo).flatMap((g) => g.ofertas)
}

export interface OfertaRolada {
  /** `${nome}#${estado ?? ''}` — chave estável pra contar vendas. */
  key: string
  recurso: Recurso
  estado?: 'novo' | 'usado'
  /** null = ilimitado (serviço por dia, corrida). */
  qtd: number | null
  /** Preço da AÇÃO já com a régua (compra = `Compra`/`Usado`; consumo = unidade). */
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
  if (acao === 'diaria' || acao === 'referencia' || r.cobranca === 'viagem') return null
  switch (r.cobranca) {
    case 'unidade':
      return 8
    case 'litro':
      return 20
    case 'mês':
      return 1 // um imóvel à venda
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
    if (!r) continue
    const acao = acaoDe(cfg, r, fator)
    // planos e tarifas de referência não se vendem em lugar nenhum
    if (acao === 'escolher' || acao === 'info') continue
    const nivel = Math.max(1, (r.nivel ?? 3) - (o.estado === 'usado' ? 1 : 0))
    const [min, max] = disp.niveis
    const dist = nivel < min ? min - nivel : nivel > max ? nivel - max : 0
    const chance = CHANCE[Math.min(dist, CHANCE.length - 1)]!
    const sorte = rng()
    const disponivel = sorte < chance
    const base = qtdBase(r, o.estado, acao)
    const qtd = base === null ? null : Math.max(1, Math.round(base * disp.quantidade * (0.5 + rng())))
    const precoBase = acao === 'comprar' ? precoDeCompra(r, o.estado) : r.preco
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
