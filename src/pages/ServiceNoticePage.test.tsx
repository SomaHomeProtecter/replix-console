import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as admin from '../api/admin'
import type { ServiceNotice } from '../api/types'
import { WritingProvider } from '../writing'
import ServiceNoticePage from './ServiceNoticePage'

vi.mock('../api/admin')
vi.mock('../auth', () => ({ realmRoles: () => ['admin'] }))

const notice: ServiceNotice = {
  id: 31, environment: 'DEV', kind: 'MAINTENANCE', title: '서비스 점검 안내',
  publicMessage: '일부 기능이 잠시 느릴 수 있습니다.',
  internalNote: 'HP-343 사용자 공지 동작을 확인하는 내부 메모입니다', status: 'DRAFT',
  linkedChangeSetId: 17, presetId: 'READ_ONLY', jiraReference: 'HP-343',
  incidentReference: 'INC-31', version: 0, createdByUserId: 3, publishedByUserId: null,
  endedByUserId: null, startsAt: null, endsAt: null, publishedAt: null, endedAt: null,
  createdAt: '2026-08-24T00:00:00Z', updatedAt: '2026-08-24T00:00:00Z',
  events: [{ id: 1, type: 'CREATED', actorUserId: 3,
    reason: 'HP-343 사용자 공지 동작을 확인하는 내부 메모입니다', payload: '{}',
    createdAt: '2026-08-24T00:00:00Z' }],
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(admin.listServiceNotices).mockResolvedValue([{ ...notice, events: [] }])
  vi.mocked(admin.getServiceNotice).mockResolvedValue(notice)
})

function renderPage() {
  return render(<MemoryRouter initialEntries={['/feature-control/notices']}>
    <WritingProvider><ServiceNoticePage /></WritingProvider>
  </MemoryRouter>)
}

describe('사용자 공지 화면(HP-343)', () => {
  it('목록에서 상세를 열어 사용자 노출 내용과 내부 메모를 분리해 보여준다', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByText('서비스 점검 안내'))

    const detail = await screen.findByRole('complementary', { name: '사용자 공지 #31 상세' })
    expect(within(detail).getByLabelText('사용자 노출 미리보기')).toHaveTextContent(
      '일부 기능이 잠시 느릴 수 있습니다.')
    expect(within(detail).getByText('내부 메모 · 외부 비공개')).toBeInTheDocument()
    expect(within(detail).getByText('CREATED')).toBeInTheDocument()
  })

  it('작성 중에도 공개 배너를 미리 보고 내부 메모를 별도 계약으로 보낸다', async () => {
    const user = userEvent.setup()
    vi.mocked(admin.createServiceNotice).mockResolvedValue(notice)
    renderPage()
    await user.click(await screen.findByRole('button', { name: '새 공지' }))
    const dialog = screen.getByRole('dialog')
    await user.selectOptions(within(dialog).getByRole('combobox', { name: '유형' }), 'MAINTENANCE')
    await user.type(within(dialog).getByRole('textbox', { name: '제목' }), '서비스 점검 안내')
    await user.type(within(dialog).getByRole('textbox', { name: '공개 메시지' }),
      '일부 기능이 잠시 느릴 수 있습니다.')
    await user.type(within(dialog).getByRole('textbox', { name: /내부 메모/ }),
      '사용자에게 노출하지 않을 점검 운영 근거입니다')
    expect(within(dialog).getByLabelText('사용자 노출 미리보기'))
      .toHaveTextContent('일부 기능이 잠시 느릴 수 있습니다.')
    await user.click(within(dialog).getByRole('button', { name: '공지 초안 생성' }))

    await waitFor(() => expect(admin.createServiceNotice).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'MAINTENANCE', title: '서비스 점검 안내',
      publicMessage: '일부 기능이 잠시 느릴 수 있습니다.',
      internalNote: '사용자에게 노출하지 않을 점검 운영 근거입니다', jiraReference: 'HP-343',
    })))
  })

  it('초안 상세에서 10자 이상 사유를 받아 즉시 게시한다', async () => {
    const user = userEvent.setup()
    vi.mocked(admin.publishServiceNotice).mockResolvedValue({ ...notice, status: 'PUBLISHED', version: 1 })
    renderPage()
    await user.click(await screen.findByText('서비스 점검 안내'))
    const detail = await screen.findByRole('complementary', { name: '사용자 공지 #31 상세' })
    await user.type(within(detail).getByRole('textbox', { name: /조치 사유/ }),
      '점검 상황을 사용자에게 즉시 게시합니다')
    await user.click(within(detail).getByRole('button', { name: '즉시 게시' }))

    await waitFor(() => expect(admin.publishServiceNotice).toHaveBeenCalledWith(
      31, 0, '점검 상황을 사용자에게 즉시 게시합니다'))
  })
})
