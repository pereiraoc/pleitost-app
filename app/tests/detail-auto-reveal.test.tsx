// @vitest-environment jsdom
// No mobile, abrir um alvo nos DETALHES deve revelar o painel direito. O
// DetailAutoReveal dispara onReveal quando o TOPO da pilha muda (novo alvo), e
// NÃO re-dispara se o drawer for fechado manualmente com o mesmo alvo aberto.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { DetailProvider, DetailAutoReveal, useDetail } from '../src/data/detail-context'

afterEach(cleanup)

function Opener() {
  const detail = useDetail()!
  return (
    <>
      <button onClick={() => detail.open({ kind: 'doc', id: 'A' })}>abrir A</button>
      <button onClick={() => detail.open({ kind: 'doc', id: 'B' })}>abrir B</button>
      <button onClick={() => detail.close()}>fechar</button>
    </>
  )
}

function Harness({ onReveal }: { onReveal: () => void }) {
  return (
    <DetailProvider>
      <DetailAutoReveal onReveal={onReveal} />
      <Opener />
    </DetailProvider>
  )
}

describe('DetailAutoReveal', () => {
  it('dispara onReveal quando um alvo abre (e de novo num alvo diferente)', () => {
    const spy = vi.fn()
    render(<Harness onReveal={spy} />)
    expect(spy).not.toHaveBeenCalled() // sem alvo → nada
    fireEvent.click(screen.getByText('abrir A'))
    expect(spy).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByText('abrir B'))
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('NÃO re-dispara ao reabrir o MESMO alvo (topo inalterado)', () => {
    const spy = vi.fn()
    render(<Harness onReveal={spy} />)
    fireEvent.click(screen.getByText('abrir A'))
    fireEvent.click(screen.getByText('abrir A')) // já é o topo → no-op
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
