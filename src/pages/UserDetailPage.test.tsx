import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
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

describe('지금 적용 중인 조치만 보기(HP-268)', () => {
  /**
   * 종결 → 재오픈으로 상쇄된 쌍(신고 55) + 되돌려지지 않은 종결 1건(신고 77).
   * 조치 이력은 이제 REPORT 축만 싣는다(HP-268) — 정지·해제는 정지 이력 탭 몫.
   */
  const withReverted = () => makeUserDetail({
    actions: [
      makeActionRow({
        id: 3, action: 'RESOLVE_REPORT', outcome: 'SUSPEND', reason: '정지 처리함',
        targetType: 'REPORT', targetId: '77', targetSummary: '심한 욕설',
      }),
      makeActionRow({ id: 2, action: 'REOPEN_REPORT', targetType: 'REPORT', targetId: '55', reason: null }),
      makeActionRow({
        id: 1, action: 'RESOLVE_REPORT', outcome: 'BLIND', reason: '가림 처리함',
        targetType: 'REPORT', targetId: '55', targetSummary: '스포일러',
      }),
    ],
  })

  it('기본값은 전량 표시 — 감사 이력은 무엇이 있었는지가 정본이다', async () => {
    getUserDetail.mockResolvedValue(withReverted())
    renderPage()
    await userEvent.click(await screen.findByRole('tab', { name: '조치 이력 3' }))

    expect(screen.getByRole('checkbox', { name: '지금 적용 중인 조치만 보기' })).not.toBeChecked()
    expect(screen.getByText('신고 종결 · 가림')).toBeInTheDocument()
    expect(screen.getByText('신고 재오픈')).toBeInTheDocument()
    expect(screen.getByText('신고 종결 · 정지')).toBeInTheDocument()
  })

  it('켜면 상쇄된 쌍이 사라지고 살아 있는 조치만 남는다', async () => {
    getUserDetail.mockResolvedValue(withReverted())
    renderPage()
    await userEvent.click(await screen.findByRole('tab', { name: '조치 이력 3' }))

    await userEvent.click(screen.getByRole('checkbox', { name: '지금 적용 중인 조치만 보기' }))

    expect(screen.queryByText('신고 종결 · 가림')).not.toBeInTheDocument()
    expect(screen.queryByText('신고 재오픈')).not.toBeInTheDocument()
    expect(screen.getByText('신고 종결 · 정지')).toBeInTheDocument()
  })

  it('숨긴 건수를 알려준다 — 이력이 조용히 줄면 기록이 사라진 줄 안다', async () => {
    getUserDetail.mockResolvedValue(withReverted())
    renderPage()
    await userEvent.click(await screen.findByRole('tab', { name: '조치 이력 3' }))
    await userEvent.click(screen.getByRole('checkbox', { name: '지금 적용 중인 조치만 보기' }))

    expect(screen.getByText(/되돌려진 2건 숨김/)).toBeInTheDocument()
  })

  it('무엇을 숨기는지 화면에 적는다 — "유효 조치"는 그 말만으론 뜻을 알 수 없다', async () => {
    getUserDetail.mockResolvedValue(withReverted())
    renderPage()
    await userEvent.click(await screen.findByRole('tab', { name: '조치 이력 3' }))

    // 역쌍까지 화면에 적혀 있어야 한다 — 툴팁으로 숨기면 아무도 안 본다
    expect(screen.getByText(/되돌려진 조치를 짝지어 숨깁니다/)).toBeInTheDocument()
    expect(screen.getByText(/가림↔해제 · 정지↔해제 · 종결↔재오픈/)).toBeInTheDocument()
  })

  it('탭 라벨의 건수는 전체를 유지한다 — 기록 규모는 필터와 무관하다', async () => {
    getUserDetail.mockResolvedValue(withReverted())
    renderPage()
    await userEvent.click(await screen.findByRole('tab', { name: '조치 이력 3' }))
    await userEvent.click(screen.getByRole('checkbox', { name: '지금 적용 중인 조치만 보기' }))

    expect(screen.getByRole('tab', { name: '조치 이력 3' })).toBeInTheDocument()
  })
})

