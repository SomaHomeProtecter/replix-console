import { CONSOLE_ENVIRONMENTS, resolveEnvironment, restoreDeepLink } from './environment'
import type { ConsoleEnvironment, ConsoleProfile, EnvironmentRoute } from './environment'

/** 콘솔 환경(개발 서버 .env.local · 호스팅 빌드 hosted-env/.env.production) — 고를 수 있는 환경의 누락 검증을 부트스트랩 시점에 끝낸다. */
function required(name: string): string {
  const value = import.meta.env[name] as string | undefined
  if (!value) {
    throw new Error(`${name} 값이 없습니다 — 개발 서버는 .env.local(.env.example 참조), 호스팅 빌드는 hosted-env/.env.production 을 확인하세요`)
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

/**
 * 지금 연결한 환경의 프로필 — {@link initEnv}가 채운다.
 *
 * <p>모듈을 평가하는 순간에는 채우지 않는다(HP-456). 싱글파일 빌드는 동적 import까지 한 파일로 합쳐 즉시
 * 평가하므로, 여기서 예외가 나면 main.tsx의 catch에 닿지 않고 엉뚱한 초기화 오류로 바뀌었다. 부팅 안에서
 * 채우면 예외가 모두 그 catch로 간다. 소비자는 모두 부팅 뒤(렌더·요청 시점)에 읽는다.
 */
export const env = {} as ConsoleProfile

let route: EnvironmentRoute | null = null

/**
 * 주소를 정본으로 맞추고 연결 환경을 정한다 — 부팅 첫 단계에서 한 번(HP-456).
 *
 * <p>① 404.html이 ?p= 에 실어 보낸 깊은 주소를 되살리고 ② 환경 조각을 넣은 주소(/moderation/&lt;env&gt;/…)로
 * 바꾼다. Keycloak 로그인 복귀 주소와 라우터가 이 주소를 쓰므로 둘보다 먼저 돈다. 해시(로그인 응답의
 * code)는 그대로 둔다.
 */
export function initEnv(): EnvironmentRoute {
  if (route) return route
  const basePath = import.meta.env.BASE_URL
  const restored = restoreDeepLink(basePath, window.location.pathname, window.location.search)
  const resolved = resolveEnvironment({
    basePath,
    pathname: restored.pathname,
    search: restored.search,
    hostname: window.location.hostname,
    fallback: required('VITE_DEFAULT_ENVIRONMENT'),
    available: CONSOLE_ENVIRONMENTS,
  })
  // 고를 수 있는 모든 환경의 값을 부팅 때 검증한다 — 전환한 뒤에야 누락이 드러나지 않게.
  // 호스팅 빌드는 LOCAL을 싣지 않으므로 그 값은 요구하지 않는다.
  const grafanaBaseUrl = optional('VITE_GRAFANA_URL')
  const profiles = CONSOLE_ENVIRONMENTS.map((environment) => profile(environment, grafanaBaseUrl))
  Object.assign(env, profiles.find((candidate) => candidate.environment === resolved.environment))

  const canonical = `${resolved.pathname}${resolved.search}${window.location.hash}`
  if (canonical !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
    window.history.replaceState(window.history.state, '', canonical)
  }
  route = resolved
  return route
}
