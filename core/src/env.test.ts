import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * initEnv는 부팅 첫 단계에서 주소를 정본으로 바꾼다(HP-456). 해시를 떨어뜨리면 Keycloak이 로그인 응답(code)을
 * 못 읽어 로그인이 끝없이 돈다 — 그런데 이 함수에 테스트가 없어 그 변이가 초록으로 남았다(재검토 지적).
 */
describe('initEnv — 부팅 때 주소 정본화', () => {
  beforeEach(() => {
    vi.resetModules()
  })
  afterEach(() => {
    window.history.replaceState(null, '', '/')
  })

  async function boot(url: string) {
    window.history.replaceState(null, '', url)
    const module = await import('./env')
    return { route: module.initEnv(), env: module.env }
  }

  it('404.html이 넘긴 깊은 주소를 되살리고 로그인 응답이 실린 해시는 그대로 둔다', async () => {
    const { route, env } = await boot('/moderation/?p=%2Fdev%2Fusers%2F42#state=s1&code=c1')

    expect(window.location.pathname).toBe('/moderation/dev/users/42')
    expect(window.location.hash).toBe('#state=s1&code=c1')
    expect(route.basename).toBe('/moderation/dev')
    expect(env.environment).toBe('DEV')
    expect(env.apiBaseUrl).toBe('http://api.test')
  })

  it('환경 조각이 없는 주소는 기본 환경 경로로 바꾸고 옛 ?environment= 는 뗀다', async () => {
    const { route, env } = await boot('/moderation/?environment=prod&selected=3')

    expect(window.location.pathname).toBe('/moderation/prod/')
    expect(window.location.search).toBe('?selected=3')
    expect(route.environment).toBe('PROD')
    expect(env.apiBaseUrl).toBe('http://prod-api.test')
  })

  it('한 번 정한 뒤에는 주소가 바뀌어도 다시 정하지 않는다', async () => {
    window.history.replaceState(null, '', '/moderation/dev/')
    const module = await import('./env')
    const first = module.initEnv()
    window.history.replaceState(null, '', '/moderation/prod/')
    expect(module.initEnv()).toBe(first)
  })
})
