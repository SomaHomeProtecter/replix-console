export const CONSOLE_ENVIRONMENTS = ['LOCAL', 'DEV', 'PROD'] as const
export type ConsoleEnvironment = (typeof CONSOLE_ENVIRONMENTS)[number]

export interface ConsoleProfile {
  environment: ConsoleEnvironment
  apiBaseUrl: string
  kcUrl: string
  kcRealm: string
  kcClientId: string
  expectedAudience: string
  expectedAzp: string
  grafanaUrl: string | null
}

export interface EnvironmentMetadata {
  environment: ConsoleEnvironment
  issuer: string
  audiences: string[]
  azp: string
}

function isEnvironment(value: string | null): value is ConsoleEnvironment {
  return value !== null && CONSOLE_ENVIRONMENTS.includes(value as ConsoleEnvironment)
}

/** URL 선택값을 우선하고, 없을 때만 빌드 기본값을 쓴다. 이상 값은 DEV로 추측하지 않고 막는다. */
export function selectEnvironment(search: string, defaultValue: string): ConsoleEnvironment {
  const fromUrl = new URLSearchParams(search).get('environment')?.toUpperCase() ?? null
  if (fromUrl !== null && !isEnvironment(fromUrl)) {
    throw new Error(`지원하지 않는 콘솔 환경입니다: ${fromUrl}`)
  }
  const normalizedDefault = defaultValue.toUpperCase()
  if (!isEnvironment(normalizedDefault)) {
    throw new Error(`VITE_DEFAULT_ENVIRONMENT 값이 올바르지 않습니다: ${defaultValue}`)
  }
  return fromUrl ?? normalizedDefault
}

export function expectedIssuer(profile: ConsoleProfile): string {
  return `${profile.kcUrl.replace(/\/$/, '')}/realms/${profile.kcRealm}`
}

function normalizedUrl(value: string): string {
  return value.replace(/\/$/, '')
}

/** 서버 자기 선언값이 콘솔 프로필과 한 항목이라도 다르면 데이터를 그리기 전에 중단한다. */
export function validateEnvironmentMetadata(
  profile: ConsoleProfile, metadata: EnvironmentMetadata,
): void {
  const mismatches: string[] = []
  if (metadata.environment !== profile.environment) mismatches.push('environment')
  if (normalizedUrl(metadata.issuer) !== normalizedUrl(expectedIssuer(profile))) mismatches.push('issuer')
  if (!metadata.audiences.includes(profile.expectedAudience)) mismatches.push('audience')
  if (metadata.azp !== profile.expectedAzp) mismatches.push('azp')
  if (mismatches.length > 0) {
    throw new Error(`연결 환경 검증 실패(${mismatches.join(', ')}) — 요청을 차단했습니다`)
  }
}

/** 토큰도 서버 호출 전에 같은 경계로 확인한다. 다른 환경 토큰 재사용은 네트워크 전에 막힌다. */
export function validateTokenClaims(
  profile: ConsoleProfile, claims: Record<string, unknown> | undefined,
): void {
  const issuer = typeof claims?.iss === 'string' ? claims.iss : ''
  const azp = typeof claims?.azp === 'string' ? claims.azp : ''
  const rawAudience = claims?.aud
  const audiences = typeof rawAudience === 'string'
    ? [rawAudience]
    : Array.isArray(rawAudience) ? rawAudience.filter((v): v is string => typeof v === 'string') : []
  if (normalizedUrl(issuer) !== normalizedUrl(expectedIssuer(profile))
      || azp !== profile.expectedAzp
      || !audiences.includes(profile.expectedAudience)) {
    throw new Error('현재 토큰이 선택한 환경의 issuer·audience·azp와 일치하지 않습니다')
  }
}
