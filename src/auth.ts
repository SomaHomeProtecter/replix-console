import Keycloak from 'keycloak-js'
import { env } from './env'
import type { ConsoleEnvironment } from './environment'
import { validateTokenClaims } from './environment'

/**
 * Keycloak 싱글턴(HP-227) — Authorization Code + PKCE(S256), 기존 replix-web client 재사용.
 * AzpValidator가 단일 azp만 수용하므로 새 client를 만들면 토큰이 401이 된다(HP-225).
 * 컴포넌트는 이 모듈만 본다 — keycloak-js 타입이 UI에 새지 않고, 테스트는 이 모듈 하나만 mock 한다.
 */
const keycloak = new Keycloak({ url: env.kcUrl, realm: env.kcRealm, clientId: env.kcClientId })

/** 앱 진입 1회 — 미로그인은 KC 로그인 화면으로 보낸다(login-required). */
export async function initAuth(): Promise<void> {
  await keycloak.init({
    onLoad: 'login-required',
    pkceMethod: 'S256',
    checkLoginIframe: false, // 로컬 전용 콘솔 — iframe 세션 체크는 콘솔 소음만 낸다
  })
  validateTokenClaims(env, keycloak.tokenParsed as Record<string, unknown> | undefined)
}

/** 매 API 호출 직전 — 만료 30초 전이면 갱신하고, 갱신 불가(세션 만료)면 재로그인으로 보낸다. */
export async function getToken(): Promise<string> {
  try {
    await keycloak.updateToken(30)
  } catch {
    await keycloak.login()
  }
  if (!keycloak.token) {
    throw new Error('인증 토큰이 없습니다 — 다시 로그인하세요')
  }
  return keycloak.token
}

export function logout(): void {
  void keycloak.logout()
}

/** 환경 전환은 기존 토큰을 폐기하고 대상 프로필 URL로 돌아온 뒤 새 Keycloak에서 재인증한다. */
export function switchEnvironment(target: ConsoleEnvironment): void {
  if (target === env.environment) return
  const redirect = new URL(window.location.href)
  redirect.searchParams.set('environment', target)
  redirect.pathname = '/'
  redirect.hash = ''
  // post_logout_redirect_uri 등록 상태에 기대지 않는다. 메모리 토큰을 먼저 폐기하고 새 issuer로
  // 완전 재로딩하면 initAuth(login-required)가 대상 Keycloak 인증을 새로 수행한다.
  keycloak.clearToken()
  window.location.assign(redirect)
}

export function userName(): string {
  return (keycloak.tokenParsed?.preferred_username as string | undefined) ?? '운영자'
}

export function realmRoles(): string[] {
  const realmAccess = keycloak.tokenParsed?.realm_access
  if (!realmAccess || typeof realmAccess !== 'object') return []
  const roles = (realmAccess as { roles?: unknown }).roles
  return Array.isArray(roles) ? roles.filter((role): role is string => typeof role === 'string') : []
}

export function roleLabel(): string {
  const roles = realmRoles()
  if (roles.includes('admin')) return 'admin'
  if (roles.includes('moderation_operator')) return '모더레이션 운영자'
  if (roles.includes('feature_flag_operator')) return '기능 제어 운영자'
  if (roles.includes('prod_change_approver')) return 'PROD 승인자'
  if (roles.includes('admin_console_viewer')) return '조회 전용'
  return '권한 없음'
}
