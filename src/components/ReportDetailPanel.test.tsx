import { render, screen } from '@testing-library/react'
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

  it('종결된 신고는 처리 정보를 보여준다', () => {
    renderPanel(makeReportItem({
      status: 'RESOLVED',
      handledBy: { id: 1, displayName: '지호', status: 'ACTIVE' },
      handledAt: '2026-08-04T11:00:00Z',
      resolutionNote: '가림 처리함',
    }))
    expect(screen.getByText(/지호/)).toBeInTheDocument()
    expect(screen.getByText(/가림 처리함/)).toBeInTheDocument()
  })
})

describe('조치 플로우 — 가림(잉크 기본)·정지(빨강)·기각(보조)', () => {
  it('기각은 REJECTED 종결이고 처리 메모를 싣는다', async () => {
    renderPanel()
    await userEvent.type(screen.getByLabelText('처리 메모'), '중복 신고')
    await userEvent.click(screen.getByRole('button', { name: '기각 (조치 없음)' }))

    expect(resolveReport).toHaveBeenCalledWith(101, 'REJECTED', '중복 신고')
    expect(onActionDone).toHaveBeenCalled()
  })

  it('가림은 blind 후 RESOLVED 종결까지 한 번에 간다', async () => {
    renderPanel()
    await userEvent.click(screen.getByRole('button', { name: '가림' }))

    expect(blindMessage).toHaveBeenCalledWith(42, '01FIXTUREMSG0000000000000A')
    expect(resolveReport).toHaveBeenCalledWith(101, 'RESOLVED', null)
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

  it('가림 해제는 실황 복구 + 신고 재오픈까지 한 번에 간다(판정 번복)', async () => {
    renderPanel(makeReportItem({ currentStatus: 'blinded', status: 'RESOLVED' }))
    await userEvent.click(screen.getByRole('button', { name: '가림 해제' }))

    expect(unblindMessage).toHaveBeenCalledWith(42, '01FIXTUREMSG0000000000000A')
    expect(reopenReport).toHaveBeenCalledWith(101) // 해제 = 판정 번복 → 큐로 복귀
    const unblindOrder = unblindMessage.mock.invocationCallOrder[0]
    const reopenOrder = reopenReport.mock.invocationCallOrder[0]
    expect(unblindOrder).toBeLessThan(reopenOrder)
    expect(onActionDone).toHaveBeenCalled()
  })

  it('대상 사용자가 없으면 정지 버튼이 비활성이다', () => {
    renderPanel(makeReportItem({ targetUser: null }))
    expect(screen.getByRole('button', { name: /계정 정지/ })).toBeDisabled()
  })

  it('탈퇴한 대상도 정지 버튼이 비활성이다(BE 409를 다이얼로그 전에 차단)', () => {
    renderPanel(makeReportItem({ targetUser: { id: 9, displayName: '탈퇴자', status: 'WITHDRAWN' } }))
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
    expect(resolveReport).toHaveBeenCalledWith(101, 'RESOLVED', '계정 정지(72시간) — 반복 스포일러')
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
