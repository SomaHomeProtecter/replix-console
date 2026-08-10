import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as admin from './api/admin'
import App from './App'

// env는 모듈 평가 시점에 굳으므로(부트스트랩 검증) 테스트마다 바꾸려면 가변 객체를 물린다.
const envMock = vi.hoisted(() => ({
  apiBaseUrl: 'http://api.test', kcUrl: '', kcRealm: '', kcClientId: '',
  grafanaUrl: null as string | null,
}))
vi.mock('./env', () => ({ env: envMock }))
vi.mock('./auth', () => ({ userName: () => '지호', logout: vi.fn(), getToken: vi.fn() }))
vi.mock('./api/admin')

beforeEach(() => {
  vi.clearAllMocks()
  envMock.grafanaUrl = null
  vi.mocked(admin.listReports).mockResolvedValue({ items: [], nextCursor: null })
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
