import type { AdminActionType, ReportReason, ReportStatus, SuspendDuration, UserStatus } from './api/types'

const KST_FULL = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hour12: false,
})

function kstParts(iso: string): Record<string, string> {
  const parts: Record<string, string> = {}
  for (const p of KST_FULL.formatToParts(new Date(iso))) {
    parts[p.type] = p.value
  }
  return parts
}

export function formatKst(iso: string | null): string {
  if (!iso) return '—'
  return KST_FULL.format(new Date(iso))
}

/** 시안 큐 행 표기 — "13:42". 전체 시각은 title 속성으로 보완한다. */
export function formatKstTime(iso: string | null): string {
  if (!iso) return '—'
  const p = kstParts(iso)
  return `${p.hour}:${p.minute}`
}

/** 시안 이력 행·메타 표기 — "08-04 13:42". */
export function formatKstShort(iso: string | null): string {
  if (!iso) return '—'
  const p = kstParts(iso)
  return `${p.month}-${p.day} ${p.hour}:${p.minute}`
}

/** EXT 신고 사유 칩과 1:1(HP-224). */
export const REASON_LABELS: Record<ReportReason, string> = {
  ABUSE: '욕설·혐오', SPOILER: '스포일러', SPAM: '도배·광고', OTHER: '기타',
}

/** 필터 칩 라벨(시안 툴바 — 열림/처리됨/기각). */
export const STATUS_LABELS: Record<ReportStatus, string> = {
  OPEN: '열림', RESOLVED: '처리됨', REJECTED: '기각',
}

/** 큐 행 상태 표기(시안 — ● OPEN / ✓ 처리 / — 기각). */
export const ROW_STATUS_LABELS: Record<ReportStatus, string> = {
  OPEN: '● OPEN', RESOLVED: '✓ 처리', REJECTED: '— 기각',
}

export const DURATION_LABELS: Record<SuspendDuration, string> = {
  H24: '24시간', H72: '72시간', D7: '7일', PERMANENT: '무기한',
}

export const ACTION_LABELS: Record<AdminActionType, string> = {
  BLIND: '가림', UNBLIND: '가림 해제', SCORE_FIX: '점수 정정',
  SUSPEND: '계정 정지', UNSUSPEND: '정지 해제',
  RESOLVE_REPORT: '신고 종결', REOPEN_REPORT: '신고 재오픈',
}

/**
 * 사용자 상태 칩 문구(시안 — "SUSPENDED · ~08-07 13:45"). 만료 배치가 없는 lazy 설계라
 * DB status는 만료 후에도 SUSPENDED로 남는다 — 화면이 만료를 계산해 정직하게 표기한다.
 */
export function suspensionChip(
  status: UserStatus, suspendedUntil: string | null, now: Date = new Date(),
): string {
  if (status !== 'SUSPENDED') return status
  if (!suspendedUntil) return 'SUSPENDED · 무기한'
  if (new Date(suspendedUntil).getTime() <= now.getTime()) {
    return 'SUSPENDED · 만료됨(자동 해제 대기)'
  }
  return `SUSPENDED · ~${formatKstShort(suspendedUntil)}`
}
