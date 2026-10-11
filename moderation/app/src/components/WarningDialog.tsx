import { useState } from 'react'
import Dialog from '@core/Dialog'
import type { WarningReason } from '../api/types'

export const WARNING_PRESETS: Record<WarningReason, { label: string; message: string }> = {
  ABUSE: {
    label: '욕설·혐오',
    message: '다른 사용자를 존중해 주세요. 공격적이거나 불쾌감을 주는 표현이 반복되면 이용이 제한될 수 있습니다.',
  },
  SPOILER: {
    label: '스포일러',
    message: '스포일러가 포함된 내용은 표시 기능을 사용해 주세요. 반복해서 다른 사람의 시청을 방해하면 이용이 제한될 수 있습니다.',
  },
  SPAM: {
    label: '도배·광고',
    message: '같은 내용의 반복 전송이나 광고성 메시지는 삼가 주세요. 반복되면 이용이 제한될 수 있습니다.',
  },
  OTHER: {
    label: '기타',
    message: 'Replix 이용 규칙을 지켜 주세요. 같은 행동이 반복되면 이용이 제한될 수 있습니다.',
  },
}

const REASONS = Object.keys(WARNING_PRESETS) as WarningReason[]

/** HP-303 경고 확인 겹. 정지와 달리 파괴적이지 않아 호박색과 중립 버튼을 쓴다. */
export default function WarningDialog({ targetName, busy, onConfirm, onCancel }: {
  targetName: string
  busy?: boolean
  onConfirm: (reason: WarningReason, note: string | null) => void
  onCancel: () => void
}) {
  const [reason, setReason] = useState<WarningReason>('ABUSE')
  const [note, setNote] = useState('')
  const preset = WARNING_PRESETS[reason]
  const trimmed = note.trim()
  return (
    // 처음 포커스는 창 자신 — 화면 읽기 프로그램이 창 이름과 보낼 문구부터 읽게 한다(HP-303 계약).
    <Dialog label="사용자 경고" title={`${targetName} 사용자 경고`} className="warning-dialog" busy={busy}
        onClose={onCancel} initialFocus="dialog">
      <p className="sub">고정된 정책 문구가 사용자 패널에 전달됩니다. 경고 3회부터 정지 검토 대상으로 표시됩니다.</p>
      <div className="warning-presets" role="radiogroup" aria-label="경고 사유">
        {REASONS.map((value) => (
          <label key={value}>
            <input type="radio" name="warning-reason" value={value}
                checked={reason === value} onChange={() => setReason(value)} />
            {WARNING_PRESETS[value].label}
          </label>
        ))}
      </div>
      <div className="warning-copy" aria-live="polite">
        <strong>{preset.label}</strong>
        <p>{preset.message}</p>
      </div>
      <div className="req">
        <label>
          운영 메모 <span className="hint">사용자에게 보이지 않음</span>
          <textarea aria-label="경고 운영 메모" rows={2} maxLength={480} value={note}
              placeholder="선택 - 감사 로그에만 남습니다" onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>
      <div className="dialog-actions">
        <button type="button" className="btn" disabled={busy} onClick={onCancel}>취소</button>
        <button type="button" className="btn btn-warn" disabled={busy}
            onClick={() => onConfirm(reason, trimmed || null)}>경고 발송</button>
      </div>
    </Dialog>
  )
}
