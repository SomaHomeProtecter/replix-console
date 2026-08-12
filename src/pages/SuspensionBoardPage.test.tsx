import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as admin from '../api/admin'
import { makeSuspendedRow } from '../test/fixtures'
import SuspensionBoardPage from './SuspensionBoardPage'

vi.mock('../api/admin')

const listSuspendedUsers = vi.mocked(admin.listSuspendedUsers)
const unsuspendUser = vi.mocked(admin.unsuspendUser)

/**
 * 시각은 <b>고정 픽스처로 멀리 떼어 둔다</b> — 가짜 타이머를 쓰면 userEvent가 그것과 얽히고,
 * 실제 시각에 가까운 값을 쓰면 테스트가 어느 날 갑자기 갈래를 바꿔 깨진다.
 */
const LONG_PAST = '2020-01-01T00:00:00Z'   // 반드시 만료됨
const FAR_FUTURE = '2999-01-01T00:00:00Z'  // 반드시 진행 중

function renderPage() {
  return render(<MemoryRouter><SuspensionBoardPage /></MemoryRouter>)
}

/** 머리글 행을 뺀 데이터 행. */
async function dataRows(): Promise<HTMLElement[]> {
  const all = await screen.findAllByRole('row')
  return all.slice(1)
}

/** 해제는 두 단계다(오조작 방지) — 그 절차를 아는 곳은 여기 한 군데로 모은다. */
async function unsuspendRow(user: ReturnType<typeof userEvent.setup>, index = 0) {
  const triggers = await screen.findAllByRole('button', { name: '정지 해제' })
  await user.click(triggers[index])
  await user.click(await screen.findByRole('button', { name: '해제 확인' }))
}

beforeEach(() => {
  vi.clearAllMocks()
  listSuspendedUsers.mockImplementation(async () => ({ rows: [makeSuspendedRow()], total: 1 }))
  unsuspendUser.mockResolvedValue({
    userId: 9, status: 'ACTIVE', suspendedUntil: null, suspendReason: null,
  })
})

describe('정지 현황판(HP-300) — 목록', () => {
  it('서버가 준 순서를 그대로 그린다 — 정렬은 서버가 정본(만료 임박순)', async () => {
    listSuspendedUsers.mockResolvedValue({
      rows: [
        makeSuspendedRow({ userId: 1, displayName: '만료됨', suspendedUntil: LONG_PAST }),
        makeSuspendedRow({ userId: 2, displayName: '진행중', suspendedUntil: FAR_FUTURE }),
        makeSuspendedRow({ userId: 3, displayName: '무기한', suspendedUntil: null }),
      ],
      total: 3,
    })
    renderPage()

    const rows = await dataRows()
    expect(rows.map((r) => within(r).getByRole('link').textContent))
        .toEqual(['만료됨', '진행중', '무기한'])
  })

  it('행은 갈래·해제 예정·사유를 적고 이름이 사용자 상세로 가는 문이다', async () => {
    listSuspendedUsers.mockResolvedValue({
      rows: [makeSuspendedRow({
        userId: 42, displayName: '악성유저', suspendedUntil: FAR_FUTURE, suspendReason: '도배',
      })],
      total: 1,
    })
    renderPage()

    const row = (await dataRows())[0]
    expect(within(row).getByRole('link', { name: '악성유저' }))
        .toHaveAttribute('href', '/users/42')
    expect(within(row).getByText('진행 중')).toBeInTheDocument()
    expect(within(row).getByText('도배')).toBeInTheDocument()
  })

  it('이름이 없으면 #id로 부른다 — 링크가 빈 칸이 되면 상세로 갈 문이 사라진다', async () => {
    listSuspendedUsers.mockResolvedValue({
      rows: [makeSuspendedRow({ userId: 42, displayName: null })], total: 1,
    })
    renderPage()

    expect(await screen.findByRole('link', { name: '#42' })).toHaveAttribute('href', '/users/42')
  })

  it('정지가 없으면 그렇다고 적는다', async () => {
    listSuspendedUsers.mockResolvedValue({ rows: [], total: 0 })
    renderPage()

    expect(await screen.findByText(/정지 중인 계정이 없습니다/)).toBeInTheDocument()
  })
})

