// Integração sobre o assets.json real: resolução de embeds/frontmatter → URL.
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { assetUrl, buildAssetIndex, resolveAsset } from '../src/data/assets'
import type { AssetsManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const manifest = JSON.parse(
  fs.readFileSync(path.join(path.dirname(appDir), 'vault-data', 'assets.json'), 'utf8'),
) as AssetsManifest
const index = buildAssetIndex(manifest)

describe('assets sobre vault-data real', () => {
  it('indexa todos os assets do manifesto', () => {
    expect(index.byPath.size).toBe(manifest.assets.length)
  })

  it('resolve basename único (Animista.jpeg) pro copiedTo do manifesto', () => {
    const entry = resolveAsset(index, 'Animista.jpeg')
    expect(entry).not.toBeNull()
    const raw = manifest.assets.find((a) => a.basename === 'Animista.jpeg')!
    expect(entry!.copiedTo).toBe(raw.copiedTo)
    // o arquivo copiado existe de verdade
    expect(
      fs.existsSync(path.join(path.dirname(appDir), 'vault-data', entry!.copiedTo)),
    ).toBe(true)
  })

  it('resolve path exato mesmo quando o basename é ambíguo', () => {
    const amb = manifest.assets.find((a) => a.ambiguous)
    expect(amb, 'esperava assets ambíguos no manifesto').toBeDefined()
    expect(resolveAsset(index, amb!.path)?.copiedTo).toBe(amb!.copiedTo)
  })

  it('basename não-único → path mais CURTO (regra do Obsidian, verificada ao vivo)', () => {
    // getFirstLinkpathDest do Obsidian resolve basename não-único pro arquivo
    // de path mais curto — verificado no Obsidian VIVO da vault (2026-08-03):
    //   Krasnogor.png (Mapas × 2 sprites Wonderdraft) → Imagens/Mapas/…
    //   Canto Alto-bw.png (Emblemas × Emblemas/transparent) → Emblemas/…
    //   Poção de Cura Adepta.png (Cartas Exportadas × Figura) → Figura/…
    // Antes o app recusava ambíguos ("nunca chutar") e a imagem SUMIA quando um
    // sprite homônimo entrava na vault (pasta Emblemas) — divergindo do que o
    // Obsidian mostra pro MESMO embed.
    expect(resolveAsset(index, 'Krasnogor.png')?.path).toBe(
      'Recursos e Mídia/Imagens/Mapas/Krasnogor.png',
    )
    expect(resolveAsset(index, 'Canto Alto-bw.png')?.path).toBe(
      'Recursos e Mídia/Imagens/Emblemas/Canto Alto-bw.png',
    )
    expect(resolveAsset(index, 'nao-existe.png')).toBeNull()
  })

  it('assetUrl escapa espaços/acentos por segmento', () => {
    const entry = resolveAsset(index, 'Animista.jpeg')!
    const url = assetUrl(entry)
    expect(url.startsWith('/vault-data/assets/')).toBe(true)
    expect(url).not.toContain(' ')
    expect(decodeURIComponent(url)).toBe('/vault-data/' + entry.copiedTo)
  })
})
