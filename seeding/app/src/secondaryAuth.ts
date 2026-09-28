/* 두 번째 환경 로그인(HP-436) — 콘솔은 정본 서버의 Keycloak 으로 로그인돼 있고, 다른 환경에 채팅을 넣을 때만 그 환경의 Keycloak
   토큰이 따로 필요하다. keycloak-js 는 페이지 이동 방식이라 두 개를 함께 못 쓰므로, 팝업 + PKCE 로 직접 구현한다.
   흐름: 팝업 → 그 환경 Keycloak 로그인 → dev-callback.html 로 돌아옴 → code 를 postMessage 로 전달 → 토큰 교환(fetch).
   갱신 토큰은 sessionStorage 에만 둔다(탭을 닫으면 사라짐). */
import type { EnvConfig } from './env'

type Tokens = { access: string; refresh: string; exp: number }
const KEY = (env: string) => `replix_seeding_secondary_${env}`

function b64url(buf: ArrayBuffer) { return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') }
async function pkce() {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)).buffer)
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))
  return { verifier, challenge }
}
function load(env: string): Tokens | null { try { const s = sessionStorage.getItem(KEY(env)); return s ? JSON.parse(s) : null } catch { return null } }
function save(env: string, t: Tokens | null) { try { t ? sessionStorage.setItem(KEY(env), JSON.stringify(t)) : sessionStorage.removeItem(KEY(env)) } catch { /* 저장 불가 */ } }

async function exchange(cfg: EnvConfig, body: Record<string, string>): Promise<Tokens> {
  const res = await fetch(`${cfg.auth.url}/realms/${cfg.auth.realm}/protocol/openid-connect/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: cfg.auth.clientId, ...body }),
  })
  if (!res.ok) throw new Error(`${cfg.label} 로그인 실패 (${res.status})`)
  const j = await res.json() as { access_token: string; refresh_token: string; expires_in: number }
  return { access: j.access_token, refresh: j.refresh_token, exp: Date.now() + (j.expires_in - 15) * 1000 }
}

/** 그 환경의 접근 토큰. 없거나 만료되면 갱신하고, 갱신도 안 되면 팝업 로그인. */
export async function secondaryToken(cfg: EnvConfig): Promise<string> {
  let t = load(cfg.env)
  if (t && t.exp > Date.now()) return t.access
  if (t?.refresh) {
    try { t = await exchange(cfg, { grant_type: 'refresh_token', refresh_token: t.refresh }); save(cfg.env, t); return t.access } catch { save(cfg.env, null) }
  }
  t = await popupLogin(cfg); save(cfg.env, t); return t.access
}

export function secondarySignedIn(cfg: EnvConfig) { const t = load(cfg.env); return !!t && !!t.refresh }
export function secondaryLogout(cfg: EnvConfig) { save(cfg.env, null) }

async function popupLogin(cfg: EnvConfig): Promise<Tokens> {
  const { verifier, challenge } = await pkce()
  const state = b64url(crypto.getRandomValues(new Uint8Array(16)).buffer)
  const redirect = new URL('dev-callback.html', location.href.split('#')[0].split('?')[0]).href
  const url = `${cfg.auth.url}/realms/${cfg.auth.realm}/protocol/openid-connect/auth?` + new URLSearchParams({
    client_id: cfg.auth.clientId, response_type: 'code', scope: 'openid', redirect_uri: redirect, state, code_challenge: challenge, code_challenge_method: 'S256',
  })
  const win = window.open(url, 'replix-secondary-login', 'width=520,height=680')
  if (!win) throw new Error('팝업이 막혔습니다. 이 사이트의 팝업을 허용한 뒤 다시 누르세요.')
  const code = await new Promise<string>((resolve, reject) => {
    const timer = setInterval(() => { if (win.closed) { clearInterval(timer); window.removeEventListener('message', onMsg); reject(new Error(`${cfg.label} 로그인 창이 닫혔습니다.`)) } }, 500)
    function onMsg(e: MessageEvent) {
      if (e.origin !== location.origin || !e.data || e.data.type !== 'replix-secondary-code') return
      clearInterval(timer); window.removeEventListener('message', onMsg)
      if (e.data.state !== state) { reject(new Error('로그인 응답이 요청과 맞지 않습니다.')); return }
      if (e.data.error) { reject(new Error(`${cfg.label} 로그인 거부: ${e.data.error}`)); return }
      resolve(e.data.code)
    }
    window.addEventListener('message', onMsg)
  })
  try { win.close() } catch { /* 이미 닫힘 */ }
  return exchange(cfg, { grant_type: 'authorization_code', code, redirect_uri: redirect, code_verifier: verifier })
}
