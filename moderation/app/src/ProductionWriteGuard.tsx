import { useEffect, useRef, useState } from 'react'
import {
  registerProductionWriteGuard,
} from './prodWriteConfirmation'
import type { ProductionWriteSummary } from './prodWriteConfirmation'

interface PendingConfirmation {
  summary: ProductionWriteSummary
  resolve: () => void
  reject: (reason: Error) => void
  opener: Element | null
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [href], '
  + 'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

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
    const next = { summary, resolve, reject, opener: document.activeElement }
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
    queueMicrotask(() => {
      if (current.opener instanceof HTMLElement && document.contains(current.opener)) {
        current.opener.focus()
      }
    })
  }

  const trapTab = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const dialog = event.currentTarget
    const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE))
    if (items.length === 0) return
    const active = document.activeElement
    const inside = dialog.contains(active) && active !== dialog
    if (event.shiftKey && (!inside || active === items[0])) {
      event.preventDefault(); items[items.length - 1].focus()
    } else if (!event.shiftKey && (!inside || active === items[items.length - 1])) {
      event.preventDefault(); items[0].focus()
    }
  }

  return (
    <>
      {children}
      {pending && (
        <div className="dialog-backdrop prod-confirm-backdrop">
          <div
              className="dialog prod-confirm-dialog" role="dialog" aria-modal="true"
              aria-label="PROD 변경 최종 확인" tabIndex={-1}
              onKeyDown={(event) => {
                event.stopPropagation()
                if (event.key === 'Escape') close(false)
                else if (event.key === 'Tab') trapTab(event)
              }}>
            <h2>PROD 변경 최종 확인</h2>
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
          </div>
        </div>
      )}
    </>
  )
}
