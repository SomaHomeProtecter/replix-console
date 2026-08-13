import { apiFetch, qs } from './client'
import type {
  AdminActionLogResponse, AdminActionType, AuthorMessages, ReportPage, ReportReason, ReportStatus,
  ModerationDecisionResult, ModerationReviewDecision, ModerationReviewPage, ResolutionAction,
  ResolveResult, SuspendDuration, SuspendedUsers, SuspensionResult, UserDetail, UserSearchResult,
} from './types'

/** 관리 API 래퍼(HP-226/227) — 경로·메서드를 한 곳에 모아 화면은 함수 이름만 안다. */

export interface ReportFilters {
  status: ReportStatus | ''
  reason: ReportReason | ''
}

export interface ActionLogFilters {
  adminUserId: number | ''
  action: AdminActionType | ''
  from: string
  to: string
}

/** 전역 조치 로그(HP-299) — 서버 정렬을 그대로 받고 복합 커서는 불투명 문자열로 전달한다. */
export function listActions(
  filters: ActionLogFilters, cursor: string | null, size = 30,
): Promise<AdminActionLogResponse> {
  return apiFetch(`/api/v1/admin/actions${qs({
    adminUserId: filters.adminUserId,
    action: filters.action,
    from: filters.from,
    to: filters.to,
    cursor,
    size,
  })}`)
}

export function listReports(
  filters: ReportFilters, cursor: string | null, size = 20,
): Promise<ReportPage> {
  return apiFetch(`/api/v1/admin/reports${qs({
    status: filters.status, reason: filters.reason, cursor, size,
  })}`)
}

export function resolveReport(
  reportId: number, outcome: 'RESOLVED' | 'REJECTED', note: string | null,
  action: ResolutionAction | null = null,
): Promise<ResolveResult> {
  return apiFetch(`/api/v1/admin/reports/${reportId}/resolve`, {
    method: 'POST', body: JSON.stringify({ outcome, note, action }),
  })
}

/** 종결 번복 — 신고를 큐로 되돌린다(이미 OPEN이면 멱등). */
export function reopenReport(reportId: number): Promise<ResolveResult> {
  return apiFetch(`/api/v1/admin/reports/${reportId}/reopen`, { method: 'POST' })
}

/**
 * @param signal 일괄 가림이 <b>취소</b>를 걸 수 있게 받는다(HP-298). 취소해도 이미 서버에 닿은
 *   건은 처리될 수 있으므로, 취소 뒤에는 목록을 다시 읽어 실제 상태로 맞춘다 — 취소는 "안 나간
 *   것으로 친다"가 아니라 "더 보내지 않고 기다리기를 멈춘다"이다.
 */
export function blindMessage(
  episodeId: number, msgId: string, signal?: AbortSignal,
): Promise<{ blinded: boolean }> {
  return apiFetch(`/api/v1/admin/messages/${episodeId}/${msgId}/blind`, { method: 'POST', signal })
}

/**
 * 그 회차에서 그 작성자가 남긴 글 모아 보기(HP-298) — 일괄 가림의 재료.
 * 가림 자체는 이 목록으로 고른 뒤 {@link blindMessage}를 건별로 부른다(감사 1건 1행 유지).
 */
export function listAuthorMessages(
  episodeId: number, userId: number, keep?: string,
): Promise<AuthorMessages> {
  // keep = 신고된 msgId. 상한(200)에 잘릴 때 그 줄이 창 밖으로 밀리면 목록에 없어
  // 미리 체크도 안 되고 운영자가 신고받은 바로 그 메시지를 가릴 수 없다.
  return apiFetch(`/api/v1/admin/messages/${episodeId}/by-author/${userId}`
    + qs({ keep: keep ?? '' }))
}

export function unblindMessage(episodeId: number, msgId: string): Promise<{ blinded: boolean }> {
  return apiFetch(`/api/v1/admin/messages/${episodeId}/${msgId}/blind`, { method: 'DELETE' })
}

/**
 * 스포일러 점수 수동 정정(HP-294) — 범위는 0..10(BE `@Min(0) @Max(10)`, 채점 스키마 HP-109와 동일).
 * 감사 사유는 BE가 `score=<이전>→<이후>`로 스스로 만든다 — 이전 값을 클라가 실어 보내면
 * 화면이 낡았을 때 틀린 값이 감사에 박힌다.
 */
export function fixSpoilerScore(
  episodeId: number, msgId: string, score: number,
): Promise<{ spoilerScore: number }> {
  return apiFetch(`/api/v1/admin/messages/${episodeId}/${msgId}/spoiler-score`, {
    method: 'PATCH', body: JSON.stringify({ score }),
  })
}

export function suspendUser(
  userId: number, duration: SuspendDuration, reason: string,
): Promise<SuspensionResult> {
  return apiFetch(`/api/v1/admin/users/${userId}/suspend`, {
    method: 'POST', body: JSON.stringify({ duration, reason }),
  })
}

export function unsuspendUser(userId: number): Promise<SuspensionResult> {
  return apiFetch(`/api/v1/admin/users/${userId}/suspend`, { method: 'DELETE' })
}

/**
 * 정지 현황판(HP-300) — status가 SUSPENDED인 계정 목록(만료 임박순, 무기한은 뒤).
 * 만료 지난 정지도 함께 온다: 만료가 lazy라 "만료됨·자동 해제 대기"가 현황판의 한 갈래다.
 */
export function listSuspendedUsers(): Promise<SuspendedUsers> {
  return apiFetch('/api/v1/admin/users/suspended')
}

export function getUserDetail(userId: number): Promise<UserDetail> {
  return apiFetch(`/api/v1/admin/users/${userId}`)
}

/** 상세 진입용 사용자 검색(HP-301) — 서버가 최대 10건으로 닫고 빈 검색은 목록을 열지 않는다. */
export function searchUsers(query: string): Promise<UserSearchResult> {
  return apiFetch(`/api/v1/admin/users/search${qs({ q: query })}`)
}

/** 차단 쓰기 시점에 쌓인 bounded 표본. Redis 메시지 전수 탐색을 하지 않는다(HP-302). */
export function listModerationReviews(size = 50): Promise<ModerationReviewPage> {
  return apiFetch(`/api/v1/admin/moderation-reviews${qs({ size })}`)
}

/** 판정은 튜닝 입력만 쌓고 원 채팅 상태를 바꾸지 않는다. */
export function decideModerationReview(
  sampleId: string, decision: ModerationReviewDecision,
): Promise<ModerationDecisionResult> {
  return apiFetch(`/api/v1/admin/moderation-reviews/${encodeURIComponent(sampleId)}/decision`, {
    method: 'POST', body: JSON.stringify({ decision }),
  })
}
