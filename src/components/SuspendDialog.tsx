import { useState } from 'react'
import type { SuspendDuration } from '../api/types'
import { DURATION_LABELS } from '../format'

const PRESETS: SuspendDuration[] = ['H24', 'H72', 'D7', 'PERMANENT']

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

  return (
    <div className="dialog-backdrop">
      {/* 최초 포커스는 사유 입력(autoFocus — 유일한 필수 입력), Esc = 취소(리뷰 m5).
          완전한 포커스 트랩은 이월 — 로컬 콘솔 3인 사용 전제에서 최소 동선만 잡는다. */}
      <div
          className="dialog" role="dialog" aria-modal="true" aria-label="계정 정지"
          onKeyDown={(e) => {
            if (e.key === 'Escape') onCancel()
          }}>
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
