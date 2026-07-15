// @vitest-environment jsdom
// #284: no celular as abas que não cabem (Combate etc.) têm que rolar de lado —
// a FILA de abas do TabStrip é um scroller horizontal (.tabs-scroll), e o `right`
// (quando existe) fica FIXO fora do scroll.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { TabStrip } from '../src/components/ficha/bits'

const TABS = [
  { id: 'a', label: 'Ataques' },
  { id: 'b', label: 'Magias' },
  { id: 'c', label: 'Defesas' },
  { id: 'd', label: 'Sentidos' },
  { id: 'e', label: 'Perícias' },
  { id: 'f', label: 'Ações' },
]

afterEach(cleanup)

describe('TabStrip — fila de abas rolável (#284)', () => {
  it('as abas ficam dentro de um scroller .tabs-scroll', () => {
    const { container } = render(<TabStrip tabs={TABS} active="a" onSelect={() => {}} />)
    const scroller = container.querySelector('.tabs-scroll')
    expect(scroller).toBeTruthy()
    // todas as abas estão dentro do scroller (não fora dele)
    const btns = scroller!.querySelectorAll('button')
    expect(btns.length).toBe(TABS.length)
    // abas não encolhem (flex none = 0 0 auto) — estouram e rolam em vez de espremer
    expect((btns[0] as HTMLElement).style.flexShrink).toBe('0')
  })

  it('o slot `right` fica FORA do scroller (fixo)', () => {
    const { container } = render(
      <TabStrip tabs={TABS} active="a" onSelect={() => {}} right={<button>edit</button>} />,
    )
    const scroller = container.querySelector('.tabs-scroll')!
    // o botão "edit" não está dentro do scroller de abas
    const editInside = [...scroller.querySelectorAll('button')].some((b) => b.textContent === 'edit')
    expect(editInside).toBe(false)
    // mas existe na barra
    expect([...container.querySelectorAll('button')].some((b) => b.textContent === 'edit')).toBe(true)
  })

  it('clicar numa aba chama onSelect com o id', () => {
    const onSelect = vi.fn()
    const { getByText } = render(<TabStrip tabs={TABS} active="a" onSelect={onSelect} />)
    getByText('Perícias').click()
    expect(onSelect).toHaveBeenCalledWith('e')
  })
})
