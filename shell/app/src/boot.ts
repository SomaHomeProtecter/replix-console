import { getToken, initAuth, logout, realmRoles, userName } from '@moderation/auth'
import { initEnv, loadProfile } from '@moderation/env'
import { verifyEnvironment } from '@moderation/environmentGuard'
import { confirmProductionWrite } from '@moderation/prodWriteConfirmation'
import { bindHost } from '@seeding/host'
import { isHostedConsole } from './navigation'
import { hasConsoleRole, homeEnvironment, sectionOf } from './sections'

export type BootResult = { kind: 'console' } | { kind: 'denied' }

/** JWT 본문에서 sub만 읽는다 — 검증은 서버와 validateTokenClaims(조치 auth.ts)가 이미 했다. */
function subjectOf(token: string): string {
  try {
    const body = token.split('.')[1] ?? ''
    const json = atob(body.replace(/-/g, '+').replace(/_/g, '/'))
    const sub = (JSON.parse(json) as { sub?: unknown }).sub
    return typeof sub === 'string' ? sub : ''
  } catch {
    return ''
  }
}

/**
 * 콘솔을 여는 순서(HP-506) — 조치 콘솔의 부팅(HP-456·HP-337)을 콘솔 전체로 넓혔다.
 *
 * <p>① 서버를 정한다: 조치 주소는 경로 조각(/moderation/&lt;env&gt;/)과 깊은 주소 복원을 initEnv가 처리하고, 홈·시딩은
 * 호스팅이면 PROD다. ② 그 서버의 Keycloak에 한 번 로그인한다(login-required — 세션이 있으면 화면 없이 돌아온다).
 * ③ 콘솔 역할이 하나도 없으면 서버 대조 전에 멈춘다. ④ 서버 자기 선언과 프로필을 대조해 어긋나면 그리기 전에 막는다.
 * ⑤ 시딩이 자기 로그인 대신 이 연결을 빌려 쓰게 묶는다.
 */
export async function bootConsole(): Promise<BootResult> {
  if (sectionOf(window.location.pathname) === 'moderation') initEnv()
  else loadProfile(homeEnvironment(isHostedConsole()))

  await initAuth()
  if (!hasConsoleRole(realmRoles())) return { kind: 'denied' }
  await verifyEnvironment()

  const token = await getToken()
  bindHost({
    user: { name: userName(), sub: subjectOf(token), roles: realmRoles() },
    token: () => getToken().catch(() => null),
    logout,
    confirmProductionWrite,
  })
  return { kind: 'console' }
}
