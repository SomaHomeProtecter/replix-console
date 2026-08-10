import { apiFetch, qs } from './client'
import type {
  ReportPage, ReportReason, ReportStatus, ResolutionAction, ResolveResult, SuspendDuration,
  SuspensionResult, UserDetail,
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

export function blindMessage(episodeId: number, msgId: string): Promise<{ blinded: boolean }> {
  return apiFetch(`/api/v1/admin/messages/${episodeId}/${msgId}/blind`, { method: 'POST' })
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
