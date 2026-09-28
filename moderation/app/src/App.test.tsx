import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as admin from './api/admin'
import App from './App'
import * as auth from './auth'
import { makeSuspendedRow } from './test/fixtures'

// env는 모듈 평가 시점에 굳으므로(부트스트랩 검증) 테스트마다 바꾸려면 가변 객체를 물린다.
const envMock = vi.hoisted(() => ({
  environment: 'DEV' as 'LOCAL' | 'DEV' | 'PROD',
  apiBaseUrl: 'http://api.test', kcUrl: '', kcRealm: '', kcClientId: '',
  expectedAudience: 'account', expectedAzp: 'replix-web',
  grafanaUrl: null as string | null,
}))
vi.mock('./env', () => ({ env: envMock }))
vi.mock('./auth', () => ({
  userName: () => '지호', roleLabel: () => 'admin', logout: vi.fn(),
  switchEnvironment: vi.fn(), getToken: vi.fn(), realmRoles: () => ['admin'],
}))
vi.mock('./api/admin')

beforeEach(() => {
  vi.clearAllMocks()
  envMock.environment = 'DEV'
  envMock.grafanaUrl = null
  vi.mocked(admin.listReports).mockResolvedValue({ items: [], nextCursor: null })
  vi.mocked(admin.listSuspendedUsers).mockResolvedValue({ rows: [], total: 0 })
  vi.mocked(admin.listActions).mockResolvedValue({ items: [], nextCursor: null, admins: [] })
  vi.mocked(admin.searchUsers).mockResolvedValue({ rows: [] })
  vi.mocked(admin.listModerationReviews).mockResolvedValue({
    items: [], pendingTotal: 0, viewTotal: 0, hasMore: false,
    counts: {
      profanity: { falsePositive: 0, truePositive: 0 },
      hate: { falsePositive: 0, truePositive: 0 }, evictedPending: 0,
    },
  })
  vi.mocked(admin.listFeatureFlags).mockResolvedValue([])
  vi.mocked(admin.listFeedback).mockResolvedValue({ items: [], nextCursor: null })
})

describe('환경 표시와 전환(HP-337)', () => {
  it('선택한 환경을 표시하고 전환은 재인증 함수에 위임한다', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><App /></MemoryRouter>)

    const selector = screen.getByRole('combobox', { name: '연결 환경' })
    expect(selector).toHaveValue('DEV')
    await user.selectOptions(selector, 'PROD')
    expect(auth.switchEnvironment).toHaveBeenCalledWith('PROD')
  })

  it('PROD에서는 실제 데이터 경고를 모든 화면 위에 계속 표시한다', () => {
    envMock.environment = 'PROD'
    render(<MemoryRouter><App /></MemoryRouter>)
    expect(screen.getByRole('status')).toHaveTextContent('PROD 운영 환경')
  })
})

/**
 * 화면이 둘 이상이 된 순간(HP-300 정지 현황판) 톱바가 <b>길</b>이 된다. 종전 톱바의 "신고 큐"는
 * 링크가 아닌 글자였다 — 화면이 하나뿐일 때는 맞았지만, 지금은 그대로 두면 새 화면에 갈 길이 없다.
 */