describe('정지 현황판 — 세 갈래 세기', () => {
  it('진행 중·무기한·만료됨을 각각 센다', async () => {
    listSuspendedUsers.mockResolvedValue({
      rows: [
        makeSuspendedRow({ userId: 1, suspendedUntil: LONG_PAST }),
        makeSuspendedRow({ userId: 2, suspendedUntil: LONG_PAST }),
        makeSuspendedRow({ userId: 3, suspendedUntil: FAR_FUTURE }),
        makeSuspendedRow({ userId: 4, suspendedUntil: null }),
      ],
      total: 4,
    })
    renderPage()

    const chips = await screen.findByRole('list', { name: '정지 갈래별 수' })
    expect(within(chips).getByText(/진행 중/)).toHaveTextContent('1')
    expect(within(chips).getByText(/무기한/)).toHaveTextContent('1')
    expect(within(chips).getByText(/만료됨/)).toHaveTextContent('2')
  })

  /**
   * 상한(200)에 잘리면 칩은 <b>화면에 실린 것만</b> 셀 수 있다. 그걸 밝히지 않으면 "만료됨 3건"이
   * 전체인 줄 알고 정리를 끝냈다고 판단한다 — 실제로는 창 밖에 더 있다.
   */
  it('잘렸으면 전체 수와 함께 "실린 것만 센 수"임을 밝힌다', async () => {
    listSuspendedUsers.mockResolvedValue({
      rows: [makeSuspendedRow({ userId: 1 })], total: 5,
    })
    renderPage()

    const notice = await screen.findByRole('status')
    expect(notice).toHaveTextContent('5')
    expect(notice).toHaveTextContent('1')
    expect(await screen.findByText(/표시된 것만/)).toBeInTheDocument()
  })

  it('안 잘렸으면 그 안내를 띄우지 않는다 — 늘 뜨면 아무도 안 읽는다', async () => {
    listSuspendedUsers.mockResolvedValue({
      rows: [makeSuspendedRow({ userId: 1 })], total: 1,
    })
    renderPage()

    await screen.findByRole('table')
    expect(screen.queryByText(/표시된 것만/)).not.toBeInTheDocument()
  })
})

/**
 * 콘솔은 열어 둔 채로 쓰는 화면이라, 시각을 렌더 때 굳히면 만료가 <b>영영 안 넘어간다</b> —
 * 하필 "지금 어떤가"가 이 화면의 전부다(HP-296에서 큐 경과 뱃지가 겪은 것과 같은 결함).
 *
 * <p>칩과 행을 <b>함께</b> 보는 이유: 둘이 각자 {@code new Date()}를 부르면 같은 렌더 안에서도
 * 시각이 갈려, 칩은 "진행 중 1"인데 그 아래 행은 "만료됨"이라고 적는 순간이 생긴다.
 */
