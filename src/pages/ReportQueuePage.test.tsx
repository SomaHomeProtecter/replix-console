import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
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

  it('행 = 시각·사유 pill·발췌(작성자 포함)·상태 텍스트(시안)', async () => {
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
    expect(within(first).getByText('스포일러꾼')).toBeInTheDocument()      // 작성자(.who)
    expect(within(first).getByText('범인은 집사다')).toBeInTheDocument()
    expect(within(first).getByText('● OPEN')).toBeInTheDocument()
    const second = rows[2]
    expect(within(second).getByText('욕설·혐오')).toBeInTheDocument()
    expect(within(second).getByText('✓ 처리')).toBeInTheDocument()
  })

  it('상태·사유 칩 토글은 목록을 리셋해 다시 묻는다(켜진 칩 재클릭 = 해제)', async () => {
    renderPage()
    await screen.findByText('범인은 집사다', { exact: false })

    await userEvent.click(screen.getByRole('button', { name: '열림' })) // 초기 OPEN 해제 → 전체
    expect(listReports).toHaveBeenLastCalledWith({ status: '', reason: '' }, null)

    await userEvent.click(screen.getByRole('button', { name: '스포일러' }))
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

  it('행을 클릭하면 선택된다(aria-current)', async () => {
    renderPage()
    await screen.findByText('범인은 집사다', { exact: false })

    const row = screen.getAllByRole('row')[1]
    expect(row).not.toHaveAttribute('aria-current')
    await userEvent.click(row)
    expect(row).toHaveAttribute('aria-current', 'true')
  })

  it('키보드(Enter)로도 행을 선택할 수 있다', async () => {
    renderPage()
    await screen.findByText('범인은 집사다', { exact: false })

    const row = screen.getAllByRole('row')[1]
    row.focus()
    await userEvent.keyboard('{Enter}')
    expect(row).toHaveAttribute('aria-current', 'true')
  })

  it('필터 변경 뒤 도착한 옛 커서 응답은 버린다(경합 가드)', async () => {
    let resolveLate!: (page: { items: ReturnType<typeof makeReportItem>[]; nextCursor: string | null }) => void
    const latePage = new Promise<{ items: ReturnType<typeof makeReportItem>[]; nextCursor: string | null }>(
        (resolve) => { resolveLate = resolve })
    listReports
        .mockResolvedValueOnce({ items: [makeReportItem()], nextCursor: '101' }) // 초기
        .mockReturnValueOnce(latePage)                                            // 더 불러오기(느린 응답)
        .mockResolvedValueOnce({
          items: [makeReportItem({ id: 50, snapshotMessage: '새 필터 결과' })],
          nextCursor: null,
        })                                                                        // 필터 변경(빠른 응답)
    renderPage()
    await screen.findByText('범인은 집사다', { exact: false })

    await userEvent.click(screen.getByRole('button', { name: '더 불러오기' })) // in-flight로 남김
    await userEvent.click(screen.getByRole('button', { name: '열림' }))        // 필터 해제 — 새 요청 먼저 완료
    await screen.findByText('새 필터 결과', { exact: false })

    await act(async () => {
      resolveLate({ items: [makeReportItem({ id: 999, snapshotMessage: '늦은 옛 응답' })], nextCursor: '999' })
      await latePage
    })

    expect(screen.queryByText('늦은 옛 응답', { exact: false })).not.toBeInTheDocument()
    // 옛 응답의 커서로 되덮이지 않는다(새 필터 응답은 nextCursor=null → 버튼 없음)
    expect(screen.queryByRole('button', { name: '더 불러오기' })).not.toBeInTheDocument()
  })

  it('조회 실패는 메시지를 표면화한다', async () => {
    listReports.mockRejectedValue(new Error('관리자 권한이 없습니다 — 서버가 요청을 거부했습니다'))
    renderPage()
    expect(await screen.findByText(/관리자 권한이 없습니다/)).toBeInTheDocument()
  })

  it('행 선택 → 상세 모달 조치(기각) → 목록을 다시 묻는다', async () => {
    renderPage()
    await screen.findByText('범인은 집사다', { exact: false })
    await userEvent.click(screen.getAllByRole('row')[1])
    expect(screen.getByRole('dialog', { name: '신고 상세' })).toBeInTheDocument() // 가운데 팝업
    expect(screen.getByText(/스냅샷 원문/)).toBeInTheDocument()

    const callsBefore = listReports.mock.calls.length
    await userEvent.click(screen.getByRole('button', { name: '기각 (조치 없음)' }))

    expect(admin.resolveReport).toHaveBeenCalledWith(101, 'REJECTED', null)
    expect(listReports.mock.calls.length).toBe(callsBefore + 1)
    expect(listReports).toHaveBeenLastCalledWith({ status: 'OPEN', reason: '' }, null)
  })

  it('모달 바깥(백드롭) 클릭 → 목록으로 복귀, 내부 클릭은 유지', async () => {
    const { container } = renderPage()
    await screen.findByText('범인은 집사다', { exact: false })
    await userEvent.click(screen.getAllByRole('row')[1])

    // 카드 내부 클릭은 닫히지 않는다
    const modal = screen.getByRole('dialog', { name: '신고 상세' })
    await userEvent.click(within(modal).getByText('범인은 집사다')) // 모달 안 스냅샷 원문
    expect(screen.getByRole('dialog', { name: '신고 상세' })).toBeInTheDocument()

    // 백드롭 클릭 = 원래 페이지(목록)로
    await userEvent.click(container.querySelector('.modal-backdrop')!)
    expect(screen.queryByRole('dialog', { name: '신고 상세' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('row').length).toBeGreaterThan(1) // 목록 그대로
  })

  it('Esc는 위 겹부터 닫는다 — 정지 다이얼로그 → 상세 모달 순', async () => {
    renderPage()
    await screen.findByText('범인은 집사다', { exact: false })
    await userEvent.click(screen.getAllByRole('row')[1])
    await userEvent.click(screen.getByRole('button', { name: /계정 정지/ }))
    expect(screen.getByRole('dialog', { name: '계정 정지' })).toBeInTheDocument()

    await userEvent.keyboard('{Escape}') // 다이얼로그만 닫힌다(stopPropagation)
    expect(screen.queryByRole('dialog', { name: '계정 정지' })).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: '신고 상세' })).toBeInTheDocument()

    await userEvent.keyboard('{Escape}') // 이번엔 모달이 닫힌다
    expect(screen.queryByRole('dialog', { name: '신고 상세' })).not.toBeInTheDocument()
  })
})
