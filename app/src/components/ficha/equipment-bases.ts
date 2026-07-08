// Bases de ARMADURA e ESCUDO derivadas dos DOCS REAIS da vault (issue #63).
//
// As opções dos dropdowns de armadura/escudo do InventarioTab vêm da pasta
// Sistema/Equipamento/{Armaduras,Escudos}, do mesmo jeito que as armas listam
// de Sistema/Equipamento/Armas (InventarioTab: armaGroups) — nunca de strings
// hardcodadas. Antes o escudo oferecia 'Escudo Leve'/'Escudo Pesado', que NÃO
// existem na vault: o escudo escolhido não resolvia pro doc, então perdia
// dureza, danos e o bônus-defesa (Broquel=1/Escudo=2). Os escudos reais são
// Broquel (bonus-defesa 1, dureza 2, danos 4) e Escudo (bonus-defesa 2,
// dureza 4, danos 4). Com o Nome gravado como wikilink do doc real, o COMBATE
// lê danos:: do próprio doc (integridade) e o bônus-defesa por nome
// (BonusEscudo); a dureza base é materializada no FM ao escolher o escudo
// (InventarioTab: writeEscudoBase, a partir de dureza::).
import type { Catalog } from '../../data/catalog'

const ESCUDOS_FOLDER = 'Sistema/Equipamento/Escudos/'
const ARMADURAS_FOLDER = 'Sistema/Equipamento/Armaduras/'

/** "Sem Escudo" NÃO é um doc — é o estado SEM peça (GearCard.noGear; onBase
 *  grava Nome vazio no FM, espelhando setEscudoNome do plugin). Fica no topo
 *  do dropdown, antes dos escudos reais da pasta. */
export const SEM_ESCUDO = 'Sem Escudo'

/** Ordem das categorias de armadura no dropdown — Sem → Leve → Pesada, como o
 *  embed de Armaduras.md e o design. "Sem Armadura" é um doc real (grupo 'Sem'),
 *  tratado como noGear pelo GearCard. */
const ARMADURA_GRUPO_ORDER = ['Sem', 'Leve', 'Pesada']

function grupoStr(grupo: unknown): string {
  return typeof grupo === 'string' ? grupo : ''
}

/** Bases de ESCUDO: os docs da pasta Escudos (subtype 'Escudo': Broquel, Escudo)
 *  em ordem alfabética pt-BR, com "Sem Escudo" à frente. */
export function escudoBases(catalog: Catalog): string[] {
  const docs = catalog.content
    .filter((e) => e.id.startsWith(ESCUDOS_FOLDER) && e.subtype === 'Escudo')
    .map((e) => e.basename ?? e.id)
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
  return [SEM_ESCUDO, ...docs]
}

/** Bases de ARMADURA: os docs da pasta Armaduras (subtype 'Armadura': Sem
 *  Armadura, Armadura Leve, Armadura Pesada) na ordem das categorias. */
export function armaduraBases(catalog: Catalog): string[] {
  return catalog.content
    .filter((e) => e.id.startsWith(ARMADURAS_FOLDER) && e.subtype === 'Armadura')
    .slice()
    .sort((a, b) => {
      const ia = ARMADURA_GRUPO_ORDER.indexOf(grupoStr(a.grupo))
      const ib = ARMADURA_GRUPO_ORDER.indexOf(grupoStr(b.grupo))
      return (ia < 0 ? ARMADURA_GRUPO_ORDER.length : ia) - (ib < 0 ? ARMADURA_GRUPO_ORDER.length : ib)
    })
    .map((e) => e.basename ?? e.id)
}
