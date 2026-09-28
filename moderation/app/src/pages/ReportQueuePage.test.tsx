import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
  // 호출마다 새 객체를 만든다(mockResolvedValue처럼 한 객체를 재사용하지 않는다) — 실제 fetch는
  // 매번 새로 파싱된 배열을 주는데, 같은 참조를 재사용하면 setItems가 bail-out 해 재렌더가
  // 아예 일어나지 않는다. 그 상태로는 "재조회 후" 동작을 검증할 수 없다.
  listReports.mockImplementation(async () => ({ items: [makeReportItem()], nextCursor: null }))
  // 상세 모달이 품는 작성자 글 목록(HP-298)도 스텁한다 — 없으면 이 파일의 모달 테스트가
  // 의도한 화면이 아니라 자식이 실패한 화면을 검증하게 된다(2026-08-11 자체 리뷰).
  vi.mocked(admin.listAuthorMessages).mockResolvedValue({ rows: [], total: 0 })
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
    expect(within(first).getByText('회차')).toBeInTheDocument()
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

  it('그룹방 신고는 방 식별자 대신 출처 표식만 보여준다', async () => {
    listReports.mockResolvedValue({
      items: [makeReportItem({ source: 'GROUP_ROOM', snapshotMessage: '방에서 온 신고' })],
      nextCursor: null,
    })
    renderPage()

    const row = (await screen.findAllByRole('row'))[1]
    expect(within(row).getByText('그룹방')).toBeInTheDocument()
    expect(row).not.toHaveTextContent('01ROOM')
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
        makeReportItem({ id: 1, openReportCount: 1, snapshotMessage: '한 건짜리' }),
        makeReportItem({ id: 2, openReportCount: 3, snapshotMessage: '몰린 신고' }),
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
    // 2페이지 내용이 목록에 남아 있다. 같은 문구가 열려 있는 상세 모달에도 떠 있으므로,
    // 이 테스트의 관심사(목록이 다시 채워졌는가)에 맞게 표 안으로 좁혀 찾는다.
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

  /**
   * 2026-08-11 실브라우저에서 발견 — 정지 다이얼로그를 띄운 뒤 <b>그 안의 빈 곳</b>(제목 등)을
   * 클릭하면 포커스가 body로 떨어지고, 그 상태의 Esc는 다이얼로그의 onKeyDown을 거치지 않고
   * 문서로 직행해 <b>확인 겹과 상세 모달이 함께 닫힌다</b>. 파괴적 조치 앞에 확인 한 겹을 둔
   * 의미가 사라진다. 고침은 다이얼로그 컨테이너의 {@code tabIndex={-1}}이다.
   *
   * <p>위 테스트와 다른 것을 지킨다 — 위는 <b>포커스가 겹 안에 있을 때</b>의 순서고, 이것은
   * <b>포커스가 빠져나갔을 때</b>도 순서가 지켜지는지다. 마우스만 쓰는 흔한 경로가 후자다.
   * (HP-295로 이 겹을 여는 단축키가 빠지면서 원래 테스트가 함께 지워졌는데, 고침은 남아 있어
   * 지키는 테스트가 없는 상태였다 — 클릭으로 여는 경로로 되살린다.)
   */
  it('다이얼로그 안 빈 곳을 눌러도 Esc는 위 겹만 닫는다', async () => {
    renderPage()
    await screen.findByText('범인은 집사다', { exact: false })
    await userEvent.click(screen.getAllByRole('row')[1])
    await userEvent.click(screen.getByRole('button', { name: /계정 정지/ }))
    expect(screen.getByRole('dialog', { name: '계정 정지' })).toBeInTheDocument()

    // 겹 안의 포커스 안 받는 영역(제목)을 클릭 → tabIndex가 없으면 포커스가 body로 떨어진다
    await userEvent.click(screen.getByRole('heading', { name: /계정 정지/ }))
    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('dialog', { name: '계정 정지' })).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: '신고 상세' })).toBeInTheDocument()
  })
})

