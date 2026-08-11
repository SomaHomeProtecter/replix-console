import { act, render, screen } from '@testing-library/react'
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
  return render(
      <MemoryRouter>
        <ReportDetailPanel report={report} onActionDone={onActionDone} />
      </MemoryRouter>)
}

beforeEach(() => {
  vi.clearAllMocks()
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

  it('같은 메시지 다중 신고는 집계로 강조한다', () => {
    renderPanel(makeReportItem({ sameMessageReportCount: 3 }))
    expect(screen.getByText(/같은 메시지 신고/)).toHaveTextContent('같은 메시지 신고 3건')
  })

  it('사라진 메시지(실황 null)는 그렇게 말한다', () => {
    renderPanel(makeReportItem({ currentStatus: null, spoilerScore: null }))
    expect(screen.getByText(/사라짐/)).toBeInTheDocument()
  })

  it('대상 사용자 카드는 사용자 상세로 이어진다', () => {
    renderPanel()
    const link = screen.getByRole('link', { name: /사용자 상세/ })
    expect(link).toHaveAttribute('href', '/users/9')
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

  it('사라진 메시지(실황 null)에는 정정 자체를 막는다 — BE가 404로 되돌려 보낸다', () => {
    renderPanel(makeReportItem({ currentStatus: null, spoilerScore: null }))
    expect(screen.getByRole('button', { name: '점수 정정' })).toBeDisabled()
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
   * busy는 왕복이 끝나면 바로 풀리는데 report.spoilerScore는 재조회가 와야 갱신된다 —
   * 그 사이 버튼이 다시 활성이라 두 번째 누름이 score=3→3 감사 행을 남긴다.
   */
  it('정정 요청 뒤 같은 값으로 다시 누를 수 없다', async () => {
    let release!: () => void
    fixSpoilerScore.mockReturnValue(new Promise((r) => {
      release = () => r({ spoilerScore: 3 })
    }))
    renderPanel(makeReportItem({ spoilerScore: 8 }))
    await userEvent.click(screen.getByRole('radio', { name: '3' }))
    await userEvent.click(screen.getByRole('button', { name: '점수 정정' }))

    await act(async () => { release() })

    expect(screen.getByRole('button', { name: '점수 정정' })).toBeDisabled()
    expect(fixSpoilerScore).toHaveBeenCalledTimes(1)
  })

})
