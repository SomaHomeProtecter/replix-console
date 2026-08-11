import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as admin from '../api/admin'
import { makeAuthorMessage, makeReportItem } from '../test/fixtures'
import AuthorMessages from './AuthorMessages'

vi.mock('../api/admin')

const listAuthorMessages = vi.mocked(admin.listAuthorMessages)
const blindMessage = vi.mocked(admin.blindMessage)

const onActionDone = vi.fn()

/** 신고된 줄 + 같은 사람이 그 회차에 남긴 다른 줄들. */
function threeRows() {
  return {
    rows: [
      makeAuthorMessage({ msgId: 'M-1', message: '도배 첫째', playbackTime: 10 }),
      // 신고로 올라온 바로 그 줄(fixture의 report.msgId)
      makeAuthorMessage({ msgId: '01FIXTUREMSG0000000000000A', message: '신고된 줄', playbackTime: 20 }),
      makeAuthorMessage({ msgId: 'M-3', message: '도배 셋째', playbackTime: 30 }),
    ],
    total: 3,
  }
}

/** 부모는 key={report.id}로 신고마다 새로 마운트한다 — 여기서도 같은 방식으로 그린다. */
function renderPanel(report = makeReportItem()) {
  const view = render(
      <AuthorMessages key={report.id} report={report} busy={false} onActionDone={onActionDone} />)
  return {
    ...view,
    rerenderWith: (next: ReturnType<typeof makeReportItem>) => view.rerender(
        <AuthorMessages key={next.id} report={next} busy={false} onActionDone={onActionDone} />),
  }
}

const checkboxes = () => screen.getAllByRole('checkbox')
const blindButton = () => screen.getByRole('button', { name: /가림/ })

beforeEach(() => {
  vi.resetAllMocks()
  listAuthorMessages.mockResolvedValue(threeRows())
  blindMessage.mockResolvedValue({ blinded: true })
})

describe('작성자 글 일괄 보기·가림(HP-298)', () => {
  it('그 회차 그 작성자의 글을 모아 보여준다', async () => {
    renderPanel()
    expect(await screen.findByText('도배 첫째')).toBeInTheDocument()
    expect(screen.getByText('도배 셋째')).toBeInTheDocument()
    // keep = 신고된 msgId — 상한에 잘려도 그 줄이 목록에 남게 한다
    expect(listAuthorMessages).toHaveBeenCalledWith(42, 9, '01FIXTUREMSG0000000000000A')
  })

  /**
   * 신고로 올라온 줄만 미리 체크한다. <b>전체 선택을 기본값으로 두지 않는다</b>(티켓 주의) —
   * 도배 판정은 사람이 한다. 기본이 전체면 운영자가 확인 없이 누르는 쪽으로 기울고,
   * 그 순간 이 화면은 판단 도구가 아니라 일괄 삭제 버튼이 된다.
   */
  it('신고된 줄만 미리 체크한다 — 전체 선택이 기본이 아니다', async () => {
    renderPanel()
    await screen.findByText('신고된 줄')

    const checked = checkboxes().filter((c) => (c as HTMLInputElement).checked)
    expect(checked).toHaveLength(1)
    expect(blindButton()).toHaveTextContent('선택 1건 가림')
  })

  /** DoD — 선택 0건이면 누를 것이 없다. */
  it('선택을 모두 풀면 버튼이 비활성이다', async () => {
    renderPanel()
    await screen.findByText('신고된 줄')

    await userEvent.click(checkboxes().find((c) => (c as HTMLInputElement).checked)!)

    expect(blindButton()).toBeDisabled()
  })

  /**
   * 고른 건마다 단건 API를 부른다 — 일괄 엔드포인트를 만들면 감사가 한 행으로 뭉쳐진다.
   * "모든 2xx 쓰기 조치가 1행씩 남긴다"는 원칙이 3인이 admin을 공유하는 한 되돌림 판단의
   * 유일한 근거다(티켓 주의).
   */
  it('선택한 건마다 가림을 따로 부른다 — 감사는 건당 1행', async () => {
    renderPanel()
    await screen.findByText('도배 첫째')
    await userEvent.click(screen.getByRole('checkbox', { name: /도배 첫째/ }))

    await userEvent.click(blindButton())

    expect(blindMessage).toHaveBeenCalledTimes(2)
    expect(blindMessage).toHaveBeenCalledWith(42, 'M-1')
    expect(blindMessage).toHaveBeenCalledWith(42, '01FIXTUREMSG0000000000000A')
    expect(onActionDone).toHaveBeenCalled()
  })

  /**
   * DoD — 부분 실패 시 성공분만 반영하고 재조회한다. 하나가 실패했다고 나머지를 되돌릴 수
   * 없으므로(가림은 건별로 이미 확정) 남은 것을 계속 시도하고, <b>몇 건이 실패했는지 말한다</b> —
   * 조용히 넘어가면 운영자는 다 가려진 줄 안다.
   */
  it('일부가 실패해도 나머지는 가리고, 실패 건수를 알린다', async () => {
    blindMessage.mockImplementation(async (_ep: number, msgId: string) => {
      if (msgId === 'M-1') throw new Error('일시 오류')
      return { blinded: true }
    })
    renderPanel()
    await screen.findByText('도배 첫째')
    await userEvent.click(screen.getByRole('checkbox', { name: /도배 첫째/ }))

    await userEvent.click(blindButton())

    expect(blindMessage).toHaveBeenCalledTimes(2)      // 실패해도 나머지를 멈추지 않는다
    expect(screen.getByRole('alert')).toHaveTextContent('1건 실패')
    expect(onActionDone).toHaveBeenCalled()             // 성공분 반영을 위해 재조회
  })

  /** 이미 가린 글을 또 가리면 감사에 뜻 없는 행만 쌓인다 — 고를 수 없게 하고 그렇게 적는다. */
  it('이미 가려진 글은 고를 수 없고 가림으로 표시된다', async () => {
    listAuthorMessages.mockResolvedValue({
      rows: [makeAuthorMessage({ msgId: 'M-9', message: '이미 가린 글', status: 'blinded' })],
      total: 1,
    })
    renderPanel()
    await screen.findByText('이미 가린 글')

    expect(screen.getByRole('checkbox', { name: /이미 가린 글/ })).toBeDisabled()
    const row = screen.getByText('이미 가린 글').closest('li')!
    expect(within(row).getByText('가림')).toBeInTheDocument()
  })

  /** 조용히 자르면 "이게 전부"로 읽혀 남은 도배를 놓친다(memory: no silent caps). */
  it('상한에 잘렸으면 그 사실을 알린다', async () => {
    listAuthorMessages.mockResolvedValue({ rows: threeRows().rows, total: 250 })
    renderPanel()
    await screen.findByText('도배 첫째')

    expect(screen.getByText(/250건 중 3건/)).toBeInTheDocument()
  })

  it('글이 없으면 목록 대신 그렇게 말한다', async () => {
    listAuthorMessages.mockResolvedValue({ rows: [], total: 0 })
    renderPanel()

    expect(await screen.findByText(/남긴 글이 없습니다/)).toBeInTheDocument()
  })
})

