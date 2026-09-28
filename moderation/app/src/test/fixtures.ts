import type {
  AdminActionRow, AuthorMessage, FeedbackItem, ReceivedReport, ReportItem, SuspendedUserRow,
  UserDetail,
} from '../api/types'

/** 테스트 픽스처 — BE 계약(api/types.ts) 형태의 대표값. 필요한 칸만 overrides로 바꾼다. */
export function makeReportItem(overrides: Partial<ReportItem> = {}): ReportItem {
  return {
    id: 101,
    createdAt: '2026-08-04T10:00:00Z',
    reason: 'SPOILER',
    detail: '결말을 그대로 말해요',
    status: 'OPEN',
    resolvedAction: null,
    source: 'EPISODE',
    roomActive: false,
    episodeId: 42,
    msgId: '01FIXTUREMSG0000000000000A',
    snapshotMessage: '범인은 집사다',
    snapshotDisplayName: '스포일러꾼',
    reporter: { id: 7, displayName: '신고자닉', status: 'ACTIVE', profileImageUrl: null },
    targetUser: {
      id: 9, displayName: '스포일러꾼', status: 'ACTIVE',
      profileImageUrl: 'https://cdn.example/9.png',
    },
    handledBy: null,
    handledAt: null,
    resolutionNote: null,
    currentStatus: 'visible',
    spoilerScore: 8,
    sameMessageReportCount: 1,
    openReportCount: 1,
    ...overrides,
  }
}

export function makeReceivedReport(overrides: Partial<ReceivedReport> = {}): ReceivedReport {
  return {
    id: 201,
    createdAt: '2026-08-03T09:00:00Z',
    reason: 'ABUSE',
    status: 'OPEN',
    snapshotMessage: '욕설 내용',
    reporterName: '신고자닉',
    ...overrides,
  }
}

export function makeActionRow(overrides: Partial<AdminActionRow> = {}): AdminActionRow {
  return {
    id: 301,
    createdAt: '2026-08-03T10:00:00Z',
    action: 'SUSPEND',
    reason: '도배',
    adminName: '지호',
    targetType: 'USER',
    targetId: '9',
    targetSummary: null,
    outcome: null,
    ...overrides,
  }
}

export function makeUserDetail(overrides: Partial<UserDetail> = {}): UserDetail {
  return {
    profile: {
      id: 9,
      displayName: '스포일러꾼',
      email: 'target@example.com',
      authProvider: 'keycloak',
      status: 'ACTIVE',
      suspendedUntil: null,
      suspendReason: null,
      createdAt: '2026-07-01T00:00:00Z',
      updatedAt: '2026-08-01T00:00:00Z',
      profileImageUrl: 'https://cdn.example/9.png',
    },
    reportsReceived: [makeReceivedReport()],
    actions: [makeActionRow()],
    suspensions: [makeActionRow()],
    reportsSent: { total: 0, judged: 0, rejected: 0 },
    warnings: { total: 0, suspensionReviewRecommended: false },
    ...overrides,
  }
}

export function makeAuthorMessage(overrides: Partial<AuthorMessage> = {}): AuthorMessage {
  return {
    msgId: '01FIXTUREMSG0000000000000A',
    message: '범인은 집사다',
    playbackTime: 100,
    status: 'visible',
    ...overrides,
  }
}

/**
 * 정지 현황판 한 행(HP-300). 기본값은 <b>무기한</b>이다 — 만료 시각이 든 기본값을 두면 실제
 * 시각이 그 값을 지나는 순간 픽스처의 갈래가 바뀌어, 어제 통과한 테스트가 오늘 깨진다.
 */
export function makeSuspendedRow(overrides: Partial<SuspendedUserRow> = {}): SuspendedUserRow {
  return {
    userId: 9,
    displayName: '스포일러꾼',
    profileImageUrl: null,
    status: 'SUSPENDED',
    suspendedUntil: null,
    suspendReason: '반복 스포일러',
    ...overrides,
  }
}

/**
 * 사용자 피드백 한 행(HP-426). 기본값은 <b>전 칸이 찬</b> 로그인 제출이다 — 비어 올 수 있는
 * 칸(score·category·body·user)은 그 없음이 갈래를 만드는 테스트에서만 overrides로 비운다.
 */
export function makeFeedbackItem(overrides: Partial<FeedbackItem> = {}): FeedbackItem {
  return {
    id: 12,
    surface: 'EXT',
    score: 4,
    category: 'IDEA',
    body: '자막이 한 박자 늦게 떠요',
    appVersion: '1.2.3',
    platform: 'chrome',
    contentId: 101,
    episodeId: 202,
    trigger: 'PROMPT',
    createdAt: '2026-09-16T12:53:33.830Z',
    user: { id: 7, displayName: '리플러', status: 'ACTIVE', profileImageUrl: null },
    ...overrides,
  }
}
