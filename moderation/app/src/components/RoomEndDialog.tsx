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
    // 아래 신고 상세까지 어떤 키도 새지 않는다(HP-520) — 정지·경고 확인 겹과 같은 규칙이다.
    // 막지 않던 동안 Esc가 이 창과 함께 신고 상세까지 닫았고, 상세의 조치 단축키(b·n·x·s)도
    // 이 창이 떠 있는 채로 눌렸다.
    event.stopPropagation()
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
    // 포커스가 창 자체(빈 곳을 누른 뒤)나 창 밖에 있으면 버튼 사이가 아니어도 창 안으로 돌린다 — 그대로 두면
    // Shift+Tab이 아래 신고 상세 버튼으로 빠지고, 그 뒤 Esc·단축키가 상세로 간다(HP-520 리뷰).
    if (!buttons.includes(document.activeElement as HTMLButtonElement)) {
      event.preventDefault()
      ;(event.shiftKey ? last : first).focus()
    } else if (event.shiftKey && document.activeElement === first) {
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
          // 창 안의 빈 곳을 눌러도 포커스가 창에 남게 한다 — body로 떨어지면 그다음 Esc는 위
          // onKeyDown을 거치지 않고 신고 상세로 가 둘이 함께 닫힌다(SuspendDialog와 같은 이유).
          tabIndex={-1}
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
