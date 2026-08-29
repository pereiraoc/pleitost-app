// @vitest-environment jsdom
// #519: índice de assets POR MUNDO — no cyberpunk o índice é a UNIÃO dos dois
// assets.json (mundo vence por path, fantasia herda o resto) e as URLs roteiam
// pro dataset dono do arquivo. Regressões cobertas (reports 2026-08-29):
//   - "tu tirou o mapa de porto alegre": fetchAssetIndex pegava só o
//     assets.json da fantasia → mapa da POA fora do índice.
//   - Embratel-trabalhadores.png (embed em nota de Contexto) não aparecia.
import { beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderHook, act } from '@testing-library/react'
import { assetUrl, fetchAssetIndex, resolveAsset, thumbCopiedTo } from '../src/data/assets'
import { setWorldDataset, __resetWorldDatasetForTests } from '../src/data/world-dataset'
import { useTheme, __resetThemeForTests } from '../src/theme'
import type { AssetsManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const repoDir = path.dirname(appDir)
const lerManifest = (dir: string) =>
  JSON.parse(fs.readFileSync(path.join(repoDir, dir, 'assets.json'), 'utf8')) as AssetsManifest

const manifestCyber = lerManifest('vault-data-cyberpunk')

const setContext = (c: 'fantasia' | 'cyberpunk') => {
  const { result } = renderHook(() => useTheme())
  act(() => result.current.setContext(c))
}

beforeEach(() => {
  window.localStorage?.clear?.()
  __resetThemeForTests()
  __resetWorldDatasetForTests()
  // fetch real dos dois assets.json do disco, como o dev server serviria
  globalThis.fetch = (async (input: unknown) => {
    const url = String(input)
    const m = /^\/(vault-data(?:-cyberpunk)?)\/(.*)$/.exec(url)
    const file = m ? path.join(repoDir, m[1]!, decodeURIComponent(m[2]!)) : ''
    const ok = file !== '' && fs.existsSync(file)
    return {
      ok,
      status: ok ? 200 : 404,
      json: async () => JSON.parse(fs.readFileSync(file, 'utf8')),
    }
  }) as typeof fetch
})

describe('índice de assets no mundo cyberpunk (união)', () => {
  it('resolve o mapa da POA e os embeds de Contexto pro dataset do mundo', async () => {
    setContext('cyberpunk')
    // registro dos rels como o fetchCatalogForWorld faz (copiedTo + thumb)
    const rels: string[] = []
    for (const a of manifestCyber.assets) {
      rels.push(a.copiedTo, thumbCopiedTo(a.copiedTo))
    }
    setWorldDataset('cyberpunk', rels)

    const index = await fetchAssetIndex()
    for (const basename of ['Mapa de Porto Alegre RPG.png', 'Embratel-trabalhadores.png']) {
      const entry = resolveAsset(index, basename)
      expect(entry, basename).not.toBeNull()
      const url = assetUrl(entry!)
      expect(url.startsWith('/vault-data-cyberpunk/assets/'), `${basename} → ${url}`).toBe(true)
      // o arquivo copiado existe de verdade no dataset
      expect(fs.existsSync(path.join(repoDir, 'vault-data-cyberpunk', entry!.copiedTo))).toBe(true)
    }
  })

  it('asset só da fantasia segue herdado, com URL do dataset base', async () => {
    setContext('cyberpunk')
    setWorldDataset(
      'cyberpunk',
      manifestCyber.assets.flatMap((a) => [a.copiedTo, thumbCopiedTo(a.copiedTo)]),
    )
    const index = await fetchAssetIndex()
    // único asset presente SÓ na fantasia (o fork da POA herda as imagens de
    // sistema, então quase tudo existe nos dois datasets)
    const entry = resolveAsset(index, 'Companion App Draft.excalidraw.png')
    expect(entry).not.toBeNull()
    expect(assetUrl(entry!).startsWith('/vault-data/assets/')).toBe(true)
  })
})