describe('HP-295 — 키보드 큐 처리의 소유권과 안전 경계', () => {
  const reports = () => [
    makeReportItem({ id: 101, snapshotMessage: '첫 신고' }),
    makeReportItem({ id: 102, snapshotMessage: '둘째 신고' }),
    makeReportItem({ id: 103, snapshotMessage: '셋째 신고' }),
  ]

  it('모달이 닫힌 동안 J/K는 행 포커스만 움직이고 Enter가 명시적으로 연다', async () => {
    listReports.mockResolvedValue({ items: reports(), nextCursor: null })
    renderPage()
    await screen.findByText('첫 신고')
    const rows = screen.getAllByRole('row').slice(1)

    fireEvent.keyDown(document, { key: 'j' })
    expect(rows[0]).toHaveFocus()
    fireEvent.keyDown(document, { key: 'j' })
    expect(rows[1]).toHaveFocus()
    fireEvent.keyDown(document, { key: 'k' })
    expect(rows[0]).toHaveFocus()

    await userEvent.keyboard('{Enter}')
    expect(screen.getByRole('dialog', { name: '신고 상세' })).toBeInTheDocument()
  })

  it('3건을 마우스 없이 처리하되 성공 뒤 다음 모달은 자동으로 열지 않는다', async () => {
    const all = reports()
    listReports
        .mockResolvedValueOnce({ items: all, nextCursor: null })
        .mockResolvedValueOnce({ items: all.slice(1), nextCursor: null })
        .mockResolvedValueOnce({ items: all.slice(2), nextCursor: null })
        .mockResolvedValueOnce({ items: [], nextCursor: null })
    vi.mocked(admin.resolveReport).mockResolvedValue({} as never)
    renderPage()
    await screen.findByText('첫 신고')

    fireEvent.keyDown(document, { key: 'j' })
    for (const [id, nextId] of [[101, 102], [102, 103], [103, null]] as const) {
      await userEvent.keyboard('{Enter}')
      expect(screen.getByRole('dialog', { name: '신고 상세' })).toBeInTheDocument()
      await userEvent.keyboard('n')
      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: '신고 상세' })).not.toBeInTheDocument()
      })
      expect(admin.resolveReport).toHaveBeenCalledWith(id, 'RESOLVED', null, null)
      if (nextId !== null) {
        const next = document.querySelector<HTMLElement>(`[data-report-id="${nextId}"]`)
        expect(next).toHaveFocus()
      }
    }
    expect(admin.resolveReport).toHaveBeenCalledTimes(3)
  })

  it('처리 메모 입력은 단축키가 아니고 보조 다이얼로그가 아래 조치 키를 막는다', async () => {
    listReports.mockResolvedValue({ items: reports(), nextCursor: null })
    renderPage()
    await screen.findByText('첫 신고')
    await userEvent.click(screen.getAllByRole('row')[1])

    const note = screen.getByRole('textbox', { name: '처리 메모' })
    await userEvent.type(note, 'bnxs')
    expect(note).toHaveValue('bnxs')
    expect(admin.blindMessage).not.toHaveBeenCalled()
    expect(admin.resolveReport).not.toHaveBeenCalled()
    expect(admin.suspendUser).not.toHaveBeenCalled()

    // 메모 밖에서 S는 정지 확인까지만 연다. 위 겹에서 X를 눌러도 기각으로 새지 않는다.
    ;(screen.getByRole('dialog', { name: '신고 상세' }) as HTMLElement).focus()
    await userEvent.keyboard('s')
    expect(screen.getByRole('dialog', { name: '계정 정지' })).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('dialog', { name: '계정 정지' }), { key: 'x' })
    expect(admin.resolveReport).not.toHaveBeenCalled()
    expect(admin.suspendUser).not.toHaveBeenCalled()
  })

  it('OS 자동 반복·빠른 개별 연타·IME 조합은 한 신고를 중복 종결하지 않는다', async () => {
    listReports.mockResolvedValue({ items: reports(), nextCursor: null })
    let finish!: () => void
    vi.mocked(admin.resolveReport).mockImplementation(() => new Promise<void>((resolve) => {
      finish = resolve
    }) as never)
    renderPage()
    await screen.findByText('첫 신고')
    await userEvent.click(screen.getAllByRole('row')[1])
    const modal = screen.getByRole('dialog', { name: '신고 상세' })

    fireEvent.keyDown(modal, { key: 'x', repeat: true })
    fireEvent.keyDown(modal, { key: 'x', isComposing: true })
    expect(admin.resolveReport).not.toHaveBeenCalled()

    fireEvent.keyDown(modal, { key: 'x' })
    fireEvent.keyDown(modal, { key: 'x' })
    fireEvent.keyDown(modal, { key: 'x' })
    await waitFor(() => expect(admin.resolveReport).toHaveBeenCalledTimes(1))
    finish()
  })
})

