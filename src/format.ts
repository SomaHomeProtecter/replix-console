import type { AdminActionType, ReportReason, ReportStatus, SuspendDuration, UserStatus } from './api/types'

const KST = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hour12: false,
})

export function formatKst(iso: string | null): string {
  if (!iso) return '—'
  return KST.format(new Date(iso))
}

/** EXT 신고 사유 칩과 1:1(HP-224). */
export const REASON_LABELS: Record<ReportReason, string> = {
  ABUSE: '욕설·혐오', SPOILER: '스포일러', SPAM: '도배·광고', OTHER: '기타',
}

export const STATUS_LABELS: Record<ReportStatus, string> = {
  OPEN: '접수', RESOLVED: '처리', REJECTED: '기각',
}

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  ACTIVE: '활성', SUSPENDED: '정지', WITHDRAWN: '탈퇴',
}

export const DURATION_LABELS: Record<SuspendDuration, string> = {
  H24: '24시간', H72: '72시간', D7: '7일', PERMANENT: '무기한',
}

export const ACTION_LABELS: Record<AdminActionType, string> = {
  BLIND: '가림', UNBLIND: '가림 해제', SCORE_FIX: '점수 정정',
  SUSPEND: '계정 정지', UNSUSPEND: '정지 해제', RESOLVE_REPORT: '신고 종결',
}

/**
 * 정지 상태 표기(정본) — 만료 배치가 없는 lazy 설계라 DB status는 만료 후에도 SUSPENDED로
 * 남는다. 화면이 만료를 계산해 정직하게 보여준다. 정지 아님 → null.
 */
export function suspensionLabel(
  status: UserStatus, suspendedUntil: string | null, now: Date = new Date(),
): string | null {
  if (status !== 'SUSPENDED') return null
  if (!suspendedUntil) return '무기한 정지'
  if (new Date(suspendedUntil).getTime() <= now.getTime()) {
    return '정지 만료됨(다음 활동 시 자동 해제)'
  }
  return `${formatKst(suspendedUntil)}까지 정지`
}
