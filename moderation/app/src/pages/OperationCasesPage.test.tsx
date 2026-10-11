import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as admin from '../api/admin'
import { realmRoles } from '@core/auth'
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
  // 조치 콘솔은 /moderation/<env>/ 아래에서 돈다(HP-456). 루트 기준 경로('/operation-cases')와 비교하던
  // 복원이 한 번도 맞지 않아, 공유한 주소·재로그인 복귀·사용자 상세의 '열기'가 빈 상세를 띄웠다(코드 리뷰 지적).
  it('주소의 ?selected= 로 케이스를 연다 — 앱이 하위 경로에서 돌아도 그렇다', async () => {
    window.history.replaceState(null, '', '/moderation/prod/operation-cases?selected=7')
    try {
      render(<OperationCasesPage />)
      await waitFor(() => expect(admin.getOperationCase).toHaveBeenCalledWith(7))
    } finally {
      window.history.replaceState(null, '', '/')
    }
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

describe('조회 전용 계정(HP-529)', () => {
  it('담당·기한 저장과 기록 추가를 끄고 이유를 보인다', async () => {
    const user = userEvent.setup()
    vi.mocked(realmRoles).mockReturnValue(['admin_console_viewer'])
    render(<OperationCasesPage />)
    await user.click(await screen.findByText('신고 #7'))
    const save = await screen.findByRole('button', { name: '담당·기한 저장' })
    expect(save).toBeDisabled()
    expect(save).toHaveAttribute('title', '조치 권한이 없습니다 — admin 또는 moderation_operator 역할이 필요합니다')
    expect(screen.getByRole('button', { name: '기록 추가' })).toBeDisabled()
    expect(screen.getByText('조치 권한이 없습니다 — admin 또는 moderation_operator 역할이 필요합니다', { selector: '.readonly-note' })).toBeInTheDocument()
  })
})

describe('응답 순서·불러오는 중·한글 기록 이름(HP-527)', () => {
  it('필터를 빠르게 바꿔도 먼저 보낸 느린 응답이 지금 필터의 목록을 덮지 않는다', async () => {
    const user = userEvent.setup()
    let finishAll: (value: OperationCasePage) => void = () => {}
    vi.mocked(admin.listOperationCases).mockImplementation((view) => view === 'ALL'
      ? new Promise((resolve) => { finishAll = resolve })
      : Promise.resolve({ ...page, items: [{ ...item, reportId: 8, messagePreview: '미배정 케이스' }] }))
    render(<OperationCasesPage />)
    expect(screen.getByText('불러오는 중…')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '미배정' }))
    expect(await screen.findByText('신고 #8')).toBeInTheDocument()
    finishAll(page) // '전체'의 늦은 응답
    await waitFor(() => expect(admin.listOperationCases).toHaveBeenCalledTimes(2))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.queryByText('신고 #7')).not.toBeInTheDocument()
    expect(screen.getByText('신고 #8')).toBeInTheDocument()
  })

  it('협업 메모·감사 기록의 유형을 한글로 보이고, 행은 키보드로 고른다', async () => {
    vi.mocked(admin.getOperationCase).mockResolvedValue({ ...detail,
      notes: [{ id: 1, type: 'HANDOFF', body: '야간 담당에게 넘깁니다', author: { id: 3, displayName: '지호' }, createdAt: '2026-08-25T00:02:00Z' }],
      events: [{ id: 2, type: 'ASSIGNEE_CHANGED', detail: '담당 지정', actor: { id: 3, displayName: '지호' }, workspaceVersion: 1, createdAt: '2026-08-25T00:01:00Z' }] })
    render(<OperationCasesPage />)
    const row = (await screen.findByText('신고 #7')).closest('tr')!
    row.focus()
    await userEvent.keyboard('{Enter}')
    expect(await screen.findByText('인수인계', { selector: '.case-log strong' })).toBeInTheDocument()
    expect(screen.getByText('담당 변경', { selector: '.case-log strong' })).toBeInTheDocument()
  })
})