describe('쓰기 도중에는 모달을 닫지 않는다(HP-298)', () => {
  /**
   * 모달이 쓰기 도중 닫히면 상세 패널이 언마운트돼 <b>결과를 알릴 곳이 사라진다</b> —
   * 일괄 가림이 40건 중 3건 실패했는데 그 사실이 조용히 없어지면 운영자는 전부 가려진 줄 알고
   * 넘어간다. 백드롭 클릭은 특히 잘못 눌리기 쉬워 "실수로 닫힘"이 흔하다.
   *
   * <p>갇히지 않는 근거는 둘이다 — 요청 하나는 apiFetch의 API_TIMEOUT_MS에 끊기고, 배치 전체가
   * 그 배수만큼 길어지는 경우는 일괄 가림 옆의 [취소]가 받는다. 끊는 장치가 하나도 없던 동안에는
   * 이 잠금 자체를 걸 수 없었다(걸면 얼고, 안 걸면 결과가 사라졌다).
   */
  function openModalWithPendingWrite() {
    vi.mocked(admin.resolveReport).mockImplementation(() => new Promise(() => {}))
  }

  it('백드롭 클릭·Esc로 닫히지 않고 ✕도 잠긴다', async () => {
    openModalWithPendingWrite()
    const { container } = renderPage()
    await screen.findByText('범인은 집사다', { exact: false })
    await userEvent.click(screen.getAllByRole('row')[1])
    await userEvent.click(within(screen.getByRole('dialog', { name: '신고 상세' }))
        .getByRole('button', { name: '기각' }))

    await userEvent.click(container.querySelector('.modal-backdrop')!)
    expect(screen.getByRole('dialog', { name: '신고 상세' })).toBeInTheDocument()

    await userEvent.keyboard('{Escape}')
    expect(screen.getByRole('dialog', { name: '신고 상세' })).toBeInTheDocument()

    expect(screen.getByRole('button', { name: '닫기' })).toBeDisabled()
  })

  it('닫는 조치가 성공하면 모달이 닫힌다 — 잠금이 남아 갇히지 않는다', async () => {
    // clearAllMocks는 호출 기록만 지우고 구현은 남긴다 — 앞 테스트가 심은 "영영 안 끝나는"
    // 구현이 새면 여기서도 잠긴 채라 원인과 무관한 실패가 난다(이 파일 beforeEach 주석 참조).
    vi.mocked(admin.resolveReport).mockResolvedValue({ id: 101, status: 'REJECTED' } as never)
    renderPage()
    await screen.findByText('범인은 집사다', { exact: false })
    await userEvent.click(screen.getAllByRole('row')[1])
    await userEvent.click(within(screen.getByRole('dialog', { name: '신고 상세' }))
        .getByRole('button', { name: '기각' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '신고 상세' })).not.toBeInTheDocument()
    })
  })
})

