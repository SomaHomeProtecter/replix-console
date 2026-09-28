import { useEffect, useId, useRef, useState } from 'react'
import type { FocusEvent, MouseEvent } from 'react'

/**
 * console.replix.tv 아래 다른 도구(HP-456). 다른 앱이라 라우터 링크가 아니라 페이지 이동이다.
 * 도구가 늘면 여기에 줄을 더한다.
 */
const OTHER_TOOLS = [
  { href: '/', label: '운영 콘솔 홈', hint: '도구 목록' },
  { href: '/seeding/', label: '시딩 도구', hint: '수집 · AI 채팅 계획 · 채팅 넣기' },
] as const

/**
 * 운영 콘솔 도구 전환 — 종전 "Replix Admin" 브랜드 링크 자리다(HP-456). 두 도구 모두 어두운 톱바가 있어
 * 공용 바를 한 겹 더 얹지 않고 각 도구 톱바 안에서 오간다.
 *
 * <p>조치를 처리하는 동안에는 종전 브랜드 링크처럼 이동 수단을 모두 잠근다(HP-300 쓰기 중 이탈 차단) —
 * 페이지를 떠나면 조치 성패를 알릴 곳이 사라진다. 열려 있던 목록도 그때 닫는다. 전역 잠금을 쓰지 않는
 * 화면의 쓰기는 api/client.ts가 이탈 직전에 붙잡는다.
 *
 * <p>초점이 밖으로 나가면 목록을 닫는다. Esc는 이 안이나 초점 없는 곳에서 누른 것만 받는다 — 문서 전체의
 * Esc를 받으면 검색창 지우기·대화상자 닫기의 Esc까지 가로채 초점을 빼앗는다.
 */
export default function ConsoleSwitcher({ disabled, disabledTitle }: {
  disabled: boolean
  disabledTitle?: string
}) {
  const [open, setOpen] = useState(false)
  const listId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (disabled) setOpen(false)
  }, [disabled])

  // Safari는 버튼을 눌러도 초점을 주지 않아, 메뉴를 마우스로 열면 초점이 body에 남는다. 그래서 바깥 누름과
  // Esc를 문서에서 받는다. Esc는 이 안이나 초점 없는 곳(body)에서 누른 것만 받는다 — 다른 입력칸·대화상자의
  // Esc까지 가로채면 검색어 지우기·대화상자 닫기에서 초점을 빼앗는다.
  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return
      const target = event.target as Node | null
      const inside = !!target && !!wrapRef.current?.contains(target)
      if (!inside && target !== document.body && target !== document.documentElement) return
      setOpen(false)
      toggleRef.current?.focus()
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  const blockWhileWriting = (event: MouseEvent<HTMLAnchorElement>) => {
    if (disabled) event.preventDefault()
  }
  const closeWhenFocusLeaves = (event: FocusEvent<HTMLDivElement>) => {
    if (open && !wrapRef.current?.contains(event.relatedTarget as Node | null)) setOpen(false)
  }

  return (
    <div
        className="console-switcher" ref={wrapRef} onBlur={closeWhenFocusLeaves}>
      <a
          href="/" className="brand" aria-disabled={disabled || undefined}
          title={disabled ? disabledTitle : '운영 콘솔 홈'} onClick={blockWhileWriting}>
        <span className="rx">Re</span>plix
      </a>
      <span className="console-switcher-sep" aria-hidden="true">/</span>
      <button
          ref={toggleRef} type="button" className="console-switcher-toggle"
          aria-expanded={open} aria-controls={open ? listId : undefined}
          disabled={disabled} title={disabled ? disabledTitle : '다른 운영 도구로 이동'}
          onClick={() => setOpen((current) => !current)}>
        조치 콘솔<span className="caret" aria-hidden="true" />
      </button>
      {open && (
        <nav id={listId} className="console-switcher-menu" aria-label="운영 콘솔 도구">
          <ul>
            {OTHER_TOOLS.map((tool) => (
              <li key={tool.href}>
                <a href={tool.href} onClick={blockWhileWriting}>
                  <b>{tool.label}</b><small>{tool.hint}</small><em>{tool.href}</em>
                </a>
              </li>
            ))}
            <li>
              <span className="current" aria-current="page">
                <b>조치 콘솔</b><small>신고 · 정지 · 조치 로그 · 기능 제어</small><em>/moderation/</em>
              </span>
            </li>
          </ul>
          {/* 시딩은 console.replix.tv에서 늘 운영에 붙는다(seeding/app/src/env.ts) — 여기가 DEV여도 그렇다. */}
          <p>시딩 도구는 늘 운영 서버에 붙습니다. 운영 Keycloak에 로그인돼 있으면 다시 입력하지 않습니다.</p>
        </nav>
      )}
    </div>
  )
}