describe('정지 현황판 — 시각', () => {
  it('열어 둔 화면에서 만료가 넘어가고, 칩과 행이 함께 넘어간다', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-08-12T00:00:00Z'))
      listSuspendedUsers.mockResolvedValue({
        rows: [makeSuspendedRow({ userId: 1, suspendedUntil: '2026-08-12T00:00:30Z' })],
        total: 1,
      })
      renderPage()
      await act(async () => { await vi.advanceTimersByTimeAsync(0) })

      const chips = screen.getByRole('list', { name: '정지 갈래별 수' })
      expect(within(chips).getByText(/진행 중/)).toHaveTextContent('1')
      expect(within(chips).getByText(/만료됨/)).toHaveTextContent('0')
      expect(screen.getAllByRole('row')[1]).toHaveTextContent('진행 중')

      // 30초 뒤 만료 — 다음 분 눈금에서 화면이 따라온다
      await act(async () => { await vi.advanceTimersByTimeAsync(61_000) })

      expect(within(chips).getByText(/진행 중/)).toHaveTextContent('0')
      expect(within(chips).getByText(/만료됨/)).toHaveTextContent('1')
      expect(screen.getAllByRole('row')[1]).toHaveTextContent('만료됨')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('정지 현황판 — 행에서 바로 해제', () => {
  it('그 행의 사용자로 해제가 나가고, 끝나면 목록을 다시 읽는다', async () => {
    const user = userEvent.setup()
    listSuspendedUsers.mockImplementation(async () => ({
      rows: [makeSuspendedRow({ userId: 77 })], total: 1,
    }))
    renderPage()

    await unsuspendRow(user)

    await waitFor(() => expect(unsuspendUser).toHaveBeenCalledWith(77))
    await waitFor(() => expect(listSuspendedUsers).toHaveBeenCalledTimes(2))
  })

  /**
   * ST-6(HP-298)에서 배운 것 — 쓰기가 도는 동안 <b>다른 행의 해제도</b> 잠근다. 목록은 조치 뒤
   * 통째로 다시 읽히므로, 첫 요청이 끝나기 전에 두 번째를 누르면 그 사이 사라질 수도 있는 행에
   * 대고 조치가 나간다. 상한은 {@code API_TIMEOUT_MS}라 잠금이 영구히 남지 않는다.
   */
  it('한 건이 도는 동안 모든 행의 해제가 잠긴다', async () => {
    const user = userEvent.setup()
    let release!: () => void
    unsuspendUser.mockImplementation(() => new Promise((ok) => {
      release = () => ok({ userId: 1, status: 'ACTIVE', suspendedUntil: null, suspendReason: null })
    }))
    listSuspendedUsers.mockImplementation(async () => ({
      rows: [makeSuspendedRow({ userId: 1 }), makeSuspendedRow({ userId: 2 })], total: 2,
    }))
    renderPage()

    const triggers = await screen.findAllByRole('button', { name: '정지 해제' })
    await user.click(triggers[0])
    await user.click(await screen.findByRole('button', { name: '해제 확인' }))

    // 다른 행(2번)의 해제도 잠긴다 — 확인 단계와 무관한 별개 행이다
    await waitFor(() => expect(triggers[1]).toBeDisabled())
    expect(screen.getByRole('button', { name: '해제 확인' })).toBeDisabled()
    // 새로고침도 함께 잠근다 — 쓰기는 끝나면 스스로 목록을 다시 읽으므로, 그 사이 손으로 건 읽기는
    // 조치 전 목록을 실어 와 조치 후 목록을 덮을 수 있다
    expect(screen.getByRole('button', { name: '새로고침' })).toBeDisabled()

    release()
    await waitFor(() => expect(unsuspendUser).toHaveBeenCalledTimes(1))
  })

  it('해제가 실패하면 알리고, 목록은 그래도 다시 읽어 실상에 맞춘다', async () => {
    const user = userEvent.setup()
    unsuspendUser.mockRejectedValue(new Error('403 권한이 없습니다'))
    renderPage()

    await unsuspendRow(user)

    expect(await screen.findByRole('alert')).toHaveTextContent('403 권한이 없습니다')
    await waitFor(() => expect(listSuspendedUsers).toHaveBeenCalledTimes(2))
  })

  /**
   * 해제 자체는 성공했는데 재조회가 실패하면 화면은 <b>조치 전 목록</b>이다 — 방금 푼 계정이
   * 그대로 남아 있어, 아무 일도 없었던 것처럼 보인다. 그 상태를 화면이 밝혀야 다시 누르지 않는다.
   */
  it('해제는 됐는데 재조회가 실패하면 화면이 최신이 아님을 밝힌다', async () => {
    const user = userEvent.setup()
    listSuspendedUsers
        .mockResolvedValueOnce({ rows: [makeSuspendedRow({ userId: 9 })], total: 1 })
        .mockRejectedValueOnce(new Error('네트워크 오류'))
    renderPage()

    await unsuspendRow(user)

    expect(await screen.findByRole('alert')).toHaveTextContent(/최신이 아닙니다/)
  })

  /**
   * 만료된 행의 해제는 <b>실제 제한을 푸는 것이 아니라</b> 남은 표시를 정리하는 일이다(만료 배치가
   * 없어 status만 SUSPENDED로 남아 있다). 같은 버튼이라 구분을 적지 않으면 아직 걸려 있는 벌을
   * 푼다고 착각한다.
   */
  it('만료된 행의 해제는 이미 풀려 있음을 함께 알린다', async () => {
    listSuspendedUsers.mockResolvedValue({
      rows: [makeSuspendedRow({ userId: 1, suspendedUntil: LONG_PAST })], total: 1,
    })
    renderPage()

    const button = await screen.findByRole('button', { name: '정지 해제' })
    expect(button).toHaveAttribute('title', expect.stringContaining('이미'))
  })
})

describe('정지 현황판 — 오조작 방지(두 단계)', () => {
  /**
   * 줄이 촘촘하고 옆 줄이 남이라 한 칸 빗나간 클릭이 <b>엉뚱한 사람의 정지를 푼다</b>. 되돌리려면
   * 다시 정지해야 하는데 원래 기간은 이 화면에 없어(해제 예정 시각만 있다) 그대로 복원할 수 없다.
   */
  it('한 번 눌러서는 아무것도 나가지 않는다', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: '정지 해제' }))

    expect(await screen.findByRole('button', { name: '해제 확인' })).toBeInTheDocument()
    expect(unsuspendUser).not.toHaveBeenCalled()
  })

  it('취소하면 원래대로 돌아간다', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: '정지 해제' }))
    await user.click(screen.getByRole('button', { name: '취소' }))

    expect(await screen.findByRole('button', { name: '정지 해제' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '해제 확인' })).not.toBeInTheDocument()
    expect(unsuspendUser).not.toHaveBeenCalled()
  })

  it('확인은 한 행에만 열린다 — 다른 행을 누르면 그 행으로 옮겨 간다', async () => {
    const user = userEvent.setup()
    listSuspendedUsers.mockResolvedValue({
      rows: [makeSuspendedRow({ userId: 1 }), makeSuspendedRow({ userId: 2 })], total: 2,
    })
    renderPage()

    const triggers = await screen.findAllByRole('button', { name: '정지 해제' })
    await user.click(triggers[0])
    // 1번 행은 확인 단계로 바뀌었으니, 남아 있는 트리거는 2번 행 것뿐이다
    await user.click(screen.getByRole('button', { name: '정지 해제' }))

    expect(screen.getAllByRole('button', { name: '해제 확인' })).toHaveLength(1)
    expect(within((await dataRows())[1]).getByRole('button', { name: '해제 확인' }))
        .toBeInTheDocument()
  })
})

