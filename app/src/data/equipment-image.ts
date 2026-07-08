// Figuras de EQUIPAMENTO do INVENTÁRIO (issue #65) — espelham a resolução de
// imagem das cartas do pleitost-views sobre o assets.json real:
//   • propriedade/imbuição da arma → Figura/Imbuições e Têmperas/<Base> <TierFem>.png
//     (imbuicoes-render.ts:81 — sufixo de tier FEMININO);
//   • selo de OBRA-PRIMA (overlay) → a MESMA figura, mas SÓ quando a propriedade
//     é a Obra-prima automática: essas figuras (<X> Obra-prima <tier>.png) SÃO
//     selos de cera na vault; não existe asset 'selo' dedicado (só estas);
//   • escudo → Figura/Armas/<image|basename>.png (escudos-render.ts:126, mesma
//     resolução das armas ⇒ reusa weaponImageUrl);
//   • tesouro → Figura/Equipamentos/<Nome>[ <TierMasc>].png (eq-defesa-render.ts:68
//     COM tier / eq-ataque-render.ts:77 SEM tier — sufixo MASCULINO);
//   • armadura → SEM mapeamento base→imagem confiável (Equipamentos/Armaduras/*
//     têm nomes genéricos, sem carta) ⇒ null (placeholder), como pediu a issue.
import { assetUrl, type AssetIndex } from './assets'
import { weaponImageUrl } from './creature-image'
import type { VaultDoc } from './types'

const FIGURA_IMBUICOES = 'Recursos e Mídia/Imagens/Cartas/Figura/Imbuições e Têmperas'
const FIGURA_EQUIPAMENTOS = 'Recursos e Mídia/Imagens/Cartas/Figura/Equipamentos'
const FIGURA_ARMAS = 'Recursos e Mídia/Imagens/Cartas/Figura/Armas'
const FIGURA_IMPLEMENTOS = 'Recursos e Mídia/Imagens/Cartas/Figura/Implementos'

/** Basename de um wikilink/nome ("[[Broquel]]" / "[[X|Y]]" / "Broquel" → "Broquel"). */
function wikiBasename(nome: string): string {
  const m = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/.exec(nome)
  const target = (m ? m[1] : nome).trim()
  return target.split('/').pop() ?? target
}

/** Sufixo de tier no nome do arquivo — FEMININO nas imbuições/têmperas
 *  (CARTAS_TIER_LABEL_FEMININO do pleitost-views: A→Adepta …). */
const TIER_FEM: Record<'A' | 'E' | 'M', string> = { A: 'Adepta', E: 'Experiente', M: 'Mestre' }
/** …e MASCULINO nos equipamentos/tesouros (CARTAS_TIER_LABEL_MASCULINO). */
const TIER_MASC: Record<'A' | 'E' | 'M', string> = { A: 'Adepto', E: 'Experiente', M: 'Mestre' }

function byPath(assets: AssetIndex, path: string): string | null {
  const entry = assets.byPath.get(path)
  return entry ? assetUrl(entry) : null
}

/** Figura da PROPRIEDADE/imbuição da arma. `base` = basename do wikilink
 *  Propriedade (ex.: "Imbuição Torrencial", "Arma Obra-prima"); `tier` = a
 *  qualidade A/E/M. A pasta só tem imagens com sufixo de tier ⇒ sem base ou
 *  sem tier → null (o slot fica vazio, como o da arma). */
export function propriedadeImageUrl(
  base: string,
  tier: '' | 'A' | 'E' | 'M',
  assets: AssetIndex | undefined,
): string | null {
  const b = base.trim()
  if (!b || !tier || !assets) return null
  return byPath(assets, `${FIGURA_IMBUICOES}/${b} ${TIER_FEM[tier]}.png`)
}

/** true quando a propriedade é a Obra-prima automática (selo), não uma imbuição
 *  real — basename "<X> Obra-prima" (Arma/Armadura/Broquel/Escudo/Ferramenta),
 *  como as constantes ARMA_OBRA_PRIMA/ARMADURA_OBRA_PRIMA/escudoObraPrima do
 *  modelo. */
export function isObraPrima(base: string): boolean {
  return /(?:^|\s)Obra-prima$/i.test(base.trim())
}

/** Selo de OBRA-PRIMA pro overlay POR CIMA da imagem do item: a figura da
 *  propriedade SÓ quando ela é a Obra-prima automática (essas figuras SÃO selos
 *  de cera na vault); imbuição real ou item comum → null (sem selo). */
export function obraPrimaSeloUrl(
  base: string,
  tier: '' | 'A' | 'E' | 'M',
  assets: AssetIndex | undefined,
): string | null {
  return isObraPrima(base) ? propriedadeImageUrl(base, tier, assets) : null
}

/** Figura do ESCUDO — mesma resolução das armas do pleitost-views (escudos-render
 *  usa Figura/Armas/<image|basename>.png ⇒ reusa weaponImageUrl sobre o doc do
 *  escudo). Sem doc (Sem Escudo) → null (o card mostra o emoji). */
export function escudoImageUrl(
  doc: VaultDoc | undefined,
  assets: AssetIndex | undefined,
): string | null {
  return weaponImageUrl(doc, assets)
}

/** Figura do ESCUDO pelo NOME (Inventario.Escudo.Nome) — Figura/Armas/<basename>.png,
 *  SEM depender do doc carregado: escudo escolhido no app (overlay) não tem doc
 *  em refs, então escudoImageUrl(doc) caía no emoji (Broquel sumia). */
export function escudoImageUrlByName(
  nome: string,
  assets: AssetIndex | undefined,
): string | null {
  const base = wikiBasename(nome)
  if (!base || base === 'Sem Escudo' || !assets) return null
  return byPath(assets, `${FIGURA_ARMAS}/${base}.png`)
}

/** Figura do TESOURO — Figura/Equipamentos/<Nome>[ <TierMasc>].png. Tenta COM
 *  sufixo de tier primeiro (ex.: "Anel da Resistência Adepto.png"); senão SEM
 *  sufixo (ex.: "Anel Canário.png") — espelha eq-defesa (com tier) vs
 *  eq-ataque/pericia (sem tier) do pleitost-views. Sem figura → null. */
export function tesouroImageUrl(
  nome: string,
  tier: '' | 'A' | 'E' | 'M',
  assets: AssetIndex | undefined,
): string | null {
  const base = nome.trim()
  if (!base || !assets) return null
  if (tier) {
    const tiered = byPath(assets, `${FIGURA_EQUIPAMENTOS}/${base} ${TIER_MASC[tier]}.png`)
    if (tiered) return tiered
  }
  const eq = byPath(assets, `${FIGURA_EQUIPAMENTOS}/${base}.png`)
  if (eq) return eq
  // Implementos vivem em Figura/Implementos (sem sufixo de tier) —
  // implementos-render.ts:80 do pleitost-views. Ex.: Foco da Consistência.png.
  return byPath(assets, `${FIGURA_IMPLEMENTOS}/${base}.png`)
}
