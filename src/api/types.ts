/**
 * BE 관리 API 계약(HP-226/227) — 원천은 Replix-be의 응답 DTO들:
 * AdminReportPageResponse · ResolveReportResponse · SuspensionResponse · AdminUserDetailResponse.
 * 여기 타입은 그 record들을 1:1로 옮긴 것이므로 BE가 바뀌면 여기도 함께 바꾼다.
 */
export type ReportReason = 'ABUSE' | 'SPOILER' | 'SPAM' | 'OTHER'
export type ReportStatus = 'OPEN' | 'RESOLVED' | 'REJECTED'
export type ReportSource = 'EPISODE' | 'GROUP_ROOM'
export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'WITHDRAWN'
export type SuspendDuration = 'H24' | 'H72' | 'D7' | 'PERMANENT'
export type AdminActionType =
  | 'BLIND' | 'UNBLIND' | 'SCORE_FIX' | 'SUSPEND' | 'UNSUSPEND' | 'WARN'
  | 'RESOLVE_REPORT' | 'REOPEN_REPORT'

export type WarningReason = 'ABUSE' | 'SPOILER' | 'SPAM' | 'OTHER'

export interface WarningResult {
  warning: {
    id: number
    reason: WarningReason
    reasonLabel: string
    message: string
    createdAt: string
  }
  totalWarnings: number
  suspensionReviewRecommended: boolean
}

export type AdminTargetType = 'USER' | 'MESSAGE' | 'REPORT'

/** 처리(RESOLVED)에 동반된 조치. null = 단순 처리. */
export type ResolutionAction = 'BLIND' | 'SUSPEND' | 'ROOM_CLOSE'

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
  /** 채팅 출처. roomId 자체는 사적 방 열거를 막기 위해 관리 API가 내보내지 않는다. */
  source: ReportSource
  /** 신고가 가리킨 그룹방이 현재 Redis에 남아 있는지. roomId 자체는 노출하지 않는다. */
  roomActive: boolean
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
export type ResolveOutcome = 'BLIND' | 'SUSPEND' | 'ROOM_CLOSE' | 'NONE' | 'REJECTED'

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

/** 전역 조치 로그 한 행(HP-299) — 사용자 상세 이력과 달리 처리자·대상 사용자를 모두 명시한다. */
export interface AdminActionLogRow {
  id: number
  createdAt: string
  action: AdminActionType
  outcome: ResolveOutcome | null
  reason: string | null
  adminId: number
  adminName: string | null
  targetType: AdminTargetType
  targetId: string
  targetSummary: string | null
  targetUserId: number | null
  targetUserName: string | null
}

export interface AdminActor {
  id: number
  displayName: string | null
}

export interface AdminActionLogResponse {
  items: AdminActionLogRow[]
  nextCursor: string | null
  /** 현재 페이지가 아니라 전체 조치 이력에서 distinct한 처리자 선택지. */
  admins: AdminActor[]
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
  /** 누적 3회는 자동 정지가 아니라 운영자의 정지 검토 신호다. */
  warnings: { total: number; suspensionReviewRecommended: boolean }
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

/**
 * 정지 현황판 한 행(HP-300). <b>갈래(진행 중·무기한·만료됨)는 서버가 정하지 않는다</b> —
 * 만료 판정은 시각에 달려 있어, 서버와 화면이 각자 시계를 보면 같은 계정을 다르게 부른다.
 * 원수치만 받고 갈래는 {@link suspensionState} 하나가 센다.
 */
export interface SuspendedUserRow {
  userId: number
  displayName: string | null
  profileImageUrl: string | null
  status: UserStatus
  /** null = 무기한. 지난 시각이면 만료됨(자동 해제 대기) — 만료 배치가 없어 행만 남은 상태다. */
  suspendedUntil: string | null
  suspendReason: string | null
}

/** @property total 상한 적용 전 전체 수 — rows.length와 다르면 잘린 것이다(화면이 알려야 한다). */
export interface SuspendedUsers {
  rows: SuspendedUserRow[]
  total: number
}

/** 사용자 상세 진입용 검색 결과(HP-301) — 이메일은 결과에 노출하지 않는다. */
export interface UserSearchRow {
  userId: number
  displayName: string
  profileImageUrl: string | null
  status: UserStatus
}

export interface UserSearchResult {
  rows: UserSearchRow[]
}

export type ModerationReviewStage = 'PROFANITY' | 'HATE'
export type ModerationReviewDecision = 'FALSE_POSITIVE' | 'TRUE_POSITIVE'

export interface ModerationReviewRow {
  sampleId: string
  episodeId: number
  msgId: string
  userId: number | null
  displayName: string | null
  message: string
  stage: ModerationReviewStage
  category: string | null
  /** 1차 규칙은 확률값이 없어 null, 2차 kor_unsmile만 실제 선택 category 점수. */
  score: number | null
  createdAt: string
}

export interface ModerationStageCounts {
  falsePositive: number
  truePositive: number
}

export interface ModerationReviewCounts {
  profanity: ModerationStageCounts
  hate: ModerationStageCounts
  evictedPending: number
}

export interface ModerationReviewPage {
  items: ModerationReviewRow[]
  pendingTotal: number
  counts: ModerationReviewCounts
}

export interface ModerationDecisionResult {
  sampleId: string
  decision: ModerationReviewDecision
  counts: ModerationReviewCounts
}
