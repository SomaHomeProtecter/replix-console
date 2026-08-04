import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as admin from '../api/admin'
import { makeReportItem } from '../test/fixtures'
import ReportQueuePage from './ReportQueuePage'

vi.mock('../api/admin')

const listReports = vi.mocked(admin.listReports)

function renderPage() {
  return render(<MemoryRouter><ReportQueuePage /></MemoryRouter>)
}

beforeEach(() => {
  vi.clearAllMocks()
  listReports.mockResolvedValue({ items: [makeReportItem()], nextCursor: null })
})

describe('신고 큐(정본 ①) — 테이블·필터·커서 페이징', () => {
  it('초기 로드는 접수(OPEN) 상태만 본다', async () => {
    renderPage()
    await screen.findByText('범인은 집사다', { exact: false })
    expect(listReports).toHaveBeenCalledWith({ status: 'OPEN', reason: '' }, null)
  })

  it('행 = 시각·사유 pill·발췌(작성자 포함)·상태 배지', async () => {
    listReports.mockResolvedValue({
      items: [makeReportItem(), makeReportItem({
        id: 102, reason: 'ABUSE', status: 'RESOLVED',
        snapshotMessage: '심한 욕설', snapshotDisplayName: '악성유저',
      })],
      nextCursor: null,
    })
    renderPage()

    const rows = await screen.findAllByRole('row')
    const first = rows[1] // rows[0] = 헤더
    expect(within(first).getByText('스포일러')).toBeInTheDocument()
    expect(within(first).getByText(/스포일러꾼.*범인은 집사다/)).toBeInTheDocument()
    expect(within(first).getByText('접수')).toBeInTheDocument()
    const second = rows[2]
    expect(within(second).getByText('욕설·혐오')).toBeInTheDocument()
    expect(within(second).getByText('처리')).toBeInTheDocument()
  })

  it('상태 세그먼트·사유 select 변경은 목록을 리셋해 다시 묻는다', async () => {
    renderPage()
    await screen.findByText('범인은 집사다', { exact: false })

    await userEvent.click(screen.getByRole('button', { name: '전체' }))
    expect(listReports).toHaveBeenLastCalledWith({ status: '', reason: '' }, null)

    await userEvent.selectOptions(screen.getByLabelText('사유 필터'), 'SPOILER')
    expect(listReports).toHaveBeenLastCalledWith({ status: '', reason: 'SPOILER' }, null)
  })

  it('nextCursor가 있으면 "더 불러오기"가 이어붙인다', async () => {
    listReports
        .mockResolvedValueOnce({ items: [makeReportItem()], nextCursor: '101' })
        .mockResolvedValueOnce({
          items: [makeReportItem({ id: 90, snapshotMessage: '두번째 페이지 메시지' })],
          nextCursor: null,
        })
    renderPage()
    await screen.findByText('범인은 집사다', { exact: false })

    await userEvent.click(screen.getByRole('button', { name: '더 불러오기' }))

    expect(listReports).toHaveBeenLastCalledWith({ status: 'OPEN', reason: '' }, '101')
    expect(screen.getByText('범인은 집사다', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('두번째 페이지 메시지', { exact: false })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '더 불러오기' })).not.toBeInTheDocument()
  })

  it('행을 클릭하면 선택된다', async () => {
    renderPage()
    await screen.findByText('범인은 집사다', { exact: false })

    const row = screen.getAllByRole('row')[1]
    expect(row).toHaveAttribute('aria-selected', 'false')
    await userEvent.click(row)
    expect(row).toHaveAttribute('aria-selected', 'true')
  })

  it('조회 실패는 메시지를 표면화한다', async () => {
    listReports.mockRejectedValue(new Error('관리자 권한이 없습니다 — 서버가 요청을 거부했습니다'))
    renderPage()
    expect(await screen.findByText(/관리자 권한이 없습니다/)).toBeInTheDocument()
  })
})
