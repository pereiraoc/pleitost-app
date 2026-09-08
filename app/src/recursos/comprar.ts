// Compra num ESTABELECIMENTO (aba Serviços do local) gravando no herói pela
// API de store correta (local vs vault) — mesmo choke point das compras da
// loja de tesouros (data/purchase.ts). Toda a regra de dinheiro está em
// hero-recursos.ts (puro); aqui só se escolhe a operação pela ação da oferta.
// O plano de custo de vida garante o MÍNIMO — consumir fora dele é extra e
// sempre pode; miudeza (abaixo de um milhar) sai do bolso, sem registro.
import type { VaultDoc } from '../data/types'
import { currentFm, ouroDe, writeHero } from '../data/purchase'
import type { RecursosCfg } from './types'
import type { OfertaRolada } from './ofertas'
import { OURO_FM, RECURSOS_FM, comprarItem, custoEmOuro, pagarAvista, recursosDoFm, type Resultado } from './hero-recursos'

export interface CompraResultado {
  ok: boolean
  /** Mensagem pra UI (sucesso ou motivo). */
  msg: string
  /** Unidades que saíram da vitrine (0 = nenhuma). */
  vendidas: number
}

export function comprarNoEstabelecimento(
  heroId: string,
  vaultDoc: VaultDoc | undefined,
  cfg: RecursosCfg,
  fator: number,
  o: OfertaRolada,
): CompraResultado {
  void cfg
  const fm = currentFm(heroId, vaultDoc)
  const ouro = ouroDe(fm)
  const r = recursosDoFm(fm)
  const rec = o.recurso
  let res: Resultado | null = null
  let msg = ''
  const semSaldo = (custo: number) => ({ ok: false, msg: `Saldo insuficiente (precisa de ${custo} na ficha).`, vendidas: 0 })

  switch (o.acao) {
    case 'comprar':
      res = comprarItem(r, rec, { preco: o.preco, estado: o.estado }, ouro, fator)
      if (!res) return semSaldo(custoEmOuro(o.preco, fator))
      msg = `${rec.nome}${o.estado ? ` (${o.estado})` : ''} comprado — é posse sua, com a manutenção no custo do mês.`
      break
    case 'diaria':
      res = pagarAvista(r, o.preco, ouro, fator)
      if (!res) return semSaldo(custoEmOuro(o.preco, fator))
      msg = `${rec.nome}: um ${rec.cobranca === 'noite' ? 'pernoite' : 'dia'} pago.`
      break
    case 'avista':
      res = pagarAvista(r, o.preco, ouro, fator)
      if (!res) return semSaldo(custoEmOuro(o.preco, fator))
      msg = `${rec.nome}: pago na hora.`
      break
    case 'miudeza':
      // abaixo de um milhar: sai do bolso — sem registro na ficha
      return { ok: true, msg: `${rec.nome}: ${o.preco} do bolso, sem registro.`, vendidas: 1 }
    case 'info':
    case 'referencia':
      return { ok: false, msg: 'Só referência de preço — o plano do mês cobre.', vendidas: 0 }
    case 'escolher':
      return { ok: false, msg: 'Plano de custo de vida se escolhe na ficha.', vendidas: 0 }
  }
  if (!res) return { ok: false, msg: 'Nada a fazer.', vendidas: 0 }
  writeHero(heroId, vaultDoc, RECURSOS_FM, res.recursos as unknown as Record<string, unknown>)
  if (res.ouro !== undefined) writeHero(heroId, vaultDoc, OURO_FM, res.ouro)
  return { ok: true, msg, vendidas: 1 }
}
