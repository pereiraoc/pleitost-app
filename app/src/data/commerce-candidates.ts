// COMÉRCIO — monta os CANDIDATOS da loja a partir do catálogo (issue #93). Puro:
// recebe docs já carregados (o gather async vive no ComercioTab) e devolve os
// candidatos classificados (tesouro simples / combo arma×imbuição / obra-prima)
// + poções. Modelo LIMITADO: combos só das ARMAS TÍPICAS da região × todas as
// imbuições (armas incomuns ficam como encomenda especial). Tesouros simples:
// TODOS do sistema (típico se está nos Recursos, senão incomum).
import type { VaultDoc } from './types'
import { precoPO } from '../grupo/wealth'
import { escudoObraPrima, wikiTarget } from '../components/ficha/hero-model'
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
  const target = (m ? m[1]! : raw).trim()
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
  /** TODAS as armas vendáveis (fora especiais/naturais, que só vêm por regra). O
   *  combo é TÍPICO se a arma está nos Recursos, senão INCOMUM — a nota
   *  "Disponibilidade de Tesouros" prevê os dois (Arma incomum + imbuição típica
   *  ×½, etc.), então a arma incomum entra com % reduzido, não some. */
  armas: VaultDoc[]
  /** Bases de ARMADURA (Armadura Leve/Pesada) — viram "<base> Obra-prima". */
  armaduras: VaultDoc[]
  /** Bases de ESCUDO (Broquel/Escudo) — viram "<base> Obra-prima". */
  escudos: VaultDoc[]
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

  // 2) Combos ARMA×IMBUIÇÃO — "Adaga Relampejante" (preço = imbuição). Vale pra
  //    TODA arma vendável: típica (∈ Recursos) ou incomum. O comboMult aplica os
  //    modificadores da nota (tt ×1 · it ×½ · ti ×¼ · ii ×⅛), então a arma incomum
  //    entra com % menor no roll — não é mais excluída.
  for (const arma of input.armas) {
    const armaTipica = tipico.has(arma.basename)
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
        mult: comboMult(armaTipica, tipico.has(imb.basename)),
        tiers: T3,
        armaTarget: arma.id,
        imbTarget: imb.id, // p/ a 2ª carta no hover
        propriedadeBase: imb.basename, // p/ selo (figura "Imbuição X <Tier>.png")
      })
    }
    // 3) Arma Obra-prima (básico) — "Adaga Obra-prima". Básico-típico ×2 se a arma
    //    é típica; básico-incomum ×½ se não. #288: mesmo filtro AplicavelA.
    if (obraPrimaArma && isAplicavelAoHost(aplicavelPredicates(obraPrimaArma), host)) {
      candidates.push({
        key: `${arma.id}|obra-prima`,
        nome: `${arma.basename} Obra-prima`,
        label: `${arma.basename} Obra-prima`,
        precoBase: precoPO(obraPrimaArma),
        mult: RARIDADE_MULT[raridadeTesouro('Arma Obra-prima', armaTipica)],
        tiers: T3,
        armaTarget: arma.id,
        imbTarget: obraPrimaArma.id, // 2ª carta no hover = a obra-prima
        propriedadeBase: 'Arma Obra-prima', // selo "Arma Obra-prima <Tier>.png"
      })
    }
  }

  // 4) Obra-primas de ARMADURA/ESCUDO — oferecidas em QUALQUER cidade (#341/user),
  //    não só quando estão nos Recursos. A base é TÍPICA se aparece nos Recursos
  //    (via o alias "[[<Qualidade>|<base>]]", ex. "Armadura Obra-prima|Armadura
  //    Leve"), senão INCOMUM. A classe sai de raridadeTesouro(<qualidade>, típico):
  //    Armadura Obra-prima é BÁSICO (×2 típico / ×½ incomum); Broquel/Escudo
  //    Obra-prima NÃO são básicos (×1 típico / ×¼ incomum).
  const basesTipicas = new Set<string>()
  for (const raw of input.recursos) {
    const m = /\[\[([^\]|]+)\|([^\]]+)\]\]/.exec(raw)
    if (!m) continue
    if (/Obra-prima$/i.test((m[1]!.split('/').pop() ?? '').trim())) basesTipicas.add(m[2]!.trim())
  }
  const gearBases = [
    ...input.armaduras.map((base) => ({ base, quality: 'Armadura Obra-prima' })),
    ...input.escudos.map((base) => ({ base, quality: wikiTarget(escudoObraPrima(base.basename)) })),
  ]
  for (const { base, quality } of gearBases) {
    const q = qualByName.get(quality)
    if (!q) continue
    candidates.push({
      key: `${q.id}|${base.basename}`,
      nome: `${base.basename} Obra-prima`,
      label: `${base.basename} Obra-prima`,
      precoBase: precoPO(q),
      mult: RARIDADE_MULT[raridadeTesouro(quality, basesTipicas.has(base.basename))],
      tiers: T3,
      imbTarget: q.id, // 2ª carta no hover = a obra-prima
      propriedadeBase: quality, // selo "<Qualidade> <Tier>.png"
      thumbBasename: base.basename, // miniatura da armadura/escudo base
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
