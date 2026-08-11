import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as admin from '../api/admin'
import { makeAuthorMessage, makeReportItem } from '../test/fixtures'
import AuthorMessages from './AuthorMessages'

vi.mock('../api/admin')

const listAuthorMessages = vi.mocked(admin.listAuthorMessages)
const blindMessage = vi.mocked(admin.blindMessage)

const onActionDone = vi.fn()
/** 부모가 줘야 하는 "렌더마다 바뀌지 않는" 함수 — 모듈 수준에 두어 그 계약대로 쓴다. */
const onBusyChange = vi.fn()

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
function renderPanel(report = makeReportItem(), busy = false) {
  const view = render(
      <AuthorMessages
          key={report.id} report={report} busy={busy}
          onActionDone={onActionDone} onBusyChange={onBusyChange} />)
  return {
    ...view,
    rerenderWith: (next: ReturnType<typeof makeReportItem>) => view.rerender(
        <AuthorMessages
            key={next.id} report={next} busy={false}
            onActionDone={onActionDone} onBusyChange={onBusyChange} />),
  }
}

/** 테스트가 결정 시점을 잡을 수 있게 밖에서 푸는 약속. */
function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((ok, fail) => { resolve = ok; reject = fail })
  return { promise, resolve, reject }
}

/**
 * 실제 apiFetch처럼 — 응답이 없다가 signal이 끊기면 거절한다.
 * 이걸 안 지키면(그냥 영영 매달리는 promise) 취소해도 배치가 끝나지 않아, 테스트가
 * <b>실제로는 없는</b> 교착을 재현하게 된다.
 */
function hangingBlind() {
  blindMessage.mockImplementation((_ep: number, _msgId: string, signal?: AbortSignal) =>
    new Promise((_ok, fail) => {
      const abort = () => fail(new DOMException('aborted', 'AbortError'))
      if (signal?.aborted) abort()
      else signal?.addEventListener('abort', abort, { once: true })
    }))
}

