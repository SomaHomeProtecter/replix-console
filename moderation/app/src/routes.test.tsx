import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as admin from './api/admin'
import { ModerationRoutes } from './routes'
import { WritingProvider } from './writing'

// 톱바·메뉴는 공용 틀(shell/app)이 그리고 그 동작은 공용 틀 테스트가 지킨다. 여기서는 경로마다 맞는 화면이
// 걸려 있는지만 본다(종전 App.test의 경로 검증을 옮겼다 — HP-521).
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
  vi.mocked(admin.listReports).mockResolvedValue({ items: [], nextCursor: null })
  vi.mocked(admin.listSuspendedUsers).mockResolvedValue({ rows: [], total: 0 })
  vi.mocked(admin.listActions).mockResolvedValue({ items: [], nextCursor: null, admins: [] })
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

// 공용 틀(shell/app ModerationSection)과 같은 감쌈 — 쓰기 중 잠금을 쓰는 화면이 있다.
function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><WritingProvider><ModerationRoutes /></WritingProvider></MemoryRouter>)
}

describe('조치 경로 — 주소마다 맞는 화면이 열린다', () => {
  it('/suspensions는 정지 현황판을 연다', async () => {
    renderAt('/suspensions')
    expect(await screen.findByRole('region', { name: '정지 현황판' })).toBeInTheDocument()
    expect(admin.listSuspendedUsers).toHaveBeenCalled()
  })

  it('/actions는 전역 조치 로그를 연다', async () => {
    renderAt('/actions')
    expect(await screen.findByRole('region', { name: '조치 로그' })).toBeInTheDocument()
    expect(admin.listActions).toHaveBeenCalled()
  })

  it('/feedback는 사용자 피드백 목록을 연다', async () => {
    renderAt('/feedback')
    expect(await screen.findByRole('region', { name: '피드백' })).toBeInTheDocument()
    expect(admin.listFeedback).toHaveBeenCalled()
  })

  it('/moderation-reviews는 클린봇 오탐 검토를 연다', async () => {
    renderAt('/moderation-reviews')
    expect(await screen.findByRole('region', { name: '클린봇 오탐 검토' })).toBeInTheDocument()
    expect(admin.listModerationReviews).toHaveBeenCalled()
  })

  it('/feature-control은 기능 제어를 연다', async () => {
    renderAt('/feature-control')
    expect(await screen.findByRole('region', { name: '기능 제어' })).toBeInTheDocument()
    expect(admin.listFeatureFlags).toHaveBeenCalled()
  })
})
