// Report 5464acaf (2026-09-17, @nataribsouza): "Vida Dante não está
// sincronizando na aba de Sessão após reduzir na aba de combate."
// Dois defeitos compostos:
//
// (a) PENDÊNCIA DE EV PRESA: o valor otimista dos steppers da mesa só era
//     solto quando o servidor devolvia EXATAMENTE o alvo — se o dono do herói
//     mudasse a vida na ficha nesse meio-tempo, a igualdade nunca acontecia e
//     o número na tela de quem aplicou o EV congelava pra sempre.
//     → pendenciaResolvida: solta quando o live ALCANÇA o alvo OU quando ele
//       MUDOU em relação à base registrada no write (alguma escrita pousou).
//
// (b) PUSH DO DONO ATROPELA DANO DE MESA: o dono re-publica o state a partir
//     do FM local a cada mudança — dano aplicado direto no servidor era
//     sobrescrito no push seguinte, sem caminho servidor→local.
//     → todo write de recursosRestantes carrega um `rev` (nonce); o dono faz
//       BACKFLOW (aplica no FM local, origem 'sync') só de rev que NÃO é dele
//       e ainda não aplicou — echo do próprio push e refetch STALE (rev antigo
//       do próprio conjunto) nunca revertem edição local.
import { describe, expect, it } from 'vitest'
import { decideBackflow, pendenciaResolvida } from '../src/data/session-repo/vida-sync'

describe('(a) pendência de EV dos steppers da mesa', () => {
  it('solta quando o live alcança o alvo (fluxo feliz)', () => {
    expect(pendenciaResolvida({ alvo: 12, base: 20, vitLive: 12 })).toBe(true)
  })
  it('solta quando o live mudou em relação à base (o dono escreveu outro valor)', () => {
    expect(pendenciaResolvida({ alvo: 12, base: 20, vitLive: 15 })).toBe(true)
  })
  it('segura enquanto o live ainda mostra a base (nada pousou — anti-flicker)', () => {
    expect(pendenciaResolvida({ alvo: 12, base: 20, vitLive: 20 })).toBe(false)
  })
  it('rajada que volta ao valor original (alvo === base) solta na igualdade', () => {
    expect(pendenciaResolvida({ alvo: 20, base: 20, vitLive: 20 })).toBe(true)
  })
})

describe('(b) backflow do dano de mesa pro dono', () => {
  const meusRevs = new Set(['r1', 'r2'])
  const aplicados = new Set(['x9'])
  it('rev estrangeiro novo → aplicar (dano da mesa entra no local)', () => {
    expect(decideBackflow({ rev: 'gm7', meusRevs, aplicados })).toBe('aplicar')
  })
  it('rev do próprio push (echo) → ignorar', () => {
    expect(decideBackflow({ rev: 'r2', meusRevs, aplicados })).toBe('ignorar')
  })
  it('refetch STALE com rev antigo MEU → ignorar (nunca reverte edição local)', () => {
    expect(decideBackflow({ rev: 'r1', meusRevs, aplicados })).toBe('ignorar')
  })
  it('rev estrangeiro já aplicado → ignorar (idempotência)', () => {
    expect(decideBackflow({ rev: 'x9', meusRevs, aplicados })).toBe('ignorar')
  })
  it('sem rev (cliente antigo/plugin) → ignorar (conservador: não arrisca echo-revert)', () => {
    expect(decideBackflow({ rev: undefined, meusRevs, aplicados })).toBe('ignorar')
  })
})
