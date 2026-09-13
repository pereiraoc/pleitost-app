// @vitest-environment jsdom
// THUMBNAILS (#280): os contextos PEQUENOS (retratos de lista, mini de item)
// usam o thumb gerado no deploy; os GRANDES (ficha/hero/lightbox) seguem no
// cheio. Cobre a derivação de caminho (thumbCopiedTo/thumbUrl — a MESMA regra do
// gerador scripts/gen-thumbs.mjs) e o VaultImage com `thumb` (usa o thumb e faz
// fallback pro cheio no onError, sem loop).
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assetUrl,
  assetUrlFor,
  buildAssetIndex,
  preferThumb,
  resolveAsset,
  thumbCopiedTo,
  thumbUrl,
} from '../src/data/assets'
import { thumbDestFor, fullWebpDestFor, stripLeadingFrontmatter } from '../../scripts/gen-thumbs.mjs'
import { VaultImage } from '../src/components/compendium/VaultImage'
import type { AssetsManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'assets.json'), 'utf8'),
) as AssetsManifest
const index = buildAssetIndex(manifest)

beforeAll(() => {
  // VaultImage carrega o assets.json via fetch — serve do disco.
  globalThis.fetch = (async (input: unknown) => {
    const rel = decodeURIComponent(String(input).replace(/^\/vault-data\//, ''))
    const file = path.join(vaultDataDir, rel)
    const ok = fs.existsSync(file)
    return { ok, status: ok ? 200 : 404, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) }
  }) as typeof fetch
})
afterEach(cleanup)

describe('derivação do caminho do thumb (#280)', () => {
  it('assets/<p>.<ext> raster → assets-thumb/<p>.<ext>.webp', () => {
    expect(thumbCopiedTo('assets/Recursos e Mídia/Imagens/Retratos/Foo.png')).toBe(
      'assets-thumb/Recursos e Mídia/Imagens/Retratos/Foo.png.webp',
    )
    expect(thumbCopiedTo('assets/x/Bar.JPG')).toBe('assets-thumb/x/Bar.JPG.webp')
    expect(thumbCopiedTo('assets/y/Baz.webp')).toBe('assets-thumb/y/Baz.webp.webp')
  })

  it('svg/gif (não-raster) e fora de assets/ ficam no próprio caminho (sem thumb)', () => {
    expect(thumbCopiedTo('assets/x/Icone.svg')).toBe('assets/x/Icone.svg')
    expect(thumbCopiedTo('assets/x/Anim.gif')).toBe('assets/x/Anim.gif')
    expect(thumbCopiedTo('outra/coisa.png')).toBe('outra/coisa.png')
  })

  it('thumbUrl escapa por segmento e aponta pro assets-thumb', () => {
    const entry = resolveAsset(index, 'Animista.jpeg')!
    const url = thumbUrl(entry)
    expect(url.startsWith('/vault-data/assets-thumb/')).toBe(true)
    expect(url.endsWith('.jpeg.webp')).toBe(true)
    expect(url).not.toContain(' ')
    expect(decodeURIComponent(url)).toBe('/vault-data/' + thumbCopiedTo(entry.copiedTo))
  })

  it('gen-thumbs.thumbDestFor concorda com thumbCopiedTo (mesma regra nos dois lados)', () => {
    // O gerador recebe o caminho relativo a vault-data (com o separador do SO);
    // o resultado precisa bater com o que o app deriva de copiedTo.
    const entry = resolveAsset(index, 'Animista.jpeg')!
    const relFromVaultData = entry.copiedTo.split('/').join(path.sep)
    expect(thumbDestFor(relFromVaultData)).toBe(thumbCopiedTo(entry.copiedTo))
    // não-raster → gerador retorna null (o app mantém o caminho cheio).
    expect(thumbDestFor(path.join('assets', 'x', 'Icone.svg'))).toBeNull()
    expect(thumbDestFor(path.join('fora', 'coisa.png'))).toBeNull()
  })

  it('assetUrlFor(small) usa thumb SÓ em produção; dev/test cai no cheio', () => {
    const entry = resolveAsset(index, 'Animista.jpeg')!
    // Em teste import.meta.env.PROD é false → preferThumb false → cheio.
    expect(preferThumb).toBe(false)
    expect(assetUrlFor(entry, true)).toBe(assetUrl(entry))
    // contexto grande (small=false) é sempre o cheio.
    expect(assetUrlFor(entry, false)).toBe(assetUrl(entry))
  })
})

// IMAGEM CHEIA EM WEBP (2026-09-13): o site publicado tinha ido a 3,1 GB
// contra o limite de 1 GB do GitHub Pages e o deploy parou de entrar. O cheio
// passa a ser reencodado pra webp NO DIST, na mesma resolução (2972 MB → 258).
describe('derivação do caminho da imagem cheia em webp', () => {
  it('troca a extensão mantendo o caminho', () => {
    expect(fullWebpDestFor('assets/x/Foto.png')).toBe('assets/x/Foto.webp')
    expect(fullWebpDestFor('assets/x/Foto.JPG')).toBe('assets/x/Foto.webp')
  })

  it('não mexe no que já é webp, nem em vetorial/animado', () => {
    expect(fullWebpDestFor('assets/x/Foto.webp')).toBeNull()
    expect(fullWebpDestFor('assets/x/Icone.svg')).toBeNull()
    expect(fullWebpDestFor('assets/x/Anima.gif')).toBeNull()
  })

  it('só mexe dentro de assets/', () => {
    expect(fullWebpDestFor('fora/coisa.png')).toBeNull()
    expect(fullWebpDestFor(undefined)).toBeNull()
  })

  it('o thumb do cheio convertido continua derivável pelos dois lados', () => {
    // o app deriva de copiedTo (thumbCopiedTo); o gerador, do caminho no dist
    // (thumbDestFor). Depois da conversão os dois têm que dar no mesmo arquivo.
    const cheia = fullWebpDestFor('assets/x/Foto.png')!
    expect(thumbCopiedTo(cheia)).toBe(thumbDestFor(cheia))
  })
})

describe('stripLeadingFrontmatter (#283) — mascara frontmatter colado no binário', () => {
  const WEBP = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]) // RIFF…WEBP
  it('remove o bloco --- inicial e devolve só os bytes da imagem', () => {
    const glued = Buffer.concat([Buffer.from('---\ndg-publish: true\n---\n'), WEBP])
    const out = stripLeadingFrontmatter(glued)
    expect(Buffer.compare(out, WEBP)).toBe(0)
  })
  it('imagem SEM frontmatter é devolvida INTACTA (mesma referência)', () => {
    const out = stripLeadingFrontmatter(WEBP)
    expect(out).toBe(WEBP) // identidade → o gerador detecta "sem mudança"
  })
  it('abre --- mas sem fechamento → não arrisca cortar (devolve original)', () => {
    const weird = Buffer.concat([Buffer.from('---\nsem fim'), WEBP])
    expect(stripLeadingFrontmatter(weird)).toBe(weird)
  })
})

