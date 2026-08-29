// Report 2026-08-29: "vários itens de contexto sem as informações" — o rótulo
// 🛡️**Influências:** (usado em 120 localizações, fantasia E POA; o template
// POA de país usa "Organizações Influentes") tem o VALOR nas linhas seguintes
// do callout (bullets `- [[Org]] …` / sub-entradas `**[[Org]]:** …`) e o
// parser não o reconhecia → organizacoesInfluentes ficava null e a ficha
// omitia a seção inteira.
import { describe, expect, it } from 'vitest'
import { parseLocationBody } from '../../extractor/parse-location-body.mjs'

const MOINHOS = [
  '#Local',
  '> [!abstract] Contexto do `= this.subcategoria`: `= this.file.name`',
  '> 🗺️**Geolocalização:** `= this.Geolocalização`',
  '> 📖**Contexto Histórico:** Desenvolveu-se no início do século XX como bairro aristocrático.',
  '',
  '> [!info] Informações do `= this.subcategoria`: `= this.file.name`',
  '> ℹ️**Descrição:** Área nobre com mansões e sedes corporativas.',
  '> ',
  '> 👁️**Aparência do Local:** Ruas limpas, jardins bem cuidados.',
  '> ',
  '> 🛡️**Influências:**',
  '> - [[Gradiente]] financia renovação urbana;',
  '> - [[Brigada Militar]] treina em parques.',
  '> ',
  '> 📖**Acontecimento Recente:** Audiência pública sobre torres de vigilância.',
].join('\n')

const VILA_FANTASIA = [
  '#Local',
  '> [!info] Informações da `= this.subcategoria`: `= this.file.name`',
  '> 👥**População:** Cerca de 300 habitantes.',
  '> ',
  '> 🛡️**Influências:**',
  '>- **[[Sociedade Aberta]]:** Mantém um posto de guarda.',
  '>',
  '>📖**Acontecimento Recente:** ',
].join('\n')

describe('parseLocationBody — rótulo Influências', () => {
  it('captura os bullets sob 🛡️**Influências:** (template POA de bairro)', () => {
    const out = parseLocationBody(MOINHOS, {})
    expect(out.organizacoesInfluentes).toContain('[[Gradiente]]')
    expect(out.organizacoesInfluentes).toContain('[[Brigada Militar]]')
    // os vizinhos continuam certos
    expect(out.descricao).toBe('Área nobre com mansões e sedes corporativas.')
    expect(out.acontecimentoRecente).toContain('Audiência pública')
    expect(out.contexto).toContain('bairro aristocrático')
  })

  it('captura sub-entradas **[[Org]]:** (template fantasia)', () => {
    const out = parseLocationBody(VILA_FANTASIA, {})
    expect(out.organizacoesInfluentes).toContain('[[Sociedade Aberta]]')
    expect(out.populacao).toBe('Cerca de 300 habitantes.')
  })

  it('sub-entrada PLACEHOLDER (sem texto após o rótulo) não vira conteúdo', () => {
    // template fantasia não-preenchido (ex.: Canto Alto): `- **[[Org]]:** ` vazio
    const body = [
      '> [!info] Informações da X',
      '> 🛡️**Influências:**',
      '>- **[[Sociedade Aberta]]:** ',
      '>',
      '>📖**Acontecimento Recente:** ',
    ].join('\n')
    const out = parseLocationBody(body, {})
    expect(out.organizacoesInfluentes).toBeNull()
    expect(out.acontecimentoRecente).toBeNull()
  })
})
