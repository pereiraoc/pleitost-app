// Execução (2026-10-02): quem é o ALVO da frase "como você executa esta
// escola" do mundo (reskin.execucao da Contexto-Def). Lê o FM — derivado ou
// cru, tanto faz: Classe, Sintonia e Habilidades.Lista existem nos dois —
// e devolve as chaves canônicas que `reskinExecucao` resolve em cascata.
import { fmPath, listaEntries, str, tracoDeElemento, wikiTarget } from '../components/ficha/hero-model'
import { classeCanonica } from '../recursos/regalias'
import type { ExecucaoAlvo } from '../data/reskin'

export type { ExecucaoAlvo } from '../data/reskin'

const basename = (alvo: string): string => alvo.split('/').pop()?.trim() ?? ''

/** Alvo da execução a partir do FM de um herói ou criatura. */
export function execucaoDe(fm: Record<string, unknown>): ExecucaoAlvo {
  const classe = classeCanonica(str(fm['Classe'])) || null
  const sintoniaCru = basename(wikiTarget(fm['Sintonia']))
  const sintonia = sintoniaCru ? tracoDeElemento(sintoniaCru) ?? sintoniaCru : null
  const habilidades = listaEntries(fmPath(fm, 'Habilidades', 'Lista'))
    .map((e) => basename(e.target))
    .filter(Boolean)
  return { classe, sintonia, habilidades }
}
