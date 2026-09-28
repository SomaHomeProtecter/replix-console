import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import SuspendDialog from './SuspendDialog'

/** 다이얼로그를 열고 닫는 바깥 맥락 — 포커스 복귀를 보려면 "열기 전 요소"가 있어야 한다. */
function Harness() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>계정 정지…</button>
      {open && (
        <SuspendDialog targetName="스포일러꾼" onConfirm={() => {}} onCancel={() => setOpen(false)} />
      )}
    </>
  )
}

describe('SuspendDialog 포커스 트랩(HP-268)', () => {
  it('Tab이 마지막 요소를 지나면 다이얼로그 첫 요소로 돌아온다', async () => {
    render(<SuspendDialog targetName="스포일러꾼" onConfirm={vi.fn()} onCancel={vi.fn()} />)
    // 사유를 채워야 확정 버튼이 활성 — 비활성 버튼은 포커스 대상이 아니라 순환에서 빠진다
    await userEvent.type(screen.getByLabelText('정지 사유'), '도배')

    const confirm = screen.getByRole('button', { name: '정지 적용' })
    confirm.focus()
    await userEvent.tab()

    // 다이얼로그 밖(body)으로 새지 않고 첫 요소(✕)로 순환한다
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '닫기' }))
  })

  it('Shift+Tab이 첫 요소를 지나면 마지막 요소로 돌아온다', async () => {
    render(<SuspendDialog targetName="스포일러꾼" onConfirm={vi.fn()} onCancel={vi.fn()} />)
    await userEvent.type(screen.getByLabelText('정지 사유'), '도배')

    screen.getByRole('button', { name: '닫기' }).focus()
    await userEvent.tab({ shift: true })

    expect(document.activeElement).toBe(screen.getByRole('button', { name: '정지 적용' }))
  })

  it('비활성 확정 버튼은 순환 대상에서 빠진다 — 사유가 비면 취소가 마지막이다', async () => {
    render(<SuspendDialog targetName="스포일러꾼" onConfirm={vi.fn()} onCancel={vi.fn()} />)

    screen.getByRole('button', { name: '닫기' }).focus()
    await userEvent.tab({ shift: true })

    expect(document.activeElement).toBe(screen.getByRole('button', { name: '취소' }))
  })

  it('닫으면 포커스가 열기 전 요소로 돌아온다', async () => {
    render(<Harness />)
    const opener = screen.getByRole('button', { name: '계정 정지…' })
    await userEvent.click(opener)
    expect(screen.getByRole('dialog', { name: '계정 정지' })).toBeInTheDocument()

    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('dialog', { name: '계정 정지' })).not.toBeInTheDocument()
    // 안 되돌리면 포커스가 body로 떨어져 키보드 사용자가 자기 위치를 잃는다
    expect(document.activeElement).toBe(opener)
  })
})
