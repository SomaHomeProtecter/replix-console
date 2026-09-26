/* 시딩 도구 로그인(HP-435). 작품 탐색(catalog/app/src/auth.ts)과 같은 Keycloak SPA 방식(Authorization Code + PKCE),
   다른 점은 둘이다: ① 서버는 메타가 아니라 호스트명으로 정한다(env.ts) ② 롤을 읽는다 — 관리자 롤이 없으면 화면을
   열지 않는다(서버도 같은 롤을 검사하므로 이 게이트는 안내용이지 보안 경계가 아니다). */
import Keycloak from 'keycloak-js'
import { useEffect, useState } from 'react'
import { AUTH } from './env'

const FLAG = 'replix_seeding_signed_in'

/* BE SecurityConfig 의 /api/v1/admin/** 과 같은 집합 — GET 은 이 셋, 변경은 admin·moderation_operator 만. */
const READ_ROLES = ['admin', 'admin_console_viewer', 'moderation_operator']
const WRITE_ROLES = ['admin', 'moderation_operator']

export type AuthUser = { name: string; sub: string; roles: string[] }
type Listener = () => void

const listeners = new Set<Listener>()
let kc: Keycloak | null = null
let ready = false
let user: AuthUser | null = null
let initPromise: Promise<void> | null = null
let initialized = false // k.init() 을 실제로 호출했는가 — initPromise 가 resolve 돼도 init 은 안 했을 수 있다

function emit() { listeners.forEach((l) => l()) }

function instance(): Keycloak {
  if (kc) return kc
  kc = new Keycloak({ url: AUTH.url, realm: AUTH.realm, clientId: AUTH.clientId })
  kc.onAuthSuccess = kc.onAuthRefreshSuccess = () => { readUser(); emit() }
  kc.onAuthLogout = kc.onAuthRefreshError = () => { user = null; emit() }
  return kc
}

function readUser() {
  const t = kc?.tokenParsed as
    | { preferred_username?: string; name?: string; sub?: string; realm_access?: { roles?: string[] } }
    | undefined
  user = kc?.authenticated && t?.sub
    ? { name: t.name || t.preferred_username || '사용자', sub: t.sub, roles: t.realm_access?.roles ?? [] }
    : null
}

function hasFlag() { try { return localStorage.getItem(FLAG) === '1' } catch { return false } }
function setFlag(on: boolean) { try { on ? localStorage.setItem(FLAG, '1') : localStorage.removeItem(FLAG) } catch { /* 저장 불가 환경 */ } }

export function initAuth(): Promise<void> {
  if (initPromise) return initPromise
  const k = instance()
  const returning = /[?&](code|error)=/.test(location.search)
  if (!returning && !hasFlag()) { ready = true; initPromise = Promise.resolve(); emit(); return initPromise }
  initialized = true
  initPromise = k
    .init({
      pkceMethod: 'S256',
      responseMode: 'query',
      onLoad: 'check-sso',
      silentCheckSsoRedirectUri: new URL('silent-check-sso.html', location.href.split('#')[0]).href,
      checkLoginIframe: false,
    })
    .then((ok) => { setFlag(!!ok); readUser() }, () => { setFlag(false); user = null })
    .finally(() => { ready = true; emit() })
  return initPromise
}

/* ⚠ 처음 온 방문자는 initAuth() 가 Keycloak init() 을 건너뛴다(왕복 절약). 그 상태에서 k.login() 을 부르면
   어댑터가 없어 "Cannot read properties of undefined (reading 'login')" 로 터진다(2026-09-20 실측) —
   initPromise 가 아니라 **init() 을 실제로 했는지**를 보고, 안 했으면 여기서 한다. */
export function login() {
  const k = instance()
  const go = () => k.login({ redirectUri: location.href })
  if (initialized && initPromise) { initPromise.then(go); return }
  initialized = true
  initPromise = k.init({ pkceMethod: 'S256', responseMode: 'query', checkLoginIframe: false }).then(() => {}, () => {})
  initPromise.then(go)
}

export function logout() {
  setFlag(false)
  kc?.logout({ redirectUri: location.href.split('?')[0] })
}

export async function accessToken(): Promise<string | null> {
  if (!kc?.authenticated) return null
  try { await kc.updateToken(30) } catch { return null }
  return kc.token ?? null
}

export function canRead(u: AuthUser | null) { return !!u && u.roles.some((r) => READ_ROLES.includes(r)) }
export function canWrite(u: AuthUser | null) { return !!u && u.roles.some((r) => WRITE_ROLES.includes(r)) }

export function useAuth(): { ready: boolean; user: AuthUser | null } {
  const [, tick] = useState(0)
  useEffect(() => {
    const l = () => tick((n) => n + 1)
    listeners.add(l)
    initAuth()
    return () => { listeners.delete(l) }
  }, [])
  return { ready, user }
}
