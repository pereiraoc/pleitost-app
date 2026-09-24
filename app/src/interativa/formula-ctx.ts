// Contexto das fórmulas (#466): de onde vêm os VALORES que interpolam a prosa
// da magia — sempre do FM DERIVADO (rules.derivedFm), nunca cálculo próprio.
//  - potência: `Magias.Potencia` do BLOCO (o chamador passa o fm do bloco —
//    primário = fm; secundário = { ...fm, Magias: fm.Magias.Secundaria }, o
//    mesmo `mfm` que os painéis de magia já montam);
//  - MOD: valor do atributo de conjuração da ESCOLA da magia
//    (`Magias.Lista[Nome === escola].Atributo` → `Atributos.<X>`).
// Magia sem escola conhecida (Tesouros) ou bloco sem potência → campos null
// (o interpolador deixa o texto intacto).
import { fmPath, num, str } from '../components/ficha/hero-model'
import type { FormulaCtx } from './formulas'

export type { FormulaCtx } from './formulas'

/** Atributo de conjuração da escola no fm do bloco ("INT"), ou null. */
export function atributoDaEscola(mfm: Record<string, unknown>, escola: string): string | null {
  const linhas = (fmPath(mfm, 'Magias', 'Lista') ?? []) as Record<string, unknown>[]
  if (!Array.isArray(linhas)) return null
  const linha = linhas.find((l) => str(l['Nome']) === escola)
  const atributo = linha ? str(linha['Atributo']).trim().toUpperCase() : ''
  return atributo || null
}

/** Contexto de fórmula de uma magia do bloco `mfm` na escola `escola`. */
export function formulaCtxDeMagia(mfm: Record<string, unknown>, escola: string | null): FormulaCtx {
  const potencia = num(fmPath(mfm, 'Magias', 'Potencia'))
  const atributo = escola ? atributoDaEscola(mfm, escola) : null
  const mod = atributo ? num(fmPath(mfm, 'Atributos', atributo)) : null
  return { potencia: potencia > 0 ? potencia : null, mod: atributo ? mod : null }
}
