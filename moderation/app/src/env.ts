import { CONSOLE_ENVIRONMENTS, selectEnvironment } from './environment'
import type { ConsoleEnvironment, ConsoleProfile } from './environment'

/** 콘솔 환경(개발 서버 .env.local · 호스팅 빌드 .env.production) — 고를 수 있는 환경의 누락 검증을 부트스트랩 시점에 끝낸다. */
function required(name: string): string {
  const value = import.meta.env[name] as string | undefined
  if (!value) {
    throw new Error(`${name} 값이 없습니다 — 개발 서버는 .env.local(.env.example 참조), 호스팅 빌드는 .env.production 을 확인하세요`)
  }
  return value
}

/**
 * 선택 값 — 없으면 그 기능만 화면에서 빠진다.
 *
 * <p><b>required()에 넣지 않는다</b>: env 검증은 부트스트랩 시점에 throw 하므로, 값을 안 채운
 * 팀원의 콘솔이 <b>통째로 뜨지 않는다</b>. Grafana 링크 하나 때문에 콘솔을 못 쓰는 것은
 * 바꾸려던 것보다 나쁘다.
 */
function optional(name: string): string | null {
  const value = import.meta.env[name] as string | undefined
  return value ? value : null
}

function profile(environment: ConsoleEnvironment, grafanaBaseUrl: string | null): ConsoleProfile {
  const prefix = `VITE_${environment}`
  const namespace = environment === 'LOCAL' ? null : environment.toLowerCase()
  let grafanaUrl = grafanaBaseUrl
  if (grafanaUrl && namespace) {
    const url = new URL(grafanaUrl)
    url.searchParams.set('var-namespace', namespace)
    grafanaUrl = url.toString()
  }
  return {
    environment,
    apiBaseUrl: required(`${prefix}_API_BASE_URL`).replace(/\/$/, ''),
    kcUrl: required(`${prefix}_KC_URL`).replace(/\/$/, ''),
    kcRealm: required(`${prefix}_KC_REALM`),
    kcClientId: required(`${prefix}_KC_CLIENT_ID`),
    expectedAudience: required(`${prefix}_EXPECTED_AUDIENCE`),
    expectedAzp: required(`${prefix}_EXPECTED_AZP`),
    grafanaUrl,
  }
}

const grafanaBaseUrl = optional('VITE_GRAFANA_URL')
// 호스팅 빌드는 LOCAL을 싣지 않으므로(HP-456) 고를 수 있는 환경의 프로필만 만든다.
export const profiles = Object.fromEntries(
    CONSOLE_ENVIRONMENTS.map((environment) => [environment, profile(environment, grafanaBaseUrl)]),
) as Partial<Record<ConsoleEnvironment, ConsoleProfile>>

/** 이 탭에서 고른 환경 — 새로고침해도 유지한다(HP-456). 탭을 닫으면 사라진다. */
const ENVIRONMENT_STORAGE_KEY = 'replix_moderation_environment'

function storedEnvironment(): string | null {
  try { return window.sessionStorage.getItem(ENVIRONMENT_STORAGE_KEY) } catch { return null }
}

function rememberEnvironment(environment: ConsoleEnvironment): void {
  try { window.sessionStorage.setItem(ENVIRONMENT_STORAGE_KEY, environment) } catch { /* 저장 불가 환경 */ }
}

const selected = selectEnvironment({
  search: window.location.search,
  stored: storedEnvironment(),
  hostname: window.location.hostname,
  fallback: required('VITE_DEFAULT_ENVIRONMENT'),
  available: CONSOLE_ENVIRONMENTS,
})
rememberEnvironment(selected)

// selectEnvironment는 고를 수 있는 환경만 돌려주므로 해당 프로필이 반드시 있다.
export const env = profiles[selected] as ConsoleProfile
