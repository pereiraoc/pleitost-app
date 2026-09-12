// #519 — "puxar" as ilustrações do mundo POA 1987 (pedido 2026-09-02):
// Classes e Companheiros têm arte própria do mundo em Recursos e Mídia/
// Recursos de Contextos/{Classes,Companheiros}/<nome do mundo>.png. A
// resolução vive no registro central creature-image.ts e é guiada por DADOS:
// reskinName (registro do contexto) dá o basename e a pasta só existe no
// índice de assets do mundo — na fantasia nada muda (identidade + pasta
// ausente ⇒ cai na hierarquia clássica). Contexto Atual/Organizações/Locais
// entram por EMBED nas próprias notas (convenção da vault) — sem código.
import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildAssetIndex } from '../src/data/assets'
import { creatureImageUrl, worldClassHeroTarget } from '../src/data/creature-image'
import { setActiveContexto } from '../src/data/reskin'
import type { ContextoDef } from '../src/data/context-def'
import type { AssetsManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const repoDir = path.dirname(appDir)
const manifest = (dir: string) =>
  JSON.parse(fs.readFileSync(path.join(repoDir, dir, 'assets.json'), 'utf8')) as AssetsManifest
const cyber = buildAssetIndex(manifest('vault-data-cyberpunk'))
const fantasia = buildAssetIndex(manifest('vault-data'))
const defPoa = JSON.parse(
  fs.readFileSync(path.join(repoDir, 'vault-data-cyberpunk', 'contexto.json'), 'utf8'),
) as ContextoDef

afterEach(() => setActiveContexto(null))

const heroi = (classe: string): VaultDoc =>
  ({
    id: 'local:Heroi:x',
    basename: 'Cacique',
    subtype: 'Heroi',
    frontmatter: { Classe: `[[${classe}]]` },
    images: [],
  }) as unknown as VaultDoc

const companheiro = (classe: string): VaultDoc =>
  ({
    id: 'local:CA:x',
    basename: 'Bicho',
    subtype: 'Companheiro Animal',
    frontmatter: { Classe: `[[${classe}]]` },
    images: [],
  }) as unknown as VaultDoc

const notaClasse = (nome: string): VaultDoc =>
  ({
    id: `Sistema/Criação de Personagem/Classes/${nome}`,
    basename: nome,
    frontmatter: { categoria: 'Classe', Imagem: `[[${nome}.jpeg]]` },
    images: [{ target: `${nome}.jpeg`, from: 'frontmatter:Imagem' }],
  }) as unknown as VaultDoc

describe('retratos de classe do mundo (cyberpunk)', () => {
  it('herói sem retrato: fallback usa a arte do mundo (Bardo → Ressonante)', () => {
    setActiveContexto(defPoa)
    const url = creatureImageUrl(heroi('Bardo'), cyber)
    expect(decodeURIComponent(url ?? '')).toContain('Recursos de Contextos/Classes/Ressonante.png')
  })
  it('classe sem arte do mundo cai na arte da fantasia', () => {
    setActiveContexto(defPoa)
    // Arcanista TEM arte (Tecnologista); usar um nome fora do reskin
    const url = creatureImageUrl(heroi('Inexistente'), cyber)
    expect(url).toBeNull()
  })
  it('na fantasia nada muda (Classes/Bardo da vault)', () => {
    const url = creatureImageUrl(heroi('Bardo'), fantasia)
    expect(decodeURIComponent(url ?? '')).toContain('Imagens/Classes/Bardo')
  })
})

describe('companheiros → Empregados do mundo', () => {
  it('Companheiro Animal Canino → Segurança.png', () => {
    setActiveContexto(defPoa)
    const url = creatureImageUrl(companheiro('Companheiro Animal Canino'), cyber)
    expect(decodeURIComponent(url ?? '')).toContain('Recursos de Contextos/Companheiros/Segurança.png')
  })
  it('na fantasia segue a pasta Companheiros Animais', () => {
    const url = creatureImageUrl(companheiro('Companheiro Animal Canino'), fantasia)
    expect(decodeURIComponent(url ?? '')).toContain('Companheiros Animais/Companheiro Animal Canino')
  })
})

describe('nota de Classe (wizard + compêndio)', () => {
  it('no cyberpunk o retrato da nota vem do mundo, não do FM Imagem', () => {
    setActiveContexto(defPoa)
    const url = creatureImageUrl(notaClasse('Bardo'), cyber)
    expect(decodeURIComponent(url ?? '')).toContain('Recursos de Contextos/Classes/Ressonante.png')
  })
  it('worldClassHeroTarget dá o target do hero pro DocView (e null na fantasia)', () => {
    setActiveContexto(defPoa)
    expect(worldClassHeroTarget(notaClasse('Mago'), cyber)).toBe(
      'Recursos e Mídia/Recursos de Contextos/Classes/Pirata.png'.normalize('NFC'),
    )
    setActiveContexto(null)
    expect(worldClassHeroTarget(notaClasse('Mago'), fantasia)).toBeNull()
  })
})

// Bestiário do mundo (2026-09-12): cada ficha de criatura ganha ilustração
// PRÓPRIA em Recursos de Contextos/Bestiário/<nome>.png, gerada a partir da
// própria ficha (arma, prótese, afiliação). Os PNGs chegam depois do Codex —
// o teste prova que a RESOLUÇÃO já está no lugar quando chegarem, e que na
// fantasia (pasta ausente) nada muda.
const monstro = (nome: string): VaultDoc =>
  ({
    id: `Sistema/Criaturas/Bestiário/${nome}`,
    basename: nome,
    subtype: 'Monstro',
    frontmatter: { Classe: '[[Soldado|Soldado Competente]]', 'Raça': '[[Humano|Humano (Médio)]]' },
    images: [],
  }) as unknown as VaultDoc

const indiceCom = (caminho: string) =>
  buildAssetIndex({
    counts: {},
    assets: [
      {
        path: caminho,
        basename: caminho.split('/').pop()!,
        copiedTo: caminho,
        sha256: 'x',
        referencedBy: [],
        orphan: false,
        ambiguous: false,
      },
    ],
    missing: [],
  } as AssetsManifest)

describe('bestiário do mundo', () => {
  it('a criatura usa a arte do mundo quando ela existe', () => {
    setActiveContexto(defPoa)
    const idx = indiceCom('Recursos e Mídia/Recursos de Contextos/Bestiário/Cabo de Choque.png')
    const url = creatureImageUrl(monstro('Cabo de Choque'), idx)
    expect(decodeURIComponent(url ?? '')).toContain('Recursos de Contextos/Bestiário/Cabo de Choque.png')
  })

  it('sem arte do mundo, segue a hierarquia clássica de monstro', () => {
    setActiveContexto(defPoa)
    const idx = indiceCom('Recursos e Mídia/Imagens/Monstros/Cabo de Choque.png')
    const url = creatureImageUrl(monstro('Cabo de Choque'), idx)
    expect(decodeURIComponent(url ?? '')).toContain('Imagens/Monstros/Cabo de Choque.png')
  })

  it('hoje, sem arte própria, TODA criatura humana cai na mesma figura de raça', () => {
    setActiveContexto(defPoa)
    // É exatamente o motivo da leva de arte do bestiário: sem PNG por ficha,
    // o Cabo de Choque e o Barão do Cartel mostram a MESMA imagem genérica.
    const a = creatureImageUrl(monstro('Cabo de Choque'), cyber)
    const b = creatureImageUrl(monstro('Barão do Cartel'), cyber)
    expect(decodeURIComponent(a ?? '')).toContain('Imagens/Raças/Humano')
    expect(a).toBe(b)
  })
})
