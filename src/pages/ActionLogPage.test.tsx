import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as admin from '../api/admin'
import type { AdminActionLogRow, AdminActionLogResponse } from '../api/types'
import ActionLogPage from './ActionLogPage'

vi.mock('../api/admin')

const listActions = vi.mocked(admin.listActions)

function row(overrides: Partial<AdminActionLogRow> = {}): AdminActionLogRow {
  return {
    id: 31,
    createdAt: '2026-08-12T03:34:00Z',
    action: 'RESOLVE_REPORT',
    outcome: 'SUSPEND',
    reason: '반복 도배',
    adminId: 7,
    adminName: '운영자A',
    targetType: 'REPORT',
    targetId: '91',
    targetSummary: '신고 당시 메시지',
    targetUserId: 19,
    targetUserName: '대상사용자',
    ...overrides,
  }
}

function response(overrides: Partial<AdminActionLogResponse> = {}): AdminActionLogResponse {
  return {
    items: [row()],
    nextCursor: null,
    admins: [
      { id: 7, displayName: '운영자A' },
      { id: 8, displayName: '운영자B' },
    ],
    ...overrides,
  }
}

/** 상세가 실제로 받은 출처를 드러내는 대역 — 링크의 state가 도착했는지 결과로 본다. */
function BackProbe() {
  const state = useLocation().state as { from?: string; label?: string } | null
  return (
    <div>
      <span data-testid="from">{state?.from}</span>
      <span data-testid="label">{state?.label}</span>
    </div>
  )
}

function renderPage() {
  return render(<MemoryRouter><ActionLogPage /></MemoryRouter>)
}

beforeEach(() => {
  vi.clearAllMocks()
  listActions.mockResolvedValue(response())
})

describe('전역 조치 로그 — 필터와 서버 정렬 결과를 그대로 읽는다', () => {
  it('처리자·조치·기간 필터를 조합해 요청한다', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('대상사용자')

    await user.selectOptions(screen.getByLabelText('처리자'), '7')
    await user.selectOptions(screen.getByLabelText('조치'), 'SUSPEND')
    await user.type(screen.getByLabelText('시작일'), '2026-08-10')
    await user.type(screen.getByLabelText('종료일'), '2026-08-12')

    await waitFor(() => expect(listActions).toHaveBeenLastCalledWith({
      adminUserId: 7,
      action: 'SUSPEND',
      from: '2026-08-09T15:00:00.000Z',
      to: '2026-08-12T14:59:59.999Z',
    }, null))
  })

  /**
   * 첫 페이지에 조치가 없는 운영자도 고를 수 있어야 한다. 행에서 처리자를 만들면 잘린 현재
   * 페이지에 우연히 등장한 운영자만 남아, 그 밖의 사람으로는 영원히 필터할 수 없다.
   */
  it('현재 페이지 밖 처리자도 고를 수 있게 응답의 전체 admins를 선택지로 쓴다', async () => {
    renderPage()
    await screen.findByText('대상사용자')

    expect(screen.getByRole('option', { name: '운영자B' })).toHaveValue('8')
  })

  it('빈 결과를 명시한다', async () => {
    listActions.mockResolvedValue(response({ items: [] }))
    renderPage()

    expect(await screen.findByText('조건에 맞는 조치 이력이 없습니다')).toBeInTheDocument()
  })

  it('사용자 상세와 같은 actionLabel 문구를 쓴다', async () => {
    renderPage()

    expect(await screen.findByText('정지 · 신고 종결')).toBeInTheDocument()
  })

  it('USER·REPORT 대상은 사용자 이름을 상세 링크로 표시한다', async () => {
    listActions.mockResolvedValue(response({
      items: [
        row({ id: 1, targetType: 'USER', targetId: '19' }),
        row({ id: 2, targetType: 'REPORT', targetId: '91' }),
      ],
    }))
    renderPage()

    const links = await screen.findAllByRole('link', { name: '대상사용자' })
    expect(links).toHaveLength(2)
    for (const link of links) expect(link).toHaveAttribute('href', '/users/19')
  })

  /**
   * 신고 대상 조치는 "누구"만으로 <b>어느 신고인지</b> 가릴 수 없다 — 같은 사람에게 정지와 신고
   * 종결을 하면 대상 칸이 똑같이 이름 하나가 된다. BE가 발췌를 싣는 이유가 이것이므로
   * (사용자 상세의 "#N만으로는 해석 불가" 피드백과 같은 문제) 이름 <b>과 함께</b> 보여준다.
   */
  it('신고 대상은 사용자 이름과 스냅샷 발췌를 함께 보여준다', async () => {
    listActions.mockResolvedValue(response({
      items: [row({
        targetType: 'REPORT', targetId: '91', targetSummary: '야 이 XX야 꺼져라 진짜',
      })],
    }))
    renderPage()

    const dataRow = (await screen.findAllByRole('row'))[1]
    expect(within(dataRow).getByRole('link', { name: '대상사용자' })).toBeInTheDocument()
    expect(within(dataRow).getByText(/야 이 XX야 꺼져라 진짜/)).toBeInTheDocument()
  })

  /** 발췌가 없는 축(정지·해제 등 USER 대상)까지 빈 따옴표를 그리지 않는다. */
  it('발췌가 없으면 이름만 보여준다', async () => {
    listActions.mockResolvedValue(response({
      items: [row({ targetType: 'USER', targetId: '19', targetSummary: null })],
    }))
    renderPage()

    const dataRow = (await screen.findAllByRole('row'))[1]
    expect(within(dataRow).getByRole('link', { name: '대상사용자' })).toBeInTheDocument()
    expect(within(dataRow).queryByText(/[“”]/)).not.toBeInTheDocument()
  })

  /**
   * 대상 열은 폭이 고정이라 넘치면 <code>ellipsis</code>로 잘린다(styles.css). 감사 로그에서
   * 대상 식별자가 잘린 채 <b>확인할 방법이 없으면</b> 그 행은 읽을 수 없으므로 전문을 title로 남긴다.
   */
  it('잘려도 읽을 수 있게 대상 전문을 title로 남긴다', async () => {
    listActions.mockResolvedValue(response({
      items: [
        row({ id: 1, targetType: 'REPORT', targetId: '91', targetSummary: '긴 스냅샷 발췌' }),
        row({
          id: 2, targetType: 'MESSAGE', targetId: '4:01KZSEED0000000000000000',
          targetSummary: null, targetUserId: null, targetUserName: null,
        }),
      ],
    }))
    renderPage()

    const rows = await screen.findAllByRole('row')
    expect(within(rows[1]).getByRole('cell', { name: /대상사용자/ }))
        .toHaveAttribute('title', '대상사용자 · “긴 스냅샷 발췌”')
    expect(within(rows[2]).getByRole('cell', { name: '4:01KZSEED0000000000000000' }))
        .toHaveAttribute('title', '4:01KZSEED0000000000000000')
  })

  /** 상세는 온 곳으로 되돌려야 한다 — 출처를 안 실으면 조치 로그에서 들어와도 신고 큐로 나간다. */
  it('대상 링크는 어디서 왔는지를 함께 실어 보낸다', async () => {
    listActions.mockResolvedValue(response({ items: [row({ targetType: 'USER' })] }))
    render(
        <MemoryRouter initialEntries={['/actions']}>
          <Routes>
            <Route path="/actions" element={<ActionLogPage />} />
            <Route path="/users/:userId" element={<BackProbe />} />
          </Routes>
        </MemoryRouter>)

    await userEvent.setup().click(await screen.findByRole('link', { name: '대상사용자' }))

    expect(await screen.findByTestId('from')).toHaveTextContent('/actions')
    expect(screen.getByTestId('label')).toHaveTextContent('조치 로그')
  })

  it('MESSAGE 대상은 targetSummary나 targetId로 표시하고 맥락 의존 표현을 쓰지 않는다', async () => {
    listActions.mockResolvedValue(response({
      items: [row({
        targetType: 'MESSAGE', targetId: '42:M-1', targetSummary: null,
        targetUserId: null, targetUserName: null,
      })],
    }))
    renderPage()

    const dataRow = (await screen.findAllByRole('row'))[1]
    expect(within(dataRow).getByText('42:M-1')).toBeInTheDocument()
    expect(within(dataRow).queryByText('이 사용자')).not.toBeInTheDocument()
  })
})

