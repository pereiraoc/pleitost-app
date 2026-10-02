// ESCUDO DO MESTRE — o que cada vista por combatente TEM pra mostrar (puro,
// sobre o FM publicado). Chip de vista vazia renderiza desabilitado (pedido
// 2026-10-02: "mais claro que ele não é clicável"). Mesmos critérios das
// seções do resumo (hide-when-empty), sem renderizar.
import type { Catalog } from '../../../data/catalog'
import { fmPath, listaEntries, profLetter, str, type ProfRow } from '../../ficha/hero-model'
import { computeMagiaAtaque } from '../../../interativa/invocacao'
import { parseItemAlias } from '../../ficha/hero-model'
import { ESSENCIAS_PATH_PREFIXES, MODIFICADORES_PATH_PREFIX } from '../../../rules/projection'

type Fm = Record<string, unknown>

/** Habilidade que NÃO entra na lista do Escudo: modificador de bestiário
 *  (Competente/Solo/Elite/Evolução Básica de Monstro — estrutura do monstro,
 *  não o que ele faz) ou ESSÊNCIA (o que ela faz aparece em MAGIAS). Decide
 *  pela PASTA da nota resolvida no catálogo, nunca por nome. */
export function habilidadeOcultaNoEscudo(catalog: Catalog, target: string): boolean {
  const r = catalog.resolve(target)
  if (r.kind !== 'doc') return false
  if (r.id.startsWith(MODIFICADORES_PATH_PREFIX)) return true
  return ESSENCIAS_PATH_PREFIXES.some((p) => r.id.startsWith(p))
}

function lista(v: unknown): Fm[] {
  return Array.isArray(v) ? (v as Fm[]) : []
}

export function temAtaques(fm: Fm): boolean {
  const armas = lista(fmPath(fm, 'Inventario', 'Armas', 'Lista')).filter((a) => str(a['Nome']))
  const naturais = lista(fmPath(fm, 'Ataques', 'Lista')).filter((r) => str(r['Nome']) && str(r['Nome']) !== 'Manobras')
  return armas.length + naturais.length > 0
}

/** Alguma escola proficiente (+N/CD) ou alguma magia listada (primária ou da
 *  segunda classe) — o mesmo "não vazio" do MagiasResumo. */
export function temMagias(fm: Fm): boolean {
  const blocos: Fm[] = [fm]
  const sec = fmPath(fm, 'Magias', 'Secundaria') as Fm | undefined
  if (sec && Array.isArray(sec['Lista']) && (sec['Lista'] as unknown[]).length) blocos.push({ ...fm, Magias: sec } as Fm)
  for (const b of blocos) {
    for (const e of lista(fmPath(b, 'Magias', 'Lista'))) {
      const nome = str(e['Nome'])
      if (!nome) continue
      if (lista(e['Lista']).length > 0) return true
      if (nome !== 'Tesouros' && computeMagiaAtaque(b, `Magia ${nome}`)) return true
    }
  }
  return false
}

export function temPericias(fm: Fm): boolean {
  return lista(fmPath(fm, 'Pericias', 'Lista')).some((r) => profLetter(r as ProfRow) !== 'N')
}

/** Habilidades (menos as ocultas), técnicas ou ações. */
export function temHabilidades(fm: Fm, catalog: Catalog): boolean {
  const habs = listaEntries(fmPath(fm, 'Habilidades', 'Lista')).filter((e) => !habilidadeOcultaNoEscudo(catalog, e.target))
  if (habs.length) return true
  if (listaEntries(fmPath(fm, 'Tecnicas', 'Lista')).length) return true
  return listaEntries(fmPath(fm, 'Acoes', 'Lista')).some((e) => !!e.target)
}

/** Armadura, tesouros ou consumíveis (armas e escudo NÃO: já aparecem em
 *  ATAQUES e no bloco do escudo). */
export function temPertences(fm: Fm): boolean {
  if (str(fmPath(fm, 'Inventario', 'Armadura', 'Nome'))) return true
  const tes = lista(fmPath(fm, 'Inventario', 'Tesouros')).some((t) => !!parseItemAlias(t).nome)
  if (tes) return true
  return lista(fmPath(fm, 'Inventario', 'Consumiveis')).some((c) => {
    const { nome, qtd } = parseItemAlias(c)
    return !!nome && qtd > 0
  })
}

export type VistaId = 'ataques' | 'magias' | 'pericias' | 'habilidades' | 'pertences'

export function vistasDisponiveis(fm: Fm, catalog: Catalog): Record<VistaId, boolean> {
  return {
    ataques: temAtaques(fm),
    magias: temMagias(fm),
    pericias: temPericias(fm),
    habilidades: temHabilidades(fm, catalog),
    pertences: temPertences(fm),
  }
}
