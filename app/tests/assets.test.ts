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

  it('basename ambíguo e alvo inexistente → null (nunca chutar)', () => {
    const amb = manifest.assets.find((a) => a.ambiguous)!
    expect(resolveAsset(index, amb.basename)).toBeNull()
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
