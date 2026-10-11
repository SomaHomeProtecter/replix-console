import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'

/** 포커스가 갈 수 있는 요소들. `:not([disabled])` — 꺼진 버튼은 순환에서 빠진다. */
const FOCUSABLE = 'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), '
  + '[href], select:not([disabled]), [tabindex]:not([tabindex="-1"])'
const FIELDS = 'input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled])'

/**
 * 콘솔 공용 다이얼로그(HP-528). 다이얼로그마다 포커스·Esc를 따로 짜던 동안 동작이 제각각이었다 — Esc가 아래 창까지
 * 닫거나(HP-520), 처리 중에도 닫혀 결과를 알릴 곳이 사라지거나, 포커스가 창 밖으로 빠졌다. 정지 다이얼로그가 리뷰를
 * 거쳐 다듬은 규칙을 한 곳에 모았다:
 *
 * <ul>
 *   <li>열 때 — 첫 입력 칸(없으면 첫 버튼)에 포커스(initialFocus로 바꿀 수 있다). 안의 요소가 autoFocus로 이미
 *       가져갔으면 그대로 둔다.</li>
 *   <li>Tab은 창 안에서만 돈다. 빈 곳을 눌러 포커스가 창 자신에 있을 때의 Shift+Tab까지 가둔다.</li>
 *   <li>모든 키는 이 창에서 끝난다 — 아래 신고 상세의 Esc·단축키가 함께 눌리지 않는다.</li>
 *   <li>처리 중(busy)에는 ✕·Esc·바깥 클릭으로 닫히지 않는다.</li>
 *   <li>닫히면 연 자리(버튼)로 포커스를 돌려준다 — 안 돌려주면 다음 Tab이 페이지 처음부터 시작한다.</li>
 * </ul>
 */
export default function Dialog({
  label, title, onClose, busy = false, className, backdropClassName,
  closeOnBackdrop = true, showClose = true, initialFocus, describedBy, children,
}: {
  /** 화면 읽기 프로그램이 읽는 창 이름. */
  label: string
  /** 보이는 제목(h2). 없으면 그리지 않는다 — 내용이 제목을 따로 그리는 창. */
  title?: ReactNode
  onClose: () => void
  busy?: boolean
  /** .dialog에 더할 클래스(예: 'feature-dialog'). */
  className?: string
  backdropClassName?: string
  /** 바깥 클릭으로 닫을지 — 다시 입력하기 어려운 확인 창은 끈다. */
  closeOnBackdrop?: boolean
  showClose?: boolean
  /**
   * 처음 포커스 자리. 기본은 첫 입력 칸. 되돌리기 어려운 확인 창은 '취소' 버튼 ref를 준다(Enter 연타가 곧바로
   * 실행으로 이어지지 않게). 'dialog'는 창 자신 — 화면 읽기 프로그램이 창 이름과 안내 문구부터 읽게 한다.
   */
  initialFocus?: RefObject<HTMLElement | null> | 'dialog'
  describedBy?: string
  children: ReactNode
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const pressedOutside = useRef(false)
  const titleId = useId()
  // 여는 순간의 포커스 자리. effect가 아니라 첫 렌더 중에 잡는다 — effect 때는 안의 autoFocus가 이미 포커스를 가져가
  // "열기 전 자리"가 지워져 있다.
  const [opener] = useState<Element | null>(() => document.activeElement)

  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    const active = document.activeElement
    if (!(box.contains(active) && active !== box)) {
      // 입력 칸이 없으면 ✕가 아니라 첫 동작 버튼으로 — ✕는 늘 DOM 처음이라 기본 Tab 순서로는 그것이 잡힌다.
      const items = Array.from(box.querySelectorAll<HTMLElement>(FOCUSABLE))
      const target = initialFocus === 'dialog' ? box
        : initialFocus?.current ?? box.querySelector<HTMLElement>(FIELDS)
          ?? items.find((item) => !item.classList.contains('modal-close')) ?? items[0] ?? box
      target.focus()
    }
    return () => {
      if (opener instanceof HTMLElement && document.contains(opener)) opener.focus()
      // 연 버튼이 그새 꺼졌거나(처리 중) 처음부터 포커스가 body에 있었으면 포커스가 body로 떨어진다. 아직 열려 있는 맨
      // 위 창으로 돌려, 다음 Tab·Esc가 그 창을 거치게 한다. (기능 변경 창의 '변경 적용' → PROD 확인 창이 닫힌 직후가
      // 그 경우다. 닫히는 이 창은 이미 문서에서 빠졌으므로 남은 창 중 DOM 순서상 마지막 = 맨 위다.)
      const active = document.activeElement
      if (active === null || active === document.body) {
        const open = document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')
        open[open.length - 1]?.focus()
      }
    }
    // 열 때 한 번 — 다시 그려질 때마다 포커스를 빼앗지 않는다.
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const trapTab = (event: React.KeyboardEvent) => {
    const box = boxRef.current
    if (!box) return
    const items = Array.from(box.querySelectorAll<HTMLElement>(FOCUSABLE))
    if (items.length === 0) { event.preventDefault(); return }
    const first = items[0]!
    const last = items[items.length - 1]!
    const active = document.activeElement
    const inside = box.contains(active) && active !== box
    if (event.shiftKey && (!inside || active === first)) {
      event.preventDefault(); last.focus()
    } else if (!event.shiftKey && (!inside || active === last)) {
      event.preventDefault(); first.focus()
    }
  }

  return (
    <div
        className={backdropClassName ? `dialog-backdrop ${backdropClassName}` : 'dialog-backdrop'} role="presentation"
        // 누르기 시작한 곳도, 뗀 곳도 바깥일 때만 닫는다 — 창 안에서 글자를 고르다 바깥에서 손을 떼도 닫히지 않게.
        // 닫기는 mousedown이 아니라 click에서 한다: mousedown에 닫으면 뒤따르는 click이 아래 상세 모달의 바깥에
        // 떨어져 두 겹이 함께 닫힌다. click은 여기서 전파를 끊는다.
        onMouseDown={(event) => { pressedOutside.current = event.target === event.currentTarget }}
        onClick={(event) => {
          event.stopPropagation()
          const outside = pressedOutside.current && event.target === event.currentTarget
          pressedOutside.current = false
          if (outside && closeOnBackdrop && !busy) onClose()
        }}>
      <div
          ref={boxRef} className={className ? `dialog ${className}` : 'dialog'}
          role="dialog" aria-modal="true" aria-label={label} aria-describedby={describedBy}
          aria-busy={busy || undefined}
          // 창 안의 빈 곳을 눌러도 포커스가 창에 남게 한다 — body로 떨어지면 다음 Esc가 이 창을 거치지 않는다.
          tabIndex={-1}
          onKeyDown={(event) => {
            event.stopPropagation()
            if (event.key === 'Escape') {
              event.preventDefault()
              if (!busy) onClose()
            } else if (event.key === 'Tab') {
              trapTab(event)
            }
          }}>
        {showClose && (
          <button type="button" className="modal-close" aria-label="닫기" disabled={busy}
              title={busy ? '처리하는 중입니다 — 끝나면 닫을 수 있습니다' : undefined} onClick={onClose}>✕</button>
        )}
        {title && <h2 id={titleId}>{title}</h2>}
        {children}
      </div>
    </div>
  )
}