describe('경합·상태 정합(2026-08-11 자체 리뷰)', () => {
  /** 늦게 도착한 이전 신고의 응답이 지금 신고의 목록을 덮으면, 운영자가 본 적 없는 남의 글이 가려진다. */
  it('늦게 온 이전 응답이 현재 신고의 목록을 덮지 않는다', async () => {
    let resolveA!: (v: { rows: never[]; total: number }) => void
    listAuthorMessages
        .mockImplementationOnce(() => new Promise((r) => { resolveA = r as never }))
        .mockResolvedValueOnce({
          rows: [makeAuthorMessage({ msgId: 'B-1', message: 'B의 글' })], total: 1,
        })
    const { rerenderWith } = renderPanel(makeReportItem({ id: 1, msgId: 'A-MSG' }))
    rerenderWith(makeReportItem({ id: 2, msgId: 'B-1' }))
    await screen.findByText('B의 글')

    // A의 응답이 이제야 도착한다
    resolveA({ rows: [makeAuthorMessage({ msgId: 'A-MSG', message: 'A의 글' })] as never, total: 1 })
    await new Promise((r) => setTimeout(r, 0))

    expect(screen.queryByText('A의 글')).not.toBeInTheDocument()
    expect(screen.getByText('B의 글')).toBeInTheDocument()
  })

  /** 새 응답이 오기 전까지 이전 신고의 글이 체크된 채 남으면 그 상태로 가림이 나갈 수 있다. */
  it('신고가 바뀌면 새 목록이 오기 전에 이전 목록을 비운다', async () => {
    listAuthorMessages.mockResolvedValueOnce(threeRows())
        .mockImplementationOnce(() => new Promise(() => {}))   // 두 번째는 영영 안 온다
    const { rerenderWith } = renderPanel(makeReportItem({ id: 1 }))
    await screen.findByText('도배 첫째')

    rerenderWith(makeReportItem({ id: 2, msgId: 'OTHER' }))

    expect(screen.queryByText('도배 첫째')).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  /**
   * 보내고 나면 <b>선택을 비워</b> 같은 건이 두 번 나가지 않는다. 잠금을 재조회까지 끌지
   * 않는 이유: 그러면 조회가 멎었을 때 화면이 무기한 잠긴다(2라운드 지적 — HP-294에서 이미
   * 같은 실패를 겪고 되돌렸던 구조다). 점수 정정 버튼과 같은 해법이다.
   */
  it('보내고 나면 선택이 풀려 같은 건이 두 번 나가지 않는다', async () => {
    renderPanel()
    await screen.findByText('신고된 줄')
    // 재조회는 영영 안 온다 — 그래도 버튼은 잠겨 있어야 한다
    listAuthorMessages.mockImplementationOnce(() => new Promise(() => {}))

    await userEvent.click(blindButton())

    expect(blindButton()).toBeDisabled()
    expect(blindButton()).toHaveTextContent('선택 0건 가림')
  })

  /**
   * 부모가 가림·해제를 하면 재조회로 report.currentStatus가 바뀐다 — 그걸 축으로 다시 읽는다.
   * 별도 신호(reloadKey)를 두지 않는 이유: 그건 <b>모든</b> 부모 조치에 재조회를 걸어,
   * 점수 정정처럼 이 목록과 무관한 조치까지 운영자가 골라 둔 선택을 지웠다(2라운드 지적).
   */
  it('신고 메시지의 실황이 바뀌면 목록을 다시 읽는다', async () => {
    const { rerenderWith } = renderPanel(makeReportItem({ currentStatus: 'visible' }))
    await screen.findByText('도배 첫째')
    expect(listAuthorMessages).toHaveBeenCalledTimes(1)

    rerenderWith(makeReportItem({ currentStatus: 'blinded' }))

    expect(listAuthorMessages).toHaveBeenCalledTimes(2)
  })

  /**
   * 같은 <b>메시지</b>에 신고가 둘이면(묶음 ×N — 큐가 가장 급하다고 강조하는 경우) 두 신고의
   * episodeId·msgId·작성자가 모두 같다. 신고 전환을 상태 초기화로 처리하면 목록만 비고
   * 재조회 축이 하나도 안 바뀌어 <b>영영 빈 채로 남는다</b>(2라운드 지적). key로 새로 마운트해
   * 그 경우를 구조적으로 없앤다.
   */
  it('같은 메시지의 다른 신고로 옮겨도 목록이 채워진다', async () => {
    const { rerenderWith } = renderPanel(makeReportItem({ id: 101 }))
    await screen.findByText('도배 첫째')

    rerenderWith(makeReportItem({ id: 102 }))   // msgId·episodeId·작성자 동일

    expect(await screen.findByText('도배 첫째')).toBeInTheDocument()
  })

  /** 실패 배너가 다음 신고로 따라가면, 아무 조치도 안 한 신고에 실패 문구가 뜬다. */
  it('신고가 바뀌면 이전의 실패 배너를 지운다', async () => {
    blindMessage.mockRejectedValue(new Error('실패'))
    const { rerenderWith } = renderPanel(makeReportItem({ id: 1 }))
    await screen.findByText('신고된 줄')
    await userEvent.click(blindButton())
    expect(screen.getByRole('alert')).toBeInTheDocument()

    listAuthorMessages.mockResolvedValue({ rows: [], total: 0 })
    rerenderWith(makeReportItem({ id: 2, msgId: 'OTHER' }))

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  /**
   * Redis status는 visible / blocked_profanity / blocked_hate / blinded 네 값이다(ChatService).
   * blinded만 보면 클린봇이 이미 막은 줄이 손 안 댄 글처럼 보여, 운영자가 다시 골라 가리면
   * 뜻 없는 감사 행만 쌓인다.
   */
  it('클린봇이 막은 줄은 표시하되 고를 수 있다 — 사용자가 필터를 끄면 보인다', async () => {
    listAuthorMessages.mockResolvedValue({
      rows: [makeAuthorMessage({ msgId: 'M-P', message: '욕설 줄', status: 'blocked_profanity' })],
      total: 1,
    })
    renderPanel()
    await screen.findByText('욕설 줄')

    // ChatHistoryService: 본문을 지우는 것은 blinded뿐이고 blocked_*는 본문이 그대로 내려가
    // FE 클린봇 토글에 달렸다 — 즉 사용자가 끄면 보이므로 운영자가 가려야 할 대상이다.
    expect(screen.getByRole('checkbox', { name: /욕설 줄/ })).toBeEnabled()
    const row = screen.getByText('욕설 줄').closest('li')!
    expect(within(row).getByText('클린봇')).toBeInTheDocument()
  })

})