const checkboxes = () => screen.getAllByRole('checkbox')
/** 일괄 가림 버튼 — 라벨이 단계에 따라 바뀌므로(선택 N건 / 가림 중 / 목록 갱신 중) 셋 다 잡는다. */
const blindButton = () => screen.getByRole('button', { name: /가림|갱신 중/ })

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
    expect(blindMessage).toHaveBeenCalledWith(42, 'M-1', expect.any(AbortSignal))
    expect(blindMessage).toHaveBeenCalledWith(42, '01FIXTUREMSG0000000000000A', expect.any(AbortSignal))
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
    expect(screen.getByRole('alert')).toHaveTextContent('2건 중 1건')
    expect(onActionDone).toHaveBeenCalled()             // 성공분 반영을 위해 재조회
  })

  /**
   * 실패한 건을 <b>다시 골라 둔다</b>. 건수만 알려주면 운영자는 40건 중 어느 3건이 남았는지
   * 알 길이 없어 목록을 처음부터 다시 훑어야 한다 — 그 사이 이미 가려진 것을 또 고르면 감사에
   * 뜻 없는 BLIND 행이 쌓인다. 실패분만 체크된 채로 두면 [가림]을 한 번 더 누르는 것이 곧 재시도다.
   */
  it('실패한 건만 다시 골라 둔다 — 어느 건이 남았는지 알 수 있게', async () => {
    blindMessage.mockImplementation(async (_ep: number, msgId: string) => {
      if (msgId === 'M-1') throw new Error('일시 오류')
      return { blinded: true }
    })
    renderPanel()
    await screen.findByText('도배 첫째')
    await userEvent.click(screen.getByRole('checkbox', { name: /도배 첫째/ }))

    await userEvent.click(blindButton())

    expect(screen.getByRole('checkbox', { name: /도배 첫째/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /신고된 줄/ })).not.toBeChecked()
    expect(blindButton()).toHaveTextContent('선택 1건 가림')
  })

  /**
   * 가림 도중 모달을 닫아도 <b>큐 재조회는 나가야 한다</b>. onActionDone이 갱신하는 것은
   * 사라진 이 컴포넌트가 아니라 <b>부모 페이지</b>라, 언마운트 가드 안에 넣으면 서버는
   * 바뀌었는데 큐만 낡아 방금 가린 메시지가 '표시 중'으로 남는다.
   */
  it('가림 도중 모달이 닫혀도 큐 재조회는 나간다', async () => {
    const { unmount } = renderPanel()
    await screen.findByText('신고된 줄')
    let finish!: (v: { blinded: boolean }) => void
    blindMessage.mockImplementationOnce(() => new Promise((r) => { finish = r as never }))

    await userEvent.click(blindButton())
    unmount()
    await act(async () => { finish({ blinded: true }) })

    expect(onActionDone).toHaveBeenCalled()
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
   * 보내는 즉시 <b>선택을 비운다</b> — 같은 건이 두 번 나가는 창을 그 자리에서 닫는다.
   */
  it('보내는 즉시 선택이 비어 같은 건이 두 번 나가지 않는다', async () => {
    renderPanel()
    await screen.findByText('신고된 줄')

    await userEvent.click(blindButton())

    expect(blindMessage).toHaveBeenCalledTimes(1)
    expect(blindButton()).toHaveTextContent('선택 0건 가림')
    expect(screen.getByRole('checkbox', { name: /신고된 줄/ })).not.toBeChecked()
  })

  /**
   * <b>잠금은 재조회가 커밋될 때까지 유지한다.</b> 먼저 풀면 목록이 아직 옛것인 채 버튼이 열려,
   * 한 번 더 누르면 이미 가린 건에 또 요청이 나가고 감사에 중복 BLIND 행이 쌓인다.
   *
   * <p>한때 이 잠금을 뺐던 이유는 "조회가 멎으면 화면이 무기한 잠긴다"였는데, 그건 잠금이 아니라
   * <b>끊는 장치가 없던 것</b>이 원인이었다. 지금은 요청 하나가 apiFetch의 API_TIMEOUT_MS에
   * 끊기고(그 보장은 client.test.ts가 지킨다), 배치 전체가 길어지는 경우는 [취소]가 받는다.
   * 여기서는 admin API가 mock이라 시간 상한이 돌지 않으므로 이 테스트로는 그 부분을 증명하지 않는다.
   */
  it('재조회가 커밋될 때까지 잠근 채로 둔다 — 중복 조치 방지', async () => {
    renderPanel()
    await screen.findByText('신고된 줄')
    listAuthorMessages.mockImplementationOnce(() => new Promise(() => {}))   // 재조회가 안 온다

    await userEvent.click(blindButton())

    expect(blindButton()).toBeDisabled()
    expect(blindButton()).toHaveTextContent('목록 갱신 중')   // 무엇을 기다리는지 이름을 밝힌다
    expect(screen.getAllByRole('checkbox').every((c) => (c as HTMLInputElement).disabled)).toBe(true)
    // 보내는 단계가 끝났으므로 [취소]는 내려간다 — 눌러도 할 일이 없는 손잡이를 남기면
    // 멎은 것처럼 보이는 화면에서 유일한 출구가 반응조차 안 하는 꼴이 된다.
    expect(screen.queryByRole('button', { name: '취소' })).not.toBeInTheDocument()
  })

  /**
   * 누른 뒤 화면이 <b>누르기 전과 똑같아</b> 보이면(목록이 이미 차 있어 스피너도 안 뜬다)
   * 운영자는 안 눌린 줄 알고 한 번 더 누른다 — 그 순간 감사에 중복 행이 쌓인다.
   */
  it('진행 중에는 몇 건까지 처리했는지 보여준다', async () => {
    const gate = deferred<{ blinded: boolean }>()
    blindMessage
        .mockResolvedValueOnce({ blinded: true })
        .mockImplementationOnce(() => gate.promise)
    renderPanel()
    await screen.findByText('도배 첫째')
    await userEvent.click(screen.getByRole('checkbox', { name: /도배 첫째/ }))

    await userEvent.click(blindButton())

    expect(blindButton()).toHaveTextContent('가림 중… 1/2')
    await act(async () => { gate.resolve({ blinded: true }) })
  })

  /**
   * 브라우저는 호스트당 커넥션이 6개 안팎이라 200건을 한꺼번에 쏘면 뒤쪽은 대기줄에서 시간을
   * 다 쓰는데, 타임아웃은 <b>보낸 시점부터</b> 재므로 서버가 멀쩡해도 뒤쪽이 무더기로 끊긴다.
   */
  it('한 번에 흘려보내는 요청 수를 제한한다', async () => {
    const many = Array.from({ length: 10 }, (_, i) => makeAuthorMessage({
      msgId: `S-${i}`, message: `도배 ${i}`, playbackTime: i,
    }))
    listAuthorMessages.mockResolvedValue({ rows: many, total: 10 })
    blindMessage.mockImplementation(() => new Promise(() => {}))   // 하나도 안 끝난다
    renderPanel()
    await screen.findByText('도배 0')
    for (const box of checkboxes()) await userEvent.click(box)
    expect(blindButton()).toHaveTextContent('선택 10건 가림')

    await userEvent.click(blindButton())

    expect(blindMessage).toHaveBeenCalledTimes(6)
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

describe('선택 보존·경합(2026-08-11 4라운드 재설계)', () => {
  /**
   * 클린봇이 막은 줄({@code blocked_*})도 <b>미리 체크</b>돼야 한다. 렌더는 고를 수 있게 고쳤는데
   * 미리 체크만 {@code visible} 조건으로 남아, 클린봇에 걸린 줄이 신고되면 정작 <b>신고된 그
   * 줄이 하나도 안 골라진</b> 채 열렸다(3라운드). 운영자가 [가림]을 눌러도 그 줄은 안 가려진다.
   */
  it('클린봇이 막은 줄이 신고된 것이면 그 줄을 미리 고른다', async () => {
    listAuthorMessages.mockResolvedValue({
      rows: [makeAuthorMessage({
        msgId: '01FIXTUREMSG0000000000000A', message: '욕설 섞인 신고 줄',
        status: 'blocked_profanity',
      })],
      total: 1,
    })
    renderPanel()
    await screen.findByText('욕설 섞인 신고 줄')

    expect(screen.getByRole('checkbox')).toBeChecked()
    expect(blindButton()).toBeEnabled()
  })

  /**
   * <b>재조회가 운영자의 선택을 지우지 않는다</b> — 이 규칙 하나가 리뷰 세 라운드가 왕복한
   * 지뢰를 없앤다. 종전에는 재조회가 선택을 통째로 갈아 끼워, "언제 다시 읽느냐"를 정할 때마다
   * 운영자 작업이 날아갈 위험을 함께 저울질해야 했다(그래서 재조회 축을 넣었다 뺐다 했다).
   * 재조회가 무해하면 그 다툼 자체가 사라진다.
   */
  it('재조회가 운영자가 손으로 고른 것을 지우지 않는다', async () => {
    const { rerenderWith } = renderPanel(makeReportItem({ currentStatus: 'visible' }))
    await screen.findByText('도배 첫째')
    await userEvent.click(screen.getByRole('checkbox', { name: /도배 첫째/ }))
    await userEvent.click(screen.getByRole('checkbox', { name: /도배 셋째/ }))

    // 부모가 신고된 메시지를 가렸다 — 실황이 바뀌어 이 목록을 다시 읽는다
    rerenderWith(makeReportItem({ currentStatus: 'blinded' }))
    await act(async () => {})

    expect(screen.getByRole('checkbox', { name: /도배 첫째/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /도배 셋째/ })).toBeChecked()
  })

  /**
   * 선택을 보존하되 <b>가릴 수 없게 된 것은 뺀다</b>. 사라졌거나 이미 가려진 줄이 고른 채로
   * 남으면 [가림]이 그 건에 요청을 보내 뜻 없는 감사 행이 쌓이거나 404가 난다.
   */
  it('재조회에서 이미 가려졌거나 사라진 줄의 선택은 뺀다', async () => {
    const { rerenderWith } = renderPanel(makeReportItem({ currentStatus: 'visible' }))
    await screen.findByText('도배 첫째')
    await userEvent.click(screen.getByRole('checkbox', { name: /도배 첫째/ }))
    expect(blindButton()).toHaveTextContent('선택 2건 가림')

    listAuthorMessages.mockResolvedValue({
      rows: [
        // 첫째는 그새 가려졌고, 신고된 줄은 아예 사라졌다(TTL·삭제)
        makeAuthorMessage({ msgId: 'M-1', message: '도배 첫째', status: 'blinded' }),
        makeAuthorMessage({ msgId: 'M-3', message: '도배 셋째' }),
      ],
      total: 2,
    })
    rerenderWith(makeReportItem({ currentStatus: 'blinded' }))
    await screen.findByText('도배 셋째')

    expect(blindButton()).toBeDisabled()
    expect(blindButton()).toHaveTextContent('선택 0건 가림')
  })

  /**
   * 미리 체크는 <b>처음 한 번</b>뿐이다. 재조회 때마다 다시 씨를 뿌리면, 운영자가 일부러 푼
   * 신고된 줄이 재조회마다 되살아나 결국 의도치 않게 가려진다.
   */
  it('재조회가 미리 체크를 다시 뿌리지 않는다 — 일부러 푼 것을 되살리지 않는다', async () => {
    const { rerenderWith } = renderPanel(makeReportItem({ currentStatus: 'visible' }))
    await screen.findByText('신고된 줄')
    await userEvent.click(screen.getByRole('checkbox', { name: /신고된 줄/ }))   // 일부러 푼다
    expect(blindButton()).toHaveTextContent('선택 0건 가림')

    rerenderWith(makeReportItem({ currentStatus: 'blocked_hate' }))
    await act(async () => {})

    expect(screen.getByRole('checkbox', { name: /신고된 줄/ })).not.toBeChecked()
  })

  /**
   * <b>한 신고 안에서</b> 조회 둘이 겹칠 수 있다 — 일괄 가림 뒤의 재조회와, 그 가림으로 신고된
   * 줄의 실황이 바뀌어 걸리는 재조회가 그렇다. 늦게 도착한 쪽이 먼저 나간 응답을 덮으면
   * 방금 가린 줄이 목록에 '표시 중'으로 되살아난다.
   */
  it('한 신고 안에서 늦게 온 응답이 나중 응답을 덮지 않는다', async () => {
    const slow = deferred<{ rows: ReturnType<typeof makeAuthorMessage>[]; total: number }>()
    listAuthorMessages
        .mockImplementationOnce(() => slow.promise)
        .mockResolvedValue({
          rows: [makeAuthorMessage({ msgId: 'M-9', message: '최신 목록' })], total: 1,
        })
    const { rerenderWith } = renderPanel(makeReportItem({ currentStatus: 'visible' }))

    rerenderWith(makeReportItem({ currentStatus: 'blinded' }))   // 같은 신고, 실황만 바뀜
    await screen.findByText('최신 목록')
    await act(async () => {
      slow.resolve({ rows: [makeAuthorMessage({ msgId: 'M-0', message: '낡은 목록' })], total: 1 })
    })

    expect(screen.queryByText('낡은 목록')).not.toBeInTheDocument()
    expect(screen.getByText('최신 목록')).toBeInTheDocument()
  })

  /**
   * 쓰기가 도는 동안 <b>부모의 조치 버튼도</b> 막아야 한다 — 안 그러면 일괄 가림 도중 [기각]이
   * 눌려 한 신고에 "타당해서 가리는 중"과 "부당해서 기각"이 동시에 기록되고, 기각이 신고를
   * 큐에서 빼며 이 패널을 언마운트해 가림의 성패를 알릴 화면까지 사라진다.
   */
  it('쓰기가 도는 동안 부모에게 알리고, 끝나면 푼다', async () => {
    const gate = deferred<{ blinded: boolean }>()
    blindMessage.mockImplementationOnce(() => gate.promise)
    renderPanel()
    await screen.findByText('신고된 줄')
    onBusyChange.mockClear()

    await userEvent.click(blindButton())
    expect(onBusyChange).toHaveBeenLastCalledWith(true)

    await act(async () => { gate.resolve({ blinded: true }) })
    expect(onBusyChange).toHaveBeenLastCalledWith(false)
  })

  /** 언마운트에도 반드시 풀어야 한다 — 안 그러면 부모가 영영 잠긴 채 남는다. */
  it('쓰기 도중 언마운트돼도 부모의 잠금을 푼다', async () => {
    blindMessage.mockImplementation(() => new Promise(() => {}))
    const { unmount } = renderPanel()
    await screen.findByText('신고된 줄')
    await userEvent.click(blindButton())
    expect(onBusyChange).toHaveBeenLastCalledWith(true)

    unmount()

    expect(onBusyChange).toHaveBeenLastCalledWith(false)
  })
})

describe('취소·알림·경계(2026-08-11 4라운드 리뷰 반영)', () => {
  /**
   * 도는 동안 모달이 잠기므로(결과를 알릴 화면을 지키려고) <b>빠져나갈 손잡이</b>가 없으면
   * 서버가 응답을 안 할 때 갇힌다 — 자동 상한은 요청 하나에만 걸려, 40건이면 상한 × 물결 수만큼
   * 곱해진다(200건이면 몇 분). 취소는 "안 나간 것으로 친다"가 아니라 "더 보내지 않는다"이다.
   */
  it('취소하면 남은 건을 더 보내지 않는다', async () => {
    const many = Array.from({ length: 10 }, (_, i) => makeAuthorMessage({
      msgId: `S-${i}`, message: `도배 ${i}`, playbackTime: i,
    }))
    listAuthorMessages.mockResolvedValue({ rows: many, total: 10 })
    hangingBlind()
    renderPanel()
    await screen.findByText('도배 0')
    for (const box of checkboxes()) await userEvent.click(box)
    await userEvent.click(blindButton())
    expect(blindMessage).toHaveBeenCalledTimes(6)   // 첫 물결만 나갔다

    await userEvent.click(screen.getByRole('button', { name: '취소' }))

    expect(blindMessage).toHaveBeenCalledTimes(6)   // 나머지 4건은 영영 안 나간다
    expect(await screen.findByRole('alert')).toHaveTextContent('취소했습니다')
    // 보낸 6건도 끊겼고 4건은 안 나갔다 — 확정되지 않은 10건이 그대로 골라져 있어야
    // 운영자가 [가림]을 한 번 더 누르는 것으로 이어서 할 수 있다.
    expect(blindButton()).toHaveTextContent('선택 10건 가림')
  })

  /** 취소해도 이미 서버에 닿은 건은 처리될 수 있다 — 실제 상태는 재조회만이 말해 준다. */
  it('취소해도 목록을 다시 읽어 실제 상태로 맞춘다', async () => {
    hangingBlind()
    renderPanel()
    await screen.findByText('신고된 줄')
    listAuthorMessages.mockClear()
    await userEvent.click(blindButton())

    await userEvent.click(screen.getByRole('button', { name: '취소' }))

    await waitFor(() => expect(listAuthorMessages).toHaveBeenCalled())
    expect(onActionDone).toHaveBeenCalledWith(expect.stringContaining('취소'))
  })

  /** 취소가 끝나면 잠금이 풀려야 한다 — 안 풀리면 취소 버튼이 갇힘을 못 없앤 것이다. */
  it('취소가 끝나면 잠금이 풀린다', async () => {
    hangingBlind()
    renderPanel()
    await screen.findByText('신고된 줄')
    await userEvent.click(blindButton())

    await userEvent.click(screen.getByRole('button', { name: '취소' }))

    await waitFor(() => expect(onBusyChange).toHaveBeenLastCalledWith(false))
    expect(screen.queryByRole('button', { name: '취소' })).not.toBeInTheDocument()
  })

  /**
   * 결과 문구는 <b>페이지까지</b> 올린다. 이 컴포넌트 안에만 두면 신고가 큐에서 빠져 패널이
   * 언마운트되는 순간 "40건 중 3건 실패"가 함께 사라진다 — 그 3건은 여전히 사용자에게 보이는데
   * 화면 어디에도 그 사실이 없다.
   */
  it('일부 실패 사실을 부모에게도 올린다 — 화면이 사라져도 남게', async () => {
    blindMessage.mockRejectedValue(new Error('일시 오류'))
    renderPanel()
    await screen.findByText('신고된 줄')

    await userEvent.click(blindButton())

    expect(onActionDone).toHaveBeenCalledWith(expect.stringContaining('1건 실패'))
  })

  /** 다 잘되면 올릴 것이 없다 — 없는 문구를 올리면 이전 실패가 지워지지 않는다. */
  it('전부 성공하면 알릴 문구가 없다', async () => {
    renderPanel()
    await screen.findByText('신고된 줄')

    await userEvent.click(blindButton())

    expect(onActionDone).toHaveBeenCalledWith(undefined)
  })

  /** 부모가 다른 조치를 하는 동안 여기서도 새 조치를 받으면 두 쓰기가 겹친다. */
  it('부모가 조치 중이면 여기서도 아무것도 고르거나 보낼 수 없다', async () => {
    renderPanel(makeReportItem(), true)
    await screen.findByText('신고된 줄')

    expect(blindButton()).toBeDisabled()
    expect(checkboxes().every((c) => (c as HTMLInputElement).disabled)).toBe(true)
  })

  /**
   * 취소 문구는 <b>아는 것보다 많이 말하지 않는다</b>. 끊긴 요청이 서버에 닿았는지는 화면이
   * 알 수 없고 목록만이 안다 — "N건 처리"로만 끝내면 나머지가 안 됐다는 뜻으로 읽힌다.
   */
  it('취소 문구는 확정된 것만 말하고 나머지는 목록을 보라고 한다', async () => {
    hangingBlind()
    renderPanel()
    await screen.findByText('신고된 줄')
    await userEvent.click(blindButton())

    await userEvent.click(screen.getByRole('button', { name: '취소' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('나머지는 목록에서 확인')
  })

  /**
   * 조회가 실패하면 <b>다시 시도할 손잡이</b>가 있어야 한다. 없으면 모달을 닫았다 다시 여는 것
   * 말고는 이 기능을 쓸 방법이 없다 — apiFetch에 시간 상한이 생긴 뒤로 조회가 "영영 로딩 중"
   * 대신 실패로 끝나게 됐으므로 이 길이 실제로 열린다.
   */
  it('목록 조회가 실패하면 다시 시도할 수 있다', async () => {
    listAuthorMessages.mockRejectedValueOnce(new Error('서버가 응답하지 않습니다'))
    renderPanel()
    await screen.findByText('서버가 응답하지 않습니다')

    listAuthorMessages.mockResolvedValue(threeRows())
    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }))

    expect(await screen.findByText('도배 첫째')).toBeInTheDocument()
    // 처음 성공한 조회이므로 여기서 신고된 줄을 미리 고른다(재조회가 아니다)
    expect(screen.getByRole('checkbox', { name: /신고된 줄/ })).toBeChecked()
  })

  /** 고를 것이 없는데 "선택 0건 가림"과 종결 안내만 남으면 무엇을 하라는 화면인지 알 수 없다. */
  it('이 회차에 남긴 글이 없으면 조치 줄을 내린다', async () => {
    listAuthorMessages.mockResolvedValue({ rows: [], total: 0 })
    renderPanel()
    await screen.findByText(/남긴 글이 없습니다/)

    expect(screen.queryByRole('button', { name: /가림/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/종결하지 않습니다/)).not.toBeInTheDocument()
  })

  /** 작성자를 모르면 그 사람의 글을 모을 수 없다 — 빈 목록으로 오해하게 두지 않는다. */
  it('대상 사용자 정보가 없으면 조회하지 않고 그렇게 말한다', async () => {
    renderPanel(makeReportItem({ targetUser: null }))

    expect(screen.getByText(/작성자 정보가 없어/)).toBeInTheDocument()
    expect(listAuthorMessages).not.toHaveBeenCalled()
  })

  /**
   * BE는 상한에 잘려도 신고된 줄을 되끼워 준다(keep) — 다만 그새 만료·삭제됐으면 되끼울 것이
   * 없어 조용히 빠진다. 그 사실을 안 적으면 운영자는 '신고됨' 표가 없는 이유를 몰라 엉뚱한
   * 줄을 신고된 줄로 여긴다.
   */
  it('신고된 줄이 목록에 없으면 사라졌다고 말한다', async () => {
    listAuthorMessages.mockResolvedValue({
      rows: [makeAuthorMessage({ msgId: 'M-1', message: '남은 글' })], total: 1,
    })
    renderPanel()
    await screen.findByText('남은 글')

    expect(screen.getByText(/신고된 줄은 목록에 없습니다/)).toBeInTheDocument()
  })

  /**
   * 일괄 가림은 신고를 닫지 않는다. 안 적으면 운영자는 가렸으니 끝난 줄 알고 넘어가고,
   * 그 신고는 큐에 열린 채 남아 다음 사람이 같은 건을 또 본다.
   */
  it('가림이 신고를 종결하지 않는다고 화면에 적는다', async () => {
    renderPanel()
    await screen.findByText('신고된 줄')

    expect(screen.getByText(/가림은 신고를 종결하지 않습니다/)).toBeInTheDocument()
  })
})
