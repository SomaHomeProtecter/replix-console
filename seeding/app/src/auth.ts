/* 시딩 도구 권한(HP-435 → HP-506). 로그인은 운영 콘솔 공용 틀(shell/app)이 콘솔을 열 때 한 번 하고, 시딩은 틀이
   넘겨준 사용자·토큰을 쓴다(host.ts). 시딩이 따로 Keycloak에 로그인하던 길은 단독 앱과 함께 지웠다(HP-521).
   롤 게이트는 안내용이지 보안 경계가 아니다 — 서버도 같은 롤을 검사한다. */
import { can } from '@core/roles'
import { seedingHost } from './host'

export type AuthUser = { name: string; sub: string; roles: string[] }

/** 공용 틀이 로그인한 사용자. 틀이 아직 연결되지 않았으면 null — 시딩 화면은 아무것도 그리지 않는다. */
export function currentUser(): AuthUser | null { return seedingHost()?.user ?? null }

export function logout() { seedingHost()?.logout() }

export async function accessToken(): Promise<string | null> {
  const host = seedingHost()
  return host ? host.token() : null
}

/* 보기 = admin·admin_console_viewer·moderation_operator, 넣기·고치기 = admin·moderation_operator(콘솔 역할 표, core/roles.ts). */
export function canRead(u: AuthUser | null) { return !!u && can(u.roles, 'view') }
export function canWrite(u: AuthUser | null) { return !!u && can(u.roles, 'moderate') }
