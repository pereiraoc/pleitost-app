// #476 — Repertório Expandido (técnica adepta do Arcanista) era só prosa
// ("Escolha um benefício") — nada pro app oferecer. Agora a técnica tem uma
// Escolha_Habilidades "Benefício" com três notas-opção, cada uma somando os
// slots de magia no bloco certo: primário (`Condicional Classe,[[Arcanista]]`)
// ou secundário (`Condicional Habilidades.Lista,Contem([[Treinamento de
// Arcanista]])`) — mesmo idioma do Repertório Diverso do Mago.
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import type { IndexManifest, VaultDoc } from '../src/data/types'
import { projectHeroRules } from '../src/rules/useHeroRules'
import { fmPath, num } from '../src/components/ficha/hero-model'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)
const loadFromDisk = async (id: string): Promise<VaultDoc> =>
  JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${id}.json`), 'utf8')) as VaultDoc

const PICK_BASICAS = { '[[Repertório Expandido (Duas Básicas)]]': 'Escolha.[[Repertório Expandido]]' }
const PICK_ADEPTAS = { '[[Repertório Expandido (Duas Adeptas)]]': 'Escolha.[[Repertório Expandido]]' }
const PICK_MISTO = { '[[Repertório Expandido (Básica e Adepta)]]': 'Escolha.[[Repertório Expandido]]' }

async function projetar(fm: Record<string, unknown>) {
  const { projection } = await projectHeroRules(fm, catalog, loadFromDisk)
  return projection
}
const slotsPrim = (d: Record<string, unknown>, t: 'A' | 'B') => num(fmPath(d, 'Magias', 'Slots', t))
const slotsSec = (d: Record<string, unknown>, t: 'A' | 'B') => num(fmPath(d, 'Magias', 'Secundaria', 'Slots', t))

describe('#476 — Repertório Expandido oferece o benefício e soma no bloco certo', () => {
  // A projeção DEFAULTA a escolha na 1ª opção (source 'default' — a UI mostra o
  // select vazio com pendência até o jogador escolher), então o delta se mede
  // contra o herói SEM a técnica e entre picks diferentes.
  const d = (p: Awaited<ReturnType<typeof projetar>>) => p.derivedFm as Record<string, unknown>

  it('Arcanista primário: a escolha "Benefício" aparece com 3 opções; Duas Básicas = +2 B, Duas Adeptas = +2 A (bloco primário)', async () => {
    const base = { Classe: '[[Arcanista]]', Sintonia: '[[Traço Elemental do Fogo]]', Nível: 4 }
    const semTecnica = await projetar(base)
    const comTecnica = { ...base, Tecnicas: { Lista: [{ '[[Repertório Expandido]]': 'Slot.A' }] } }
    const basicas = await projetar({ ...comTecnica, Habilidades: { Lista: [PICK_BASICAS] } })
    const adeptas = await projetar({ ...comTecnica, Habilidades: { Lista: [PICK_ADEPTAS] } })

    const escolha = basicas.habilidadeChoices.find((c) => /Repertório Expandido/.test(c.sourceNote))
    expect(escolha).toBeTruthy()
    expect(escolha!.options.map((o) => o.replace(/^\[\[|\]\]$/g, ''))).toEqual([
      'Repertório Expandido (Duas Básicas)',
      'Repertório Expandido (Duas Adeptas)',
      'Repertório Expandido (Básica e Adepta)',
    ])
    expect(slotsPrim(d(basicas), 'B')).toBe(slotsPrim(d(semTecnica), 'B') + 2)
    expect(slotsPrim(d(basicas), 'A')).toBe(slotsPrim(d(semTecnica), 'A'))
    expect(slotsPrim(d(adeptas), 'A')).toBe(slotsPrim(d(semTecnica), 'A') + 2)
    expect(slotsPrim(d(adeptas), 'B')).toBe(slotsPrim(d(semTecnica), 'B'))
    // nada vaza pro bloco secundário
    expect(slotsSec(d(basicas), 'B')).toBe(slotsSec(d(semTecnica), 'B'))
  }, 60000)

  it('Animista com Treinamento de Arcanista (secundária): Básica e Adepta = +1 B e +1 A em Magias.Secundaria.Slots', async () => {
    const base = {
      Classe: '[[Animista]]',
      Sintonia: '[[Traço Elemental da Água]]',
      Nível: 7,
      Habilidades: {
        Lista: [{ '[[Treinamento de Arcanista]]': 'Escolha.[[Treinamento de Classe Secundária]]' }],
      },
      Tecnicas: {
        Lista: [
          { '[[Treinamento de Classe Secundária]]': 'Slot.E' },
          { '[[Especialização em Classe Secundária]]': 'Slot.E' },
        ],
      },
    }
    const semTecnica = await projetar(base)
    const comTecnica = {
      ...base,
      Tecnicas: {
        Lista: [...base.Tecnicas.Lista, { '[[Repertório Expandido]]': 'Escolha.[[Especialização em Classe Secundária]]' }],
      },
    }
    const misto = await projetar({ ...comTecnica, Habilidades: { Lista: [...base.Habilidades.Lista, PICK_MISTO] } })
    expect(slotsSec(d(misto), 'B')).toBe(slotsSec(d(semTecnica), 'B') + 1)
    expect(slotsSec(d(misto), 'A')).toBe(slotsSec(d(semTecnica), 'A') + 1)
    // o bloco PRIMÁRIO (Anima) não muda
    expect(slotsPrim(d(misto), 'B')).toBe(slotsPrim(d(semTecnica), 'B'))
    expect(slotsPrim(d(misto), 'A')).toBe(slotsPrim(d(semTecnica), 'A'))
  }, 60000)
})
