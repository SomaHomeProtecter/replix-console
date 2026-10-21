import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as admin from '../api/admin'
import { realmRoles } from '@core/auth'
import type { CleanbotPolicy } from '../api/types'
import CleanbotPolicyPage from './CleanbotPolicyPage'

vi.mock('../api/admin')
vi.mock('@core/env', () => ({ env: { environment: 'DEV' } }))
const policy: CleanbotPolicy = { id: 1, name: '정책 후보 A', status: 'DRAFT', blockedTerms: ['욕설'],
  allowedTerms: ['욕설연구'], threshold: 0.7, categoryMapping: {}, basePolicyId: null,
  activatedChangeSetId: null, revision: 0, createdBy: { id: 2, displayName: '작성자' }, reviewedBy: null,
  approvedBy: null, activatedBy: null, createdAt: '2026-08-25T00:00:00Z', updatedAt: '2026-08-25T00:00:00Z', activatedAt: null }
beforeEach(() => { vi.clearAllMocks(); vi.mocked(admin.listCleanbotPolicies).mockResolvedValue([policy]) })

describe('클린봇 정책 화면(HP-347)', () => {
  it('정책 상태와 무변경 dry-run 한계를 함께 표시한다', async () => {
    const user = userEvent.setup(); vi.mocked(admin.simulateCleanbotPolicy).mockResolvedValue({ id: 3, policyId: 1,
      sampleCount: 20, newlyBlocked: 0, newlyAllowed: 2, unchanged: 18, failures: 0, sampleLimit: 100,
      samples: [], limitation: '최근 14일 bounded 차단 표본만 사용합니다.', createdAt: '2026-08-25T00:01:00Z' })
    render(<CleanbotPolicyPage />); await user.click(await screen.findByText('정책 후보 A'))
    await user.click(screen.getByRole('button', { name: '표본 dry-run' }))
    expect(await screen.findByText(/신규 차단 0 · 신규 허용 2/)).toBeInTheDocument()
    expect(screen.getByText(/bounded 차단 표본/)).toBeInTheDocument()
  })
  it('정책 검토 요청에 revision과 사유를 보낸다', async () => {
    const user = userEvent.setup(); vi.mocked(admin.requestCleanbotPolicyReview).mockResolvedValue({ ...policy, status: 'REVIEW_REQUESTED', revision: 1 })
    render(<CleanbotPolicyPage />); await user.click(await screen.findByText('정책 후보 A'))
    await user.type(screen.getByLabelText('조치 사유'), '표본 비교를 마쳐 검토를 요청합니다')
    await user.click(screen.getByRole('button', { name: '검토 요청' }))
    await waitFor(() => expect(admin.requestCleanbotPolicyReview).toHaveBeenCalledWith(1, 0, '표본 비교를 마쳐 검토를 요청합니다'))
  })
  it('초안의 사전·임계값·category 매핑을 revision으로 수정한다', async () => {
    const user = userEvent.setup()
    vi.mocked(admin.updateCleanbotPolicy).mockResolvedValue({ ...policy, name: '정책 후보 B', revision: 1 })
    render(<CleanbotPolicyPage />); await user.click(await screen.findByText('정책 후보 A'))
    await user.click(screen.getByRole('button', { name: '초안 수정' }))
    const name = screen.getByLabelText('이름'); await user.clear(name); await user.type(name, '정책 후보 B')
    await user.type(screen.getByLabelText(/카테고리 매핑/), '지역=regional_hate')
    await user.click(screen.getByRole('button', { name: '초안 저장' }))
    await waitFor(() => expect(admin.updateCleanbotPolicy).toHaveBeenCalledWith(1, 0, expect.objectContaining({
      name: '정책 후보 B', threshold: 0.7, categoryMapping: { 지역: 'regional_hate' },
    })))
  })
  it('라벨별 임계값을 보여 주고, 초안 수정에서 라벨=값 줄을 숫자로 보낸다(HP-693)', async () => {
    const user = userEvent.setup()
    vi.mocked(admin.listCleanbotPolicies).mockResolvedValue([{ ...policy, categoryThresholds: { 지역: 0.6 } }])
    vi.mocked(admin.updateCleanbotPolicy).mockResolvedValue({ ...policy, categoryThresholds: { 지역: 0.6, '악플/욕설': 0.8 }, revision: 1 })
    render(<CleanbotPolicyPage />); await user.click(await screen.findByText('정책 후보 A'))
    expect(screen.getByText('지역 0.6')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '초안 수정' }))
    const field = screen.getByLabelText(/라벨별 임계값/)
    expect(field).toHaveValue('지역=0.6')
    await user.type(field, '\n악플/욕설=0.8')
    await user.click(screen.getByRole('button', { name: '초안 저장' }))
    await waitFor(() => expect(admin.updateCleanbotPolicy).toHaveBeenCalledWith(1, 0, expect.objectContaining({
      threshold: 0.7, categoryThresholds: { 지역: 0.6, '악플/욕설': 0.8 },
    })))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
  it.each([
    ['악플/욕설=1.5', '라벨별 임계값 형식 오류: 악플/욕설=1.5'],
    ['악플/욕설=-0.1', '라벨별 임계값 형식 오류: 악플/욕설=-0.1'],
    ['악플/욕설=', '라벨별 임계값 형식 오류: 악플/욕설='],
    ['=0.5', '라벨별 임계값 형식 오류: =0.5'],
    ['악플/욕설=0.6\n악플/욕설=0.9', '라벨별 임계값에 같은 항목이 두 번 있습니다: 악플/욕설'],
  ])('라벨별 임계값 %j 는 보내지 않고 알린다', async (input, message) => {
    const user = userEvent.setup()
    render(<CleanbotPolicyPage />); await user.click(await screen.findByText('정책 후보 A'))
    await user.click(screen.getByRole('button', { name: '초안 수정' }))
    await user.type(screen.getByLabelText(/라벨별 임계값/), input)
    await user.click(screen.getByRole('button', { name: '초안 저장' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(admin.updateCleanbotPolicy).not.toHaveBeenCalled()
  })
  it.each([
    ['칸을 모르는 서버(BE 릴리스 전)', undefined],
    ['값을 돌려주지 않은 서버', {}],
  ])('%s가 라벨별 임계값을 버리면 빠졌다고 알리고, 목록 새로고침 오류도 지우지 않는다', async (_, returned) => {
    const user = userEvent.setup()
    vi.mocked(admin.updateCleanbotPolicy).mockResolvedValue({ ...policy, categoryThresholds: returned, revision: 1 })
    render(<CleanbotPolicyPage />); await user.click(await screen.findByText('정책 후보 A'))
    await user.click(screen.getByRole('button', { name: '초안 수정' }))
    await user.type(screen.getByLabelText(/라벨별 임계값/), '악플/욕설=0.8')
    vi.mocked(admin.listCleanbotPolicies).mockRejectedValueOnce(new Error('목록을 불러오지 못했습니다'))
    await user.click(screen.getByRole('button', { name: '초안 저장' }))
    const alert = await screen.findByRole('alert')
    await waitFor(() => expect(alert).toHaveTextContent('아직 라벨별 임계값을 받지 않습니다'))
    expect(alert).toHaveTextContent('목록을 불러오지 못했습니다')
  })
  it('활성 정책을 사유와 revision으로 안전하게 폐기한다', async () => {
    const user = userEvent.setup(); const active = { ...policy, status: 'ACTIVE' as const, revision: 3 }
    vi.mocked(admin.listCleanbotPolicies).mockResolvedValue([active])
    vi.mocked(admin.retireCleanbotPolicy).mockResolvedValue({ ...active, status: 'RETIRED', revision: 4 })
    render(<CleanbotPolicyPage />); await user.click(await screen.findByText('정책 후보 A'))
    await user.type(screen.getByLabelText('조치 사유'), 'DEV 검증 종료로 정책을 해제합니다')
    await user.click(screen.getByRole('button', { name: '정책 폐기' }))
    await waitFor(() => expect(admin.retireCleanbotPolicy)
      .toHaveBeenCalledWith(1, 3, 'DEV 검증 종료로 정책을 해제합니다', undefined))
  })
})

describe('조회 전용 계정(HP-529)', () => {
  it('새 정책·초안 수정·검토 요청·dry-run을 끄고 이유를 보인다', async () => {
    const user = userEvent.setup()
    vi.mocked(realmRoles).mockReturnValue(['admin_console_viewer'])
    render(<CleanbotPolicyPage />)
    await user.click(await screen.findByText('정책 후보 A'))
    for (const name of ['새 정책', '초안 수정', '검토 요청', '표본 dry-run']) {
      expect(screen.getByRole('button', { name })).toBeDisabled()
    }
    expect(screen.getByRole('button', { name: '새 정책' })).toHaveAttribute('title', '조치 권한이 없습니다 — admin 또는 moderation_operator 역할이 필요합니다')
    expect(screen.getByText('조치 권한이 없습니다 — admin 또는 moderation_operator 역할이 필요합니다', { selector: '.readonly-note' })).toBeInTheDocument()
  })
})
