import { useEffect, useRef, useState } from 'react'

/**
 * 신고가 가리킨 그룹방 종료 확인. roomId나 멤버는 보여 주지 않고, 소멸 범위만 정확히 알린다.
 * 취소에 최초 포커스를 둬 Enter 연타가 곧바로 되돌릴 수 없는 종료로 이어지지 않게 한다.
 */
export default function RoomEndDialog({ busy, onConfirm, onCancel }: {
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const [opener] = useState<Element | null>(() => document.activeElement)

  useEffect(() => {
    cancelRef.current?.focus()
    return () => {
      if (opener instanceof HTMLElement && document.contains(opener)) opener.focus()
    }
  }, [opener])

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape' && !busy) {
      event.preventDefault()
      onCancel()
      return
    }
    if (event.key !== 'Tab') return
    const buttons = Array.from(
      dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? [],
    )
    if (buttons.length === 0) return
    const first = buttons[0]
    const last = buttons[buttons.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div
        className="dialog-backdrop"
        onClick={(event) => {
          event.stopPropagation()
          if (!busy) onCancel()
        }}>
      <div
          ref={dialogRef}
          className="dialog" role="dialog" aria-modal="true" aria-label="그룹방 종료"
          aria-describedby="room-end-description"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={onKeyDown}>
        <h2>이 그룹방을 종료할까요?</h2>
        <p id="room-end-description" className="sub">
          신고가 접수된 방의 초대 링크, 재생 상태와 채팅이 즉시 삭제됩니다.
        </p>
        <div className="room-end-copy">
          방은 복구할 수 없습니다. 신고 기록과 처리 이력은 남습니다.
        </div>
        <div className="dialog-actions">
          <button ref={cancelRef} type="button" className="btn" disabled={busy} onClick={onCancel}>
            취소
          </button>
          <button type="button" className="btn btn-room-end-solid" disabled={busy} onClick={onConfirm}>
            방 종료
          </button>
        </div>
      </div>
    </div>
  )
}
