// #291: o kit de store reativo compartilhado pelos ~8 stores de módulo.
import { describe, expect, it, vi } from 'vitest'
import { createStoreChannel, createKeyedStoreChannel } from '../src/data/store-kit'

describe('createStoreChannel (global)', () => {
  it('emit notifica todos os assinantes e bumpa a versão', () => {
    const ch = createStoreChannel()
    const a = vi.fn()
    const b = vi.fn()
    ch.subscribe(a)
    ch.subscribe(b)
    expect(ch.version()).toBe(0)
    ch.emit()
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
    expect(ch.version()).toBe(1)
  })

  it('desassinar para de notificar', () => {
    const ch = createStoreChannel()
    const a = vi.fn()
    const off = ch.subscribe(a)
    off()
    ch.emit()
    expect(a).not.toHaveBeenCalled()
  })

  it('resetForTests zera versão e solta assinantes', () => {
    const ch = createStoreChannel()
    const a = vi.fn()
    ch.subscribe(a)
    ch.emit()
    ch.resetForTests()
    expect(ch.version()).toBe(0)
    ch.emit()
    expect(a).toHaveBeenCalledTimes(1) // só o emit de antes do reset
  })
})

describe('createKeyedStoreChannel (por-chave)', () => {
  it('emit só notifica a chave alvo', () => {
    const ch = createKeyedStoreChannel()
    const g1 = vi.fn()
    const g2 = vi.fn()
    ch.subscribe('g1', g1)
    ch.subscribe('g2', g2)
    ch.emit('g1')
    expect(g1).toHaveBeenCalledTimes(1)
    expect(g2).not.toHaveBeenCalled()
  })

  it('desassinar remove a entrada vazia do map (sem vazamento)', () => {
    const ch = createKeyedStoreChannel()
    const off = ch.subscribe('g1', vi.fn())
    off()
    // sem entrada, emit é no-op silencioso (não recria o Set)
    expect(() => ch.emit('g1')).not.toThrow()
    // reassinar recria e funciona
    const cb = vi.fn()
    ch.subscribe('g1', cb)
    ch.emit('g1')
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('múltiplos assinantes na mesma chave: um desassina, o outro segue', () => {
    const ch = createKeyedStoreChannel()
    const a = vi.fn()
    const b = vi.fn()
    const offA = ch.subscribe('g1', a)
    ch.subscribe('g1', b)
    offA()
    ch.emit('g1')
    expect(a).not.toHaveBeenCalled()
    expect(b).toHaveBeenCalledTimes(1)
  })
})
