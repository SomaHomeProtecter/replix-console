import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { env, loadProfile } from '@core/env'
import Shell from './Shell'

vi.mock('@core/auth', () => ({
  userName: () => 'hyunbin',
  roleLabel: () => 'admin',
  logout: vi.fn(),
  switchEnvironment: vi.fn(),
}))

const nav = () => screen.getByRole('navigation', { name: '콘솔 메뉴' })

describe('공용 틀 — 개발 서버(localhost)', () => {
  beforeEach(() => {
    loadProfile('DEV')
    window.history.replaceState(null, '', '/')
  })

  it('DEV에서는 PROD 띠가 없고, 홈이 켜진다', () => {
    render(<Shell section="home" path="/" search={null}>본문</Shell>)
    expect(screen.queryByRole('status')).toBeNull()
    expect(within(nav()).getByRole('link', { name: /홈/ })).toHaveAttribute('aria-current', 'page')
  })

  it('같은 서버의 메뉴는 페이지를 다시 열지 않고 주소만 옮긴다', () => {
    const onPop = vi.fn()
    window.addEventListener('popstate', onPop)
    render(<Shell section="home" path="/" search={null}>본문</Shell>)
    fireEvent.click(within(nav()).getByRole('link', { name: 'AI 프롬프트' }))
    expect(`${window.location.pathname}${window.location.search}`).toBe('/seeding/?view=prompts')
    expect(onPop).toHaveBeenCalledTimes(1)
    window.removeEventListener('popstate', onPop)
  })

  it('시딩 메뉴 — 회차를 고른 주소(?work=&episode=)에서는 회차 작업이, ?view=prompts에서는 AI 프롬프트가 켜진다(HP-526)', () => {
    // 시딩은 고른 작품·회차를 주소에 적는다(replaceState) — 뒤로 가기로 그 주소에 돌아와도 회차 작업이 켜져야 한다
    const { unmount } = render(<Shell section="seeding" path="/seeding/?work=1&episode=12" search={null}>본문</Shell>)
    expect(within(nav()).getByRole('link', { name: '회차 작업' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav()).getByRole('link', { name: 'AI 프롬프트' })).not.toHaveAttribute('aria-current')
    unmount()
    render(<Shell section="seeding" path="/seeding/?view=prompts" search={null}>본문</Shell>)
    expect(within(nav()).getByRole('link', { name: 'AI 프롬프트' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav()).getByRole('link', { name: '회차 작업' })).not.toHaveAttribute('aria-current')
  })

  it('조치 메뉴는 하위 경로까지 켜진다 — 기능 제어의 탭들', () => {
    render(<Shell section="moderation" path="/moderation/dev/feature-control/presets" search={null}>본문</Shell>)
    expect(within(nav()).getByRole('link', { name: '기능 제어' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav()).getByRole('link', { name: '신고 큐' })).not.toHaveAttribute('aria-current')
    expect(within(nav()).getByRole('link', { name: '신고 큐' })).toHaveAttribute('href', '/moderation/dev/')
  })

  it('조치 메뉴는 성격별 묶음으로 나뉜다 — 묶음 이름이 무리 이름으로 읽힌다(HP-529)', () => {
    render(<Shell section="moderation" path="/moderation/dev/" search={null}>본문</Shell>)
    const names = (group: string) => within(screen.getByRole('group', { name: group }))
      .getAllByRole('link').map((link) => link.textContent)
    expect(names('신고·제재')).toEqual(['신고 큐', '운영 협업', '정지 현황', '조치 로그'])
    expect(names('클린봇')).toEqual(['오탐 검토', '정책 실험'])
    expect(names('서비스 운영')).toEqual(['기능 제어', '피드백'])
  })

  it('조치가 쓰기 중이면 이동 수단을 모두 잠근다', () => {
    render(
      <Shell section="moderation" path="/moderation/dev/" locked lockedTitle="처리 중" search={null}>본문</Shell>)
    const link = within(nav()).getByRole('link', { name: '조치 로그' })
    expect(link).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(link)
    expect(window.location.pathname).toBe('/')
    expect(screen.getByRole('combobox', { name: '연결 서버' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '로그아웃' })).toBeDisabled()
  })

  it('사용자 상세에서는 신고 큐가 켜지지 않는다 — 신고 큐(/)는 정확히 그 경로일 때만', () => {
    render(<Shell section="moderation" path="/moderation/dev/users/9" search={null}>본문</Shell>)
    expect(within(nav()).getByRole('link', { name: '신고 큐' })).not.toHaveAttribute('aria-current')
  })
})

/**
 * 지표 화면은 만들지 않는다(HP-223 확정 제약 ③). 대신 있는 곳으로 보낸다(HP-297) — 종전 조치 톱바의
 * 링크를 공용 틀이 왼쪽 메뉴 '바깥 도구'로 옮겼다(HP-506). 이 검증은 조치 App.test에서 옮겨 왔다(HP-521).
 */
describe('공용 틀 — Grafana 딥링크(HP-297)', () => {
  beforeEach(() => {
    loadProfile('DEV')
    window.history.replaceState(null, '', '/')
  })

  it('VITE_GRAFANA_URL이 없으면 링크를 아예 그리지 않는다', () => {
    env.grafanaUrl = null
    render(<Shell section="home" path="/" search={null}>본문</Shell>)
    expect(within(nav()).queryByRole('link', { name: /Grafana/ })).not.toBeInTheDocument()
  })

  it('값이 있으면 그 대시보드로 새 탭에서 열고 opener를 끊는다', () => {
    env.grafanaUrl = 'https://grafana.test/d/moderation'
    render(<Shell section="home" path="/" search={null}>본문</Shell>)
    const link = within(nav()).getByRole('link', { name: /Grafana/ })
    expect(link).toHaveAttribute('href', 'https://grafana.test/d/moderation')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noreferrer'))
  })
})
