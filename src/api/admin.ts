import { apiFetch, qs } from './client'
import type {
  AuthorMessages, ReportPage, ReportReason, ReportStatus, ResolutionAction, ResolveResult,
  SuspendDuration, SuspensionResult, UserDetail,
} from './types'

/** 관리 API 래퍼(HP-226/227) — 경로·메서드를 한 곳에 모아 화면은 함수 이름만 안다. */

export interface ReportFilters {
  status: ReportStatus | ''
  reason: ReportReason | ''
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

export function getUserDetail(userId: number): Promise<UserDetail> {
  return apiFetch(`/api/v1/admin/users/${userId}`)
}
