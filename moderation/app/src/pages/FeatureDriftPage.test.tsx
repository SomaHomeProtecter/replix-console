import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as admin from '../api/admin'
import type { FeatureChangeSet, FeatureDriftState } from '../api/types'
import { WritingProvider } from '../writing'
import FeatureDriftPage from './FeatureDriftPage'

vi.mock('../api/admin')
vi.mock('../auth', () => ({ realmRoles: () => ['admin'] }))

const drift: FeatureDriftState = {
  flagKey: 'chat.message.send.enabled', displayName: '채팅 전송', status: 'DRIFT',
  desiredRevision: 7, activeInstances: 2, mismatchedInstances: 1,
  lastReportedAt: '2026-08-24T00:00:00Z', observationChangeSetId: null,
  observationDueAt: null, recommendedActions: ['CREATE_REAPPLY_DRAFT', 'CHECK_DEPLOYED_REVISION'],
}
const stale: FeatureDriftState = {
  ...drift, flagKey: 'report.submit.enabled', displayName: '신고 접수', status: 'STALE',
  activeInstances: 0, mismatchedInstances: 0, recommendedActions: ['CHECK_RUNTIME_INSTANCES'],
}
const created: FeatureChangeSet = {
  id: 41, environment: 'DEV', title: '[DRIFT] 채팅 전송 재적용',
  purpose: 'runtime drift를 새 revision으로 복구합니다', jiraReference: 'HP-343',
  incidentReference: 'INC-DRIFT', status: 'DRAFT', risk: 'HIGH', version: 0,
  createdByUserId: 3, approvedByUserId: null, scheduledByUserId: null,
  rollbackOfChangeSetId: null, autoRollbackEnabled: true, verificationWindowSeconds: 60,
  approvalExpiresAt: null, requestedAt: null, approvedAt: null, scheduledAt: null,
  appliedAt: null, verificationDueAt: null, verificationCompletedAt: null, failureCode: null,
  createdAt: '2026-08-24T00:00:00Z', updatedAt: '2026-08-24T00:00:00Z',
  items: [], events: [], findings: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(admin.listFeatureDrift).mockResolvedValue([drift, stale])
})

function renderPage() {
  return render(<MemoryRouter initialEntries={['/feature-control/drift']}>
    <WritingProvider><FeatureDriftPage /></WritingProvider>
  </MemoryRouter>)
}

describe('runtime drift 해소 화면(HP-343)', () => {
  it('실제 drift와 stale의 권장 조치를 구분해 보여준다', async () => {
    renderPage()
    expect(await screen.findByText('Drift')).toBeInTheDocument()
    expect(screen.getByText('Stale')).toBeInTheDocument()
    expect(screen.getByText('원하는 revision 재적용')).toBeInTheDocument()
    expect(screen.getByText('runtime 인스턴스 확인')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: '재적용 초안' })).toHaveLength(1)
  })

  it('실제 drift만 사유와 인시던트를 담은 재적용 초안으로 연결한다', async () => {
    const user = userEvent.setup()
    vi.mocked(admin.createDriftReapplyChangeSet).mockResolvedValue(created)
    renderPage()
    await user.click(await screen.findByRole('button', { name: '재적용 초안' }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByRole('textbox', { name: /복구 사유/ }),
      'runtime drift를 새 revision으로 복구합니다')
    await user.type(within(dialog).getByRole('textbox', { name: '인시던트' }), 'INC-DRIFT')
    await user.click(within(dialog).getByRole('button', { name: '재적용 초안 생성' }))

    await waitFor(() => expect(admin.createDriftReapplyChangeSet).toHaveBeenCalledWith(drift,
      expect.objectContaining({ reason: 'runtime drift를 새 revision으로 복구합니다',
        jiraReference: 'HP-343', incidentReference: 'INC-DRIFT', autoRollbackEnabled: true })))
    expect(await screen.findByRole('link', { name: '변경 세트 열기' }))
      .toHaveAttribute('href', '/feature-control/change-sets?selected=41')
  })
})
