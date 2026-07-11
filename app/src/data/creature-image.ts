// Hierarquia de imagem de criatura — ESPELHA resolveImage do plugin
// (src/cola/yaml-block-deps-factory.ts §0.6.108). Ordem (1ª que existir):
//   Heroi:   FM Imagem → Retratos/<nome> → Classes/<classe> → null
//   CA:      FM Imagem → Retratos/<nome> → Companheiros Animais/<classe> → null
//   Monstro: FM Imagem → Monstros/<nome> → Raças/<raça> → Monstros/<classe> → null
// null = caller usa fallback (iniciais/emoji), como no plugin.
import { assetUrl, resolveAsset, type AssetIndex } from './assets'
import type { VaultDoc } from './types'

const RETRATOS = 'Recursos e Mídia/Imagens/Retratos'
const CLASSES_HEROI = 'Recursos e Mídia/Imagens/Classes'
const CLASSES_CA = 'Recursos e Mídia/Imagens/Companheiros Animais'
const MONSTROS = 'Recursos e Mídia/Imagens/Monstros'
const RACAS = 'Recursos e Mídia/Imagens/Raças'
const EXTS = ['.png', '.jpg', '.jpeg', '.webp']

function tryFolder(assets: AssetIndex, folder: string, base: string | null): string | null {
  if (!base) return null
  for (const ext of EXTS) {
    const entry = assets.byPath.get(`${folder}/${base}${ext}`.normalize('NFC'))
    if (entry) return assetUrl(entry)
  }
  return null
}

/** Basename do alvo de um wikilink FM ("[[Guerreiro|X]]" → "Guerreiro"). */
function wikiBase(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const target = /\[\[([^\]|]+)/.exec(value)?.[1] ?? value
  return target.split('/').pop()!.trim() || null
}

export function creatureImageUrl(
  doc: VaultDoc | undefined,
  assets: AssetIndex | undefined,
): string | null {
  if (!doc || !assets) return null
  const fm = doc.frontmatter

  // 1. property Imagem (wikilink/nome de arquivo)
  const imagem = fm['Imagem']
  if (typeof imagem === 'string' && imagem.trim()) {
    const base = wikiBase(imagem)
    const entry = base ? resolveAsset(assets, base) : null
    if (entry) return assetUrl(entry)
  }

  const nome =
    typeof fm['nome'] === 'string' && fm['nome'].trim() ? (fm['nome'] as string) : doc.basename
  const classe = wikiBase(fm['Classe'])
  const raca = wikiBase(fm['Raça'])

  switch (doc.subtype) {
    case 'Heroi':
      return tryFolder(assets, RETRATOS, nome) ?? tryFolder(assets, CLASSES_HEROI, classe)
    case 'Companheiro Animal':
      return tryFolder(assets, RETRATOS, nome) ?? tryFolder(assets, CLASSES_CA, classe)
    case 'Monstro':
      return (
        tryFolder(assets, MONSTROS, nome) ??
        tryFolder(assets, RACAS, raca) ??
        tryFolder(assets, MONSTROS, classe)
      )
    default:
      return null
  }
}

/** Imagem de um GRUPO: Retratos/<basename do grupo> (existem na vault). */
export function groupImageUrl(
  basename: string | undefined,
  assets: AssetIndex | undefined,
): string | null {
  if (!basename || !assets) return null
  return tryFolder(assets, RETRATOS, basename)
}

// Figuras das cartas de arma — single source of truth do plugin pleitost-views
// (data/cartas-assets.ts:15 FIGURA_ARMAS). O autosheet NÃO mostra imagem de
// arma no Editável (golden carlos/editavel__tab-inventario.html só tem o
// retrato do header); a fonte de imagem por item na família de plugins é o
// render de cartas do pleitost-views.
const FIGURA_ARMAS = 'Recursos e Mídia/Imagens/Cartas/Figura/Armas'

/**
 * Imagem do slot de arma do INVENTÁRIO (issue #12). Ordem:
 *   1. 1ª imagem embutida no doc da arma (doc.images → assets.json) — hoje
 *      nenhum doc de arma tem embed, mas é a fonte primária quando existir;
 *   2. figura da carta, como o pleitost-views resolve (armas-render.ts:31-40):
 *      FM `image` (string | {path}) senão `<basename>.png`, dentro de
 *      Figura/Armas (armas-render.ts:131).
 * null = slot vazio do design (sem o default.png das cartas — o design
 * renderiza o slot vazio quando não há imagem).
 */
export function weaponImageUrl(
  doc: VaultDoc | undefined,
  assets: AssetIndex | undefined,
): string | null {
  if (!doc || !assets) return null

  const embed = doc.images[0]?.target
  if (embed) {
    const entry =
      resolveAsset(assets, embed) ?? resolveAsset(assets, embed.split('/').pop() ?? embed)
    if (entry) return assetUrl(entry)
  }

  const imageRaw = doc.frontmatter['image']
  let fileName = `${doc.basename}.png`
  if (imageRaw && typeof imageRaw === 'object') {
    const path = (imageRaw as { path?: unknown }).path
    if (typeof path === 'string') fileName = path
  } else if (typeof imageRaw === 'string' && imageRaw.trim()) {
    fileName = imageRaw
  }
  const figura = assets.byPath.get(`${FIGURA_ARMAS}/${fileName}`.normalize('NFC'))
  return figura ? assetUrl(figura) : null
}
