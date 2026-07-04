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
    const entry = assets.byPath.get(`${folder}/${base}${ext}`)
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
