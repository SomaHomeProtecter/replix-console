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
const warnUser = vi.mocked(admin.warnUser)

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

/**
 * 상세로 오는 길이 셋이 됐다(신고 큐 · 정지 현황판 · 조치 로그) — 돌아가는 길이 하나로 굳어
 * 있으면 <b>온 곳이 아닌 데로</b> 되돌려보낸다. 보낸 화면이 <code>state.from</code>으로 알려
 * 주면 그리로, 아니면 종전대로 신고 큐로 간다(직접 URL 진입·북마크).
 */
describe('돌아가는 길 — 온 곳으로 되돌린다', () => {
  function renderFrom(state?: { from: string; label: string }) {
    return render(
        <MemoryRouter initialEntries={[{ pathname: '/users/9', state }]}>
          <Routes>
            <Route path="/users/:userId" element={<UserDetailPage />} />
          </Routes>
        </MemoryRouter>)
  }

  it('보낸 화면이 알려주면 그 화면으로 돌아간다', async () => {
    renderFrom({ from: '/actions', label: '조치 로그' })

    const back = await screen.findByRole('link', { name: '← 조치 로그로' })
    expect(back).toHaveAttribute('href', '/actions')
  })

  /** 받침이 있는 유일한 출처 — 조사를 손으로 적으면 여기서 "정지 현황로"가 된다. */
  it('받침 있는 화면 이름에는 "으로"를 붙인다', async () => {
    renderFrom({ from: '/suspensions', label: '정지 현황' })

    const back = await screen.findByRole('link', { name: '← 정지 현황으로' })
    expect(back).toHaveAttribute('href', '/suspensions')
  })

  it('출처를 모르면 종전대로 신고 큐로 간다', async () => {
    renderFrom()

    const back = await screen.findByRole('link', { name: '← 신고 큐로' })
    expect(back).toHaveAttribute('href', '/')
  })
})

