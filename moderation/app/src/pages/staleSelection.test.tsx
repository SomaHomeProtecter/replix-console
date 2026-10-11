import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as admin from '../api/admin'
import type { FeatureChangeSet, FeatureFlagRow, Incident, OperationCaseDetail, OperationCaseRow, ServiceNotice, CleanbotPolicy, CleanbotSimulation } from '../api/types'
import { WritingProvider } from '@core/writing'
import FeatureChangeSetPage from './FeatureChangeSetPage'
import CleanbotPolicyPage from './CleanbotPolicyPage'
import IncidentModePage from './IncidentModePage'
import ServiceNoticePage from './ServiceNoticePage'
import OperationCasesPage from './OperationCasesPage'

vi.mock('../api/admin')

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

const flag = {
  key: 'chat.message.send.enabled', displayName: '채팅 전송', description: '', environment: 'DEV', enabled: true,
  effectiveEnabled: true, rolloutPercentage: 100, expiresAt: null, owner: 'Chat', risk: 'HIGH', policyClass: 'AVAILABLE',
  globalOnly: false, dependencies: [], conflicts: [], allowlistedUserIds: [], revision: 3, connected: true,
  registryDigest: 'abc', updatedAt: '2026-08-24T00:00:00Z', activeInstances: 2, mismatchedInstances: 0, converged: true,
  lastReportedAt: '2026-08-24T00:00:00Z',
} as unknown as FeatureFlagRow

const makeSet = (id: number, title: string) => ({
  id, environment: 'DEV', title, purpose: '목적', jiraReference: null, incidentReference: null, status: 'DRAFT',
  risk: 'HIGH', version: 0, createdByUserId: 11, approvedByUserId: null, scheduledByUserId: null,
  rollbackOfChangeSetId: null, autoRollbackEnabled: false, verificationWindowSeconds: 60, approvalExpiresAt: null,
  requestedAt: null, approvedAt: null, scheduledAt: null, appliedAt: null, verificationDueAt: null,
  verificationCompletedAt: null, failureCode: null, createdAt: '2026-08-24T00:00:00Z', updatedAt: '2026-08-24T00:00:00Z',
  findings: [], items: [], events: [],
}) as unknown as FeatureChangeSet

/*
 * 고른 행을 늦은 응답이 덮지 않는다(HP-527, 2026-10-12 독립 리뷰가 재현한 결함의 회귀 테스트). 덮이면 운영자가 보는 상세와
 * 그 위의 승인·적용·저장 대상이 어긋난다.
 */
