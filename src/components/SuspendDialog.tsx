import { useEffect, useRef, useState } from 'react'
import type { SuspendDuration } from '../api/types'
import { DURATION_LABELS } from '../format'

const PRESETS: SuspendDuration[] = ['H24', 'H72', 'D7', 'PERMANENT']

/** 포커스가 갈 수 있는 요소들. `:not([disabled])` — 사유가 비어 꺼진 확정 버튼은 순환에서 빠진다. */
const FOCUSABLE = 'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), '
  + '[href], select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * 정지 확인 다이얼로그(시안 cm-dlg) — 프리셋 4단 · 사유 필수(*) · 제재 범위 안내 · 감사 고지.
 * 파괴적 조치라 확인 한 겹을 강제하고, 빨강은 프리셋 선택·확정 버튼에만 쓴다.
 */
export default function SuspendDialog({ targetName, busy, onConfirm, onCancel }: {
  targetName: string
  busy?: boolean
  onConfirm: (duration: SuspendDuration, reason: string) => void
  onCancel: () => void
}) {
  const [duration, setDuration] = useState<SuspendDuration>('H24')
  const [reason, setReason] = useState('')
  const trimmed = reason.trim()
  const dialogRef = useRef<HTMLDivElement>(null)

  // 여는 순간의 포커스 위치. useEffect가 아니라 첫 렌더 중에 잡는다 — effect는 커밋 이후라
  // 그때는 사유 입력의 autoFocus가 이미 포커스를 가져가 "열기 전 자리"가 지워져 있다.
  const [opener] = useState<Element | null>(() => document.activeElement)

  // 닫힌 뒤 포커스를 그 자리로 되돌린다 — 안 되돌리면 포커스가 body로 떨어져 키보드
  // 사용자가 자기 위치를 잃고, 다음 Tab이 페이지 처음부터 다시 시작한다.
  useEffect(() => () => {
    if (opener instanceof HTMLElement && document.contains(opener)) {
      opener.focus()
    }
  }, [opener])

  /**
   * Tab을 다이얼로그 안에서 순환시킨다(포커스 트랩).
   *
   * <p>파괴적 조치를 확인하는 화면이라 포커스가 뒤 페이지로 새면 사용자가 무엇을 조작하는지
   * 화면과 어긋난다 — 보이는 것은 이 다이얼로그인데 Enter는 뒤의 버튼을 누르는 식이다.
   * 브라우저 기본 Tab 이동은 겹 개념이 없어 우리가 끝단에서만 가로챈다(중간 이동은 그대로 둔다).
   */
  const trapTab = (e: React.KeyboardEvent) => {
    const box = dialogRef.current
    if (!box) return
    const focusables = Array.from(box.querySelectorAll<HTMLElement>(FOCUSABLE))
    if (focusables.length === 0) return
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    const active = document.activeElement
    if (e.shiftKey && (active === first || !box.contains(active))) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    // 바깥(백드롭) 클릭 = 취소 — 상세 모달과 같은 복귀 동선(2026-08-05 피드백).
    // stopPropagation: 이 클릭이 상세 모달 카드까지 번져도 모달은 닫히지 않지만, 겹 경계를 명시한다.
    <div
        className="dialog-backdrop"
        onClick={(e) => {
          e.stopPropagation()
          onCancel()
        }}>
      {/* 최초 포커스는 사유 입력(autoFocus — 유일한 필수 입력), Esc = 취소(리뷰 m5),
          Tab은 이 겹 안에서 순환(HP-268 trapTab), 닫으면 포커스는 열기 전 자리로. */}
      <div
          ref={dialogRef}
          className="dialog" role="dialog" aria-modal="true" aria-label="계정 정지"
          // 겹 안의 빈 곳(제목·안내 문구 등)을 눌러도 포커스가 이 겹을 벗어나지 않게 한다.
          // 없으면 포커스가 body로 떨어지고, 그 상태의 Esc는 아래 onKeyDown을 거치지 않고 문서로
          // 직행해 **확인 겹과 상세 모달이 함께 닫힌다** — 확인 겹을 띄운 의미가 사라진다.
          // (2026-08-11 실브라우저에서 발견. Tab 순환은 trapTab이 따로 지키므로 -1로 충분하다.)
          tabIndex={-1}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              // 상세 모달의 문서 레벨 Esc 핸들러까지 번지면 겹이 한 번에 다 닫힌다 — 위 겹만 닫는다
              e.stopPropagation()
              onCancel()
            } else if (e.key === 'Tab') {
              trapTab(e)
            }
          }}>
        <button type="button" className="modal-close" aria-label="닫기" onClick={onCancel}>✕</button>
        <h2>{targetName} 계정 정지</h2>
        <p className="sub">채팅·답글·이모지·좋아요 전송이 차단됩니다. 로그인과 시청·읽기는 막지 않습니다.</p>
        <div className="durs" role="radiogroup" aria-label="정지 기간">
          {PRESETS.map((preset) => (
            <label key={preset}>
              <input
                  type="radio" name="suspend-duration" value={preset}
                  checked={duration === preset}
                  onChange={() => setDuration(preset)} />
              {DURATION_LABELS[preset]}
            </label>
          ))}
        </div>
        <div className="req">
          <label>
            정지 사유 <span className="must">*</span>
            <textarea
                aria-label="정지 사유" rows={2} maxLength={200} value={reason} autoFocus
                placeholder="필수 — 감사 로그와 차단 안내에 남습니다"
                onChange={(e) => setReason(e.target.value)} />
          </label>
        </div>
        <div className="warnline">
          <span>⚠</span>
          <span>정지 사실과 사유는 감사 로그에 기록되고, 사용자에게는 전송 시점에 "USER_SUSPENDED" 안내가 전달됩니다.</span>
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onCancel}>취소</button>
          <button
              type="button" className="btn btn-danger-solid"
              disabled={!trimmed || busy}
              onClick={() => onConfirm(duration, trimmed)}>
            정지 적용
          </button>
        </div>
      </div>
    </div>
  )
}