describe('VaultImage com thumb (#280)', () => {
  const target = 'Animista.jpeg'

  it('thumb → src é a URL do thumb; onError troca pro cheio uma vez', async () => {
    const { container } = render(<VaultImage target={target} thumb />)
    const img = await waitFor(() => {
      const el = container.querySelector('img')
      expect(el).toBeTruthy()
      return el!
    })
    const entry = resolveAsset(index, target)!
    // jsdom resolve o src pra URL absoluta; comparamos pelo sufixo do caminho.
    expect(img.getAttribute('src')).toBe(thumbUrl(entry))

    // Falha do thumb (404 em dev / imagem pulada) → onError aponta pro cheio.
    fireEvent.error(img)
    await waitFor(() => expect(img.src.endsWith(assetUrl(entry))).toBe(true))

    // Guard anti-loop: já no cheio, um novo error NÃO mexe mais no src.
    const afterFallback = img.src
    fireEvent.error(img)
    expect(img.src).toBe(afterFallback)
  })

  it('sem thumb → src é o CHEIO (comportamento anterior intacto)', async () => {
    const { container } = render(<VaultImage target={target} />)
    const img = await waitFor(() => {
      const el = container.querySelector('img')
      expect(el).toBeTruthy()
      return el!
    })
    const entry = resolveAsset(index, target)!
    expect(img.getAttribute('src')).toBe(assetUrl(entry))
  })
})
