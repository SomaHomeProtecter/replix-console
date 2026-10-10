import type { ReactNode } from 'react'

/* 틀의 선 아이콘. 이모지를 쓰지 않는 이유는 조치 콘솔과 같다(HP-310) — 컬러 이모지만 다른 톤으로 렌더돼 글자와 섞인다. */

function Icon({ size, children }: { size: number; children: ReactNode }) {
  return (
    <svg
        width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {children}
    </svg>
  )
}

export function HomeIcon() {
  return <Icon size={16}><path d="M3 10.5 12 3l9 7.5" /><path d="M5.5 9v11h13V9" /></Icon>
}

export function SproutIcon() {
  return (
    <Icon size={15}>
      <path d="M12 21v-8" />
      <path d="M12 13c0-4.4-3.1-7-7.5-7 0 4.4 3.1 7 7.5 7z" />
      <path d="M12 11c0-3.9 2.7-6.5 7.5-6.5 0 3.9-2.7 6.5-7.5 6.5z" />
    </Icon>
  )
}

export function ShieldIcon() {
  return <Icon size={15}><path d="M12 3 4.5 6v5.6c0 4.4 3.1 8.1 7.5 9.4 4.4-1.3 7.5-5 7.5-9.4V6z" /></Icon>
}

export function LockIcon() {
  return <Icon size={10}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></Icon>
}

export function ExternalIcon() {
  return (
    <Icon size={13}>
      <path d="M14 4h6v6" />
      <path d="M20 4l-9 9" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </Icon>
  )
}

export function ArrowIcon() {
  return <Icon size={14}><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></Icon>
}
