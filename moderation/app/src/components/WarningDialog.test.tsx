import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import WarningDialog from './WarningDialog'

describe('WarningDialog — 경고 문구와 접근성 계약(HP-303)', () => {
  it('사용자에게 보낼 고정 문구를 미리 보여주고 운영 메모는 선택값으로 분리한다', async () => {
    const onConfirm = vi.fn()
    render(<WarningDialog targetName="스포일러꾼" onConfirm={onConfirm} onCancel={vi.fn()} />)

    const dialog = screen.getByRole('dialog', { name: '사용자 경고' })
    expect(dialog).toHaveFocus()
    expect(screen.getByText(/다른 사용자를 존중해 주세요/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('radio', { name: '기타' }))
    expect(screen.getByText(/Replix 이용 규칙을 지켜 주세요/)).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('경고 운영 메모'), '  내부 확인만  ')
    await userEvent.click(screen.getByRole('button', { name: '경고 발송' }))

    expect(onConfirm).toHaveBeenCalledWith('OTHER', '내부 확인만')
  })

  it('Esc로 닫고 원래 버튼으로 포커스를 돌린다', async () => {
    const onCancel = vi.fn()
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
    const view = render(
        <WarningDialog targetName="대상" onConfirm={vi.fn()} onCancel={onCancel} />)

    await userEvent.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledTimes(1)
    view.unmount()
    expect(opener).toHaveFocus()
    opener.remove()
  })
})
