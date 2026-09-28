export const ALL_CONSOLE_ENVIRONMENTS = ['LOCAL', 'DEV', 'PROD'] as const
export type ConsoleEnvironment = (typeof ALL_CONSOLE_ENVIRONMENTS)[number]

/**
 * 고를 수 있는 환경(HP-456). 호스팅 빌드(console.replix.tv)에는 LOCAL을 싣지 않는다 — 공개 호스트에서
 * 개인 PC의 localhost를 겨누는 선택지는 쓸 곳이 없다. 개발 서버(npm run dev)만 셋을 다 연다.
 */
export function availableEnvironments(devServer: boolean): readonly ConsoleEnvironment[] {
  return devServer ? ALL_CONSOLE_ENVIRONMENTS : ['DEV', 'PROD']
}

export const CONSOLE_ENVIRONMENTS = availableEnvironments(import.meta.env.DEV)

/** 운영 콘솔 호스트. 이 주소로 처음 열면 PROD다 — 시딩 도구(seeding/app/src/env.ts)와 같은 규칙. */
export const HOSTED_CONSOLE_HOSTNAME = 'console.replix.tv'

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

export interface EnvironmentSources {
  /** location.search — 환경 전환이 붙이는 ?environment= */
  search: string
  /** 이 탭에서 지난번에 고른 환경(sessionStorage). 없으면 null */
  stored: string | null
  /** location.hostname */
  hostname: string
  /** 빌드 기본값(VITE_DEFAULT_ENVIRONMENT) */
  fallback: string
  available: readonly ConsoleEnvironment[]
}

function isAvailable(
  value: string | null, available: readonly ConsoleEnvironment[],
): value is ConsoleEnvironment {
  return value !== null && available.includes(value as ConsoleEnvironment)
}

/**
 * 연결 환경을 고른다. 우선순위 = 주소의 ?environment= → 이 탭에서 고른 값 → 주소 규칙
 * (console.replix.tv면 PROD) → 빌드 기본값.
 *
 * <p>주소 값과 빌드 기본값이 이상하면 DEV로 추측하지 않고 막는다. 탭에 남은 값은 콘솔이 스스로 쓴 것이라
 * 이상하면 조용히 버린다 — 탭을 옮기면 ?environment=가 주소에서 빠지므로, 이 값이 없으면 호스팅
 * 기본값(PROD) 때문에 DEV에서 일하던 사람이 새로고침 한 번에 PROD로 넘어간다(HP-456).
 */
export function selectEnvironment(sources: EnvironmentSources): ConsoleEnvironment {
  const { available } = sources
  const fromUrl = new URLSearchParams(sources.search).get('environment')?.toUpperCase() ?? null
  if (fromUrl !== null) {
    if (!isAvailable(fromUrl, available)) {
      throw new Error(`지원하지 않는 콘솔 환경입니다: ${fromUrl}`)
    }
    return fromUrl
  }
  const stored = sources.stored?.toUpperCase() ?? null
  if (isAvailable(stored, available)) return stored
  if (sources.hostname === HOSTED_CONSOLE_HOSTNAME && available.includes('PROD')) return 'PROD'
  const fallback = sources.fallback.toUpperCase()
  if (!isAvailable(fallback, available)) {
    throw new Error(`VITE_DEFAULT_ENVIRONMENT 값이 올바르지 않습니다: ${sources.fallback}`)
  }
  return fallback
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
