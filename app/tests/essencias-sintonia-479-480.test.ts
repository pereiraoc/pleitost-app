// @vitest-environment node
// #479/#480 — regras de essência LIMITADAS pela Sintonia (conteúdo da vault,
// vocabulário existente: Condicional Sintonia + Escolha_Habilidades):
//  • Magias Anima: NENHUMA essência do elemento OPOSTO à sintonia (tabela da
//    própria nota: Fogo↔Água, Vento↔Terra); 10 opções por escolha (12−3+1).
//  • Treinamento de Animista (secundária): a 1ª essência (Nível 1) é DO
//    elemento da sintonia (3 opções); Nível 4/7 sem o oposto.
//  • Essência Invertida: escolha da essência ADEPTA do elemento OPOSTO.
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { projectHeroRules } from '../src/rules/useHeroRules'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)
const load = (id: string): VaultDoc =>
  JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${id}.json`), 'utf8')) as VaultDoc

type Choice = { sourceNote?: string; label?: string; options?: string[] }
async function choicesDe(fm: Record<string, unknown>, sourceNote: string): Promise<Choice[]> {
  const { projection } = await projectHeroRules(fm, catalog, async (id) => load(id))
  const p = projection as never as { habilidadeChoices?: Choice[] }
  return (p.habilidadeChoices ?? []).filter((c) => c.sourceNote === sourceNote)
}
const temOpcao = (c: Choice, s: string) => (c.options ?? []).some((o) => o.includes(s))

describe('#480 — Magias Anima exclui o elemento OPOSTO à sintonia', () => {
  it('sintonia Fogo: sem essências de Água; com Fogo e Criação (10 opções)', async () => {
    const fm = {
      Classe: '[[Animista]]',
      Sintonia: '[[Traço Elemental do Fogo|Fogo]]',
      'Nível': 3,
    }
    const anima = await choicesDe(fm, 'Magias Anima')
    expect(anima.length).toBe(5) // 3 base + Nivel 2 + Nivel 3
    for (const c of anima) {
      expect(c.options?.length).toBe(10)
      expect(temOpcao(c, 'Congelante')).toBe(false) // Água (oposto do Fogo)
      expect(temOpcao(c, 'Hidratante')).toBe(false)
      expect(temOpcao(c, 'Torrencial')).toBe(false)
      expect(temOpcao(c, 'Flamejante')).toBe(true)
      expect(temOpcao(c, 'de Criação')).toBe(true)
    }
  })

  it('sintonia Terra: sem essências de Vento', async () => {
    const fm = {
      Classe: '[[Animista]]',
      Sintonia: '[[Traço Elemental da Terra|Terra]]',
      'Nível': 1,
    }
    const anima = await choicesDe(fm, 'Magias Anima')
    expect(anima.length).toBe(3)
    for (const c of anima) {
      expect(temOpcao(c, 'Ciclonal')).toBe(false)
      expect(temOpcao(c, 'Relampejante')).toBe(false)
      expect(temOpcao(c, 'Ventania')).toBe(false)
      expect(temOpcao(c, 'Sísmica')).toBe(true)
    }
  })

  it('SEM sintonia definida, as escolhas condicionais não aparecem (estado transitório)', async () => {
    const fm = { Classe: '[[Animista]]', 'Nível': 1 }
    const anima = await choicesDe(fm, 'Magias Anima')
    expect(anima.length).toBe(0)
  })
})

describe('#480 — Treinamento de Animista (classe secundária)', () => {
  const base = {
    Classe: '[[Guerreiro]]',
    Sintonia: '[[Traço Elemental da Água|Água]]',
    Habilidades: {
      Lista: [{ '[[Treinamento de Animista]]': 'Escolha.[[Treinamento de Classe Secundária]]' }],
    },
    Tecnicas: { Lista: [{ '[[Treinamento de Classe Secundária]]': 'Slot.A' }] },
  }
  it('Nível 1: a essência é DO elemento da sintonia (3 Menores de Água)', async () => {
    const treino = await choicesDe({ ...base, 'Nível': 1 }, 'Treinamento de Animista')
    expect(treino.length).toBe(1)
    const c = treino[0]!
    expect(c.options?.length).toBe(3)
    expect(temOpcao(c, 'Congelante Menor')).toBe(true)
    expect(temOpcao(c, 'Hidratante Menor')).toBe(true)
    expect(temOpcao(c, 'Torrencial Menor')).toBe(true)
  })
  it('Nível 4: segunda essência sem o oposto (Fogo fora, 10 Menores)', async () => {
    const treino = await choicesDe({ ...base, 'Nível': 4 }, 'Treinamento de Animista')
    expect(treino.length).toBe(2)
    const n4 = treino[1]!
    expect(n4.options?.length).toBe(10)
    expect(temOpcao(n4, 'Flamejante')).toBe(false) // Fogo (oposto da Água)
    expect(temOpcao(n4, 'Mineral Menor')).toBe(true)
  })
})

describe('#479/#485 — Essência Invertida: nota ÚNICA, sintonia × contexto (Condicional empilhada, plugin v2.0.46)', () => {
  it('PRIMÁRIO (Classe Animista, Vento): escolha com as 3 ADEPTA de Terra', async () => {
    const fm = {
      Classe: '[[Animista]]',
      Sintonia: '[[Traço Elemental do Vento|Vento]]',
      'Nível': 9,
      Tecnicas: { Lista: [{ '[[Essência Invertida]]': 'Slot.E' }] },
    }
    const inv = await choicesDe(fm, 'Essência Invertida')
    expect(inv.length).toBe(1)
    const c = inv[0]!
    expect(c.options?.length).toBe(3)
    expect(temOpcao(c, 'Enraizante Adepta')).toBe(true)
    expect(temOpcao(c, 'Mineral Adepta')).toBe(true)
    expect(temOpcao(c, 'Sísmica Adepta')).toBe(true)
    expect(temOpcao(c, 'Menor')).toBe(false)
  })
  it('SECUNDÁRIO (Guerreiro + Treinamento de Animista, Vento): escolha com as 3 MENOR de Terra', async () => {
    const fm = {
      Classe: '[[Guerreiro]]',
      Sintonia: '[[Traço Elemental do Vento|Vento]]',
      'Nível': 9,
      Habilidades: {
        Lista: [{ '[[Treinamento de Animista]]': 'Escolha.[[Treinamento de Classe Secundária]]' }],
      },
      Tecnicas: {
        Lista: [
          { '[[Treinamento de Classe Secundária]]': 'Slot.A' },
          { '[[Maestria em Classe Secundária]]': 'Slot.M' },
          { '[[Essência Invertida]]': 'Escolha.[[Maestria em Classe Secundária]]' },
        ],
      },
    }
    const inv = await choicesDe(fm, 'Essência Invertida')
    expect(inv.length).toBe(1)
    const c = inv[0]!
    expect(c.options?.length).toBe(3)
    expect(temOpcao(c, 'Enraizante Menor')).toBe(true)
    expect(temOpcao(c, 'Mineral Menor')).toBe(true)
    expect(temOpcao(c, 'Sísmica Menor')).toBe(true)
    expect(temOpcao(c, 'Adepta')).toBe(false)
  })
  it('pick SECUNDÁRIO: a Menor alimenta a lista SEGREGADA (Magias.Secundaria.Lista)', async () => {
    const fm = {
      Classe: '[[Guerreiro]]',
      Sintonia: '[[Traço Elemental do Vento|Vento]]',
      'Nível': 9,
      Habilidades: {
        Lista: [
          { '[[Treinamento de Animista]]': 'Escolha.[[Treinamento de Classe Secundária]]' },
          { '[[Essência Enraizante Menor]]': 'Escolha.[[Essência Invertida]]' },
        ],
      },
      Tecnicas: {
        Lista: [
          { '[[Treinamento de Classe Secundária]]': 'Slot.A' },
          { '[[Maestria em Classe Secundária]]': 'Slot.M' },
          { '[[Essência Invertida]]': 'Escolha.[[Maestria em Classe Secundária]]' },
        ],
      },
    }
    const { projection } = await projectHeroRules(fm, catalog, async (id) => load(id))
    const d = projection.derivedFm as Record<string, unknown>
    const magias = d['Magias'] as Record<string, unknown>
    const sec = JSON.stringify((magias['Secundaria'] as Record<string, unknown>)['Lista'])
    expect(sec).toContain('Vinhas Emaranhantes')
    expect(sec).toContain('Enraizar')
    expect(JSON.stringify(magias['Lista'] ?? '')).not.toContain('Vinhas Emaranhantes')
  })
  it('pick PRIMÁRIO: a Adepta alimenta a lista PRIMÁRIA (Magias.Lista)', async () => {
    const fm = {
      Classe: '[[Animista]]',
      Sintonia: '[[Traço Elemental do Vento|Vento]]',
      'Nível': 9,
      Habilidades: {
        Lista: [{ '[[Essência Enraizante Adepta]]': 'Escolha.[[Essência Invertida]]' }],
      },
      Tecnicas: { Lista: [{ '[[Essência Invertida]]': 'Slot.E' }] },
    }
    const { projection } = await projectHeroRules(fm, catalog, async (id) => load(id))
    const d = projection.derivedFm as Record<string, unknown>
    const magias = d['Magias'] as Record<string, unknown>
    expect(JSON.stringify(magias['Lista'])).toContain('Vinhas Emaranhantes')
    const sec = (magias['Secundaria'] as Record<string, unknown> | undefined)?.['Lista']
    expect(JSON.stringify(sec ?? '')).not.toContain('Vinhas Emaranhantes')
  })
})

describe('retrocompat — picks salvos ANTES do filtro sobrevivem', () => {
  it('Animista Terra com Hidratante (Água, permitida) já escolhida mantém a essência', async () => {
    // shape real dos heróis existentes (Uni): pick gravado como linha de
    // Escolha na lista — o filtro barra escolha NOVA, nunca apaga a salva
    const fm = {
      Classe: '[[Animista]]',
      Sintonia: '[[Traço Elemental da Terra|Terra]]',
      'Nível': 3,
      Habilidades: {
        Lista: [{ '[[Essência Hidratante Adepta]]': 'Escolha.01.[[Magias Anima]]' }],
      },
    }
    const { projection } = await projectHeroRules(fm, catalog, async (id) => load(id))
    const d = projection.derivedFm as Record<string, unknown>
    const hab = JSON.stringify((d['Habilidades'] as Record<string, unknown>)['Lista'])
    expect(hab).toContain('Essência Hidratante Adepta')
  })
})
