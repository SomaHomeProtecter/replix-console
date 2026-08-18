import { CONSOLE_ENVIRONMENTS, selectEnvironment } from './environment'
import type { ConsoleEnvironment, ConsoleProfile } from './environment'

/** 콘솔 환경(.env.local) — 세 환경의 누락 검증을 부트스트랩 시점에 끝낸다. */
function required(name: string): string {
  const value = import.meta.env[name] as string | undefined
  if (!value) {
    throw new Error(`${name} 값이 없습니다 — admin-ui/.env.local 을 확인하세요 (.env.example 참조)`)
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
export const profiles = Object.fromEntries(
    CONSOLE_ENVIRONMENTS.map((environment) => [environment, profile(environment, grafanaBaseUrl)]),
) as Record<ConsoleEnvironment, ConsoleProfile>

export const env = profiles[selectEnvironment(
    window.location.search, required('VITE_DEFAULT_ENVIRONMENT'))]
