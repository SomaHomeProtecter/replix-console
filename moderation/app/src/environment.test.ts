import { describe, expect, it } from 'vitest'
import {
  availableEnvironments, selectEnvironment, validateEnvironmentMetadata, validateTokenClaims,
} from './environment'
import type { ConsoleProfile, EnvironmentSources } from './environment'

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

function sources(changed: Partial<EnvironmentSources> = {}): EnvironmentSources {
  return {
    search: '', stored: null, hostname: 'localhost', fallback: 'DEV',
    available: ['LOCAL', 'DEV', 'PROD'], ...changed,
  }
}

describe('콘솔 환경 선택', () => {
  it('URL 선택값을 빌드 기본값보다 우선한다', () => {
    expect(selectEnvironment(sources({ search: '?environment=PROD' }))).toBe('PROD')
  })

  it('지원하지 않는 URL 환경은 기본값으로 추측하지 않고 중단한다', () => {
    expect(() => selectEnvironment(sources({ search: '?environment=staging' })))
        .toThrow('지원하지 않는')
  })

  it('URL 선택값은 이 탭에서 고른 값과 주소 규칙보다 앞선다', () => {
    expect(selectEnvironment(sources({
      search: '?environment=DEV', stored: 'PROD', hostname: 'console.replix.tv', available: HOSTED,
    }))).toBe('DEV')
  })

  it('호스팅 빌드에 없는 LOCAL을 URL로 요구하면 막는다(HP-456)', () => {
    expect(() => selectEnvironment(sources({
      search: '?environment=LOCAL', hostname: 'console.replix.tv', available: HOSTED,
    }))).toThrow('지원하지 않는')
  })

  // 탭을 옮기면 ?environment=가 주소에서 빠진다. 호스팅 기본값이 PROD라, 이 값이 없으면 DEV에서
  // 일하던 사람이 새로고침 한 번에 PROD로 넘어간다(HP-456).
  it('URL 값이 없으면 이 탭에서 고른 환경을 그대로 쓴다', () => {
    expect(selectEnvironment(sources({
      stored: 'DEV', hostname: 'console.replix.tv', available: HOSTED,
    }))).toBe('DEV')
  })

  it('탭에 남은 값이 지금 고를 수 없는 환경이면 버리고 다음 규칙으로 간다', () => {
    expect(selectEnvironment(sources({
      stored: 'LOCAL', hostname: 'console.replix.tv', available: HOSTED,
    }))).toBe('PROD')
    expect(selectEnvironment(sources({ stored: 'staging' }))).toBe('DEV')
  })

  it('처음 연 호스팅 콘솔(console.replix.tv)은 빌드 기본값과 무관하게 PROD다', () => {
    expect(selectEnvironment(sources({
      hostname: 'console.replix.tv', fallback: 'DEV', available: HOSTED,
    }))).toBe('PROD')
  })

  it('다른 주소는 빌드 기본값을 쓴다', () => {
    expect(selectEnvironment(sources({ hostname: 'localhost', fallback: 'dev' }))).toBe('DEV')
  })

  it('빌드 기본값이 고를 수 없는 환경이면 추측하지 않고 막는다', () => {
    expect(() => selectEnvironment(sources({ fallback: 'LOCAL', available: HOSTED })))
        .toThrow('VITE_DEFAULT_ENVIRONMENT')
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
