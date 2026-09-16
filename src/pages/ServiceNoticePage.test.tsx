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
  incidentReference: 'INC-31', linkUrl: null, version: 0, createdByUserId: 3, publishedByUserId: null,
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

function renderSelectedPage() {
  return render(<MemoryRouter initialEntries={['/feature-control/notices?selected=31']}>
    <WritingProvider><ServiceNoticePage /></WritingProvider>
  </MemoryRouter>)
}

describe('사용자 공지 화면(HP-343)', () => {
  it('타임라인 딥링크로 들어오면 해당 공지 상세를 바로 연다', async () => {
    renderSelectedPage()
    expect(await screen.findByRole('complementary', { name: '사용자 공지 #31 상세' }))
      .toBeInTheDocument()
    expect(admin.getServiceNotice).toHaveBeenCalledWith(31)
  })

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
    const presetOptions = within(dialog).getByRole('combobox', { name: '연결 프리셋' })
      .querySelectorAll('option')
    expect([...presetOptions].map((option) => option.textContent)).toEqual(expect.arrayContaining([
      '외부 공개 콘텐츠 중지', '개인정보 전송 중지', '비디오 오버레이 최소화', 'Disney+ 격리',
    ]))
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

  it('링크 URL을 입력하면 생성 요청에 linkUrl로 실린다', async () => {
    const user = userEvent.setup()
    vi.mocked(admin.createServiceNotice).mockResolvedValue({
      ...notice, id: 32, linkUrl: 'https://replix.tv/terms',
    })
    renderPage()
    await user.click(await screen.findByRole('button', { name: '새 공지' }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByRole('textbox', { name: '제목' }), '약관 개정 안내')
    await user.type(within(dialog).getByRole('textbox', { name: '공개 메시지' }), '9/18 시행됩니다.')
    await user.type(within(dialog).getByRole('textbox', { name: /내부 메모/ }),
      '링크 URL 필드 동작을 확인하는 내부 메모입니다')
    await user.type(within(dialog).getByRole('textbox', { name: /링크 URL/ }), 'https://replix.tv/terms')
    await user.click(within(dialog).getByRole('button', { name: '공지 초안 생성' }))

    await waitFor(() => expect(admin.createServiceNotice).toHaveBeenCalledWith(
      expect.objectContaining({ linkUrl: 'https://replix.tv/terms' })))
  })

  it('링크 URL을 비워 두면 빈 문자열이 아니라 null로 보낸다', async () => {
    const user = userEvent.setup()
    vi.mocked(admin.createServiceNotice).mockResolvedValue(notice)
    renderPage()
    await user.click(await screen.findByRole('button', { name: '새 공지' }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByRole('textbox', { name: '제목' }), '서비스 점검 안내')
    await user.type(within(dialog).getByRole('textbox', { name: '공개 메시지' }), '일부 기능이 느릴 수 있습니다.')
    await user.type(within(dialog).getByRole('textbox', { name: /내부 메모/ }),
      '링크 없이 생성하는 경우를 확인하는 내부 메모입니다')
    await user.click(within(dialog).getByRole('button', { name: '공지 초안 생성' }))

    await waitFor(() => expect(admin.createServiceNotice).toHaveBeenCalledWith(
      expect.objectContaining({ linkUrl: null })))
  })

  it('https로 시작하지 않는 링크 URL은 생성 요청을 보내지 않고 알린다', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: '새 공지' }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByRole('textbox', { name: '제목' }), '약관 개정 안내')
    await user.type(within(dialog).getByRole('textbox', { name: '공개 메시지' }), '9/18 시행됩니다.')
    await user.type(within(dialog).getByRole('textbox', { name: /내부 메모/ }),
      '잘못된 링크를 막는지 확인하는 내부 메모입니다')
    await user.type(within(dialog).getByRole('textbox', { name: /링크 URL/ }), 'http://replix.tv/terms')
    await user.click(within(dialog).getByRole('button', { name: '공지 초안 생성' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('https://')
    expect(admin.createServiceNotice).not.toHaveBeenCalled()
  })

  it('스킴만 있는 링크 URL은 생성 요청을 보내지 않고 알린다', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: '새 공지' }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByRole('textbox', { name: '제목' }), '약관 개정 안내')
    await user.type(within(dialog).getByRole('textbox', { name: '공개 메시지' }), '9/18 시행됩니다.')
    await user.type(within(dialog).getByRole('textbox', { name: /내부 메모/ }),
      '스킴만 남은 링크를 막는지 확인하는 내부 메모입니다')
    await user.type(within(dialog).getByRole('textbox', { name: /링크 URL/ }), 'https://')
    await user.click(within(dialog).getByRole('button', { name: '공지 초안 생성' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('https://')
    expect(admin.createServiceNotice).not.toHaveBeenCalled()
  })

  it('링크가 있는 공지 상세에 전문 보기 링크가 보인다', async () => {
    vi.mocked(admin.getServiceNotice).mockResolvedValue({ ...notice, linkUrl: 'https://replix.tv/terms' })
    renderSelectedPage()

    const link = await screen.findByRole('link', { name: /전문 보기/ })
    expect(link).toHaveAttribute('href', 'https://replix.tv/terms')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('링크가 없는 공지 상세에는 전문 보기 링크가 없다', async () => {
    renderSelectedPage()
    await screen.findByRole('complementary', { name: '사용자 공지 #31 상세' })

    expect(screen.queryByRole('link', { name: /전문 보기/ })).not.toBeInTheDocument()
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
