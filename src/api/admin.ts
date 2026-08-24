import { apiFetch, qs } from './client'
import type {
  AdminActionLogResponse, AdminActionType, AuthorMessages, ReportPage, ReportReason, ReportStatus,
  ModerationDecisionResult, ModerationReviewDecision, ModerationReviewPage, ResolutionAction,
  ModerationReviewStage, ModerationReviewView, ResolveResult, SuspendDuration, SuspendedUsers,
  SuspensionResult, UserDetail, UserSearchResult, WarningReason, WarningResult,
  EnvironmentMetadata,
  FeatureChangeSet, FeatureChangeSetCreate, FeatureControlPreset, FeatureControlPresetApply,
  FeatureDryRunRow, FeatureFlagChange, FeatureFlagRow,
  ServiceNotice, ServiceNoticeCreate,
} from './types'

/** 관리 API 래퍼(HP-226/227) — 경로·메서드를 한 곳에 모아 화면은 함수 이름만 안다. */

export function getEnvironmentMetadata(): Promise<EnvironmentMetadata> {
  return apiFetch('/api/v1/admin/meta/environment')
}

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
  }, {
    target: `신고 #${reportId}`,
    change: `OPEN → ${outcome}${action ? ` (${action})` : ''}`,
    reason: note?.trim() || '운영자 판정(별도 메모 없음)',
  })
}

/** 종결 번복 — 신고를 큐로 되돌린다(이미 OPEN이면 멱등). */
export function reopenReport(reportId: number): Promise<ResolveResult> {
  return apiFetch(`/api/v1/admin/reports/${reportId}/reopen`, { method: 'POST' }, {
    target: `신고 #${reportId}`, change: '종결 상태 → OPEN', reason: '운영자 판정 번복',
  })
}

/**
 * @param signal 일괄 가림이 <b>취소</b>를 걸 수 있게 받는다(HP-298). 취소해도 이미 서버에 닿은
 *   건은 처리될 수 있으므로, 취소 뒤에는 목록을 다시 읽어 실제 상태로 맞춘다 — 취소는 "안 나간
 *   것으로 친다"가 아니라 "더 보내지 않고 기다리기를 멈춘다"이다.
 */
export function blindMessage(
  episodeId: number, msgId: string, signal?: AbortSignal,
): Promise<{ blinded: boolean }> {
  return apiFetch(`/api/v1/admin/messages/${episodeId}/${msgId}/blind`, { method: 'POST', signal }, {
    target: `메시지 ${episodeId}:${msgId}`, change: '현재 상태 → 강제 가림',
    reason: '운영자가 신고·작성자 메시지를 검토해 선택',
  })
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
  return apiFetch(`/api/v1/admin/messages/${episodeId}/${msgId}/blind`, { method: 'DELETE' }, {
    target: `메시지 ${episodeId}:${msgId}`, change: '강제 가림 → 이전 상태 복원',
    reason: '운영자 가림 판정 번복',
  })
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
  }, {
    target: `메시지 ${episodeId}:${msgId}`, change: `스포일러 점수 → ${score}`,
    reason: '운영자 수동 점수 정정',
  })
}

export function suspendUser(
  userId: number, duration: SuspendDuration, reason: string,
): Promise<SuspensionResult> {
  return apiFetch(`/api/v1/admin/users/${userId}/suspend`, {
    method: 'POST', body: JSON.stringify({ duration, reason }),
  }, {
    target: `사용자 #${userId}`, change: `계정 정지(${duration})`, reason,
  })
}

export function unsuspendUser(userId: number): Promise<SuspensionResult> {
  return apiFetch(`/api/v1/admin/users/${userId}/suspend`, { method: 'DELETE' }, {
    target: `사용자 #${userId}`, change: 'SUSPENDED → ACTIVE', reason: '운영자 정지 해제',
  })
}

