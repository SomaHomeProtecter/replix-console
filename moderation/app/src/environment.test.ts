import { describe, expect, it } from 'vitest'
import {
  selectEnvironment, validateEnvironmentMetadata, validateTokenClaims,
} from './environment'
import type { ConsoleProfile } from './environment'

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

describe('콘솔 환경 선택', () => {
  it('URL 선택값을 빌드 기본값보다 우선한다', () => {
    expect(selectEnvironment('?environment=PROD', 'DEV')).toBe('PROD')
  })

  it('지원하지 않는 URL 환경은 기본값으로 추측하지 않고 중단한다', () => {
    expect(() => selectEnvironment('?environment=staging', 'DEV')).toThrow('지원하지 않는')
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
