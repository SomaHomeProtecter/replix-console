import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as admin from '../api/admin'
import type { FeatureChangeSet, FeatureControlPreset } from '../api/types'
import { WritingProvider } from '../writing'
import FeatureControlPresetPage from './FeatureControlPresetPage'

vi.mock('../api/admin')
vi.mock('../auth', () => ({ realmRoles: () => ['admin'] }))

const preset: FeatureControlPreset = {
  id: 'CHAT_BLOCK', displayName: '채팅 차단', description: '새 채팅을 중지합니다.',
  risk: 'HIGH', requiresExpiry: true, targets: [{
    flagKey: 'chat.message.send.enabled', displayName: '채팅 전송', enabled: false,
    rolloutPercentage: 100,
  }],
}

const created: FeatureChangeSet = {
  id: 17, environment: 'DEV', title: '[프리셋] 채팅 차단',
  purpose: '채팅 장애 확산을 방지하는 프리셋입니다', jiraReference: 'HP-343',
  incidentReference: null, status: 'DRAFT', risk: 'HIGH', version: 0,
  createdByUserId: 3, approvedByUserId: null, scheduledByUserId: null,
  rollbackOfChangeSetId: null, autoRollbackEnabled: true, verificationWindowSeconds: 60,
  approvalExpiresAt: null, requestedAt: null, approvedAt: null, scheduledAt: null,
  appliedAt: null, verificationDueAt: null, verificationCompletedAt: null, failureCode: null,
  createdAt: '2026-08-24T00:00:00Z', updatedAt: '2026-08-24T00:00:00Z', items: [], events: [], findings: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(admin.listFeatureControlPresets).mockResolvedValue([preset])
})

function renderPage() {
  return render(<MemoryRouter initialEntries={['/feature-control/presets']}>
    <WritingProvider><FeatureControlPresetPage /></WritingProvider>
  </MemoryRouter>)
}

describe('장애 대응 프리셋 화면(HP-343)', () => {
  it('대상 플래그와 변경값을 카드에서 먼저 보여준다', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: '채팅 차단' })).toBeInTheDocument()
    expect(screen.getByText('chat.message.send.enabled')).toBeInTheDocument()
    expect(screen.getByText('OFF · 100%')).toBeInTheDocument()
  })

  it('사유와 안전 정책으로 변경 세트 초안만 만든 뒤 상세 링크를 제공한다', async () => {
    const user = userEvent.setup()
    vi.mocked(admin.createPresetChangeSet).mockResolvedValue(created)
    renderPage()
    await user.click(await screen.findByRole('button', { name: '초안 만들기' }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByRole('textbox', { name: /적용 사유/ }),
      '채팅 장애 확산을 방지하는 프리셋입니다')
    await user.click(within(dialog).getByRole('button', { name: '변경 세트 초안 생성' }))

    await waitFor(() => expect(admin.createPresetChangeSet).toHaveBeenCalledWith(preset,
      expect.objectContaining({
        reason: '채팅 장애 확산을 방지하는 프리셋입니다', jiraReference: 'HP-343',
        autoRollbackEnabled: true, verificationWindowSeconds: 60,
      })))
    expect(await screen.findByRole('link', { name: '변경 세트 열기' }))
      .toHaveAttribute('href', '/feature-control/change-sets?selected=17')
  })
})
