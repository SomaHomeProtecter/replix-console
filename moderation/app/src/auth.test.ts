import { beforeEach, describe, expect, it, vi } from 'vitest'

const keycloakMock = vi.hoisted(() => ({
  init: vi.fn(), login: vi.fn(), logout: vi.fn(), clearToken: vi.fn(),
  tokenParsed: undefined as Record<string, unknown> | undefined,
}))

vi.mock('keycloak-js', () => ({ default: vi.fn(() => keycloakMock) }))
vi.mock('./env', () => ({
  env: {
    environment: 'PROD', apiBaseUrl: 'https://api.test', kcUrl: 'https://auth.test',
    kcRealm: 'replix', kcClientId: 'replix-web', expectedAudience: 'account',
    expectedAzp: 'replix-web', grafanaUrl: null,
  },
}))

import { environmentSwitchUrl, initAuth, logout, switchEnvironment } from './auth'
import { resolveEnvironment } from './environment'

describe('환경 전환(HP-456)', () => {
  it('고른 환경의 조치 콘솔 첫 화면으로 간다 — 콘솔 홈(/)으로 튕기지 않는다', () => {
    const next = environmentSwitchUrl(
      'https://console.replix.tv/moderation/prod/users/42?selected=1#frag', 'DEV', '/moderation/',
    )
    expect(next.toString()).toBe('https://console.replix.tv/moderation/dev/')
  })

  // 전환 주소와 주소 해석은 따로 만들어져 서로 어긋나도 각자의 테스트는 초록이다 — 한 바퀴를 돌려 본다.
  it.each(['DEV', 'PROD'] as const)('%s로 전환한 주소를 다시 해석하면 그 환경이다', (target) => {
    const next = environmentSwitchUrl('https://console.replix.tv/moderation/prod/', target, '/moderation/')
    expect(resolveEnvironment({
      basePath: '/moderation/', pathname: next.pathname, search: next.search,
      hostname: 'console.replix.tv', fallback: 'DEV', available: ['DEV', 'PROD'],
    }).environment).toBe(target)
  })

  // keycloak-js 26의 clearToken()은 login-required로 init했으면 곧바로 login()을 부른다. 그 비동기
  // 로그인 이동이 몇 ms 뒤 지금 환경의 Keycloak으로 떠나며 전환 이동을 취소해, 전환이 한 번도 되지
  // 않았다(코드 리뷰가 실제 keycloak-js로 재현). 페이지를 통째로 다시 불러오면 메모리 토큰은 어차피 사라진다.
  it('토큰을 지우지 않고 곧바로 떠난다 — 지우면 지금 환경으로 다시 로그인하러 가며 전환을 취소한다', () => {
    keycloakMock.clearToken.mockClear()
    keycloakMock.login.mockClear()

    switchEnvironment('DEV')

    expect(keycloakMock.clearToken).not.toHaveBeenCalled()
    expect(keycloakMock.login).not.toHaveBeenCalled()
  })
})

describe('계정 전환 로그아웃(HP-353)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    keycloakMock.init.mockResolvedValue(false)
    keycloakMock.login.mockResolvedValue(undefined)
    keycloakMock.logout.mockResolvedValue(undefined)
    window.history.replaceState({}, '', '/feature-control/change-sets?environment=PROD')
  })

  it('로그아웃 뒤 계정 전환 표식이 있는 같은 화면으로 돌아간다', () => {
    logout()

    expect(keycloakMock.logout).toHaveBeenCalledOnce()
    const redirect = new URL(keycloakMock.logout.mock.calls[0][0].redirectUri)
    expect(redirect.pathname).toBe('/feature-control/change-sets')
    expect(redirect.searchParams.get('environment')).toBe('PROD')
    expect(redirect.searchParams.get('accountSwitch')).toBe('1')
  })

  it('계정 전환 표식으로 부팅하면 Google 계정 선택 로그인을 요청하고 표식을 제거한다', async () => {
    window.history.replaceState(
      {}, '', '/feature-control/change-sets?environment=PROD&selected=1&accountSwitch=1',
    )

    await initAuth()

    expect(keycloakMock.init).toHaveBeenCalledWith({
      pkceMethod: 'S256', checkLoginIframe: false,
    })
    expect(keycloakMock.clearToken).toHaveBeenCalledOnce()
    expect(keycloakMock.login).toHaveBeenCalledOnce()
    const options = keycloakMock.login.mock.calls[0][0]
    expect(options.prompt).toBe('select_account')
    const redirect = new URL(options.redirectUri)
    expect(redirect.searchParams.get('accountSwitch')).toBeNull()
    expect(redirect.searchParams.get('selected')).toBe('1')
  })
})