export function warnUser(
  userId: number, reason: WarningReason, note: string | null,
): Promise<WarningResult> {
  return apiFetch(`/api/v1/admin/users/${userId}/warnings`, {
    method: 'POST', body: JSON.stringify({ reason, note }),
  }, {
    target: `사용자 #${userId}`, change: `경고 발송(${reason})`,
    reason: note?.trim() || `정책 사유 ${reason}`,
  })
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

export interface ModerationReviewFilters {
  view: ModerationReviewView
  stage: ModerationReviewStage | ''
  offset: number
  size?: number
}

/** 차단 시점 표본과 최근 판정 이력. Redis 메시지 전수 탐색을 하지 않는다(HP-302/327). */
export function listModerationReviews(filters: ModerationReviewFilters): Promise<ModerationReviewPage> {
  return apiFetch(`/api/v1/admin/moderation-reviews${qs({
    view: filters.view, stage: filters.stage, offset: filters.offset, size: filters.size ?? 50,
  })}`)
}

/** 판정은 튜닝 입력만 쌓고 원 채팅 상태를 바꾸지 않는다. */
export function decideModerationReview(
  sampleId: string, decision: ModerationReviewDecision,
): Promise<ModerationDecisionResult> {
  return apiFetch(`/api/v1/admin/moderation-reviews/${encodeURIComponent(sampleId)}/decision`, {
    method: 'POST', body: JSON.stringify({ decision }),
  }, {
    target: `클린봇 표본 ${sampleId}`, change: `미판정 → ${decision}`,
    reason: '운영자 표본 판정',
  })
}

/** 현재 연결 환경의 코드 registry와 영속 override·runtime 수렴 상태. */
export function listFeatureFlags(): Promise<FeatureFlagRow[]> {
  return apiFetch('/api/v1/admin/control/flags')
}

export function changeFeatureFlag(
  key: string, change: FeatureFlagChange,
): Promise<FeatureFlagRow> {
  return apiFetch(`/api/v1/admin/control/flags/${encodeURIComponent(key)}`, {
    method: 'PATCH', body: JSON.stringify(change),
  }, {
    target: `기능 플래그 ${key}`,
    change: `${change.enabled ? 'ON' : 'OFF'} · rollout ${change.rolloutPercentage}%`,
    reason: change.reason,
  })
}

export function listFeatureChangeSets(): Promise<FeatureChangeSet[]> {
  return apiFetch('/api/v1/admin/control/change-sets')
}

export function getFeatureChangeSet(id: number): Promise<FeatureChangeSet> {
  return apiFetch(`/api/v1/admin/control/change-sets/${id}`)
}

export function createFeatureChangeSet(change: FeatureChangeSetCreate): Promise<FeatureChangeSet> {
  return apiFetch('/api/v1/admin/control/change-sets', {
    method: 'POST', body: JSON.stringify(change),
  }, {
    target: `기능 변경 세트 ${change.title}`, change: `초안 생성 · ${change.items.length}개 플래그`,
    reason: change.purpose,
  })
}

function changeSetWorkflow(id: number, action: string, version: number, reason: string) {
  return apiFetch<FeatureChangeSet>(`/api/v1/admin/control/change-sets/${id}/${action}`, {
    method: 'POST', body: JSON.stringify({ expectedVersion: version, reason }),
  }, { target: `기능 변경 세트 #${id}`, change: action, reason })
}

export const requestFeatureChangeReview = (id: number, version: number, reason: string) =>
  changeSetWorkflow(id, 'request-review', version, reason)
export const approveFeatureChangeSet = (id: number, version: number, reason: string) =>
  changeSetWorkflow(id, 'approve', version, reason)
export const rejectFeatureChangeSet = (id: number, version: number, reason: string) =>
  changeSetWorkflow(id, 'reject', version, reason)
export const applyFeatureChangeSet = (id: number, version: number, reason: string) =>
  changeSetWorkflow(id, 'apply', version, reason)
export const cancelFeatureChangeSet = (id: number, version: number, reason: string) =>
  changeSetWorkflow(id, 'cancel', version, reason)

export function scheduleFeatureChangeSet(
  id: number, version: number, scheduledAt: string, reason: string,
): Promise<FeatureChangeSet> {
  return apiFetch(`/api/v1/admin/control/change-sets/${id}/schedule`, {
    method: 'POST', body: JSON.stringify({ expectedVersion: version, scheduledAt, reason }),
  }, { target: `기능 변경 세트 #${id}`, change: `예약 → ${scheduledAt}`, reason })
}

export function rollbackFeatureChangeSet(
  id: number, version: number, safetyExpiresAt: string | null, reason: string,
): Promise<FeatureChangeSet> {
  return apiFetch(`/api/v1/admin/control/change-sets/${id}/rollback`, {
    method: 'POST', body: JSON.stringify({ expectedVersion: version, safetyExpiresAt, reason }),
  }, { target: `기능 변경 세트 #${id}`, change: '롤백 초안 생성', reason })
}

export function dryRunFeatureChangeSet(id: number, userIds: number[]): Promise<FeatureDryRunRow[]> {
  return apiFetch(`/api/v1/admin/control/change-sets/${id}/dry-run`, {
    method: 'POST', body: JSON.stringify({ userIds }),
  })
}

export function listFeatureControlPresets(): Promise<FeatureControlPreset[]> {
  return apiFetch('/api/v1/admin/control/presets')
}

export function createPresetChangeSet(
  preset: FeatureControlPreset, request: FeatureControlPresetApply,
): Promise<FeatureChangeSet> {
  return apiFetch(`/api/v1/admin/control/presets/${preset.id}`, {
    method: 'POST', body: JSON.stringify(request),
  }, {
    target: `기능 제어 프리셋 ${preset.displayName}`,
    change: `변경 세트 초안 생성 · ${preset.targets.length}개 플래그`, reason: request.reason,
  })
}

export function listServiceNotices(): Promise<ServiceNotice[]> {
  return apiFetch('/api/v1/admin/control/notices')
}

export function getServiceNotice(id: number): Promise<ServiceNotice> {
  return apiFetch(`/api/v1/admin/control/notices/${id}`)
}

export function createServiceNotice(notice: ServiceNoticeCreate): Promise<ServiceNotice> {
  return apiFetch('/api/v1/admin/control/notices', {
    method: 'POST', body: JSON.stringify(notice),
  }, { target: `사용자 공지 ${notice.title}`, change: '초안 생성', reason: notice.internalNote })
}

function noticeWorkflow(id: number, action: string, version: number, reason: string) {
  return apiFetch<ServiceNotice>(`/api/v1/admin/control/notices/${id}/${action}`, {
    method: 'POST', body: JSON.stringify({ expectedVersion: version, reason }),
  }, { target: `사용자 공지 #${id}`, change: action, reason })
}

export const publishServiceNotice = (id: number, version: number, reason: string) =>
  noticeWorkflow(id, 'publish', version, reason)
export const endServiceNotice = (id: number, version: number, reason: string) =>
  noticeWorkflow(id, 'end', version, reason)
export const cancelServiceNotice = (id: number, version: number, reason: string) =>
  noticeWorkflow(id, 'cancel', version, reason)

export function scheduleServiceNotice(
  id: number, version: number, startsAt: string, endsAt: string | null, reason: string,
): Promise<ServiceNotice> {
  return apiFetch(`/api/v1/admin/control/notices/${id}/schedule`, {
    method: 'POST', body: JSON.stringify({ expectedVersion: version, startsAt, endsAt, reason }),
  }, { target: `사용자 공지 #${id}`, change: `예약 게시 → ${startsAt}`, reason })
}
