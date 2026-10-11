import { useRef } from 'react'
import Dialog from '@core/Dialog'

/**
 * 신고가 가리킨 그룹방 종료 확인. roomId나 멤버는 보여 주지 않고, 소멸 범위만 정확히 알린다.
 * 취소에 최초 포커스를 둬 Enter 연타가 곧바로 되돌릴 수 없는 종료로 이어지지 않게 한다.
 */
export default function RoomEndDialog({ busy, onConfirm, onCancel }: {
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  return (
    // Esc가 아래 신고 상세까지 닫던 문제(HP-520)와 처리 중 닫힘 잠금은 공용 다이얼로그가 지킨다(HP-528).
    <Dialog label="그룹방 종료" title="이 그룹방을 종료할까요?" describedBy="room-end-description" busy={busy}
        onClose={onCancel} initialFocus={cancelRef}>
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
    </Dialog>
  )
}
