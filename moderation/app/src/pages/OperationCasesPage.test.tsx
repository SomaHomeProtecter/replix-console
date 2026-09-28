import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as admin from '../api/admin'
import type { OperationCaseDetail, OperationCasePage } from '../api/types'
import OperationCasesPage from './OperationCasesPage'

vi.mock('../api/admin')
const item = { reportId: 7, createdAt: '2026-08-25T00:00:00Z', reason: 'ABUSE' as const,
  messagePreview: '검토할 신고 메시지', targetUser: { id: 10, displayName: '대상' }, assignee: null,
  dueAt: null, reviewRequested: false, version: 0, updatedAt: null, stale: false, overdue: false }
const page: OperationCasePage = { items: [item], workloads: [], truncated: false }
const detail: OperationCaseDetail = { item, notes: [], events: [] }
beforeEach(() => { vi.clearAllMocks(); vi.mocked(admin.listOperationCases).mockResolvedValue(page); vi.mocked(admin.getOperationCase).mockResolvedValue(detail) })

describe('운영 협업 화면(HP-347)', () => {
  it('담당 필터와 케이스 상세를 현재 콘솔의 테이블·상세 문법으로 제공한다', async () => {
    const user = userEvent.setup(); render(<OperationCasesPage />)
    expect(await screen.findByRole('button', { name: '미배정' })).toBeInTheDocument()
    await user.click(screen.getByText('신고 #7'))
    expect(await screen.findByText('내부 메모·인수인계')).toBeInTheDocument()
    expect(screen.getByText('감사 타임라인')).toBeInTheDocument()
  })
  it('expected version과 사유를 포함해 담당자를 배정한다', async () => {
    const user = userEvent.setup(); vi.mocked(admin.assignOperationCase).mockResolvedValue({ ...detail, item: { ...item, assignee: { id: 3, displayName: '운영자' }, version: 1 } })
    render(<OperationCasesPage />); await user.click(await screen.findByText('신고 #7'))
    await user.type(screen.getByLabelText('담당자 사용자 ID'), '3')
    await user.type(screen.getByLabelText('배정·인계 사유'), '신고 검토를 인계합니다')
    await user.click(screen.getByRole('button', { name: '담당·기한 저장' }))
    await waitFor(() => expect(admin.assignOperationCase).toHaveBeenCalledWith(7, 0, 3, null, '신고 검토를 인계합니다'))
  })
})
