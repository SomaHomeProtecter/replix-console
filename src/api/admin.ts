import { apiFetch, qs } from './client'
import type {
  ReportPage, ReportReason, ReportStatus, ResolveResult, SuspendDuration,
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
): Promise<ResolveResult> {
  return apiFetch(`/api/v1/admin/reports/${reportId}/resolve`, {
    method: 'POST', body: JSON.stringify({ outcome, note }),
  })
}

export function blindMessage(episodeId: number, msgId: string): Promise<{ blinded: boolean }> {
  return apiFetch(`/api/v1/admin/messages/${episodeId}/${msgId}/blind`, { method: 'POST' })
}

export function unblindMessage(episodeId: number, msgId: string): Promise<{ blinded: boolean }> {
  return apiFetch(`/api/v1/admin/messages/${episodeId}/${msgId}/blind`, { method: 'DELETE' })
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