describe('일괄 가림 결과는 모달이 닫혀도 화면에 남는다(HP-298)', () => {
  /**
   * 페이지 → 상세 패널 → 작성자 글 목록으로 이어지는 <b>3단 합성</b>을 실제 행으로 통과시킨다.
   * 다른 테스트들은 작성자 목록을 빈 배열로 스텁해, 잠금·알림이 지나는 이 경로가 통째로
   * 검증되지 않았다(2026-08-11 4라운드 리뷰).
   *
   * <p>핵심은 <b>결과가 살아남는가</b>이다. 일부 실패 사실이 모달 안에만 있으면 신고가 큐에서
   * 빠지거나 운영자가 모달을 닫는 순간 함께 사라진다 — 못 가린 메시지는 여전히 사용자에게
   * 보이는데 화면 어디에도 그 사실이 없다.
   */
  it('일부 실패하면 모달을 닫아도 결과가 목록 화면에 남는다', async () => {
    vi.mocked(admin.listAuthorMessages).mockResolvedValue({
      rows: [{
        msgId: '01FIXTUREMSG0000000000000A', message: '범인은 집사다',
        playbackTime: 100, status: 'visible',
      }],
      total: 1,
    })
    vi.mocked(admin.blindMessage).mockRejectedValue(new Error('일시 오류'))
    const { container } = renderPage()
    await screen.findByText('범인은 집사다', { exact: false })
    await userEvent.click(screen.getAllByRole('row')[1])

    await userEvent.click(await screen.findByRole('button', { name: /선택 1건 가림/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: '닫기' })).toBeEnabled())
    await userEvent.click(container.querySelector('.modal-backdrop')!)

    expect(screen.queryByRole('dialog', { name: '신고 상세' })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('1건 실패')
  })

  /**
   * 다른 목록을 보는데 이전 목록에서 난 "1건 실패"가 그대로 떠 있으면, 지금 보는 신고들에서
   * 난 일로 읽힌다. 결과 문구는 <b>그 목록의 것</b>이지 화면 전체의 것이 아니다.
   */
  it('필터를 바꾸면 이전 결과 문구를 내린다', async () => {
    vi.mocked(admin.listAuthorMessages).mockResolvedValue({
      rows: [{
        msgId: '01FIXTUREMSG0000000000000A', message: '범인은 집사다',
        playbackTime: 100, status: 'visible',
      }],
      total: 1,
    })
    vi.mocked(admin.blindMessage).mockRejectedValue(new Error('일시 오류'))
    const { container } = renderPage()
    await screen.findByText('범인은 집사다', { exact: false })
    await userEvent.click(screen.getAllByRole('row')[1])
    await userEvent.click(await screen.findByRole('button', { name: /선택 1건 가림/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: '닫기' })).toBeEnabled())
    await userEvent.click(container.querySelector('.modal-backdrop')!)
    expect(screen.getByRole('status')).toHaveTextContent('1건 실패')

    await userEvent.click(screen.getByRole('button', { name: '열림' }))   // 필터 해제

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  /**
   * 잠금 사슬의 <b>자식 → 페이지</b> 구간. 다른 테스트들은 패널 자신의 쓰기(기각)로만 잠그므로,
   * `onBusyChange(locked)`를 `onBusyChange(busy)`로 바꾸는 변이가 모든 테스트를 통과했다
   * (2026-08-12 독립 리뷰). 그 회귀가 나가면 <b>일괄 가림 도중 모달이 닫혀</b> 결과를 알릴
   * 화면이 사라진다 — 못 가린 건은 여전히 사용자에게 보이는데 화면 어디에도 그 사실이 없다.
   */
  it('자식의 일괄 가림 중에도 모달이 닫히지 않는다', async () => {
    vi.mocked(admin.listAuthorMessages).mockResolvedValue({
      rows: [{
        msgId: '01FIXTUREMSG0000000000000A', message: '범인은 집사다',
        playbackTime: 100, status: 'visible',
      }],
      total: 1,
    })
    vi.mocked(admin.blindMessage).mockImplementation(() => new Promise(() => {}))
    const { container } = renderPage()
    await screen.findByText('범인은 집사다', { exact: false })
    await userEvent.click(screen.getAllByRole('row')[1])

    await userEvent.click(await screen.findByRole('button', { name: /선택 1건 가림/ }))

    await userEvent.click(container.querySelector('.modal-backdrop')!)
    expect(screen.getByRole('dialog', { name: '신고 상세' })).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.getByRole('dialog', { name: '신고 상세' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '닫기' })).toBeDisabled()
  })
})
