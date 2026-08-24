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
const ACCOUNT_SWITCH_PARAM = 'accountSwitch'

function accountSwitchRedirect(): URL {
  const redirect = new URL(window.location.href)
  redirect.searchParams.delete(ACCOUNT_SWITCH_PARAM)
  return redirect
}

/** 앱 진입 1회 — 미로그인은 KC 로그인 화면으로 보낸다(login-required). */
export async function initAuth(): Promise<void> {
  const switchAccount = new URLSearchParams(window.location.search)
      .get(ACCOUNT_SWITCH_PARAM) === '1'
  if (switchAccount) {
    // 로그아웃 직후 login-required를 바로 실행하면 남아 있는 Google SSO 세션이 같은 계정을
    // 다시 선택해 버린다. 먼저 adapter만 초기화한 뒤 계정 선택을 명시해 다른 운영 계정으로
    // 전환할 수 있게 한다. redirect에서는 표식을 지워 다음 부팅이 정상 callback을 처리한다.
    await keycloak.init({ pkceMethod: 'S256', checkLoginIframe: false })
    keycloak.clearToken()
    // Keycloak 26과 Google broker는 OIDC 표준 prompt=select_account를 그대로 전달하지만
    // keycloak-js 26.2 타입은 none/login/consent만 열어 둔다. 런타임 지원값을 이 호출에만 좁혀 쓴다.
    const loginWithAccountChoice = keycloak.login as unknown as (options: {
      prompt: 'select_account'
      redirectUri: string
    }) => Promise<void>
    await loginWithAccountChoice({
      prompt: 'select_account',
      redirectUri: accountSwitchRedirect().toString(),
    })
    return
  }
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
  const redirect = new URL(window.location.href)
  redirect.searchParams.set(ACCOUNT_SWITCH_PARAM, '1')
  void keycloak.logout({ redirectUri: redirect.toString() }).catch(() => {
    // IdP logout 실패를 삼켜 현재 화면에 남기지 않는다. 로컬 토큰을 폐기하고 같은 계정 선택
    // 진입점으로 이동하면 다음 부팅도 fail-closed 상태에서 재인증을 요구한다.
    keycloak.clearToken()
    window.location.assign(redirect)
  })
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
