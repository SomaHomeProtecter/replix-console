import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { selectableRow } from './selectableRow'

function Row({ select }: { select: () => void }) {
  return (
    <table><tbody>
      <tr data-testid="row" {...selectableRow(select)}><td>정책 후보 A <button type="button">안쪽 버튼</button></td></tr>
    </tbody></table>
  )
}

describe('키보드로 행 고르기(HP-527)', () => {
  it('Tab으로 닿고 Enter·Space로 고른다', () => {
    const select = vi.fn()
    render(<Row select={select} />)
    const row = screen.getByTestId('row')
    expect(row).toHaveAttribute('tabindex', '0')
    fireEvent.keyDown(row, { key: 'Enter' })
    fireEvent.keyDown(row, { key: ' ' })
    expect(select).toHaveBeenCalledTimes(2)
  })

  it('행 안의 버튼에서 누른 키는 그 버튼의 것이다', () => {
    const select = vi.fn()
    render(<Row select={select} />)
    fireEvent.keyDown(screen.getByRole('button', { name: '안쪽 버튼' }), { key: 'Enter' })
    expect(select).not.toHaveBeenCalled()
  })
})
