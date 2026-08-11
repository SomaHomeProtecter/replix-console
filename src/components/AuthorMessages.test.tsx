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

function renderPanel(report = makeReportItem()) {
  return render(<AuthorMessages report={report} busy={false} onActionDone={onActionDone} />)
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
    expect(listAuthorMessages).toHaveBeenCalledWith(42, 9)
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
