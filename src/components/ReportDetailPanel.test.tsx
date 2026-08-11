import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as admin from '../api/admin'
import { ApiHttpError } from '../api/client'
import { makeReportItem } from '../test/fixtures'
import ReportDetailPanel from './ReportDetailPanel'

vi.mock('../api/admin')

const blindMessage = vi.mocked(admin.blindMessage)
const unblindMessage = vi.mocked(admin.unblindMessage)
const resolveReport = vi.mocked(admin.resolveReport)
const reopenReport = vi.mocked(admin.reopenReport)
const suspendUser = vi.mocked(admin.suspendUser)
const fixSpoilerScore = vi.mocked(admin.fixSpoilerScore)

const onActionDone = vi.fn()

function renderPanel(report = makeReportItem()) {
  const view = render(
      <MemoryRouter>
        <ReportDetailPanel report={report} onActionDone={onActionDone} />
      </MemoryRouter>)
  return {
    ...view,
    /** 재조회가 같은 신고를 새 값으로 들고 온 상황 — 부모가 새 report 객체를 내려준다. */
    reload: (next: ReturnType<typeof makeReportItem>) => view.rerender(
        <MemoryRouter>
          <ReportDetailPanel report={next} onActionDone={onActionDone} />
        </MemoryRouter>),
  }
}

beforeEach(() => {
  // 상세 패널은 이제 작성자 글 목록(HP-298)을 자식으로 품는다 — 그 조회를 스텁하지 않으면
  // 자식이 오류 배너를 띄워 이 파일의 role="alert" 단언들이 엉뚱한 것을 잡는다.
  // clearAllMocks는 <b>호출 기록만</b> 지우고 구현은 남긴다 — 앞선 테스트가 심어 둔
  // mockReturnValue(영영 resolve 안 되는 promise)나 mockRejectedValue가 뒤 테스트로 새어,
  // 원인과 무관한 실패가 줄줄이 난다(4차 리뷰). reset은 구현까지 지운다.
  vi.resetAllMocks()
  vi.mocked(admin.listAuthorMessages).mockResolvedValue({ rows: [], total: 0 })
})

