import { describe, expect, it } from 'vitest'
import {
  availableEnvironments, resolveEnvironment, restoreDeepLink, validateEnvironmentMetadata,
  validateTokenClaims,
} from './environment'
import type { ConsoleProfile, EnvironmentRequest } from './environment'

const profile: ConsoleProfile = {
  environment: 'PROD',
  apiBaseUrl: 'https://api.replix.tv',
  kcUrl: 'https://auth.replix.tv',
  kcRealm: 'replix',
  kcClientId: 'replix-web',
  expectedAudience: 'account',
  expectedAzp: 'replix-web',
  grafanaUrl: 'https://grafana.replix-dev.site/?var-namespace=prod',
}

const HOSTED = ['DEV', 'PROD'] as const

function request(changed: Partial<EnvironmentRequest> = {}): EnvironmentRequest {
  return {
    basePath: '/moderation/', pathname: '/moderation/', search: '', hostname: 'localhost',
    fallback: 'DEV', available: ['LOCAL', 'DEV', 'PROD'], ...changed,
  }
}

/**
 * 환경을 주소 경로에 싣는다(HP-456) — /moderation/<prod|dev|local>/…
 * 탭 저장소로 들고 다니면 새 탭·복사한 링크·북마크가 환경을 잃고 호스팅 기본값(PROD)으로 열려,
 * DEV에서 보던 /users/42 가 운영의 다른 사람으로 뜬다(코드 리뷰 지적).
 */
describe('콘솔 환경 — 주소 경로', () => {
  it('경로의 환경 조각을 그대로 쓰고 basename에 넣는다', () => {
    expect(resolveEnvironment(request({
      pathname: '/moderation/dev/users/42', hostname: 'console.replix.tv', available: HOSTED,
    }))).toEqual({
      environment: 'DEV', basename: '/moderation/dev', pathname: '/moderation/dev/users/42', search: '',
    })
  })

  it('처음 연 호스팅 콘솔은 PROD 경로로 맞춘다 — 빌드 기본값과 무관하다', () => {
    const route = resolveEnvironment(request({
      pathname: '/moderation/', hostname: 'console.replix.tv', fallback: 'DEV', available: HOSTED,
    }))
    expect(route.environment).toBe('PROD')
    expect(route.pathname).toBe('/moderation/prod/')
  })

  it('다른 주소는 빌드 기본값의 경로로 맞춘다', () => {
    expect(resolveEnvironment(request({ fallback: 'dev' })).pathname).toBe('/moderation/dev/')
  })

  it('환경 조각이 없는 옛 깊은 주소는 기본 환경 아래로 옮긴다', () => {
    expect(resolveEnvironment(request({
      pathname: '/moderation/users/42', hostname: 'console.replix.tv', available: HOSTED,
    })).pathname).toBe('/moderation/prod/users/42')
  })

  it('옛 ?environment= 는 경로로 옮기고 주소에서 뗀다', () => {
    expect(resolveEnvironment(request({
      search: '?environment=dev&selected=3', hostname: 'console.replix.tv', available: HOSTED,
    }))).toEqual({
      environment: 'DEV', basename: '/moderation/dev', pathname: '/moderation/dev/', search: '?selected=3',
    })
  })

  it('끝 슬래시가 없는 환경 루트도 같은 화면이다', () => {
    expect(resolveEnvironment(request({ pathname: '/moderation/dev' })).pathname)
        .toBe('/moderation/dev/')
  })

  it('지원하지 않는 환경은 기본값으로 추측하지 않고 중단한다', () => {
    expect(() => resolveEnvironment(request({ search: '?environment=staging' })))
        .toThrow('지원하지 않는')
  })

  it('호스팅 빌드에 없는 LOCAL은 경로로도 주소 값으로도 막는다', () => {
    expect(() => resolveEnvironment(request({ pathname: '/moderation/local/', available: HOSTED })))
        .toThrow('지원하지 않는 콘솔 환경입니다: LOCAL')
    expect(() => resolveEnvironment(request({ search: '?environment=LOCAL', available: HOSTED })))
        .toThrow('지원하지 않는 콘솔 환경입니다: LOCAL')
  })

  // 호스팅 주소 규칙이 먼저 걸리면 빌드 기본값의 오타가 운영에서 드러나지 않는다(코드 리뷰 지적).
  it('빌드 기본값은 주소와 무관하게 늘 검증한다', () => {
    expect(() => resolveEnvironment(request({
      pathname: '/moderation/prod/', hostname: 'console.replix.tv', fallback: 'PRD', available: HOSTED,
    }))).toThrow('VITE_DEFAULT_ENVIRONMENT')
  })
})

describe('깊은 주소 복원(HP-456)', () => {
  it('404.html이 ?p= 에 실은 원래 경로와 search를 되살린다', () => {
    expect(restoreDeepLink('/moderation/', '/moderation/', '?p=%2Fdev%2Fusers%2F42%3Fselected%3D1'))
        .toEqual({ pathname: '/moderation/dev/users/42', search: '?selected=1' })
  })

  it('앱 루트가 아니거나 p가 없으면 그대로 둔다', () => {
    expect(restoreDeepLink('/moderation/', '/moderation/dev/', '?p=%2Fx'))
        .toEqual({ pathname: '/moderation/dev/', search: '?p=%2Fx' })
    expect(restoreDeepLink('/moderation/', '/moderation/', '?selected=1'))
        .toEqual({ pathname: '/moderation/', search: '?selected=1' })
  })

  it('다른 호스트를 가리키는 값(//…)은 받지 않는다', () => {
    expect(restoreDeepLink('/moderation/', '/moderation/', '?p=%2F%2Fevil.example%2Fx'))
        .toEqual({ pathname: '/moderation/', search: '?p=%2F%2Fevil.example%2Fx' })
  })
})

describe('고를 수 있는 환경(HP-456)', () => {
  it('개발 서버는 LOCAL까지 셋을 연다', () => {
    expect(availableEnvironments(true)).toEqual(['LOCAL', 'DEV', 'PROD'])
  })

  it('호스팅 빌드는 LOCAL을 싣지 않는다', () => {
    expect(availableEnvironments(false)).toEqual(['DEV', 'PROD'])
  })
})

describe('환경 불일치 fail-closed', () => {
  it('환경·issuer·audience·azp가 모두 같으면 통과한다', () => {
    expect(() => validateEnvironmentMetadata(profile, {
      environment: 'PROD', issuer: 'https://auth.replix.tv/realms/replix',
      audiences: ['account'], azp: 'replix-web',
    })).not.toThrow()
  })

  it.each([
    ['environment', { environment: 'DEV' as const }],
    ['issuer', { issuer: 'https://auth.replix-dev.site/realms/replix' }],
    ['audience', { audiences: ['other'] }],
    ['azp', { azp: 'other-client' }],
  ])('%s가 다르면 부팅을 막는다', (_field, changed) => {
    expect(() => validateEnvironmentMetadata(profile, {
      environment: 'PROD', issuer: 'https://auth.replix.tv/realms/replix',
      audiences: ['account'], azp: 'replix-web', ...changed,
    })).toThrow('요청을 차단')
  })

  it('다른 환경 토큰은 서버 요청 전에 막는다', () => {
    expect(() => validateTokenClaims(profile, {
      iss: 'https://auth.replix-dev.site/realms/replix', aud: 'account', azp: 'replix-web',
    })).toThrow('현재 토큰')
  })
})