describe('톱바 탭 — 화면 사이를 오간다', () => {
  it('여섯 화면이 각자의 경로로 걸려 있다', () => {
    render(<MemoryRouter><App /></MemoryRouter>)

    expect(screen.getByRole('link', { name: '신고 큐' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: '정지 현황' })).toHaveAttribute('href', '/suspensions')
    expect(screen.getByRole('link', { name: '조치 로그' })).toHaveAttribute('href', '/actions')
    expect(screen.getByRole('link', { name: '오탐 검토' })).toHaveAttribute('href', '/moderation-reviews')
    expect(screen.getByRole('link', { name: '기능 제어' })).toHaveAttribute('href', '/feature-control')
    expect(screen.getByRole('link', { name: '피드백' })).toHaveAttribute('href', '/feedback')
  })

  it('지금 보는 화면을 탭이 표시한다', () => {
    render(<MemoryRouter initialEntries={['/suspensions']}><App /></MemoryRouter>)

    expect(screen.getByRole('link', { name: '정지 현황' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: '신고 큐' })).not.toHaveAttribute('aria-current')
  })

  /**
   * 신고 큐는 <code>/</code>라 다른 <b>모든</b> 경로의 접두사다 — 두 탭이 함께 켜지면 지금 어디
   * 있는지가 화면에서 사라진다. 무엇이 그걸 막는지(NavLink의 end냐 라우터의 경로 경계 검사냐)는
   * 라우터 사정이므로 여기서 고정하지 않는다 — <b>결과</b>만 못박는다.
   */
  it('사용자 상세에서는 신고 큐 탭이 켜지지 않는다', () => {
    render(<MemoryRouter initialEntries={['/users/9']}><App /></MemoryRouter>)

    expect(screen.getByRole('link', { name: '신고 큐' })).not.toHaveAttribute('aria-current')
  })

  it('/suspensions는 정지 현황판을 연다', async () => {
    render(<MemoryRouter initialEntries={['/suspensions']}><App /></MemoryRouter>)

    expect(await screen.findByRole('region', { name: '정지 현황판' })).toBeInTheDocument()
    expect(admin.listSuspendedUsers).toHaveBeenCalled()
  })

  it('/actions는 전역 조치 로그를 연다', async () => {
    render(<MemoryRouter initialEntries={['/actions']}><App /></MemoryRouter>)

    expect(await screen.findByRole('region', { name: '조치 로그' })).toBeInTheDocument()
    expect(admin.listActions).toHaveBeenCalled()
  })

  it('/feedback는 사용자 피드백 목록을 연다', async () => {
    render(<MemoryRouter initialEntries={['/feedback']}><App /></MemoryRouter>)

    expect(await screen.findByRole('region', { name: '피드백' })).toBeInTheDocument()
    expect(admin.listFeedback).toHaveBeenCalled()
  })

  it('/moderation-reviews는 클린봇 오탐 검토를 연다', async () => {
    render(<MemoryRouter initialEntries={['/moderation-reviews']}><App /></MemoryRouter>)

    expect(await screen.findByRole('region', { name: '클린봇 오탐 검토' })).toBeInTheDocument()
    expect(admin.listModerationReviews).toHaveBeenCalled()
  })

  it('정지 해제가 도는 동안 톱바의 이탈 수단을 막고, 끝나면 다시 연다', async () => {
    const user = userEvent.setup()
    let release!: () => void
    vi.mocked(admin.listSuspendedUsers).mockResolvedValue({
      rows: [makeSuspendedRow({ userId: 9 })], total: 1,
    })
    vi.mocked(admin.unsuspendUser).mockImplementation(() => new Promise((ok) => {
      release = () => ok({ userId: 9, status: 'ACTIVE', suspendedUntil: null, suspendReason: null })
    }))
    render(<MemoryRouter initialEntries={['/suspensions']}><App /></MemoryRouter>)

    await user.click(await screen.findByRole('button', { name: '정지 해제' }))
    await user.click(screen.getByRole('button', { name: '해제 확인' }))

    const topbarLinks = [
      // 종전 "Replix Admin" 브랜드 자리는 운영 콘솔 도구 전환이 이었다(HP-456) — 같은 잠금을 진다.
      screen.getByRole('link', { name: /^Re\s*plix$/ }),
      screen.getByRole('link', { name: '신고 큐' }),
      screen.getByRole('link', { name: '정지 현황' }),
      screen.getByRole('link', { name: '조치 로그' }),
      screen.getByRole('link', { name: '오탐 검토' }),
      screen.getByRole('link', { name: '기능 제어' }),
    ]
    await waitFor(() => {
      for (const link of topbarLinks) expect(link).toHaveAttribute('aria-disabled', 'true')
    })
    const logout = screen.getByRole('button', { name: '로그아웃' })
    expect(logout).toBeDisabled()
    const toolToggle = screen.getByRole('button', { name: /조치 콘솔/ })
    expect(toolToggle).toBeDisabled()
    expect(screen.getByRole('searchbox', { name: '사용자 검색' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '검색' })).toBeDisabled()

    await user.click(topbarLinks[0])
    await user.click(logout)
    expect(auth.logout).not.toHaveBeenCalled()
    expect(screen.getByRole('region', { name: '정지 현황판' })).toBeInTheDocument()

    release()
    await waitFor(() => {
      for (const link of topbarLinks) expect(link).not.toHaveAttribute('aria-disabled')
      expect(logout).toBeEnabled()
      expect(toolToggle).toBeEnabled()
      expect(screen.getByRole('searchbox', { name: '사용자 검색' })).toBeEnabled()
    })
  })
})

/**
 * 지표 화면은 만들지 않는다(HP-223 확정 제약 ③ — Micrometer + 홈 VM Grafana). 대신 있는 곳으로
 * 보낸다(HP-297). 지금은 운영자가 Grafana URL을 따로 기억한다.
 */
describe('톱바 Grafana 딥링크(HP-297) — 콘솔은 차트를 그리지 않는다', () => {
  it('VITE_GRAFANA_URL이 없으면 링크를 아예 그리지 않는다', () => {
    render(<MemoryRouter><App /></MemoryRouter>)
    expect(screen.queryByRole('link', { name: /Grafana/ })).not.toBeInTheDocument()
  })

  it('값이 있으면 그 대시보드로 새 탭에서 연다', () => {
    envMock.grafanaUrl = 'https://grafana.test/d/moderation'
    render(<MemoryRouter><App /></MemoryRouter>)

    const link = screen.getByRole('link', { name: /Grafana/ })
    expect(link).toHaveAttribute('href', 'https://grafana.test/d/moderation')
    expect(link).toHaveAttribute('target', '_blank')
    // 새 탭으로 여는 외부 링크는 opener를 끊는다 — 콘솔은 운영 데이터를 띄우는 화면이다
    expect(link).toHaveAttribute('rel', expect.stringContaining('noreferrer'))
  })
})
