// COMÉRCIO — monta os CANDIDATOS da loja a partir do catálogo (issue #93). Puro:
// recebe docs já carregados (o gather async vive no ComercioTab) e devolve os
// candidatos classificados (tesouro simples / combo arma×imbuição / obra-prima)
// + poções. Modelo LIMITADO: combos só das ARMAS TÍPICAS da região × todas as
// imbuições (armas incomuns ficam como encomenda especial). Tesouros simples:
// TODOS do sistema (típico se está nos Recursos, senão incomum).
import type { VaultDoc } from './types'
import { precoPO } from '../grupo/wealth'
import { aplicavelPredicates, hostStatsFromDoc, isAplicavelAoHost } from '../rules/aplicavel-a'
import {
  RARIDADE_MULT,
  comboMult,
  raridadeTesouro,
  type ShopCandidate,
  type PocaoCandidate,
  type Tier,
} from './commerce'

const T3: Tier[] = ['A', 'E', 'M']

/** basename do alvo de um wikilink de Recurso ("[[A/B|C]]" → "B"). */
function recursoBasename(raw: string): string {
  const m = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/.exec(raw)
  const target = (m ? m[1] : raw).trim()
  return target.split('/').pop() ?? target
}

/** Adjetivo de uma imbuição p/ o rótulo do combo ("Imbuição Relampejante" →
 *  "Relampejante"; "Imbuição da Ventania" → "da Ventania"). */
export function imbuicaoAdjetivo(basename: string): string {
  return basename.replace(/^Imbui[çc][ãa]o\s+/i, '').trim()
}

export interface BuildCandidatesInput {
  /** Recursos (wikilinks) da localização — define o que é TÍPICO. */
  recursos: string[]
  /** Todos os tesouros simples do sistema (Equipamentos + Implementos). */
  tesourosSimples: VaultDoc[]
  /** Todas as imbuições (combinam com as armas típicas). */
  imbuicoes: VaultDoc[]
  /** Armas TÍPICAS (docs resolvidos dos Recursos, subcategoria Arma). */
  armasTipicas: VaultDoc[]
  /** Qualidades obra-prima (Arma/Armadura/Broquel/Escudo/Ferramenta Obra-prima). */
  qualidades: VaultDoc[]
  /** Poções (consumíveis). */
  pocoes: VaultDoc[]
}

/** Catálogo → candidatos da loja + poções (puro, sem assets/React). */
export function buildShopCandidates(input: BuildCandidatesInput): {
  candidates: ShopCandidate[]
  pocoes: PocaoCandidate[]
} {
  const tipico = new Set(input.recursos.map(recursoBasename))
  const qualByName = new Map(input.qualidades.map((q) => [q.basename, q]))
  const obraPrimaArma = qualByName.get('Arma Obra-prima')
  const candidates: ShopCandidate[] = []

  // 1) Tesouros simples — TODOS; típico se está nos Recursos, senão incomum
  //    (básicos ganham ×2/×½). Preço base do doc.
  for (const doc of input.tesourosSimples) {
    const nome = doc.basename
    candidates.push({
      key: doc.id,
      nome,
      label: nome,
      precoBase: precoPO(doc),
      mult: RARIDADE_MULT[raridadeTesouro(nome, tipico.has(nome))],
      tiers: T3,
    })
  }

  // 2) Combos ARMA(típica)×IMBUIÇÃO — "Adaga Relampejante" (preço = imbuição).
  for (const arma of input.armasTipicas) {
    const host = hostStatsFromDoc(arma)
    for (const imb of input.imbuicoes) {
      // #288: só oferece o combo se a imbuição é APLICÁVEL a esta arma (AplicavelA
      // do sistema) — antes toda arma × toda imbuição virava carta, gerando combos
      // incompatíveis (ex.: imbuição de Tipo,corte numa arma perfurante).
      if (!isAplicavelAoHost(aplicavelPredicates(imb), host)) continue
      const adj = imbuicaoAdjetivo(imb.basename)
      candidates.push({
        key: `${arma.id}|${imb.id}`,
        nome: `${arma.basename} ${adj}`,
        label: `${arma.basename} ${adj}`,
        precoBase: precoPO(imb),
        mult: comboMult(true, tipico.has(imb.basename)),
        tiers: T3,
        armaTarget: arma.id,
        imbTarget: imb.id, // p/ a 2ª carta no hover
        propriedadeBase: imb.basename, // p/ selo (figura "Imbuição X <Tier>.png")
      })
    }
    // 3) Arma Obra-prima (básico) aplicada à arma típica — "Adaga Obra-prima".
    //    #288: mesmo filtro AplicavelA — a obra-prima de arma exige Subcategoria,Arma
    //    + Grupo,cac-*|d-*; armas fora desses grupos não recebem o combo.
    if (obraPrimaArma && isAplicavelAoHost(aplicavelPredicates(obraPrimaArma), host)) {
      candidates.push({
        key: `${arma.id}|obra-prima`,
        nome: `${arma.basename} Obra-prima`,
        label: `${arma.basename} Obra-prima`,
        precoBase: precoPO(obraPrimaArma),
        mult: RARIDADE_MULT[raridadeTesouro('Arma Obra-prima', true)], // básico-típico ×2
        tiers: T3,
        armaTarget: arma.id,
        imbTarget: obraPrimaArma.id, // 2ª carta no hover = a obra-prima
        propriedadeBase: 'Arma Obra-prima', // selo "Arma Obra-prima <Tier>.png"
      })
    }
  }

  // 4) Obra-primas específicas dos Recursos (ex.: "Armadura Obra-prima|Armadura
  //    Leve", "Broquel Obra-prima|Broquel") — básico típico.
  for (const raw of input.recursos) {
    const m = /\[\[([^\]|]+)\|([^\]]+)\]\]/.exec(raw)
    if (!m) continue
    const targetBase = (m[1].split('/').pop() ?? '').trim()
    const alias = m[2].trim()
    if (!/Obra-prima$/i.test(targetBase)) continue
    const q = qualByName.get(targetBase)
    if (!q) continue
    candidates.push({
      key: `${q.id}|${alias}`,
      nome: `${alias} Obra-prima`,
      label: `${alias} Obra-prima`,
      precoBase: precoPO(q),
      mult: RARIDADE_MULT['basico-tipico'],
      tiers: T3,
      imbTarget: q.id, // 2ª carta no hover = a obra-prima
      propriedadeBase: targetBase, // selo "<Qualidade> <Tier>.png"
      thumbBasename: alias, // miniatura do escudo/armadura base ("Broquel")
    })
  }

  // 5) Poções — regra por dados (à parte da matriz).
  const pocoes: PocaoCandidate[] = input.pocoes.map((doc) => ({
    key: doc.id,
    nome: doc.basename,
    label: doc.basename,
    precoBase: precoPO(doc),
    tiers: T3,
  }))

  return { candidates, pocoes }
}
