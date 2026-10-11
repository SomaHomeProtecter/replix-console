// @vitest-environment-options { "url": "https://console.replix.tv/" }
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { loadProfile } from '@core/env'
import Shell from './Shell'

vi.mock('@core/auth', () => ({
  userName: () => 'hyunbin',
  roleLabel: () => 'admin',
  logout: vi.fn(),
  switchEnvironment: vi.fn(),
}))

const nav = () => screen.getByRole('navigation', { name: '콘솔 메뉴' })

describe('공용 틀 — 호스팅 콘솔(console.replix.tv)', () => {
  it('PROD에서는 띠를 보이고, 시딩 묶음에 PROD 고정을 단다', () => {
    loadProfile('PROD')
    render(<Shell section="seeding" path="/seeding/" search={null}>본문</Shell>)
    expect(screen.getByRole('status')).toHaveTextContent('PROD 운영 환경')
    expect(within(nav()).getByText('PROD 고정')).toBeInTheDocument()
    expect(within(nav()).getByRole('link', { name: '회차 작업' })).toHaveAttribute('aria-current', 'page')
    // 같은 서버라 서버 표시가 붙지 않는다
    expect(within(nav()).queryByTitle(/서버로 새로 엽니다/)).toBeNull()
  })

  it('DEV(조치 시험)에서는 홈·시딩에 PROD 표시를 달아 누르면 PROD로 새로 열린다는 것을 알린다', () => {
    loadProfile('DEV')
    render(<Shell section="moderation" path="/moderation/dev/" search={null}>본문</Shell>)
    expect(screen.queryByRole('status')).toBeNull()
    expect(within(nav()).queryByText('PROD 고정')).toBeNull()
    const tags = within(nav()).getAllByTitle('PROD 서버로 새로 엽니다')
    expect(tags).toHaveLength(3) // 홈 · 회차 작업 · AI 프롬프트
    expect(tags[0]).toHaveClass('is-prod')
    expect(within(nav()).getByRole('link', { name: /신고 큐/ })).toHaveAttribute('aria-current', 'page')
  })
})
