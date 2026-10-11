import type {
  CaseNoteType, CleanbotPolicyStatus, FeatureChangeSetStatus, FeatureRisk, IncidentResourceType, IncidentStatus,
  ServiceNoticeStatus,
} from './api/types'

/*
 * 나중에 만든 조치 화면(기능 제어 계열·인시던트·운영 협업·클린봇 정책)의 영문 기록 이름을 한글로(HP-527). 값은 서버
 * enum과 같다(FeatureChangeSetEventType·ServiceNoticeEventType·IncidentEventType·CaseEventType). 모르는 값이 오면
 * — 서버가 먼저 늘린 경우 — 원문을 그대로 보인다: 빈칸보다 낫고, 화면이 깨지지 않는다.
 */
const label = (table: Readonly<Record<string, string>>) => (value: string): string => table[value] ?? value

export const changeSetEventLabel = label({
  CREATED: '생성', UPDATED: '수정', REVIEW_REQUESTED: '검토 요청', APPROVED: '승인', REJECTED: '반려',
  SCHEDULED: '예약', SCHEDULE_FAILED: '예약 실패', VERIFICATION_SUCCEEDED: '적용 확인',
  AUTO_ROLLBACK_TRIGGERED: '자동 롤백 시작', APPLY_STARTED: '적용 시작', APPLY_SUCCEEDED: '적용 완료',
  APPLY_PARTIALLY_FAILED: '일부 적용 실패', APPLY_FAILED: '적용 실패', ROLLBACK_CREATED: '롤백 생성',
  ROLLBACK_STARTED: '롤백 시작', ROLLBACK_SUCCEEDED: '롤백 완료', ROLLBACK_FAILED: '롤백 실패', CANCELLED: '취소',
})

export const noticeEventLabel = label({
  CREATED: '생성', UPDATED: '수정', SCHEDULED: '예약', PUBLISHED: '게시', ENDED: '종료', CANCELLED: '취소',
})

export const incidentEventLabel = label({
  DECLARED: '선언', DETAILS_UPDATED: '정보 수정', STATUS_CHANGED: '상태 변경', NOTE_ADDED: '메모',
  RESOURCE_LINKED: '리소스 연결', RESOLVED: '해결', CANCELLED: '취소', REOPENED: '재개',
})

export const caseEventLabel = label({
  WORKSPACE_CREATED: '케이스 생성', ASSIGNEE_CHANGED: '담당 변경', DUE_AT_CHANGED: '기한 변경',
  INTERNAL_NOTE_ADDED: '내부 메모', HANDOFF_ADDED: '인수인계', REVIEW_REQUESTED: '재검토 요청',
})

export const CASE_NOTE_LABELS: Readonly<Record<CaseNoteType, string>> = {
  INTERNAL: '내부 메모', HANDOFF: '인수인계', REVIEW_REQUEST: '재검토 요청',
}

/** 변경 세트·공지의 상태 표와 같은 말을 쓴다(초안·검토 요청·승인됨). */
export const CLEANBOT_STATUS_LABELS: Readonly<Record<CleanbotPolicyStatus, string>> = {
  DRAFT: '초안', REVIEW_REQUESTED: '검토 요청', APPROVED: '승인됨', ACTIVE: '활성', RETIRED: '폐기',
}

/** 기능·프리셋의 위험도. */
export const RISK_LABELS: Readonly<Record<FeatureRisk, string>> = { MEDIUM: '위험 보통', HIGH: '위험 높음' }

/* 상태 표 — 각 화면에 따로 있던 것을 모았다. 통합 타임라인이 세 종류의 기록을 한 줄에 섞어 보이므로 함께 쓴다. */
export const CHANGE_SET_STATUS_LABELS: Readonly<Record<FeatureChangeSetStatus, string>> = {
  DRAFT: '초안', REVIEW_REQUESTED: '검토 요청', APPROVED: '승인됨', REJECTED: '반려',
  SCHEDULED: '예약됨', RUNNING: '적용 중', SUCCEEDED: '적용 완료',
  PARTIALLY_FAILED: '일부 실패', FAILED: '실패', ROLLED_BACK: '롤백 완료', CANCELLED: '취소',
}
export const NOTICE_STATUS_LABELS: Readonly<Record<ServiceNoticeStatus, string>> = {
  DRAFT: '초안', SCHEDULED: '예약됨', PUBLISHED: '게시 중', ENDED: '종료', CANCELLED: '취소',
}
export const INCIDENT_STATUS_LABELS: Readonly<Record<IncidentStatus, string>> = {
  DECLARED: '선언', INVESTIGATING: '조사', MITIGATING: '완화', MONITORING: '관찰', RESOLVED: '해결', CANCELLED: '취소',
}
export const INCIDENT_RESOURCE_LABELS: Readonly<Record<IncidentResourceType, string>> = {
  CHANGE_SET: '변경 세트', NOTICE: '사용자 공지', PRESET: '장애 대응 프리셋',
  RUNBOOK: '런북', DASHBOARD: '대시보드', JIRA: 'Jira',
}
