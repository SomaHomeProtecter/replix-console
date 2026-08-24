import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as admin from '../api/admin'
import type { CleanbotPolicy } from '../api/types'
import CleanbotPolicyPage from './CleanbotPolicyPage'

vi.mock('../api/admin')
vi.mock('../env', () => ({ env: { environment: 'DEV' } }))
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
})
