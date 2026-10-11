import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import RoomEndDialog from './RoomEndDialog'

/**
 * 그룹방 종료 확인은 신고 상세 모달 위에 겹친다. 키가 아래로 새면 Esc가 상세까지 닫고, 상세의
 * 조치 단축키가 이 창이 떠 있는 채로 눌린다(HP-520).
 */
describe('그룹방 종료 확인 — 키는 이 창에서 끝난다', () => {
  function renderOverParent() {
    const parentKey = vi.fn()
    const onCancel = vi.fn()
    render(
        <div onKeyDown={parentKey}>
          <RoomEndDialog onConfirm={vi.fn()} onCancel={onCancel} />
        </div>)
    return { parentKey, onCancel }
  }

  it('Esc는 이 창만 닫고 아래 신고 상세로 가지 않는다', () => {
    const { parentKey, onCancel } = renderOverParent()
    fireEvent.keyDown(screen.getByRole('dialog', { name: '그룹방 종료' }), { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(parentKey).not.toHaveBeenCalled()
  })

  it('상세의 조치 단축키도 이 창이 떠 있는 동안에는 새지 않는다', () => {
    const { parentKey } = renderOverParent()
    fireEvent.keyDown(screen.getByRole('button', { name: '취소' }), { key: 'b' })
    expect(parentKey).not.toHaveBeenCalled()
  })

  it('창의 빈 곳을 누른 뒤 Shift+Tab을 눌러도 포커스가 창 안에 남는다', () => {
    renderOverParent()
    const dialog = screen.getByRole('dialog', { name: '그룹방 종료' })
    dialog.focus()
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
    expect(screen.getByRole('button', { name: '방 종료' })).toHaveFocus()
  })
})
