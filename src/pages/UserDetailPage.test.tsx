import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as admin from '../api/admin'
import { makeActionRow, makeReceivedReport, makeUserDetail } from '../test/fixtures'
import UserDetailPage from './UserDetailPage'

vi.mock('../api/admin')

const getUserDetail = vi.mocked(admin.getUserDetail)
const unsuspendUser = vi.mocked(admin.unsuspendUser)
const suspendUser = vi.mocked(admin.suspendUser)

function renderPage() {
  return render(
      <MemoryRouter initialEntries={['/users/9']}>
        <Routes>
          <Route path="/users/:userId" element={<UserDetailPage />} />
        </Routes>
      </MemoryRouter>)
}

beforeEach(() => {
  vi.clearAllMocks()
  getUserDetail.mockResolvedValue(makeUserDetail())
})

describe('사용자 상세(정본 ②) — 기본 정보 블록 + 탭 3개', () => {
  it('헤더와 기본 정보 블록(읽기 전용)을 보여준다', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: /스포일러꾼/ })).toBeInTheDocument()
    expect(getUserDetail).toHaveBeenCalledWith(9)
    expect(screen.getByText('활성')).toBeInTheDocument()
    expect(screen.getByText('target@example.com')).toBeInTheDocument()
    expect(screen.getByText('keycloak')).toBeInTheDocument()
  })

  it('탭 = 받은 신고(기본) · 조치 이력 · 정지 이력(별도 축 suspensions)', async () => {
    getUserDetail.mockResolvedValue(makeUserDetail({
      reportsReceived: [makeReceivedReport({ snapshotMessage: '욕설 스냅샷', reporterName: '신고자닉' })],
      actions: [
        makeActionRow({ id: 33, action: 'UNSUSPEND', reason: null, createdAt: '2026-08-03T11:00:00Z' }),
        makeActionRow({ id: 32, action: 'SUSPEND', reason: '도배' }),
        makeActionRow({ id: 31, action: 'RESOLVE_REPORT', reason: '기각함' }),
      ],
      // 정지 이력은 BE가 별도 축으로 준다(리뷰 m9) — 화면은 필터하지 않고 그대로 그린다
      suspensions: [
        makeActionRow({ id: 33, action: 'UNSUSPEND', reason: null, createdAt: '2026-08-03T11:00:00Z' }),
        makeActionRow({ id: 32, action: 'SUSPEND', reason: '도배' }),
      ],
    }))
    renderPage()
    // 기본 탭 = 받은 신고
    expect(await screen.findByText(/욕설 스냅샷/)).toBeInTheDocument()
    expect(screen.getByText('신고자닉')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: /조치 이력/ }))
    const actionsTable = screen.getByRole('table')
    expect(within(actionsTable).getAllByRole('row')).toHaveLength(4) // 헤더 + 3행
    expect(within(actionsTable).getByText('정지 해제')).toBeInTheDocument()
    expect(within(actionsTable).getByText('신고 종결')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: /정지 이력/ }))
    const suspensionTable = screen.getByRole('table')
    expect(within(suspensionTable).getAllByRole('row')).toHaveLength(3) // 헤더 + SUSPEND·UNSUSPEND
    expect(within(suspensionTable).queryByText('신고 종결')).not.toBeInTheDocument()
  })

  it('정지 중이면 만료 시각을 계산해 배지에 노출하고 해제 동선을 연다', async () => {
    getUserDetail.mockResolvedValue(makeUserDetail({
      profile: {
        ...makeUserDetail().profile,
        status: 'SUSPENDED', suspendedUntil: '2126-01-01T00:00:00Z', suspendReason: '도배',
      },
    }))
    renderPage()
    expect(await screen.findByText(/까지 정지/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '정지 해제' }))
    expect(unsuspendUser).toHaveBeenCalledWith(9)
    await waitFor(() => expect(getUserDetail).toHaveBeenCalledTimes(2)) // 해제 후 재조회
  })

  it('만료 지난 정지는 만료됨으로 정직하게 표기한다(lazy 설계)', async () => {
    getUserDetail.mockResolvedValue(makeUserDetail({
      profile: {
        ...makeUserDetail().profile,
        status: 'SUSPENDED', suspendedUntil: '2026-08-01T00:00:00Z', suspendReason: '지난 정지',
      },
    }))
    renderPage()
    expect(await screen.findByText(/정지 만료됨/)).toBeInTheDocument()
  })

  it('여기서도 계정 정지가 가능하다(다이얼로그 재사용)', async () => {
    renderPage()
    await screen.findByRole('heading', { name: /스포일러꾼/ })
    await userEvent.click(screen.getByRole('button', { name: /계정 정지/ }))
    await userEvent.type(screen.getByLabelText('정지 사유'), '반복 어뷰징')
    await userEvent.click(screen.getByRole('button', { name: '정지 적용' }))

    expect(suspendUser).toHaveBeenCalledWith(9, 'H24', '반복 어뷰징')
    await waitFor(() => expect(getUserDetail).toHaveBeenCalledTimes(2)) // 정지 후 재조회
  })

  it('조회 실패는 메시지를 표면화한다', async () => {
    getUserDetail.mockRejectedValue(new Error('사용자를 찾을 수 없습니다'))
    renderPage()
    expect(await screen.findByText(/사용자를 찾을 수 없습니다/)).toBeInTheDocument()
  })
})