describe('새로고침 중 고른 행 — 목록 응답 뒤에도 고른 행이 남는다', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('변경 세트: A를 본 채 새로고침 → 목록 응답 전 B를 고름 → 목록 응답 뒤에도 B가 남는다', async () => {
    const user = userEvent.setup()
    const A = makeSet(7, '세트 A'); const B = makeSet(8, '세트 B')
    vi.mocked(admin.listFeatureChangeSets).mockResolvedValue([A, B])
    vi.mocked(admin.listFeatureFlags).mockResolvedValue([flag])
    vi.mocked(admin.getFeatureChangeSet).mockImplementation(async (id: number) => (id === 7 ? A : B))
    render(<MemoryRouter initialEntries={['/feature-control/change-sets']}><WritingProvider><FeatureChangeSetPage /></WritingProvider></MemoryRouter>)
    await user.click(await screen.findByText('세트 A'))
    expect(await screen.findByRole('complementary', { name: '변경 세트 #7 상세' })).toBeInTheDocument()

    // 새로고침 — 목록 응답을 붙잡아 둔다
    const list = deferred<FeatureChangeSet[]>()
    vi.mocked(admin.listFeatureChangeSets).mockReturnValueOnce(list.promise)
    await user.click(screen.getAllByRole('button', { name: '새로고침' })[0]!) // 화면 머리의 새로고침
    // 그사이 운영자가 B를 고른다 — B 상세가 뜬다
    await user.click(screen.getByText('세트 B'))
    expect(await screen.findByRole('complementary', { name: '변경 세트 #8 상세' })).toBeInTheDocument()
    // 목록 응답 도착
    await act(async () => { list.resolve([A, B]) })
    await new Promise((r) => setTimeout(r, 50))
    // 기대: 운영자가 마지막에 고른 B가 남는다
    expect(screen.queryByRole('complementary', { name: '변경 세트 #8 상세' })).toBeInTheDocument()
  })

  it('변경 세트: B 상세를 읽는 중에 목록 응답이 먼저 와도, 다시 열기가 B를 밀어내지 않는다', async () => {
    const user = userEvent.setup()
    const A = makeSet(7, '세트 A'); const B = makeSet(8, '세트 B')
    vi.mocked(admin.listFeatureChangeSets).mockResolvedValue([A, B])
    vi.mocked(admin.listFeatureFlags).mockResolvedValue([flag])
    vi.mocked(admin.getFeatureChangeSet).mockImplementation(async (id: number) => (id === 7 ? A : B))
    render(<MemoryRouter initialEntries={['/feature-control/change-sets']}><WritingProvider><FeatureChangeSetPage /></WritingProvider></MemoryRouter>)
    await user.click(await screen.findByText('세트 A'))
    expect(await screen.findByRole('complementary', { name: '변경 세트 #7 상세' })).toBeInTheDocument()

    const list = deferred<FeatureChangeSet[]>()
    const detailB = deferred<FeatureChangeSet>()
    vi.mocked(admin.listFeatureChangeSets).mockReturnValueOnce(list.promise)
    vi.mocked(admin.getFeatureChangeSet).mockImplementation((id: number) => (id === 8 ? detailB.promise : Promise.resolve(A)))
    await user.click(screen.getAllByRole('button', { name: '새로고침' })[0]!)
    await user.click(screen.getByText('세트 B')) // B 상세는 아직 오지 않았다 — 화면은 아직 A
    await act(async () => { list.resolve([A, B]) }) // 목록이 먼저 온다
    await act(async () => { detailB.resolve(B) })
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.getByRole('complementary', { name: '변경 세트 #8 상세' })).toBeInTheDocument()
  })

  it('공지: B 상세를 읽는 중에 목록 응답이 먼저 와도, 다시 열기가 B를 밀어내지 않는다', async () => {
    const user = userEvent.setup()
    const base = { environment: 'DEV', kind: 'MAINTENANCE', publicMessage: '안내', internalNote: '내부 메모입니다 충분히 깁니다',
      status: 'DRAFT', linkedChangeSetId: null, presetId: null, jiraReference: null, incidentReference: null, linkUrl: null,
      version: 0, createdByUserId: 3, publishedByUserId: null, endedByUserId: null, startsAt: null, endsAt: null,
      publishedAt: null, endedAt: null, createdAt: '2026-08-24T00:00:00Z', updatedAt: '2026-08-24T00:00:00Z', events: [] }
    const A = { ...base, id: 31, title: '공지 A' } as unknown as ServiceNotice
    const B = { ...base, id: 32, title: '공지 B' } as unknown as ServiceNotice
    vi.mocked(admin.listServiceNotices).mockResolvedValue([A, B])
    vi.mocked(admin.getServiceNotice).mockImplementation(async (id: number) => (id === 31 ? A : B))
    render(<MemoryRouter initialEntries={['/feature-control/notices']}><WritingProvider><ServiceNoticePage /></WritingProvider></MemoryRouter>)
    await user.click(await screen.findByText('공지 A'))
    expect(await screen.findByRole('heading', { level: 2, name: '공지 A' })).toBeInTheDocument()

    const list = deferred<ServiceNotice[]>()
    const detailB = deferred<ServiceNotice>()
    vi.mocked(admin.listServiceNotices).mockReturnValueOnce(list.promise)
    vi.mocked(admin.getServiceNotice).mockImplementation((id: number) => (id === 32 ? detailB.promise : Promise.resolve(A)))
    await user.click(screen.getAllByRole('button', { name: '새로고침' })[0]!)
    await user.click(screen.getByText('공지 B'))
    await act(async () => { list.resolve([A, B]) })
    await act(async () => { detailB.resolve(B) })
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.getByRole('heading', { level: 2, name: '공지 B' })).toBeInTheDocument()
  })

  it('인시던트: A에 메모를 남기는 사이 B를 고르면, 메모 뒤 다시 읽기가 A로 되돌리지 않는다', async () => {
    const user = userEvent.setup()
    const base = { environment: 'DEV', severity: 'SEV2', status: 'INVESTIGATING', primary: false, impactSummary: '영향',
      ownerUserId: null, nextUpdateAt: null, observationMetrics: null, successCriteria: null, monitoringEndsAt: null,
      recoveryRevisions: null, impactEndedAt: null, residualRisk: null, followUpJira: null, version: 1, createdByUserId: 3,
      createdAt: '2026-08-25T00:00:00Z', updatedAt: '2026-08-25T00:00:00Z', events: [] }
    const A = { ...base, id: 1, reference: 'INC-A', title: '인시던트 A' } as unknown as Incident
    const B = { ...base, id: 2, reference: 'INC-B', title: '인시던트 B' } as unknown as Incident
    vi.mocked(admin.listIncidents).mockResolvedValue([A, B])
    vi.mocked(admin.getIncident).mockImplementation(async (id: number) => (id === 1 ? A : B))
    render(<MemoryRouter><WritingProvider><IncidentModePage /></WritingProvider></MemoryRouter>)
    await user.click(await screen.findByText('인시던트 A'))
    const note = deferred<unknown>()
    vi.mocked(admin.addIncidentNote).mockReturnValueOnce(note.promise as never)
    const detailA = await screen.findByRole('complementary', { name: '인시던트 INC-A 상세' })
    await user.type(within(detailA).getByRole('textbox'), '원인 확인 중입니다')
    await user.click(within(detailA).getByRole('button', { name: /메모/ }))
    await user.click(screen.getByText('인시던트 B'))
    expect(await screen.findByRole('complementary', { name: '인시던트 INC-B 상세' })).toBeInTheDocument()
    await act(async () => { note.resolve(A) })
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.getByRole('complementary', { name: '인시던트 INC-B 상세' })).toBeInTheDocument()
  })
})

