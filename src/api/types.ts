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
  | 'BLIND' | 'UNBLIND' | 'SCORE_FIX' | 'SUSPEND' | 'UNSUSPEND' | 'RESOLVE_REPORT' | 'REOPEN_REPORT'

export type AdminTargetType = 'USER' | 'MESSAGE' | 'REPORT'

/** 처리(RESOLVED)에 동반된 조치 — "처리됨"을 가림/정지로 구분한다. null = 단순 처리. */
export type ResolutionAction = 'BLIND' | 'SUSPEND'

export interface UserSummary {
  id: number
  displayName: string | null
  status: UserStatus
  /** 프로필 사진(HP-268) — 없으면 null이고 화면은 이름 첫 글자로 대체한다. */
  profileImageUrl: string | null
}

export interface ReportItem {
  id: number
  createdAt: string
  reason: ReportReason
  detail: string | null
  status: ReportStatus
  resolvedAction: ResolutionAction | null
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
  /** 같은 메시지 신고 <b>누계</b>(종결분 포함) — 상세의 중립적 사실. */
  sameMessageReportCount: number
  /** 그중 <b>지금 열려 있는</b> 수 — 큐의 우선순위 칩은 이것을 쓴다. */
  openReportCount: number
}

export interface ReportPage {
  items: ReportItem[]
  nextCursor: string | null
}

export interface ResolveResult {
  id: number
  status: ReportStatus
  resolvedAction: ResolutionAction | null
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
  /** 프로필 사진(HP-268) — 없으면 null이고 화면은 이름 첫 글자로 대체한다. */
  profileImageUrl: string | null
}

export interface ReceivedReport {
  id: number
  createdAt: string
  reason: ReportReason
  status: ReportStatus
  snapshotMessage: string
  reporterName: string | null
}

/**
 * 신고 종결이 무엇으로 끝났는지(HP-268). `NONE` = 처리했지만 가림·정지는 하지 않음.
 * 종결 외 조치는 종별이 곧 결과라 붙지 않는다.
 */
export type ResolveOutcome = 'BLIND' | 'SUSPEND' | 'NONE' | 'REJECTED'

export interface AdminActionRow {
  id: number
  createdAt: string
  action: AdminActionType
  reason: string | null
  adminName: string | null
  /** 어떤 대상(신고 등)에 대한 조치인지 — 화면이 발췌·번호로 표기한다. */
  targetType: AdminTargetType
  targetId: string
  /** REPORT 대상이면 그 신고의 스냅샷 발췌(≤30자), 그 외 null(대상 = 이 사용자 자신). */
  targetSummary: string | null
  /**
   * 신고 종결의 결과(HP-268). 다른 조치는 null이고, 이 칸이 생기기 전에 쌓인 종결 기록도
   * null이다 — 화면은 그때 결과를 지어내지 않고 "신고 종결"로만 표기한다.
   */
  outcome: ResolveOutcome | null
}

/**
 * 그 사용자가 <b>보낸</b> 신고의 집계(HP-270) — 받은 신고와 반대 축이다.
 * 비율이 아니라 원수치가 내려온다: 분모를 무엇으로 잡느냐가 뜻을 뒤집기 때문이다.
 */
export interface ReportsSent {
  /** 보낸 신고 전체 */
  total: number
  /** 그중 판정이 끝난 것(RESOLVED + REJECTED) — 기각률의 분모 */
  judged: number
  /** 그중 기각된 것 */
  rejected: number
}

export interface UserDetail {
  profile: UserProfile
  reportsReceived: ReceivedReport[]
  actions: AdminActionRow[]
  /** 정지·해제만 담는 별도 축 — actions의 상한(50)과 경합하지 않는다(리뷰 m9). */
  suspensions: AdminActionRow[]
  /** 그 사용자가 <b>보낸</b> 신고 집계(HP-270) — reportsReceived와 반대 축이다. */
  reportsSent: ReportsSent
}

/** 한 회차에서 한 작성자가 남긴 글 한 줄(HP-298) — 운영자용이라 가려진 글도 원문이 온다. */
export interface AuthorMessage {
  msgId: string
  message: string
  playbackTime: number
  /**
   * Redis 실황 — visible / blocked_profanity / blocked_hate / blinded(ChatService).
   * 이미 안 보이는 줄을 다시 고르지 않게 화면이 쓴다.
   */
  status: string
}

/** @property total 상한 적용 전 전체 수 — rows.length와 다르면 잘린 것이다(화면이 알려야 한다). */
export interface AuthorMessages {
  rows: AuthorMessage[]
  total: number
}
