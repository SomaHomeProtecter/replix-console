import { createEvent, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import Dialog from './Dialog'

function Opener({ busy = false, onParentKey = () => {}, onParentClick = () => {} }: {
  busy?: boolean
  onParentKey?: () => void
  onParentClick?: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div onKeyDown={onParentKey} onClick={onParentClick}>
      <button type="button" onClick={() => setOpen(true)}>열기</button>
      {open && (
        <Dialog label="정책 변경" title="정책 변경" busy={busy} onClose={() => setOpen(false)}>
          <label>사유<input aria-label="사유" /></label>
          <div className="dialog-actions">
            <button type="button" onClick={() => setOpen(false)}>취소</button>
            <button type="button">적용</button>
          </div>
        </Dialog>
      )}
    </div>
  )
}

describe('공용 다이얼로그(HP-528)', () => {
  it('열면 첫 입력 칸에 포커스가 가고, 닫으면 연 버튼으로 돌아온다', async () => {
    const user = userEvent.setup()
    render(<Opener />)
    await user.click(screen.getByRole('button', { name: '열기' }))
    expect(screen.getByRole('textbox', { name: '사유' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '열기' })).toHaveFocus()
  })

  it('Tab은 창 안에서 돌고, 창 자신에 포커스가 있을 때의 Shift+Tab도 가둔다', async () => {
    const user = userEvent.setup()
    render(<Opener />)
    await user.click(screen.getByRole('button', { name: '열기' }))
    const dialog = screen.getByRole('dialog', { name: '정책 변경' })
    screen.getByRole('button', { name: '적용' }).focus()
    await user.tab()
    expect(screen.getByRole('button', { name: '닫기' })).toHaveFocus() // 마지막 → 처음(✕)
    dialog.focus()
    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: '적용' })).toHaveFocus()
  })

  it('모든 키는 이 창에서 끝난다 — 아래 창의 Esc·단축키가 함께 눌리지 않는다', () => {
    const parentKey = vi.fn()
    render(<Opener onParentKey={parentKey} />)
    fireEvent.click(screen.getByRole('button', { name: '열기' }))
    fireEvent.keyDown(screen.getByRole('textbox', { name: '사유' }), { key: 'b' })
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(parentKey).not.toHaveBeenCalled()
  })

  it('처리 중에는 ✕·Esc·바깥 클릭으로 닫히지 않는다', async () => {
    const user = userEvent.setup()
    render(<Opener busy />)
    await user.click(screen.getByRole('button', { name: '열기' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.keyDown(dialog, { key: 'Escape' })
    await user.click(dialog.parentElement!)
    expect(screen.getByRole('button', { name: '닫기' })).toBeDisabled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('바깥을 눌러 닫고, 그 클릭은 아래 겹(상세 모달)까지 가지 않는다', async () => {
    const user = userEvent.setup()
    const parentClick = vi.fn()
    render(<Opener onParentClick={parentClick} />)
    await user.click(screen.getByRole('button', { name: '열기' }))
    parentClick.mockClear()
    await user.click(screen.getByRole('dialog').parentElement!)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(parentClick).not.toHaveBeenCalled()
  })

  it('창 안에서 누르기 시작해 바깥에서 뗀 것은 닫지 않는다 — 글자를 고르다 끌고 나간 경우', () => {
    render(<Opener />)
    fireEvent.click(screen.getByRole('button', { name: '열기' }))
    const backdrop = screen.getByRole('dialog').parentElement!
    fireEvent.mouseDown(screen.getByRole('textbox', { name: '사유' }))
    fireEvent.click(backdrop) // 누른 곳과 뗀 곳의 공통 조상 = 바깥
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('처음 포커스 자리를 정할 수 있다 — 되돌리기 어려운 확인은 취소에', () => {
    function Confirm() {
      const cancel = useRef<HTMLButtonElement>(null)
      return (
        <Dialog label="방 종료" onClose={() => {}} initialFocus={cancel}>
          <button type="button" ref={cancel}>취소</button><button type="button">종료</button>
        </Dialog>
      )
    }
    render(<Confirm />)
    expect(screen.getByRole('button', { name: '취소' })).toHaveFocus()
  })

  it("initialFocus='dialog'면 창 자신이 포커스를 받는다 — 안내 문구부터 읽히게", () => {
    render(<Dialog label="사용자 경고" onClose={() => {}} initialFocus="dialog"><input aria-label="메모" /></Dialog>)
    expect(screen.getByRole('dialog', { name: '사용자 경고' })).toHaveFocus()
  })

  it('입력 칸이 없으면 ✕가 아니라 첫 동작 버튼에 포커스가 간다', () => {
    render(<Dialog label="확인" onClose={() => {}}><button type="button">계속</button></Dialog>)
    expect(screen.getByRole('button', { name: '계속' })).toHaveFocus()
  })

  it('닫힐 때 연 버튼이 꺼져 있으면 그 버튼을 품은 아래 창으로 포커스를 돌린다', () => {
    function Stack() {
      const [top, setTop] = useState(false)
      const [busy, setBusy] = useState(false)
      return (
        <Dialog label="기능 변경" onClose={() => {}} busy={busy}>
          <input aria-label="사유" />
          <button type="button" disabled={busy} onClick={() => { setBusy(true); setTop(true) }}>변경 적용</button>
          {top && <Dialog label="PROD 확인" onClose={() => setTop(false)}><button type="button">확인</button></Dialog>}
        </Dialog>
      )
    }
    render(<Stack />)
    const apply = screen.getByRole('button', { name: '변경 적용' })
    apply.focus()
    fireEvent.click(apply)
    expect(screen.getByRole('button', { name: '확인' })).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'PROD 확인' }), { key: 'Escape' })
    expect(screen.getByRole('dialog', { name: '기능 변경' })).toHaveFocus()
  })

  it('위 창이 열릴 때 포커스가 body에 있었어도, 닫힌 뒤에는 남은 아래 창으로 간다', () => {
    function Stack() {
      const [top, setTop] = useState(false)
      return (
        <Dialog label="기능 변경" onClose={() => {}}>
          <button type="button" onClick={() => setTop(true)}>열기</button>
          {top && <Dialog label="PROD 확인" onClose={() => setTop(false)}><button type="button">확인</button></Dialog>}
        </Dialog>
      )
    }
    render(<Stack />)
    ;(document.activeElement as HTMLElement | null)?.blur() // 연 버튼이 그새 꺼져 포커스를 잃은 상황
    expect(document.activeElement).toBe(document.body)
    fireEvent.click(screen.getByRole('button', { name: '열기' }))
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'PROD 확인' }), { key: 'Escape' })
    expect(screen.getByRole('dialog', { name: '기능 변경' })).toHaveFocus()
  })

  it('바깥을 눌러도 포커스가 창에서 빠지지 않는다 — 바깥 클릭으로 닫지 않는 창의 Tab·Esc가 계속 듣게(리뷰 2026-10-12)', () => {
    render(<Dialog label="PROD 확인" onClose={() => {}} closeOnBackdrop={false}><input aria-label="PROD 입력" /></Dialog>)
    const backdrop = screen.getByRole('dialog').parentElement!
    const press = createEvent.mouseDown(backdrop)
    fireEvent(backdrop, press)
    expect(press.defaultPrevented).toBe(true)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('처리를 시작하면 누른 버튼 대신 창이 포커스를 갖고, 끝난 뒤 body로 떨어진 포커스를 되찾는다', () => {
    function Busy() {
      const [busy, setBusy] = useState(false)
      return (
        <Dialog label="기능 변경" onClose={() => {}} busy={busy}>
          <button type="button" disabled={busy} onClick={() => setBusy(true)}>변경 적용</button>
          <button type="button" onClick={() => setBusy(false)}>끝내기(테스트)</button>
        </Dialog>
      )
    }
    render(<Busy />)
    const apply = screen.getByRole('button', { name: '변경 적용' })
    apply.focus()
    fireEvent.click(apply)
    expect(screen.getByRole('dialog')).toHaveFocus() // 꺼진 버튼에 포커스를 두지 않는다
    ;(document.activeElement as HTMLElement).blur() // 브라우저가 포커스를 body로 옮긴 상황
    fireEvent.click(screen.getByRole('button', { name: '끝내기(테스트)' }))
    expect(screen.getByRole('dialog')).toHaveFocus()
  })
})
