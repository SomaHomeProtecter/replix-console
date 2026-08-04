import { useState } from 'react'
import type { SuspendDuration } from '../api/types'
import { DURATION_LABELS } from '../format'

const PRESETS: SuspendDuration[] = ['H24', 'H72', 'D7', 'PERMANENT']

/**
 * 정지 확인 다이얼로그(정본) — 프리셋 4단 · 사유 필수 · 제재 범위 안내 · 감사 고지.
 * 파괴적 조치라 확인 한 겹을 강제하고, 빨강은 여기 확정 버튼에만 쓴다.
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
      <div className="dialog" role="dialog" aria-modal="true" aria-label="계정 정지">
        <h2>{targetName} 계정 정지</h2>
        <p className="hint">채팅·반응만 차단됩니다 — 로그인·읽기는 유지됩니다. 만료는 자동 해제(lazy)입니다.</p>
        <div className="preset-group" role="radiogroup" aria-label="정지 기간">
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
        <label>
          정지 사유
          <textarea
              aria-label="정지 사유" rows={2} maxLength={200} value={reason}
              placeholder="필수 — 대상에게 차단 안내와 함께 전달됩니다"
              onChange={(e) => setReason(e.target.value)} />
        </label>
        <p className="hint">이 조치는 감사 로그에 기록됩니다.</p>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onCancel}>취소</button>
          <button
              type="button" className="btn btn-danger"
              disabled={!trimmed || busy}
              onClick={() => onConfirm(duration, trimmed)}>
            정지 적용
          </button>
        </div>
      </div>
    </div>
  )
}