describe('사용자 상세(정본 ②) — 기본 정보 블록 + 탭 3개', () => {
  it('헤더(상태 칩·userId·provider)와 기본 정보 블록(읽기 전용)을 보여준다', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: /스포일러꾼/ })).toBeInTheDocument()
    expect(getUserDetail).toHaveBeenCalledWith(9)
    expect(screen.getAllByText('ACTIVE').length).toBeGreaterThan(0) // 헤더 칩 + 기본 정보 dl
    expect(screen.getByText('target@example.com')).toBeInTheDocument()
    expect(screen.getByText(/userId 9 · provider keycloak/)).toBeInTheDocument()
  })

  it('탭 = 받은 신고(기본) · 조치 이력 · 정지 이력(별도 축 suspensions) — 건수 표기', async () => {
    getUserDetail.mockResolvedValue(makeUserDetail({
      reportsReceived: [makeReceivedReport({ snapshotMessage: '욕설 스냅샷', reporterName: '신고자닉' })],
      // 조치 이력 = USER 축(정지·해제) + REPORT 축(신고 처리). 두 줄이 보이는 것은 중복이
      // 아니라 "제재"와 "판정"이 각각 남는 것이다(HP-268 — 뺐다가 되돌림)
      actions: [
        makeActionRow({ id: 33, action: 'UNSUSPEND', reason: null, createdAt: '2026-08-03T11:00:00Z' }),
        makeActionRow({ id: 32, action: 'SUSPEND', reason: '도배' }),
        makeActionRow({
          id: 31, action: 'RESOLVE_REPORT', reason: '가림 처리함', outcome: 'BLIND',
          targetType: 'REPORT', targetId: '77', targetSummary: '3화 결말 스포: 범인은…',
        }),
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
    expect(screen.getByText(/신고자닉/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: '조치 이력 3' })) // 건수 = 시안 탭 라벨
    // REPORT 축 조치는 어떤 신고인지 스냅샷 발췌로 직관 표기 + 처리자 컬럼(E2E 피드백 2회)
    // + 종결이 무엇으로 끝났는지 결과까지(HP-268)
    expect(screen.getByText('신고 종결 · 가림')).toBeInTheDocument()
    expect(screen.getByText(/3화 결말 스포: 범인은…/)).toBeInTheDocument()
    expect(screen.getAllByText('지호').length).toBeGreaterThan(0) // 처리자
    // 정지·해제도 함께 보인다 — 한때 뺐다가 되돌렸다(중복이 아닌 행까지 사라졌다)
    expect(screen.getByText('정지 해제')).toBeInTheDocument()
    expect(screen.getByText('계정 정지')).toBeInTheDocument()
    expect(screen.getAllByText('이 사용자').length).toBeGreaterThan(0) // USER 축 대상 표기

    await userEvent.click(screen.getByRole('tab', { name: '정지 이력 2' }))
    expect(screen.queryByText(/신고 종결/)).not.toBeInTheDocument()
    expect(screen.getByText('정지 해제')).toBeInTheDocument()
    expect(screen.getByText('계정 정지')).toBeInTheDocument()
  })

  it('정지 중이면 만료 시각을 계산해 배지에 노출하고 해제 동선을 연다', async () => {
    getUserDetail.mockResolvedValue(makeUserDetail({
      profile: {
        ...makeUserDetail().profile,
        status: 'SUSPENDED', suspendedUntil: '2126-01-01T00:00:00Z', suspendReason: '도배',
      },
    }))
    renderPage()
    expect(await screen.findByText(/SUSPENDED · ~/)).toBeInTheDocument() // 만료 시각 lazy 계산 칩

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
    expect(await screen.findByText(/만료됨\(자동 해제 대기\)/)).toBeInTheDocument()
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
