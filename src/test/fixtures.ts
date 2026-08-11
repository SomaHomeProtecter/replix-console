import type {
  AdminActionRow, AuthorMessage, ReceivedReport, ReportItem, UserDetail,
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
    ...overrides,
  }
}

export function makeAuthorMessage(overrides: Partial<AuthorMessage> = {}): AuthorMessage {
  return {
    msgId: '01FIXTUREMSG0000000000000A',
    message: '범인은 집사다',
    playbackTime: 100,
    status: 'visible',
    spoilerScore: 8,
    ...overrides,
  }
}
