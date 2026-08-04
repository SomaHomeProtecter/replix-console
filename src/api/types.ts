/**
 * BE 관리 API 계약(HP-226/227) — 원천은 Replix-be의 응답 DTO들:
 * AdminReportPageResponse · ResolveReportResponse · SuspensionResponse · AdminUserDetailResponse.
 * 여기 타입은 그 record들을 1:1로 옮긴 것이므로 BE가 바뀌면 여기도 함께 바꾼다.
 */
export type ReportReason = 'ABUSE' | 'SPOILER' | 'SPAM' | 'OTHER'
export type ReportStatus = 'OPEN' | 'RESOLVED' | 'REJECTED'
export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'WITHDRAWN'
export type SuspendDuration = 'H24' | 'H72' | 'D7' | 'PERMANENT'
export type AdminActionType =
  | 'BLIND' | 'UNBLIND' | 'SCORE_FIX' | 'SUSPEND' | 'UNSUSPEND' | 'RESOLVE_REPORT'

export interface UserSummary {
  id: number
  displayName: string | null
  status: UserStatus
}

export interface ReportItem {
  id: number
  createdAt: string
  reason: ReportReason
  detail: string | null
  status: ReportStatus
  episodeId: number
  msgId: string
  snapshotMessage: string
  snapshotDisplayName: string
  reporter: UserSummary | null
  targetUser: UserSummary | null
  handledBy: UserSummary | null
  handledAt: string | null
  resolutionNote: string | null
  /** Redis 실황 — null이면 이미 사라진 메시지(TTL 등). */
  currentStatus: string | null
  spoilerScore: number | null
  sameMessageReportCount: number
}

export interface ReportPage {
  items: ReportItem[]
  nextCursor: string | null
}

export interface ResolveResult {
  id: number
  status: ReportStatus
  resolutionNote: string | null
  handledBy: UserSummary | null
  handledAt: string | null
}

export interface SuspensionResult {
  userId: number
  status: UserStatus
  suspendedUntil: string | null
  suspendReason: string | null
}

export interface UserProfile {
  id: number
  displayName: string | null
  email: string | null
  authProvider: string
  status: UserStatus
  suspendedUntil: string | null
  suspendReason: string | null
  createdAt: string
  updatedAt: string
}

export interface ReceivedReport {
  id: number
  createdAt: string
  reason: ReportReason
  status: ReportStatus
  snapshotMessage: string
  reporterName: string | null
}

export interface AdminActionRow {
  id: number
  createdAt: string
  action: AdminActionType
  reason: string | null
  adminName: string | null
}

export interface UserDetail {
  profile: UserProfile
  reportsReceived: ReceivedReport[]
  actions: AdminActionRow[]
  /** 정지·해제만 담는 별도 축 — actions의 상한(50)과 경합하지 않는다(리뷰 m9). */
  suspensions: AdminActionRow[]
}
