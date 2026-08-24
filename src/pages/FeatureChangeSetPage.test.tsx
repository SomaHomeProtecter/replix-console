import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as admin from '../api/admin'
import type { FeatureChangeSet, FeatureFlagRow } from '../api/types'
import { WritingProvider } from '../writing'
import FeatureChangeSetPage from './FeatureChangeSetPage'

vi.mock('../api/admin')
vi.mock('../auth', () => ({ realmRoles: () => ['admin'] }))

const flag: FeatureFlagRow = {
  key: 'chat.message.send.enabled', displayName: '채팅 전송', description: '채팅 제어',
  environment: 'DEV', enabled: true, effectiveEnabled: true, rolloutPercentage: 100,
  expiresAt: null, owner: 'Chat', risk: 'HIGH', dependencies: [], conflicts: [],
  allowlistedUserIds: [], revision: 3, connected: true, registryDigest: 'abc',
  updatedAt: '2026-08-24T00:00:00Z', activeInstances: 2, mismatchedInstances: 0,
  converged: true, lastReportedAt: '2026-08-24T00:00:00Z',
}

const changeSet: FeatureChangeSet = {
  id: 7, environment: 'DEV', title: '채팅 점진 적용', purpose: '채팅 전송을 점진적으로 적용합니다',
  jiraReference: 'HP-343', incidentReference: null, status: 'DRAFT', risk: 'HIGH', version: 0,
  createdByUserId: 11, approvedByUserId: null, scheduledByUserId: null,
  rollbackOfChangeSetId: null, autoRollbackEnabled: true, verificationWindowSeconds: 60,
  approvalExpiresAt: null, requestedAt: null, approvedAt: null,
  scheduledAt: null, appliedAt: null, verificationDueAt: null,
  verificationCompletedAt: null, failureCode: null, createdAt: '2026-08-24T00:00:00Z',
  updatedAt: '2026-08-24T00:00:00Z', items: [{
    id: 1, sequence: 0, flagKey: flag.key, expectedRevision: 3,
    beforeState: JSON.stringify({ enabled: true, rolloutPercentage: 100 }),
    targetEnabled: true, targetRolloutPercentage: 25, targetExpiresAt: null,
    targetOwner: 'Chat', targetAllowlistedUserIds: [], appliedRevision: null, resultCode: null,
  }], events: [{ id: 1, type: 'CREATED', actorUserId: 11,
    reason: '채팅 전송을 점진적으로 적용합니다', payload: '{}', createdAt: '2026-08-24T00:00:00Z' }],
}

function renderPage() {
  return render(<MemoryRouter initialEntries={['/feature-control/change-sets']}>
    <WritingProvider><FeatureChangeSetPage /></WritingProvider>
  </MemoryRouter>)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(admin.listFeatureChangeSets).mockResolvedValue([{ ...changeSet, events: [] }])
  vi.mocked(admin.listFeatureFlags).mockResolvedValue([flag])
  vi.mocked(admin.getFeatureChangeSet).mockResolvedValue(changeSet)
})

describe('기능 변경 세트 화면(HP-343)', () => {
  it('목록에서 상세를 열어 diff와 불변 이벤트를 함께 보여준다', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByText('채팅 점진 적용'))

    expect(await screen.findByRole('complementary', { name: '변경 세트 #7 상세' })).toBeInTheDocument()
    expect(screen.getByText('ON · 100%')).toBeInTheDocument()
    expect(screen.getByText('ON · 25%')).toBeInTheDocument()
    expect(screen.getByText('CREATED')).toBeInTheDocument()
  })

  it('여러 기능을 고를 수 있는 초안에서 rollout 프리셋을 API 계약으로 보낸다', async () => {
    const user = userEvent.setup()
    vi.mocked(admin.createFeatureChangeSet).mockResolvedValue(changeSet)
    renderPage()
    await user.click(await screen.findByRole('button', { name: '새 변경 세트' }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByRole('textbox', { name: '제목' }), '채팅 점진 적용')
    await user.type(within(dialog).getByRole('textbox', { name: /변경 목적/ }), '채팅 기능을 일부 사용자부터 적용합니다')
    await user.click(within(dialog).getByRole('checkbox', { name: /채팅 전송/ }))
    await user.click(within(dialog).getByRole('button', { name: '25%' }))
    await user.click(within(dialog).getByRole('button', { name: '초안 생성 (1)' }))

    await waitFor(() => expect(admin.createFeatureChangeSet).toHaveBeenCalledWith(expect.objectContaining({
      title: '채팅 점진 적용', items: [expect.objectContaining({
        flagKey: flag.key, rolloutPercentage: 25, expectedRevision: 3,
      })],
    })))
  })
})
