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

import { initAuth, logout } from './auth'

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
