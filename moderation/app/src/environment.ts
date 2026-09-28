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

/**
 * 운영 콘솔 호스트. 환경을 고르지 않고 이 주소로 열면 PROD다 — 시딩 도구(seeding/app/src/env.ts)도 이
 * 호스트를 운영으로 본다(시딩은 옛 배치인 replix.tv도 운영으로 치지만 조치 콘솔은 거기서 돈 적이 없다).
 */
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

export interface EnvironmentRequest {
  /** 앱이 도는 경로 — Vite base('/moderation/') */
  basePath: string
  /** location.pathname (깊은 주소 복원 뒤) */
  pathname: string
  /** location.search (깊은 주소 복원 뒤) */
  search: string
  /** location.hostname */
  hostname: string
  /** 빌드 기본값(VITE_DEFAULT_ENVIRONMENT) */
  fallback: string
  available: readonly ConsoleEnvironment[]
}

export interface EnvironmentRoute {
  environment: ConsoleEnvironment
  /** 라우터 basename — '/moderation/dev' */
  basename: string
  /** 환경 조각을 넣은 정본 경로 — '/moderation/dev/users/42' */
  pathname: string
  /** ?environment= 를 뗀 search */
  search: string
}

/** 환경 경로의 basename — '/moderation/' + 'DEV' → '/moderation/dev'. 전환 주소와 주소 해석이 같은 규칙을 쓴다. */
export function environmentBasename(basePath: string, environment: ConsoleEnvironment): string {
  return `${basePath.replace(/\/$/, '')}/${environment.toLowerCase()}`
}

function isAvailable(
  value: string | null, available: readonly ConsoleEnvironment[],
): value is ConsoleEnvironment {
  return value !== null && available.includes(value as ConsoleEnvironment)
}

function requireAvailable(
  value: string, available: readonly ConsoleEnvironment[],
): ConsoleEnvironment {
  const normalized = value.toUpperCase()
  if (!isAvailable(normalized, available)) {
    throw new Error(`지원하지 않는 콘솔 환경입니다: ${normalized}`)
  }
  return normalized
}

/**
 * 연결 환경을 주소 경로에서 정한다(HP-456) — /moderation/<prod|dev|local>/…
 *
 * <p>환경을 경로에 싣는 이유: 링크·새 탭·북마크·복사한 주소가 자기 환경을 잃으면 호스팅 기본값(PROD)으로
 * 열려, DEV에서 보던 /users/42가 운영의 다른 사람으로 뜬다. 탭 저장소로는 새 탭과 복사한 주소를 못 지킨다
 * (코드 리뷰 지적). 경로 조각이 없으면(콘솔 홈의 링크·옛 주소) 옛 ?environment= → 주소 규칙
 * (console.replix.tv면 PROD) → 빌드 기본값 순으로 정하고, 호출자가 돌려받은 정본 경로로 주소를 바꾼다.
 *
 * <p>이상한 값은 DEV로 추측하지 않고 막는다. 빌드 기본값은 주소와 무관하게 늘 검증한다 — 호스팅 주소
 * 규칙이 먼저 걸리면 기본값의 오타가 운영에서는 드러나지 않는다.
 */
export function resolveEnvironment(request: EnvironmentRequest): EnvironmentRoute {
  const { available } = request
  if (!isAvailable(request.fallback.toUpperCase(), available)) {
    throw new Error(`VITE_DEFAULT_ENVIRONMENT 값이 올바르지 않습니다: ${request.fallback}`)
  }
  const base = request.basePath.replace(/\/$/, '')
  const rest = request.pathname.startsWith(`${base}/`) ? request.pathname.slice(base.length) : '/'
  const [, head = '', ...tail] = rest.split('/')
  const params = new URLSearchParams(request.search)
  const fromQuery = params.get('environment')
  params.delete('environment')

  let environment: ConsoleEnvironment
  let remainder: string
  if ((ALL_CONSOLE_ENVIRONMENTS as readonly string[]).includes(head.toUpperCase())) {
    environment = requireAvailable(head, available)
    remainder = `/${tail.join('/')}`
  } else {
    remainder = rest
    if (fromQuery !== null) environment = requireAvailable(fromQuery, available)
    else if (request.hostname === HOSTED_CONSOLE_HOSTNAME && available.includes('PROD')) environment = 'PROD'
    else environment = request.fallback.toUpperCase() as ConsoleEnvironment
  }
  const basename = environmentBasename(request.basePath, environment)
  const search = params.toString()
  return { environment, basename, pathname: `${basename}${remainder}`, search: search ? `?${search}` : '' }
}

/**
 * 깊은 주소 복원(HP-456). GitHub Pages는 없는 경로에 docs/404.html을 주고, 404.html은 원래 경로(와 search)를
 * ?p= 에 실어 앱 루트로 보낸다. 앱 루트에 p가 있을 때만 되살린다. 다른 호스트를 가리키는 값(//…)처럼
 * 되살릴 수 없는 p는 받지 않고 떼어 낸다 — 남기면 로그인 복귀 주소에 실려 다시 404로 떨어진다.
 */
export function restoreDeepLink(
  basePath: string, pathname: string, search: string,
): { pathname: string, search: string } {
  const base = basePath.replace(/\/$/, '')
  const params = new URLSearchParams(search)
  const p = params.get('p')
  if (pathname !== `${base}/` || p === null) return { pathname, search }
  if (!p.startsWith('/') || p.startsWith('//')) {
    params.delete('p')
    const rest = params.toString()
    return { pathname, search: rest ? `?${rest}` : '' }
  }
  const original = new URL(p, 'https://restore.invalid')
  return { pathname: `${base}${original.pathname}`, search: original.search }
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
