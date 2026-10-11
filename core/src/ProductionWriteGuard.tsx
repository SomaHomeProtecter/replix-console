import { useEffect, useRef, useState } from 'react'
import Dialog from './Dialog'
import {
  registerProductionWriteGuard,
} from './prodWriteConfirmation'
import type { ProductionWriteSummary } from './prodWriteConfirmation'

interface PendingConfirmation {
  summary: ProductionWriteSummary
  resolve: () => void
  reject: (reason: Error) => void
}

/** 모든 PROD 변경이 실제 fetch 직전에 거치는 공통 최종 확인 겹(HP-337). */
export default function ProductionWriteGuard({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingConfirmation | null>(null)
  const [confirmation, setConfirmation] = useState('')
  const pendingRef = useRef<PendingConfirmation | null>(null)

  useEffect(() => registerProductionWriteGuard((summary) => new Promise<void>((resolve, reject) => {
    if (pendingRef.current) {
      reject(new Error('다른 PROD 변경 확인이 진행 중입니다'))
      return
    }
    const next = { summary, resolve, reject }
    pendingRef.current = next
    setConfirmation('')
    setPending(next)
  })), [])

  const close = (approved: boolean) => {
    const current = pendingRef.current
    if (!current) return
    pendingRef.current = null
    setPending(null)
    setConfirmation('')
    if (approved) current.resolve()
    else current.reject(new Error('PROD 변경을 취소했습니다'))
  }

  return (
    <>
      {children}
      {pending && (
        // 포커스 가두기·Esc = 취소·닫힌 뒤 요청 버튼으로 포커스 복귀는 공용 다이얼로그가 지킨다(HP-528). 'PROD'를 다시
        // 입력해야 하는 창이라 ✕와 바깥 클릭 닫기는 두지 않는다 — 취소는 버튼·Esc로만.
        <Dialog
            label="PROD 변경 최종 확인" title="PROD 변경 최종 확인" className="prod-confirm-dialog"
            backdropClassName="prod-confirm-backdrop" showClose={false} closeOnBackdrop={false}
            onClose={() => close(false)}>
          <p className="sub">이 요청은 실제 사용자 데이터에 즉시 반영됩니다.</p>
          <dl className="prod-change-summary">
            <div><dt>환경</dt><dd><strong>PROD</strong></dd></div>
            <div><dt>대상</dt><dd>{pending.summary.target}</dd></div>
            <div><dt>변경</dt><dd>{pending.summary.change}</dd></div>
            <div><dt>사유</dt><dd>{pending.summary.reason}</dd></div>
          </dl>
          <label className="prod-confirm-input">
            계속하려면 <strong>PROD</strong>를 입력하세요
            <input
                aria-label="PROD 확인 입력" autoFocus autoComplete="off"
                value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
          </label>
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={() => close(false)}>취소</button>
            <button
                type="button" className="btn btn-prod-confirm"
                disabled={confirmation !== 'PROD'} onClick={() => close(true)}>
              PROD에 적용
            </button>
          </div>
        </Dialog>
      )}
    </>
  )
}