describe('정지 현황판 — 읽기 실패', () => {
  it('목록을 못 읽으면 알리고 다시 시도할 수 있게 한다', async () => {
    const user = userEvent.setup()
    listSuspendedUsers.mockRejectedValueOnce(new Error('서버 오류'))
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('서버 오류')

    await user.click(screen.getByRole('button', { name: '새로고침' }))
    expect(await screen.findByRole('table')).toBeInTheDocument()
  })

  /**
   * "화면이 최신이 아닙니다"라고 알리면서 <b>고칠 손잡이를 주지 않으면</b> 운영자가 할 수 있는
   * 일은 화면을 떠나는 것뿐이다. 알림과 수단은 같은 화면에 있어야 한다(HP-298에서 배운 것).
   */
  it('재조회가 실패해 낡은 화면이 남아도 새로고침으로 되살릴 수 있다', async () => {
    const user = userEvent.setup()
    listSuspendedUsers
        .mockResolvedValueOnce({ rows: [makeSuspendedRow({ userId: 9 })], total: 1 })
        .mockRejectedValueOnce(new Error('네트워크 오류'))
        .mockResolvedValueOnce({ rows: [], total: 0 })
    renderPage()

    await unsuspendRow(user)
    expect(await screen.findByRole('alert')).toHaveTextContent(/최신이 아닙니다/)

    await user.click(screen.getByRole('button', { name: '새로고침' }))

    expect(await screen.findByText(/정지 중인 계정이 없습니다/)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  /**
   * 목록이 새로 깔리면 열어 둔 확인은 <b>방금 사라진 목록</b>을 보고 연 것이 된다 — 그대로 두면
   * 그새 바뀐 행에 대고 [해제 확인]을 누른다.
   */
  it('목록을 다시 읽으면 열어 둔 확인이 닫힌다', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: '정지 해제' }))
    expect(screen.getByRole('button', { name: '해제 확인' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '새로고침' }))

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: '해제 확인' })).not.toBeInTheDocument())
    expect(unsuspendUser).not.toHaveBeenCalled()
  })
})