describe('운영 협업 — 저장 응답이 그사이 고른 다른 케이스를 덮지 않는다', () => {
  beforeEach(() => { vi.clearAllMocks() })

  const row = (reportId: number) => ({
    reportId, messagePreview: `미리보기 ${reportId}`, assignee: null, overdue: false, stale: false, reviewRequested: false,
  }) as unknown as OperationCaseRow
  const detail = (reportId: number, version = 1) => ({
    item: { reportId, version, assignee: null, dueAt: null, stale: false, overdue: false,
      targetUser: { id: 1, displayName: `대상${reportId}` }, reason: 'SPAM', createdAt: '2026-08-24T00:00:00Z' },
    notes: [], events: [],
  }) as unknown as OperationCaseDetail

  it('A에 담당 저장을 보낸 뒤 B를 열면, A 저장 응답이 와도 B가 남는다', async () => {
    const user = userEvent.setup()
    vi.mocked(admin.listOperationCases).mockResolvedValue({ items: [row(1), row(2)], workloads: [], truncated: false } as never)
    vi.mocked(admin.getOperationCase).mockImplementation(async (id: number) => detail(id))
    render(<MemoryRouter initialEntries={['/operation-cases']}><OperationCasesPage /></MemoryRouter>)
    await user.click(await screen.findByText('신고 #1'))
    const aside = await screen.findByRole('complementary', { name: '케이스 상세' })
    await within(aside).findByRole('heading', { name: '신고 #1' })

    const save = deferred<OperationCaseDetail>()
    vi.mocked(admin.assignOperationCase).mockReturnValueOnce(save.promise)
    await user.type(within(aside).getByRole('textbox', { name: '배정·인계 사유' }), '담당 변경')
    await user.click(within(aside).getByRole('button', { name: '담당·기한 저장' }))
    // 저장 응답 전에 B를 고른다
    await user.click(screen.getByText('신고 #2'))
    await within(aside).findByRole('heading', { name: '신고 #2' })
    await act(async () => { save.resolve(detail(1, 2)) })
    await new Promise((r) => setTimeout(r, 50))
    // 기대: 운영자가 마지막에 고른 B가 남는다
    expect(within(aside).getByRole('heading', { level: 2 })).toHaveTextContent('신고 #2')
  })
})

describe('클린봇 정책 — dry-run 결과가 그사이 고른 다른 정책에 붙지 않는다', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('A의 dry-run을 보낸 뒤 B를 고르면, A의 결과가 와도 B 화면에 나오지 않는다', async () => {
    const user = userEvent.setup()
    const base = { status: 'DRAFT', blockedTerms: ['욕설'], allowedTerms: [], threshold: 0.7, categoryMapping: {},
      basePolicyId: null, activatedChangeSetId: null, revision: 0, createdBy: { id: 2, displayName: '작성자' },
      reviewedBy: null, approvedBy: null, activatedBy: null, createdAt: '2026-08-25T00:00:00Z',
      updatedAt: '2026-08-25T00:00:00Z', activatedAt: null }
    const A = { ...base, id: 1, name: '정책 A' } as unknown as CleanbotPolicy
    const B = { ...base, id: 2, name: '정책 B' } as unknown as CleanbotPolicy
    vi.mocked(admin.listCleanbotPolicies).mockResolvedValue([A, B])
    const run = deferred<CleanbotSimulation>()
    vi.mocked(admin.simulateCleanbotPolicy).mockReturnValueOnce(run.promise)
    render(<CleanbotPolicyPage />)
    await user.click(await screen.findByText('정책 A'))
    await user.click(screen.getByRole('button', { name: '표본 dry-run' }))
    await user.click(screen.getByText('정책 B'))
    await act(async () => { run.resolve({ id: 3, policyId: 1, sampleCount: 20, newlyBlocked: 4, newlyAllowed: 0, unchanged: 16,
      failures: 0, sampleLimit: 100, samples: [], limitation: '최근 14일 표본', createdAt: '2026-08-25T00:01:00Z' } as unknown as CleanbotSimulation) })
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.getByRole('heading', { level: 2, name: '정책 B' })).toBeInTheDocument()
    expect(screen.queryByText(/신규 차단 4/)).not.toBeInTheDocument()
  })
})
