// O QUE A REGALIA ENTREGA (2026-09-13) — camada PURA entre a nota de
// `Regalias de Classe` e o estado do herói. Antes, a regalia era só texto: o
// jogador lia e digitava à mão quem pagava o eixo, o carro que a firma dá não
// aparecia, e nenhuma renda mensal era creditada.
//
// PRINCÍPIO: DERIVAR, NUNCA GRAVAR. Piso, posse cedida e renda são função de
// (nota × nível do herói × índice de Recursos). Nada disso vai pro frontmatter,
// e isso dá de graça: idempotência (não há como duplicar o que não se escreve),
// zero migração pra ficha já salva, e reflexo imediato quando o herói sobe de
// nível, troca de classe, perde a regalia ou a nota é editada.
//
// A REGRA DE ACUMULAÇÃO é união dos degraus alcançados, com `*Larga:*`
// removendo antes de o degrau somar o seu `*Concede:*`. Nenhuma regra mais
// simples representa a nota: "só o degrau mais alto" quebra o Artista Marcial
// (o nv 4 não concede nada material — ele perderia a academia do nv 1) e o
// Articulador (o nv 4 é a Kombi — perderia o TRI Bronze); união pura quebra o
// Executivo, que "larga no antigo o que assume no novo".
import type { RegaliaDeClasse } from './regalias'
import { isEstilo, maisAlto, papelDaAba, type ItemTido } from './hero-recursos'
import type { Papel, Recurso, RecursosCfg } from './types'

/** Plano que um terceiro garante num eixo, e quem banca. */
export interface PisoDoEixo {
  plano: Recurso
  quem: string
}

export interface ConcessoesDaRegalia {
  /** Piso por eixo: o degrau que o herói não pode largar. */
  pisos: Partial<Record<Papel, PisoDoEixo>>
  /** Posse cedida, já pronta pra entrar na lista do eixo. */
  posse: ItemTido[]
  /** Cz$ por mês que caem ao abrir o mês. */
  renda: number
  /** De onde vem a renda, pro tooltip ("a marca (nv 7)"). */
  rendaFontes: string[]
  /** Citado em `*Concede:*` mas não é nota de Recurso deste mundo (peça
   *  emprestada, dose, serviço): vira chip, nunca estado. */
  foraDoEixo: string[]
}

export const CONCESSOES_VAZIAS: ConcessoesDaRegalia = {
  pisos: {},
  posse: [],
  renda: 0,
  rendaFontes: [],
  foraDoEixo: [],
}

/** O que a regalia da classe garante NO NÍVEL do herói. */
export function concessoesDaRegalia(
  regalia: RegaliaDeClasse | null,
  nivel: number,
  porNome: Map<string, Recurso>,
  cfg: RecursosCfg,
): ConcessoesDaRegalia {
  if (!regalia || !nivel) return CONCESSOES_VAZIAS
  const pisos: Partial<Record<Papel, PisoDoEixo>> = {}
  const posse = new Map<string, ItemTido>()
  const foraDoEixo = new Set<string>()
  let renda = 0
  const rendaFontes: string[] = []

  for (const d of [...regalia.degraus].sort((a, b) => a.nivel - b.nivel)) {
    if (d.nivel > nivel) continue
    const quem = d.paga ?? `regalia de ${regalia.nome}`

    // LARGA primeiro: o degrau novo devolve o que o antigo dava
    for (const nome of d.larga) {
      const rec = porNome.get(nome)
      posse.delete(rec?.nome ?? nome)
      for (const papel of Object.keys(pisos) as Papel[]) {
        if (pisos[papel]?.plano.nome === (rec?.nome ?? nome)) delete pisos[papel]
      }
    }

    for (const nome of d.concede) {
      const rec = porNome.get(nome)
      if (!rec) {
        foraDoEixo.add(nome)
        continue
      }
      if (isEstilo(cfg, rec)) {
        const papel = papelDaAba(cfg, rec.aba)
        if (!papel) {
          foraDoEixo.add(nome)
          continue
        }
        // o degrau mais alto do mesmo eixo vence
        const atual = pisos[papel]?.plano ?? null
        if (maisAlto(atual, rec) === rec) pisos[papel] = { plano: rec, quem }
      } else {
        posse.set(rec.nome, { nome: rec.nome, aba: rec.aba, qtd: 1, pago: 0, pagoPor: quem })
      }
    }

    if (d.renda > 0) {
      renda += d.renda
      rendaFontes.push(`${quem} (nv ${d.nivel})`)
    }
  }

  return { pisos, posse: [...posse.values()], renda, rendaFontes, foraDoEixo: [...foraDoEixo] }
}
