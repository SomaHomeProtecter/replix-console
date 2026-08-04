import type {
  AdminActionType, ReportReason, ReportStatus, ResolutionAction, ResolveOutcome,
  SuspendDuration, UserStatus,
} from './api/types'

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

/** 큐 행 상태 표기 — "처리됨"을 무슨 조치였는지로 구분한다(2026-08-05 E2E 피드백). */
export function rowStatusLabel(
  status: ReportStatus, resolvedAction: ResolutionAction | null,
): string {
  if (status === 'OPEN') return '● OPEN'
  if (status === 'REJECTED') return '— 기각'
  if (resolvedAction === 'BLIND') return '✓ 가림'
  if (resolvedAction === 'SUSPEND') return '✓ 정지'
  return '✓ 처리'
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
 * 조치 이력 한 줄의 조치 이름(HP-268). "신고 종결"만으로는 <b>가림인지 정지인지 기각인지</b>
 * 알 수 없어, 이력을 읽는 사람이 신고를 하나씩 열어 봐야 했다 — 결과를 라벨에 붙인다.
 *
 * <p>결과가 없는 종결(계측 이전 기록)은 그냥 "신고 종결"이다. 모르는 것을 그럴듯하게 지어내는
 * 대신 모른다고 두는 편이, 이력을 근거로 판단하는 사람에게 안전하다.
 */
export function actionLabel(action: AdminActionType, outcome: ResolveOutcome | null): string {
  if (action !== 'RESOLVE_REPORT' || outcome === null) {
    return ACTION_LABELS[action]
  }
  switch (outcome) {
    case 'REJECTED': return '신고 기각'
    case 'BLIND': return '신고 종결 · 가림'
    case 'SUSPEND': return '신고 종결 · 정지'
    case 'NONE': return '신고 종결 · 조치 없음'
  }
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
