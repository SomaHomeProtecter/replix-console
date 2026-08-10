import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as admin from '../api/admin'
import { makeReportItem } from '../test/fixtures'
import ReportQueuePage from './ReportQueuePage'

vi.mock('../api/admin')

const listReports = vi.mocked(admin.listReports)
const blindMessage = vi.mocked(admin.blindMessage)
const resolveReport = vi.mocked(admin.resolveReport)
const suspendUser = vi.mocked(admin.suspendUser)

function renderPage() {
  return render(<MemoryRouter><ReportQueuePage /></MemoryRouter>)
}

beforeEach(() => {
  vi.clearAllMocks()
  // 호출마다 새 객체를 만든다(mockResolvedValue처럼 한 객체를 재사용하지 않는다) — 실제 fetch는
  // 매번 새로 파싱된 배열을 주는데, 같은 참조를 재사용하면 setItems가 bail-out 해 재렌더가
  // 아예 일어나지 않는다. 그 상태로는 "재조회 후" 동작을 검증할 수 없다.
  listReports.mockImplementation(async () => ({ items: [makeReportItem()], nextCursor: null }))
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
        id: 102, reason: 'ABUSE', status: 'RESOLVED', resolvedAction: 'BLIND',
        snapshotMessage: '심한 욕설', snapshotDisplayName: '악성유저',
      })],
      nextCursor: null,
    })
    renderPage()

    const rows = await screen.findAllByRole('row')
    const first = rows[1] // rows[0] = 헤더
    expect(within(first).getByText('스포일러')).toBeInTheDocument()
    // 작성자·신고자를 독립 칸으로(HP-268) — 종전엔 작성자가 발췌 앞 회색 글씨라 눈에 안 들어왔고
    // 신고자는 아예 없어 "같은 사람이 반복 신고 중인지"를 목록에서 볼 수 없었다
    expect(within(first).getByText('스포일러꾼')).toBeInTheDocument()      // 작성자
    expect(within(first).getByText('신고자닉')).toBeInTheDocument()        // 신고자
    expect(within(first).getByText('범인은 집사다')).toBeInTheDocument()
    expect(within(first).getByText('● OPEN')).toBeInTheDocument()
    const second = rows[2]
    expect(within(second).getByText('욕설·혐오')).toBeInTheDocument()
    expect(within(second).getByText('✓ 가림')).toBeInTheDocument() // 처리됨을 조치로 구분(E2E 피드백)
  })

  /**
   * 시각이 HH:mm뿐이라 3일 묵은 건과 방금 건이 같아 보였다(HP-296) — 목록만 보고 급한 것을
   * 고를 수 있어야 한다. 고정 시각 대신 "지금으로부터 N시간 전"으로 픽스처를 만들어
   * 실제 시간이 흘러도 테스트가 썩지 않게 한다.
   */
  it('큐 행에 대기 시간 뱃지가 붙는다 — 하루 넘긴 건은 톤이 다르다', async () => {
    const hoursAgo = (h: number) => new Date(Date.now() - h * 3600 * 1000).toISOString()
    listReports.mockResolvedValue({
      items: [
        makeReportItem({ id: 1, createdAt: hoursAgo(0.5), snapshotMessage: '방금 온 신고' }),
        makeReportItem({ id: 2, createdAt: hoursAgo(25), snapshotMessage: '하루 넘긴 신고' }),
      ],
      nextCursor: null,
    })
    renderPage()
    await screen.findByText('방금 온 신고')

    const rows = await screen.findAllByRole('row')
    expect(within(rows[1]).getByText('방금')).toBeInTheDocument()
    expect(within(rows[2]).getByText('1일')).toBeInTheDocument()
    // 톤이 실제로 갈려야 목록에서 눈에 걸린다 — 라벨만 다르면 의미가 없다
    expect(within(rows[2]).getByText('1일').className).not.toBe(
        within(rows[1]).getByText('방금').className)
  })

  /**
   * 여러 사람이 동시에 신고한 건이 가장 급한데, 그 수가 상세를 열어야만 보였다(HP-296).
   * 목록 응답에 이미 실려 오는 값이라 화면이 쓰기만 하면 된다.
   */
  it('같은 메시지에 몰린 신고 수를 목록에서 보여준다 — 1건이면 군더더기라 감춘다', async () => {
    listReports.mockResolvedValue({
      items: [
        makeReportItem({ id: 1, sameMessageReportCount: 1, snapshotMessage: '한 건짜리' }),
        makeReportItem({ id: 2, sameMessageReportCount: 3, snapshotMessage: '몰린 신고' }),
      ],
      nextCursor: null,
    })
    renderPage()
    await screen.findByText('몰린 신고')

    const rows = await screen.findAllByRole('row')
    expect(within(rows[1]).queryByText(/묶음/)).not.toBeInTheDocument()
    expect(within(rows[2]).getByText('묶음 ×3')).toBeInTheDocument()
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
    await userEvent.click(within(screen.getByRole('dialog', { name: '신고 상세' }))
        .getByRole('button', { name: '기각' }))

    expect(admin.resolveReport).toHaveBeenCalledWith(101, 'REJECTED', null, null)
    expect(listReports.mock.calls.length).toBe(callsBefore + 1)
    expect(listReports).toHaveBeenLastCalledWith({ status: 'OPEN', reason: '' }, null)
  })

  /**
   * 큐는 위에서부터 순서대로 처리하는 동선이라, 한 건 조치할 때마다 목록이 맨 위로 튀면
   * 매번 보던 자리까지 다시 스크롤해 내려와야 한다(HP-268 이월 1번).
   */
  it('조치 뒤 재조회해도 보던 목록 위치를 지킨다', async () => {
    const scrollTo = vi.fn()
    Object.defineProperty(window, 'scrollTo', { value: scrollTo, configurable: true })
    Object.defineProperty(window, 'scrollY', { value: 420, configurable: true })
    renderPage()
    await screen.findByText('범인은 집사다', { exact: false })
    await userEvent.click(screen.getAllByRole('row')[1])

    await userEvent.click(within(screen.getByRole('dialog', { name: '신고 상세' }))
        .getByRole('button', { name: '기각' }))

    // 조치 → 재조회 → 목록 재렌더까지 가야 복원이 일어난다
    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith(0, 420))
  })

  /**
   * 위에서부터 처리하면 남는 건 아래쪽이라, 조치는 "더 불러오기"로 펼친 구간에서 일어나기 쉽다.
   * 첫 페이지만 다시 읽으면 그 아래가 통째로 사라져 위치를 지켜도 그 자리에 아무것도 없다.
   */
  it('조치 뒤에는 펼쳐 둔 페이지 수만큼 다시 읽는다', async () => {
    listReports
        .mockResolvedValueOnce({ items: [makeReportItem()], nextCursor: '101' })      // 1페이지
        .mockResolvedValueOnce({                                                       // 더 불러오기
          items: [makeReportItem({ id: 90, snapshotMessage: '두번째 페이지 메시지' })],
          nextCursor: null,
        })
    renderPage()
    await screen.findByText('범인은 집사다', { exact: false })
    await userEvent.click(screen.getByRole('button', { name: '더 불러오기' }))
    await screen.findByText('두번째 페이지 메시지', { exact: false })

    // 재조회분 — 1페이지와 2페이지를 다시 이어 읽는다
    listReports
        .mockResolvedValueOnce({ items: [makeReportItem()], nextCursor: '101' })
        .mockResolvedValueOnce({
          items: [makeReportItem({ id: 90, snapshotMessage: '두번째 페이지 메시지' })],
          nextCursor: null,
        })
    const before = listReports.mock.calls.length
    await userEvent.click(screen.getAllByRole('row')[1])
    await userEvent.click(within(screen.getByRole('dialog', { name: '신고 상세' }))
        .getByRole('button', { name: '기각' }))

    await waitFor(() => expect(listReports.mock.calls.length).toBe(before + 2))
    expect(listReports.mock.calls[before]).toEqual([{ status: 'OPEN', reason: '' }, null])
    expect(listReports.mock.calls[before + 1]).toEqual([{ status: 'OPEN', reason: '' }, '101'])
    // 2페이지 내용이 목록에 남아 있다 — 조치 뒤 모달이 다음 열림 건(그게 이 건이다)으로
    // 이어지므로 같은 문구가 모달에도 뜬다. 이 테스트의 관심사는 목록이라 표로 좁힌다.
    expect(await within(screen.getByRole('table')).findByText('두번째 페이지 메시지', { exact: false }))
        .toBeInTheDocument()
  })

  it('필터 변경은 위치를 지키지 않는다 — 다른 목록이라 맨 위가 맞다', async () => {
    const scrollTo = vi.fn()
    Object.defineProperty(window, 'scrollTo', { value: scrollTo, configurable: true })
    Object.defineProperty(window, 'scrollY', { value: 420, configurable: true })
    renderPage()
    await screen.findByText('범인은 집사다', { exact: false })

    await userEvent.click(screen.getByRole('button', { name: '열림' }))
    await screen.findByText('범인은 집사다', { exact: false })

    expect(scrollTo).not.toHaveBeenCalled()
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

/**
 * 큐는 위에서부터 순서대로 처리하는 동선이라 조치가 끝나면 손이 마우스로 돌아가지 않아야
 * 한다(HP-295). 30건짜리 큐에서 그 왕복이 30번이다.
 */
describe('키보드로 큐 밀어내기(HP-295)', () => {
  const twoOpen = () => ({
    items: [
      makeReportItem({ id: 1, snapshotMessage: '첫째 건' }),
      makeReportItem({ id: 2, snapshotMessage: '둘째 건' }),
    ],
    nextCursor: null,
  })

  async function openFirst(firstText = '첫째 건') {
    renderPage()
    await screen.findByText(firstText)
    await userEvent.click(screen.getAllByRole('row')[1])
    return screen.getByRole('dialog', { name: '신고 상세' })
  }

  it('B는 가림으로 닫고 모달을 유지한 채 다음 열림 건으로 넘어간다', async () => {
    listReports.mockImplementation(async () => twoOpen())
    await openFirst()
    expect(screen.getByText(/신고 #1 · 스냅샷 원문/)).toBeInTheDocument()

    await userEvent.keyboard('b')

    expect(blindMessage).toHaveBeenCalledWith(42, '01FIXTUREMSG0000000000000A')
    expect(resolveReport).toHaveBeenCalledWith(1, 'RESOLVED', null, 'BLIND')
    // 모달이 닫히지 않고 다음 건으로 이어진다 — 이게 없으면 매번 다시 집어야 한다
    expect(await screen.findByText(/신고 #2 · 스냅샷 원문/)).toBeInTheDocument()
  })

  it('X는 기각, N은 조치 없이 종결로 닫는다', async () => {
    listReports.mockImplementation(async () => twoOpen())
    await openFirst()
    await userEvent.keyboard('x')
    expect(resolveReport).toHaveBeenLastCalledWith(1, 'REJECTED', null, null)

    await screen.findByText(/신고 #2 · 스냅샷 원문/)
    await userEvent.keyboard('n')
    expect(resolveReport).toHaveBeenLastCalledWith(2, 'RESOLVED', null, null)
  })

  it('마지막 열림 건을 처리하면 모달이 닫힌다 — 이어갈 곳이 없다', async () => {
    listReports.mockImplementation(async () => ({
      items: [makeReportItem({ id: 1, snapshotMessage: '마지막 건' })], nextCursor: null,
    }))
    await openFirst('마지막 건')

    await userEvent.keyboard('x')

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: '신고 상세' })).not.toBeInTheDocument())
  })

  /** 파괴적 조치는 단축키로 실행하지 않는다 — 확인 한 겹을 남긴다. */
  it('S는 정지 다이얼로그를 여는 데까지만 한다', async () => {
    listReports.mockImplementation(async () => twoOpen())
    await openFirst()

    await userEvent.keyboard('s')

    expect(screen.getByRole('dialog', { name: '계정 정지' })).toBeInTheDocument()
    expect(suspendUser).not.toHaveBeenCalled()
  })

  /** 함정 ③ — 없으면 메모에 "b"를 치는 순간 메시지가 가려진다. */
  it('처리 메모에 포커스가 있으면 단축키를 전부 무시한다', async () => {
    listReports.mockImplementation(async () => twoOpen())
    await openFirst()

    const note = screen.getByLabelText('처리 메모')
    await userEvent.click(note)
    await userEvent.keyboard('bnx')

    expect(blindMessage).not.toHaveBeenCalled()
    expect(resolveReport).not.toHaveBeenCalled()
    expect(note).toHaveValue('bnx')
  })

  /** 함정 ② — 확인 겹이 떠 있는 동안 뒤의 큐가 움직이면 확인의 의미가 사라진다. */
  it('정지 다이얼로그가 떠 있으면 큐 단축키가 죽는다', async () => {
    listReports.mockImplementation(async () => twoOpen())
    await openFirst()
    await userEvent.keyboard('s')
    expect(screen.getByRole('dialog', { name: '계정 정지' })).toBeInTheDocument()

    await userEvent.keyboard('x')

    expect(resolveReport).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: '계정 정지' })).toBeInTheDocument()
  })

  it('모달이 닫혀 있을 때 J/K는 행 포커스를 옮긴다 — Enter가 연다', async () => {
    listReports.mockImplementation(async () => twoOpen())
    renderPage()
    await screen.findByText('첫째 건')

    const rows = screen.getAllByRole('row')
    rows[1].focus()
    await userEvent.keyboard('j')
    expect(rows[2]).toHaveFocus()

    await userEvent.keyboard('k')
    expect(rows[1]).toHaveFocus()
  })
})