describe('전역 조치 로그 — 커서 이어 읽기', () => {
  it('더 불러오기는 커서를 보내고 기존 결과 뒤에 이어붙인다', async () => {
    const user = userEvent.setup()
    listActions
      .mockResolvedValueOnce(response({
        items: [row({ id: 31, targetUserName: '첫 대상' })],
        nextCursor: '1786505640000_31',
      }))
      .mockResolvedValueOnce(response({
        items: [row({ id: 30, targetUserName: '다음 대상' })],
        nextCursor: null,
      }))
    renderPage()

    await user.click(await screen.findByRole('button', { name: '더 불러오기' }))

    await screen.findByText('다음 대상')
    expect(screen.getByText('첫 대상')).toBeInTheDocument()
    expect(listActions).toHaveBeenLastCalledWith({
      adminUserId: '', action: '', from: '', to: '',
    }, '1786505640000_31')
  })

  it('필터를 바꾸면 이어붙인 목록과 커서를 버리고 첫 페이지로 교체한다', async () => {
    const user = userEvent.setup()
    listActions
      .mockResolvedValueOnce(response({
        items: [row({ id: 31, targetUserName: '첫 대상' })],
        nextCursor: '1786505640000_31',
      }))
      .mockResolvedValueOnce(response({
        items: [row({ id: 30, targetUserName: '이어진 대상' })],
        nextCursor: null,
      }))
      .mockResolvedValueOnce(response({
        items: [row({ id: 20, targetUserName: '필터 결과' })],
        nextCursor: null,
      }))
    renderPage()

    await user.click(await screen.findByRole('button', { name: '더 불러오기' }))
    await screen.findByText('이어진 대상')
    await user.selectOptions(screen.getByLabelText('조치'), 'BLIND')

    await screen.findByText('필터 결과')
    expect(screen.queryByText('첫 대상')).not.toBeInTheDocument()
    expect(screen.queryByText('이어진 대상')).not.toBeInTheDocument()
    expect(listActions).toHaveBeenLastCalledWith({
      adminUserId: '', action: 'BLIND', from: '', to: '',
    }, null)
  })
})
