import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as admin from '../api/admin'
import type { FeatureFlagRow } from '../api/types'
import FeatureControlPage from './FeatureControlPage'
import { WritingProvider } from '../writing'
import { MemoryRouter } from 'react-router'

vi.mock('../api/admin')
vi.mock('../auth', () => ({ realmRoles: () => ['admin'] }))

const row = (overrides: Partial<FeatureFlagRow> = {}): FeatureFlagRow => ({
  key: 'chat.message.send.enabled', displayName: '채팅 전송',
  description: '새 공개 채팅과 답글 전송을 제어합니다.', environment: 'DEV',
  enabled: true, effectiveEnabled: true, rolloutPercentage: 100,
  expiresAt: null, owner: 'Chat', risk: 'HIGH', policyClass: 'AVAILABLE', globalOnly: false,
  dependencies: [], conflicts: [], allowlistedUserIds: [],
  revision: 3, connected: true, registryDigest: 'abcdef0123456789',
  updatedAt: '2026-08-24T03:00:00Z', activeInstances: 2, mismatchedInstances: 0,
  converged: true, lastReportedAt: '2026-08-24T03:01:00Z', ...overrides,
})

function renderPage() {
  return render(<MemoryRouter><WritingProvider><FeatureControlPage /></WritingProvider></MemoryRouter>)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(admin.listFeatureFlags).mockResolvedValue([row()])
})

describe('기능 제어 운영 화면(HP-340)', () => {
  it('저장 상태와 runtime 수렴을 같은 행에 표시한다', async () => {
    renderPage()

    expect(await screen.findByText('채팅 전송')).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'ON' })).toBeInTheDocument()
    expect(screen.getByText('2개 활성 · 불일치 0')).toBeInTheDocument()
    expect(screen.getByText('rev 3', { exact: false })).toBeInTheDocument()
  })

  it('변경은 현재 revision과 필수 사유를 보내고 성공 뒤 다시 읽는다', async () => {
    const user = userEvent.setup()
    vi.mocked(admin.changeFeatureFlag).mockResolvedValue(row({
      enabled: false, effectiveEnabled: false, revision: 4, converged: false,
    }))
    vi.mocked(admin.listFeatureFlags)
      .mockResolvedValueOnce([row()])
      .mockResolvedValueOnce([row({ enabled: false, effectiveEnabled: false, revision: 4 })])
    renderPage()

    await user.click(await screen.findByRole('button', { name: '변경' }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'OFF' }))
    await user.type(within(dialog).getByRole('textbox', { name: /변경 사유/ }), '장애 우회')
    await user.click(within(dialog).getByRole('button', { name: '변경 적용' }))

    await waitFor(() => expect(admin.changeFeatureFlag).toHaveBeenCalledWith(
      'chat.message.send.enabled', expect.objectContaining({
        enabled: false, expectedRevision: 3, reason: '장애 우회',
      }),
    ))
    expect(admin.listFeatureFlags).toHaveBeenCalledTimes(2)
  })

  it('목록 갱신에 실패하면 낡은 행의 변경을 잠근다', async () => {
    const user = userEvent.setup()
    vi.mocked(admin.listFeatureFlags)
      .mockResolvedValueOnce([row()])
      .mockRejectedValueOnce(new Error('network'))
    renderPage()

    await screen.findByText('채팅 전송')
    await user.click(screen.getByRole('button', { name: '새로고침' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('변경을 잠갔습니다')
    expect(screen.getByRole('button', { name: '변경' })).toBeDisabled()
  })

  it('전역 정책은 rollout과 allowlist를 잠그고 안전한 목표만 보낸다', async () => {
    const user = userEvent.setup()
    vi.mocked(admin.listFeatureFlags).mockResolvedValue([row({
      key: 'overlay.danmaku.enabled', displayName: '탄막 모드', owner: 'Experience & Legal',
      enabled: false, effectiveEnabled: false, rolloutPercentage: 50,
      allowlistedUserIds: [17], policyClass: 'COMPLIANCE', globalOnly: true,
    })])
    vi.mocked(admin.changeFeatureFlag).mockResolvedValue(row())
    renderPage()

    await user.click(await screen.findByRole('button', { name: '변경' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('spinbutton', { name: 'Rollout' })).toBeDisabled()
    expect(within(dialog).getByRole('textbox', { name: 'Allowlist 사용자 ID' })).toBeDisabled()
    expect(within(dialog).getByText(/모든 사용자에게 즉시 동일하게 적용/)).toBeInTheDocument()
    await user.type(within(dialog).getByRole('textbox', { name: /변경 사유/ }), '저작권 정책에 따라 기능을 전역 제어합니다')
    await user.click(within(dialog).getByRole('button', { name: '변경 적용' }))

    await waitFor(() => expect(admin.changeFeatureFlag).toHaveBeenCalledWith(
      'overlay.danmaku.enabled', expect.objectContaining({
        rolloutPercentage: 100, allowlistedUserIds: [],
      }),
    ))
  })
})
