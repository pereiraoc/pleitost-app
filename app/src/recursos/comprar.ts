// Compra num ESTABELECIMENTO (aba Serviços do local) gravando no herói pela
// API de store correta (local vs vault) — mesmo choke point das compras da
// loja de tesouros (data/purchase.ts). Toda a regra de dinheiro está em
// hero-recursos.ts (puro); aqui só se escolhe a operação pela ação da oferta.
import type { VaultDoc } from '../data/types'
import { currentFm, ouroDe, writeHero } from '../data/purchase'
import type { RecursosCfg } from './types'
import type { OfertaRolada } from './ofertas'
import {
  OURO_FM,
  RECURSOS_FM,
  alugarMoradia,
  comprarImovel,
  comprarItem,
  custoEmOuro,
  hospedar,
  loteDeMiudeza,
  pagarAvista,
  papelDaAba,
  precoNaRegua,
  recarregarTri,
  recursosDoFm,
  usarPassagem,
  type Resultado,
} from './hero-recursos'

export interface CompraResultado {
  ok: boolean
  /** Mensagem pra UI (sucesso ou motivo). */
  msg: string
  /** Unidades que saíram da vitrine (0 = nenhuma; oferta ilimitada também conta 1). */
  vendidas: number
}

/** Ação secundária de uma oferta de moradia: comprar o imóvel (FM `Compra`). */
export function precoCompraImovel(o: OfertaRolada, mult: number): number | null {
  return o.recurso.compra !== undefined ? precoNaRegua(o.recurso.compra, mult) : null
}

export function comprarNoEstabelecimento(
  heroId: string,
  vaultDoc: VaultDoc | undefined,
  cfg: RecursosCfg,
  fator: number,
  o: OfertaRolada,
  opts: { mult: number; comprarImovel?: boolean; classeAlimentacao?: number },
): CompraResultado {
  const fm = currentFm(heroId, vaultDoc)
  const ouro = ouroDe(fm)
  const r = recursosDoFm(fm)
  const rec = o.recurso
  let res: Resultado | null = null
  let msg = ''
  let vendidas = 1
  const semOuro = (custo: number) => ({ ok: false, msg: `Ouro insuficiente (precisa de ${custo}).`, vendidas: 0 })

  switch (o.acao) {
    case 'recarga':
      res = recarregarTri(r, o.preco, ouro, fator)
      if (!res) return semOuro(custoEmOuro(o.preco, fator))
      msg = `TRI recarregado: +${o.preco}.`
      break
    case 'tri':
      res = usarPassagem(r, o.preco)
      if (!res) return { ok: false, msg: 'Saldo TRI insuficiente — recarregue no guichê.', vendidas: 0 }
      msg = `${rec.nome}: −${o.preco} do TRI.`
      break
    case 'comprar':
      res = comprarItem(r, rec, { preco: o.preco, estado: o.estado }, ouro, fator)
      if (!res) return semOuro(custoEmOuro(o.preco, fator))
      msg = `${rec.nome}${o.estado ? ` (${o.estado})` : ''} comprado — está nos seus Recursos.`
      break
    case 'diaria':
      res = pagarAvista(r, o.preco, ouro, fator)
      if (!res) return semOuro(custoEmOuro(o.preco, fator))
      msg = `${rec.nome}: um dia pago.`
      break
    case 'alugar':
      if (opts.comprarImovel) {
        const pc = precoCompraImovel(o, opts.mult)
        if (pc === null) return { ok: false, msg: 'Este imóvel não está à venda.', vendidas: 0 }
        res = comprarImovel(r, rec, pc, ouro, fator)
        if (!res) return semOuro(custoEmOuro(pc, fator))
        msg = `${rec.nome} comprado — é seu, sem aluguel.`
      } else {
        res = alugarMoradia(r, rec)
        msg = `Alugou ${rec.nome} — entra no custo do mês.`
      }
      break
    case 'hospedar':
      res = hospedar(r, rec)
      msg = `Hospedado em ${rec.nome} — ${rec.preco * 30} por mês enquanto ficar.`
      break
    case 'avista': {
      const viraItem = rec.cobranca === 'unidade' || rec.cobranca === 'mês' || rec.cobranca === 'litro'
      res = viraItem ? comprarItem(r, rec, { preco: o.preco }, ouro, fator) : pagarAvista(r, o.preco, ouro, fator)
      if (!res) return semOuro(custoEmOuro(o.preco, fator))
      msg = viraItem ? `${rec.nome} comprado — está nos seus Recursos.` : `${rec.nome}: pago.`
      break
    }
    case 'miudeza': {
      // no estilo do herói (nível ≤ classe do eixo) sai de graça; fora dele,
      // vende-se em LOTE que fecha um milhar.
      const papel = papelDaAba(cfg, rec.aba)
      const classe = papel === 'alimentacao' ? (opts.classeAlimentacao ?? 1) : 1
      if (rec.nivel !== undefined && rec.nivel <= classe) {
        return { ok: true, msg: `${rec.nome}: no seu estilo de vida — sem custo.`, vendidas: 1 }
      }
      const lote = loteDeMiudeza(o.preco, fator)
      res = comprarItem(r, rec, { preco: lote * o.preco, qtd: lote }, ouro, fator)
      if (!res) return semOuro(custoEmOuro(lote * o.preco, fator))
      vendidas = lote
      msg = `${rec.nome}: lote de ${lote} por ${lote * o.preco} — está nos seus Recursos.`
      break
    }
    case 'escolher':
      return { ok: false, msg: 'Estilo de vida se escolhe na ficha.', vendidas: 0 }
  }
  if (!res) return { ok: false, msg: 'Nada a fazer.', vendidas: 0 }
  writeHero(heroId, vaultDoc, RECURSOS_FM, res.recursos as unknown as Record<string, unknown>)
  if (res.ouro !== undefined) writeHero(heroId, vaultDoc, OURO_FM, res.ouro)
  return { ok: true, msg, vendidas }
}