describe('상세 패널(정본) — 스냅샷 원문·메타·대상 사용자 카드', () => {
  it('스냅샷 원문과 메타 한 줄(신고자·실황·스포일러 점수)·신고 상세를 보여준다', () => {
    renderPanel()
    expect(screen.getByText(/신고 #101 · 스냅샷 원문/)).toBeInTheDocument()
    expect(screen.getByText('범인은 집사다')).toBeInTheDocument()
    expect(screen.getAllByText(/스포일러꾼/).length).toBeGreaterThan(0) // 대상 카드
    expect(screen.getByText(/신고자닉/)).toBeInTheDocument()
    expect(screen.getByText(/현재 상태 표시 중/)).toBeInTheDocument()   // currentStatus=visible 실황
    expect(screen.getByText(/스포일러 점수 8/)).toBeInTheDocument()
    expect(screen.getByText(/결말을 그대로 말해요/)).toBeInTheDocument() // 신고 상세 사유
  })

  /**
   * 누계와 열린 수를 <b>함께</b> 밝힌다(2026-08-11 재설계). 목록의 "묶음 ×2" 칩은 열린 수를 세고
   * 상세의 "신고 N건"은 누계를 세는데, 둘이 서로 다른 수를 말하면서 <b>어느 쪽이 무엇인지</b>
   * 화면에 없었다 — 운영자는 같은 신고에서 2와 5를 보고 무엇을 믿을지 알 수 없었다.
   */
  it('같은 메시지 다중 신고는 누계와 열린 수를 함께 밝힌다', () => {
    renderPanel(makeReportItem({ sameMessageReportCount: 5, openReportCount: 2 }))
    expect(screen.getByText(/같은 메시지 신고/))
        .toHaveTextContent('같은 메시지 신고 5건 (열림 2건)')
  })

  /** 열린 것이 곧 전부면 괄호가 군더더기다 — 같은 수를 두 번 읽히지 않는다. */
  it('누계와 열린 수가 같으면 한 번만 말한다', () => {
    renderPanel(makeReportItem({ sameMessageReportCount: 3, openReportCount: 3 }))
    expect(screen.getByText(/같은 메시지 신고/)).toHaveTextContent('같은 메시지 신고 3건')
    expect(screen.queryByText(/열림/)).not.toBeInTheDocument()
  })

  it('사라진 메시지(실황 null)는 그렇게 말한다', () => {
    renderPanel(makeReportItem({ currentStatus: null, spoilerScore: null }))
    expect(screen.getByText(/사라짐/)).toBeInTheDocument()
  })

  /** 작성자 카드에만 있던 상세 진입을 신고자 카드에도 연다(HP-270) — 남용자에게 닿는 길. */
  it('신고자 카드도 사용자 상세로 이어진다', () => {
    renderPanel()
    const links = screen.getAllByRole('link', { name: /사용자 상세/ })
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/users/9', '/users/7'])
  })

  it('대상 사용자 카드는 사용자 상세로 이어진다', () => {
    const { container } = renderPanel()
    // 신고자 카드에도 같은 링크가 생겼으므로(HP-270) 대상 카드로 좁혀 찾는다
    const targetCard = container.querySelector('.target-card:not(.reporter-card)')!
    expect(within(targetCard as HTMLElement).getByRole('link', { name: /사용자 상세/ }))
        .toHaveAttribute('href', '/users/9')
  })

  it('종결된 신고는 무슨 조치였는지와 함께 처리 정보를 보여준다', () => {
    renderPanel(makeReportItem({
      status: 'RESOLVED', resolvedAction: 'BLIND',
      handledBy: { id: 1, displayName: '지호', status: 'ACTIVE', profileImageUrl: null },
      handledAt: '2026-08-04T11:00:00Z',
      resolutionNote: '가림 처리함',
    }))
    expect(screen.getByText(/가림 처리/)).toBeInTheDocument() // 처리 종별 구분(E2E 피드백)
    expect(screen.getByText(/지호/)).toBeInTheDocument()
    expect(screen.getByText(/가림 처리함/)).toBeInTheDocument()
  })
})

describe('조치 플로우 — 가림(잉크 기본)·정지(빨강)·기각(보조)', () => {
  it('기각은 REJECTED 종결이고 처리 메모를 싣는다', async () => {
    renderPanel()
    await userEvent.type(screen.getByLabelText('처리 메모'), '중복 신고')
    await userEvent.click(screen.getByRole('button', { name: '기각' }))

    expect(resolveReport).toHaveBeenCalledWith(101, 'REJECTED', '중복 신고', null)
    expect(onActionDone).toHaveBeenCalled()
  })

  it('가림은 blind 후 RESOLVED 종결까지 한 번에 간다', async () => {
    renderPanel()
    await userEvent.click(screen.getByRole('button', { name: '가림' }))

    expect(blindMessage).toHaveBeenCalledWith(42, '01FIXTUREMSG0000000000000A')
    expect(resolveReport).toHaveBeenCalledWith(101, 'RESOLVED', null, 'BLIND') // 조치 구분 저장
    const blindOrder = blindMessage.mock.invocationCallOrder[0]
    const resolveOrder = resolveReport.mock.invocationCallOrder[0]
    expect(blindOrder).toBeLessThan(resolveOrder)
    expect(onActionDone).toHaveBeenCalled()
  })

  it('가림 실패(이미 사라진 메시지)는 종결하지 않되, 실상 반영을 위해 재조회는 한다', async () => {
    blindMessage.mockRejectedValue(new ApiHttpError(404, 'MESSAGE_NOT_FOUND', '이미 사라진 메시지입니다'))
    renderPanel()
    await userEvent.click(screen.getByRole('button', { name: '가림' }))

    expect(screen.getByRole('alert')).toHaveTextContent('이미 사라진 메시지입니다')
    expect(resolveReport).not.toHaveBeenCalled()
    // 부분 실패(예: 가림 성공·종결 실패)가 화면을 실상과 어긋나게 두지 않도록,
    // 실패 경로에서도 목록을 다시 읽는다(리뷰 m3)
    expect(onActionDone).toHaveBeenCalled()
  })

  /**
   * 2026-08-05 김지호 결정으로 자동 재오픈을 뗐다(HP-268). 가림 해제만 신고 상태를 건드리고
   * 정지 해제·기각 번복은 안 건드리는 비대칭이 "종결"의 의미를 흐렸다 — 판정은 시점 사실,
   * 조치 상태는 현재 사실이라 섞지 않는다.
   */
  /**
   * 이 버튼이 없던 동안에는 타당하지만 가벼운 신고도 기각으로 닫을 수밖에 없었다. HP-270이
   * 신고자별 기각률을 남용 판별에 쓸 예정이라, 그렇게 쌓인 기록은 나중에 되돌릴 수 없다.
   */
  it('조치 없이 종결은 RESOLVED로 닫되 조치를 남기지 않는다 — 기각과 구분된다', async () => {
    renderPanel(makeReportItem())
    await userEvent.type(screen.getByLabelText('처리 메모'), '경미 — 제재 없음')

    await userEvent.click(screen.getByRole('button', { name: '조치 없이 종결' }))

    expect(resolveReport).toHaveBeenCalledWith(101, 'RESOLVED', '경미 — 제재 없음', null)
    expect(onActionDone).toHaveBeenCalled()
  })

  it('가림 해제는 메시지만 푼다 — 신고 상태는 건드리지 않는다', async () => {
    renderPanel(makeReportItem({ currentStatus: 'blinded', status: 'RESOLVED' }))
    await userEvent.click(screen.getByRole('button', { name: '가림 해제' }))

    expect(unblindMessage).toHaveBeenCalledWith(42, '01FIXTUREMSG0000000000000A')
    expect(reopenReport).not.toHaveBeenCalled()
    expect(onActionDone).toHaveBeenCalled()
  })

  it('재오픈은 운영자가 명시적으로 누를 때만 일어난다', async () => {
    renderPanel(makeReportItem({ currentStatus: 'blinded', status: 'RESOLVED' }))
    await userEvent.click(screen.getByRole('button', { name: '신고 재오픈' }))

    expect(reopenReport).toHaveBeenCalledWith(101)
    expect(unblindMessage).not.toHaveBeenCalled() // 되돌리는 행위와 재심사 판단은 별개
    expect(onActionDone).toHaveBeenCalled()
  })

  it('열린 신고에는 재오픈 버튼이 없다 — 이미 큐에 있다', () => {
    renderPanel(makeReportItem({ status: 'OPEN' }))
    expect(screen.queryByRole('button', { name: '신고 재오픈' })).not.toBeInTheDocument()
  })

  it('대상 사용자가 없으면 정지 버튼이 비활성이다', () => {
    renderPanel(makeReportItem({ targetUser: null }))
    expect(screen.getByRole('button', { name: /계정 정지/ })).toBeDisabled()
  })

  it('탈퇴한 대상도 정지 버튼이 비활성이다(BE 409를 다이얼로그 전에 차단)', () => {
    renderPanel(makeReportItem({ targetUser: { id: 9, displayName: '탈퇴자', status: 'WITHDRAWN', profileImageUrl: null } }))
    expect(screen.getByRole('button', { name: /계정 정지/ })).toBeDisabled()
  })
})

describe('정지 다이얼로그(정본) — 프리셋 4단·사유 필수·안내 문구·감사 고지', () => {
  it('사유가 없으면 적용이 막히고, 확정 시 suspend→RESOLVED 종결에 자동 메모를 남긴다', async () => {
    renderPanel()
    await userEvent.click(screen.getByRole('button', { name: /계정 정지/ }))

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('전송이 차단됩니다')
    expect(dialog).toHaveTextContent('로그인과 시청·읽기는 막지 않습니다')
    expect(dialog).toHaveTextContent('감사 로그')
    // 프리셋 4단 + 기본 24시간
    expect(screen.getByRole('radio', { name: '24시간' })).toBeChecked()
    expect(screen.getByRole('radio', { name: '무기한' })).toBeInTheDocument()
    // 사유 없이는 적용 불가
    expect(screen.getByRole('button', { name: '정지 적용' })).toBeDisabled()

    await userEvent.click(screen.getByRole('radio', { name: '72시간' }))
    await userEvent.type(screen.getByLabelText('정지 사유'), '반복 스포일러')
    await userEvent.click(screen.getByRole('button', { name: '정지 적용' }))

    expect(suspendUser).toHaveBeenCalledWith(9, 'H72', '반복 스포일러')
    expect(resolveReport).toHaveBeenCalledWith(
        101, 'RESOLVED', '계정 정지(72시간) — 반복 스포일러', 'SUSPEND')
    expect(onActionDone).toHaveBeenCalled()
  })

  it('취소하면 아무 조치도 나가지 않는다', async () => {
    renderPanel()
    await userEvent.click(screen.getByRole('button', { name: /계정 정지/ }))
    await userEvent.click(screen.getByRole('button', { name: '취소' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(suspendUser).not.toHaveBeenCalled()
    expect(resolveReport).not.toHaveBeenCalled()
  })

  it('Esc로도 닫히고 아무 조치도 나가지 않는다(리뷰 m10)', async () => {
    renderPanel()
    await userEvent.click(screen.getByRole('button', { name: /계정 정지/ }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await userEvent.keyboard('{Escape}') // autoFocus로 포커스가 다이얼로그 안에 있다

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(suspendUser).not.toHaveBeenCalled()
  })

  it('바깥(백드롭)·✕로도 닫히고, 다이얼로그 안 클릭은 닫히지 않는다', async () => {
    const { container } = renderPanel()
    await userEvent.click(screen.getByRole('button', { name: /계정 정지/ }))

    await userEvent.click(screen.getByLabelText('정지 사유')) // 안쪽 클릭 — 유지
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await userEvent.click(container.querySelector('.dialog-backdrop')!) // 바깥 — 닫힘
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /계정 정지/ }))
    await userEvent.click(screen.getByRole('button', { name: '닫기' }))   // ✕ — 닫힘
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(suspendUser).not.toHaveBeenCalled()
  })
})

/**
 * 스포일러 점수는 Bedrock 비동기 채점이라 오탐이 난다. 그런데 신고 4대 사유에 스포일러가 있는데도
 * 콘솔의 선택지는 가림 아니면 기각뿐이었다 — <b>메시지는 괜찮은데 점수만 틀린 건</b>을 고칠 손이
 * 없었다(HP-294). 높은 점수는 확장에서 블러 처리되므로 오탐은 멀쩡한 대화를 가린다.
 */
describe('스포일러 점수 정정(HP-294) — 판단 재료와 조치를 같은 눈높이에', () => {
  it('현재 점수가 선택된 채로 0..10을 고르게 한다', () => {
    renderPanel(makeReportItem({ spoilerScore: 8 }))
    expect(screen.getByRole('radio', { name: '8' })).toBeChecked()
    expect(screen.getByRole('radio', { name: '0' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '10' })).toBeInTheDocument()
    // 11이 있으면 BE가 400으로 되돌려 보낸다(@Max(10)) — 화면이 먼저 막는다
    expect(screen.queryByRole('radio', { name: '11' })).not.toBeInTheDocument()
  })

  it('점수를 바꿔 정정하면 그 값으로 저장하고 다시 읽는다', async () => {
    renderPanel(makeReportItem({ spoilerScore: 8 }))
    await userEvent.click(screen.getByRole('radio', { name: '3' }))
    await userEvent.click(screen.getByRole('button', { name: '점수 정정' }))

    expect(fixSpoilerScore).toHaveBeenCalledWith(42, '01FIXTUREMSG0000000000000A', 3)
    expect(onActionDone).toHaveBeenCalled()
  })

  it('고른 점수가 지금 점수와 같으면 정정을 막는다 — 감사에 score=8→8만 남는다', async () => {
    renderPanel(makeReportItem({ spoilerScore: 8 }))
    expect(screen.getByRole('button', { name: '점수 정정' })).toBeDisabled()
  })

  /**
   * 서버 점수가 바뀌면 <b>고르던 값을 버린다</b>(2026-08-11 재설계).
   *
   * <p>종전에는 "선택은 화면의 상태지 서버의 상태가 아니다"라며 재조회가 와도 고르던 값을 지켰다.
   * 그런데 그 사이 채점 배치나 다른 운영자가 점수를 바꿨으면, 화면은 <b>이미 낡은 판단 근거</b>를
   * 계속 들고 있게 된다. 그 상태로 누르면 운영자는 8→3을 고친다고 믿지만 실제로는 5→3을 고친다.
   * 근거가 바뀌면 그 근거로 만든 선택도 무효다 — 새 사실을 보여주고 다시 고르게 하는 편이 옳다.
   */
  it('서버 점수가 바뀌면 고르던 값을 버리고 새 사실을 보여준다', async () => {
    const { reload } = renderPanel(makeReportItem({ spoilerScore: 8 }))
    await userEvent.click(screen.getByRole('radio', { name: '3' }))

    reload(makeReportItem({ spoilerScore: 5 }))   // 배치·다른 운영자가 바꾼 값이 재조회로 도착

    expect(screen.getByRole('radio', { name: '5' })).toBeChecked()
    expect(screen.getByRole('radio', { name: '3' })).not.toBeChecked()
    expect(screen.getByRole('button', { name: '점수 정정' })).toBeDisabled()
  })

  /**
   * <b>방금 보냈던 값으로도 다시 정정할 수 있어야 한다</b>(2026-08-11 재설계).
   *
   * <p>종전에는 "방금 보낸 값"을 따로 기억해 그 값으로 다시 못 누르게 막았다. 그런데 그 기억은
   * 서버가 그 뒤에 다른 값이 돼도 지워지지 않아, 3으로 고친 뒤 배치가 6으로 덮은 상황에서
   * <b>3으로 되돌리는 길이 영영 막힌다</b> — 버튼은 회색인데 이유는 화면 어디에도 없다.
   * 기준은 하나면 된다: <b>지금 서버가 아는 값과 다르면</b> 보낼 수 있다.
   */
  it('다른 곳에서 점수가 바뀐 뒤에는 방금 보냈던 값으로도 다시 정정할 수 있다', async () => {
    const { reload } = renderPanel(makeReportItem({ spoilerScore: 8 }))
    await userEvent.click(screen.getByRole('radio', { name: '3' }))
    await userEvent.click(screen.getByRole('button', { name: '점수 정정' }))

    reload(makeReportItem({ spoilerScore: 6 }))   // 채점 배치가 그 뒤 6으로 바꿔 놓았다
    await userEvent.click(screen.getByRole('radio', { name: '3' }))

    expect(screen.getByRole('button', { name: '점수 정정' })).toBeEnabled()
  })

  /**
   * 점수가 바뀌어도 <b>쓰던 메모는 지우지 않는다</b>. 점수는 조치의 판단 근거라 바뀌면 선택을
   * 무효로 두는 것이 맞지만, 처리 메모는 운영자가 손으로 쓴 글이고 점수와 아무 관계가 없다 —
   * 재조회 한 번에 날아가면 긴 메모를 쓰는 동안 배치가 채점만 해도 글이 사라진다.
   * (입력을 비우는 기준은 "다른 신고로 옮겼는가"이지 "이 신고의 어떤 값이 바뀌었는가"가 아니다.)
   */
  it('서버 점수가 바뀌어도 쓰던 처리 메모는 남는다', async () => {
    const { reload } = renderPanel(makeReportItem({ spoilerScore: 8 }))
    await userEvent.type(screen.getByLabelText('처리 메모'), '반복 신고자 확인 중')

    reload(makeReportItem({ spoilerScore: 5 }))

    expect(screen.getByLabelText('처리 메모')).toHaveValue('반복 신고자 확인 중')
  })

  /** 다른 신고로 옮기면 이전 신고의 입력이므로 비운다 — 이쪽이 비우는 기준이다. */
  it('다른 신고를 열면 쓰던 메모를 비운다', async () => {
    const { reload } = renderPanel(makeReportItem({ id: 101 }))
    await userEvent.type(screen.getByLabelText('처리 메모'), '이전 건 메모')

    reload(makeReportItem({ id: 202 }))

    expect(screen.getByLabelText('처리 메모')).toHaveValue('')
  })

  it('사라진 메시지(실황 null)에는 정정 자체를 막는다 — BE가 404로 되돌려 보낸다', () => {
    renderPanel(makeReportItem({ currentStatus: null, spoilerScore: null }))
    expect(screen.getByRole('button', { name: '점수 정정' })).toBeDisabled()
  })

  /**
   * 메시지가 사라지면 고르던 값도 무효다(4차 리뷰). 초기화가 [id, spoilerScore]에만 걸려 있어,
   * <b>아직 채점되지 않은</b> 메시지가 사라지는 경우 양쪽 다 null이라 효과가 돌지 않았다 —
   * 이미 없는 메시지에 대해 고른 점수가 선택된 채 남아, 화면이 존재하지 않는 대상을 가리킨다.
   */
  it('미채점 메시지가 사라지면 고르던 값도 버린다', async () => {
    const { reload } = renderPanel(makeReportItem({ spoilerScore: null, currentStatus: 'visible' }))
    await userEvent.click(screen.getByRole('radio', { name: '7' }))
    expect(screen.getByRole('radio', { name: '7' })).toBeChecked()

    reload(makeReportItem({ spoilerScore: null, currentStatus: null }))

    expect(screen.getByRole('radio', { name: '7' })).not.toBeChecked()
  })

  it('정정 실패는 메시지를 표면화한다', async () => {
    fixSpoilerScore.mockRejectedValue(
        new ApiHttpError(404, 'MESSAGE_NOT_FOUND', '이미 사라진 메시지입니다'))
    renderPanel(makeReportItem({ spoilerScore: 8 }))
    await userEvent.click(screen.getByRole('radio', { name: '3' }))
    await userEvent.click(screen.getByRole('button', { name: '점수 정정' }))

    expect(screen.getByRole('alert')).toHaveTextContent('이미 사라진 메시지입니다')
  })
})

describe('2026-08-11 리뷰 반영 — 겹 경계·중복 조치·초안 보존', () => {
  /** tabIndex로 컨테이너가 포커스를 받게 되면서 trapTab의 역방향 분기가 그 경우를 놓쳤다. */
  it('겹 안 빈 곳에 포커스가 있어도 Shift+Tab이 겹을 벗어나지 않는다', async () => {
    renderPanel()
    await userEvent.click(screen.getByRole('button', { name: /계정 정지/ }))
    const dialog = screen.getByRole('dialog', { name: '계정 정지' })

    await userEvent.click(screen.getByRole('heading', { name: /계정 정지/ }))
    expect(dialog).toHaveFocus()

    await userEvent.tab({ shift: true })

    expect(dialog.contains(document.activeElement)).toBe(true)
  })

  /**
   * 보내고 나면 <b>선택이 풀려</b> 같은 값이 두 번 나가지 않는다(2026-08-11 4차 리뷰).
   *
   * <p>PATCH 응답과 목록 재조회 사이에는 화면이 아직 옛 점수를 들고 있는 창이 있다. 그 창을
   * 한때 "busy를 재조회까지 늘려" 닫으려 했는데, 재조회가 펼친 페이지 수만큼 순차 왕복이라
   * 패널 전체가 그 사슬 내내 얼었고(한 요청이 멈추면 무기한) 재조회가 실패하면 창이 그대로
   * 다시 열렸다. 화면을 얼리는 대신 선택을 푼다 — 아무것도 막지 않으면서 창이 닫힌다.
   *
   * <p>이 테스트는 재조회가 <b>아직 안 온 상태</b>(report.spoilerScore=8 그대로)를 그대로 둔다.
   * 그 상태에서 버튼이 잠겨 있어야 이 방식이 재조회에 기대지 않는다는 뜻이다.
   */
  it('정정을 보내고 나면 재조회 전에도 같은 값으로 다시 누를 수 없다', async () => {
    fixSpoilerScore.mockResolvedValue({ spoilerScore: 3 })
    renderPanel(makeReportItem({ spoilerScore: 8 }))
    await userEvent.click(screen.getByRole('radio', { name: '3' }))

    await userEvent.click(screen.getByRole('button', { name: '점수 정정' }))

    expect(screen.getByRole('button', { name: '점수 정정' })).toBeDisabled()
    expect(fixSpoilerScore).toHaveBeenCalledTimes(1)
  })

  /** 재조회가 실패해 새 값이 안 와도 마찬가지다 — 창이 다시 열리면 안 된다. */
  it('재조회가 실패해도 같은 값이 두 번 나가지 않는다', async () => {
    fixSpoilerScore.mockResolvedValue({ spoilerScore: 3 })
    onActionDone.mockImplementation(() => { /* 부모 재조회가 실패해 아무 갱신도 없다 */ })
    renderPanel(makeReportItem({ spoilerScore: 8 }))
    await userEvent.click(screen.getByRole('radio', { name: '3' }))
    await userEvent.click(screen.getByRole('button', { name: '점수 정정' }))

    expect(screen.getByRole('button', { name: '점수 정정' })).toBeDisabled()
    expect(fixSpoilerScore).toHaveBeenCalledTimes(1)
  })

  /** 재조회가 새 값을 들고 오면 고르던 값이 곧 지금 값이 되어 다시 누를 것이 없다. */
  it('재조회가 도착하면 같은 값으로 다시 누를 수 없다', async () => {
    fixSpoilerScore.mockResolvedValue({ spoilerScore: 3 })
    const { reload } = renderPanel(makeReportItem({ spoilerScore: 8 }))
    await userEvent.click(screen.getByRole('radio', { name: '3' }))
    await userEvent.click(screen.getByRole('button', { name: '점수 정정' }))

    reload(makeReportItem({ spoilerScore: 3 }))

    expect(screen.getByRole('radio', { name: '3' })).toBeChecked()
    expect(screen.getByRole('button', { name: '점수 정정' })).toBeDisabled()
    expect(fixSpoilerScore).toHaveBeenCalledTimes(1)
  })

})
