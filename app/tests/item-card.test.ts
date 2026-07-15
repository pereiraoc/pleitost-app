// Card reutilizável de item (issue #95) — testa o renderizador extraído do
// comércio com docs REAIS da vault: prosa do body (arma), campos do inline,
// "(Qualidade)" só na propriedade/avulso, e a composição arma + imbuição.
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { bodyDesc, bodyHtml, itemCardHtml, composedCardHtml, docKind } from '../src/components/item-card'
import { precoPO } from '../src/grupo/wealth'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest
const catalog = buildCatalog(manifest)
const readDoc = (id: string): VaultDoc =>
  JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${id}.json`), 'utf8')) as VaultDoc
const byName = (name: string): VaultDoc => {
  const r = catalog.resolve(name)
  if (r.kind !== 'doc') throw new Error(`não resolveu: ${name}`)
  return readDoc(r.id)
}

const espadaCurva = byName('Espada Curva')
const azagaia = byName('Azagaia')
const adaga = byName('Adaga')
const anel = byName('Anel Canário')
const relampejante = byName('Imbuição Relampejante')

describe('#267 6.6 — carta de escudo mostra as infos certas (numéricas do FM)', () => {
  const escudo = byName('Escudo')
  const broquel = byName('Broquel')
  it('Escudo: Defesa/Dureza/Dano vêm do FM (números), não ficam vazios', () => {
    const html = itemCardHtml(escudo, 'A', null, false)
    expect(html).toContain('Defesa')
    expect(html).toContain('Dureza')
    expect(html).toContain('Dano')
    // valores numéricos do FM (bonus-defesa:2, dureza:4, danos:4) renderizam
    expect(html).toMatch(/>Defesa<\/b>2</)
    expect(html).toMatch(/>Dureza<\/b>4</)
    expect(html).toMatch(/>Dano<\/b>4</)
    // o texto "Especial" (Pode usar para Escudada.) aparece (como no plugin)
    expect(html).toContain('Especial')
    expect(html).toContain('Escudada')
  })
  it('Broquel: valores diferentes (bonus-defesa:1, dureza:2)', () => {
    const html = itemCardHtml(broquel, 'A', null, false)
    expect(html).toMatch(/>Defesa<\/b>1</)
    expect(html).toMatch(/>Dureza<\/b>2</)
  })
})

describe('#267 — campos numéricos/lista do FM na carta de arma', () => {
  it('arma mostra Mãos (número no FM) e Propriedades (lista de wikilinks)', () => {
    const html = itemCardHtml(adaga, 'A', null, false)
    // mãos: 1 (número) → antes ficava vazio
    expect(html).toMatch(/>Mãos<\/b>1</)
    // propriedades: lista → wikilinks resolvidos e juntados
    expect(html).toContain('Propriedades')
    expect(html).toContain('Precisa')
    expect(html).toContain('Ágil')
  })
})

describe('bodyDesc — descrição em prosa do body (armas)', () => {
  it('extrai a prosa da arma que tem descrição', () => {
    expect(bodyDesc(espadaCurva)).toContain('Cimitarra')
  })
  it('vazio quando a arma não tem prosa', () => {
    expect(bodyDesc(azagaia)).toBe('')
  })
})

describe('itemCardHtml — card de um doc', () => {
  it('propriedade/avulso: mostra nome + "(Qualidade)" + stat do inline', () => {
    const html = itemCardHtml(anel, 'A', null, true)
    expect(html).toContain('Anel Canário')
    expect(html).toContain('shc-tier') // "(Adepto)" em linha própria
    expect(html).toContain('(Adepto)')
    expect(html).toContain('tier-A')
  })
  it('arma base: SEM "(Qualidade)" no nome, mas COM stats (Dano) e o fundo do tier', () => {
    const html = itemCardHtml(adaga, 'A', null, false)
    expect(html).toContain('Adaga')
    expect(html).not.toContain('shc-tier') // sem o span de qualidade
    expect(html).toContain('Dano')
    expect(html).toContain('tier-A') // fundo do tier fica
  })
})

describe('composedCardHtml — combo arma × imbuição', () => {
  const combo = {
    key: `${adaga.id}|${relampejante.id}`,
    label: 'Adaga Relampejante',
    tier: 'A' as const,
    armaTarget: adaga.id,
    imbTarget: relampejante.id,
  }
  const docsById = new Map<string, VaultDoc>([
    [adaga.id, adaga],
    [relampejante.id, relampejante],
  ])

  it('renderiza DUAS cartas (arma + imbuição), só a imbuição com "(Qualidade)"', () => {
    const html = composedCardHtml(combo, docsById, undefined)
    expect(html).toContain('shc-wrap')
    expect((html.match(/class="shc-card/g) ?? []).length).toBe(2)
    expect(html).toContain('Adaga')
    expect(html).toContain('Relampejante')
    // exatamente 1 selo de qualidade "(Adepto)" — o da imbuição (arma não tem)
    expect((html.match(/shc-tier/g) ?? []).length).toBe(1)
  })
})

describe('#96 — schema de campos por tipo', () => {
  const habilidade = byName('Ataque Furtivo')
  const tecnica = byName('Ambidestria')
  const magia = byName('Bola de Fogo')

  it('docKind classifica pelo caminho do doc', () => {
    expect(docKind(adaga)).toBe('arma')
    expect(docKind(anel)).toBe('tesouro')
    expect(docKind(habilidade)).toBe('habilidade')
    expect(docKind(tecnica)).toBe('tecnica')
    expect(docKind(magia)).toBe('magia')
  })

  it('habilidade: Classe + Rank + efeito, SEM campos de arma', () => {
    const html = itemCardHtml(habilidade, 'A', null, false)
    expect(html).toContain('Classe')
    expect(html).toContain('Rank')
    expect(html).not.toContain('>Dano<')
    expect(html).toContain('shc-desc') // o efeito (resumo/prosa)
  })

  it('técnica: mostra Custo', () => {
    expect(itemCardHtml(tecnica, 'A', null, false)).toContain('Custo')
  })

  it('tesouro: Usos + Bônus do tier (Anel Canário Adepto)', () => {
    const html = itemCardHtml(anel, 'A', null, true)
    expect(html).toContain('Usos')
    expect(html).toContain('Bônus')
    expect(html).toContain('pericia') // bonus_tipo
  })
})

describe('#268 — implemento mostra as infos do CORPO (habilidades ** - L:**)', () => {
  const foco = byName('Foco da Consistência')
  it('a carta do implemento inclui as habilidades do body (Carga Preparatória, Drenar)', () => {
    const html = itemCardHtml(foco, 'A', null, true)
    // essas infos moram no corpo da nota (não na descrição por tier) e o usuário
    // quer vê-las na carta (#268)
    expect(html).toContain('Carga Preparatória')
    expect(html).toContain('Drenar')
  })
  it('outro implemento traz as suas próprias habilidades do corpo', () => {
    const html = itemCardHtml(byName('Foco da Intensificação'), 'A', null, true)
    expect(html).toContain('Carga Cadencial')
    expect(html).toContain('Drenar')
  })
  it('a descrição por tier (cargas) continua na carta', () => {
    const html = itemCardHtml(foco, 'A', null, true)
    expect(html).toContain('re-rolar')
  })
})

describe('#122/#127 — preço com multiplicador de qualidade', () => {
  const base = precoPO(anel) // 40 PO
  it('tier E = preço_base × 5', () => {
    expect(base).toBeGreaterThan(0)
    expect(itemCardHtml(anel, 'E', null, true)).toContain(`${base * 5} PO`)
  })
  it('tier M = preço_base × 25', () => {
    expect(itemCardHtml(anel, 'M', null, true)).toContain(`${base * 25} PO`)
  })
  it('tier A = preço base cru', () => {
    expect(itemCardHtml(anel, 'A', null, true)).toContain(`${base} PO`)
  })
})

describe('#109 — campos da magia vêm do frontmatter', () => {
  const bola = byName('Bola de Fogo')
  it('mostra Tipo (Anima), Rank e Custo — não campos de arma', () => {
    const html = itemCardHtml(bola, 'A', null, false)
    expect(html).toContain('Anima') // subcategoria (arcana/anima)
    expect(html).toContain('Rank')
    expect(html).toContain('Custo')
    expect(html).not.toContain('>Dano<')
  })
})

describe('#110/#117 — fullBody rende a prosa completa, não o resumo', () => {
  const bola = byName('Bola de Fogo')
  it('fullBody usa o corpo da regra (classe shc-body) e é mais rico que o resumo', () => {
    const resumo = itemCardHtml(bola, 'A', null, false)
    const full = itemCardHtml(bola, 'A', null, false, true)
    expect(resumo).not.toContain('shc-body')
    expect(full).toContain('shc-body')
    expect(full.length).toBeGreaterThan(resumo.length)
  })
  it('bodyHtml tira meta %% e fences, mantendo a prosa', () => {
    const html = bodyHtml(bola)
    expect(html).not.toContain('%%')
    expect(html).not.toContain('autosheet-rules')
    expect(html).not.toContain('resumo::')
    expect(html.length).toBeGreaterThan(0)
  })
})

describe('#103 — classe (Bardo): corpo limpo + tabela, sem embed cru', () => {
  const bardo = byName('Bardo')
  const html = bodyHtml(bardo, undefined, { cutAfterTable: true })
  it('renderiza a tabela de nível', () => {
    expect(html).toContain('shc-tbl')
    expect(html).toContain('Nível')
  })
  it('não deixa embed cru (![[...]]), params de imagem, nem = this.x', () => {
    expect(html).not.toContain('![[')
    expect(html).not.toContain('right|profile')
    expect(html).not.toContain('this.file.name')
  })
})

describe('bodyHtml — linhas consecutivas quebram (Sucesso/Falha em linhas próprias)', () => {
  const magia = byName('Lufada de Vento')
  it('separa os desfechos com <br> em vez de colar tudo numa linha', () => {
    const html = bodyHtml(magia)
    expect(html).toContain('<br>')
    // "Sucesso:" e "Falha:" não ficam grudados no mesmo texto corrido
    expect(html).toContain('Sucesso')
    expect(html).toContain('Falha')
  })
})