describe('지금 적용 중인 조치만 보기(HP-268)', () => {
  /**
   * 종결 → 재오픈으로 상쇄된 쌍(신고 55) + 되돌려지지 않은 종결 1건(신고 77).
   * 조치 이력은 이제 REPORT 축만 싣는다(HP-268) — 정지·해제는 정지 이력 탭 몫.
   */
  const withReverted = () => makeUserDetail({
    actions: [
      makeActionRow({
        id: 3, action: 'RESOLVE_REPORT', outcome: 'BLIND', reason: '가림 처리함',
        targetType: 'REPORT', targetId: '77', targetSummary: '심한 욕설',
      }),
      makeActionRow({ id: 2, action: 'REOPEN_REPORT', targetType: 'REPORT', targetId: '55', reason: null }),
      makeActionRow({
        id: 1, action: 'RESOLVE_REPORT', outcome: 'NONE', reason: '경미',
        targetType: 'REPORT', targetId: '55', targetSummary: '스포일러',
      }),
    ],
  })

  it('기본값은 전량 표시 — 감사 이력은 무엇이 있었는지가 정본이다', async () => {
    getUserDetail.mockResolvedValue(withReverted())
    renderPage()
    await userEvent.click(await screen.findByRole('tab', { name: '조치 이력 3' }))

    expect(screen.getByRole('checkbox', { name: '지금 적용 중인 조치만 보기' })).not.toBeChecked()
    expect(screen.getByText('가림 · 신고 종결')).toBeInTheDocument()
    expect(screen.getByText('신고 재오픈')).toBeInTheDocument()
    expect(screen.getByText('조치 없음 · 신고 종결')).toBeInTheDocument()
  })

  it('켜면 상쇄된 쌍이 사라지고 살아 있는 조치만 남는다', async () => {
    getUserDetail.mockResolvedValue(withReverted())
    renderPage()
    await userEvent.click(await screen.findByRole('tab', { name: '조치 이력 3' }))

    await userEvent.click(screen.getByRole('checkbox', { name: '지금 적용 중인 조치만 보기' }))

    expect(screen.queryByText('조치 없음 · 신고 종결')).not.toBeInTheDocument()
    expect(screen.queryByText('신고 재오픈')).not.toBeInTheDocument()
    expect(screen.getByText('가림 · 신고 종결')).toBeInTheDocument()
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
  it('누적 3회부터 정지 검토를 표시하고 경고 후 상세를 다시 읽는다', async () => {
    getUserDetail.mockResolvedValue(makeUserDetail({
      warnings: { total: 3, suspensionReviewRecommended: true },
    }))
    renderPage()

    expect(await screen.findByText('3회 · 정지 검토')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /경고/ }))
    await userEvent.click(screen.getByRole('radio', { name: '스포일러' }))
    await userEvent.click(screen.getByRole('button', { name: '경고 발송' }))

    await waitFor(() => expect(warnUser).toHaveBeenCalledWith(9, 'SPOILER', null))
    await waitFor(() => expect(getUserDetail).toHaveBeenCalledTimes(2))
  })

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
    expect(screen.getByText('가림 · 신고 종결')).toBeInTheDocument()
    expect(screen.getByText(/3화 결말 스포: 범인은…/)).toBeInTheDocument()
    expect(screen.getAllByText('지호').length).toBeGreaterThan(0) // 처리자
    // 정지·해제도 함께 보인다 — 한때 뺐다가 되돌렸다(중복이 아닌 행까지 사라졌다)
    expect(screen.getByText('정지 해제')).toBeInTheDocument()
    expect(screen.getByText('정지')).toBeInTheDocument()
    expect(screen.getAllByText('이 사용자').length).toBeGreaterThan(0) // USER 축 대상 표기

    await userEvent.click(screen.getByRole('tab', { name: '정지 이력 2' }))
    expect(screen.queryByText(/신고 종결/)).not.toBeInTheDocument()
    expect(screen.getByText('정지 해제')).toBeInTheDocument()
    expect(screen.getByText('정지')).toBeInTheDocument()
  })

  /**
   * 정지 종결은 API를 두 번 부르므로 감사 행이 둘이다. 둘 다 정당한 기록이라 지울 수 없고,
   * 한쪽만 숨기면 그 사실이 화면에서 사라진다 — 한 줄로 합쳐 두 사실을 함께 남긴다(HP-268).
   */
  it('정지로 종결한 건은 한 줄로 합쳐 보이고, 정지 사유도 함께 남는다', async () => {
    getUserDetail.mockResolvedValue(makeUserDetail({
      actions: [
        makeActionRow({
          id: 50, action: 'RESOLVE_REPORT', outcome: 'SUSPEND', reason: '정지 처리함',
          targetType: 'REPORT', targetId: '26', targetSummary: '욕설 내용',
          adminName: '지호', createdAt: '2026-08-05T03:48:39.891Z',
        }),
        makeActionRow({
          id: 49, action: 'SUSPEND', targetType: 'USER', targetId: '9', reason: '도배',
          adminName: '지호', createdAt: '2026-08-05T03:48:39.844Z',
        }),
      ],
      suspensions: [],
    }))
    renderPage()
    await userEvent.click(await screen.findByRole('tab', { name: '조치 이력 2' }))

    // 한 줄 — 라벨이 두 사실을 다 말하고, 정지 행이 따로 뜨지 않는다
    expect(screen.getByText('정지 · 신고 종결')).toBeInTheDocument()
    expect(document.querySelectorAll('.evrow.act:not(.head2)')).toHaveLength(1)
    // 합치면서 잃는 정보가 없어야 한다 — 어느 신고인지, 왜 정지했는지, 종결 메모까지
    expect(screen.getByText(/욕설 내용/)).toBeInTheDocument()
    expect(screen.getByText(/도배/)).toBeInTheDocument()
    expect(screen.getByText(/정지 처리함/)).toBeInTheDocument()
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

describe('신고자 신뢰도(HP-270) — 정지 판단의 근거', () => {
  it('그 사용자가 보낸 신고의 집계와 기각률을 보여준다', async () => {
    getUserDetail.mockResolvedValue(
        makeUserDetail({ reportsSent: { total: 12, judged: 10, rejected: 3 } }))
    renderPage()
    expect(await screen.findByText('보낸 신고 12건 · 기각 3건 (판정 10건 중 30%)'))
        .toBeInTheDocument()
  })

  /** 받은 신고와 반대 축이라 라벨이 없으면 어느 쪽 수인지 알 수 없다. */
  it('보낸 신고가 없어도 자리를 비우지 않는다', async () => {
    getUserDetail.mockResolvedValue(makeUserDetail())
    renderPage()
    expect(await screen.findByText('보낸 신고 없음')).toBeInTheDocument()
  })
})
