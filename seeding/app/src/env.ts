import { connectionProfile } from '@core/env'

/* 어느 서버를 겨눌지는 주소가 정한다(HP-435 결정). 메타 태그나 빌드 인자로 바꿀 수 있게 두지 않는다 —
   운영 데이터를 쓰는 도구라 "설정을 잘못 둔 빌드"가 곧 사고다. */
export type Env = 'prod' | 'dev'

export function hostEnv(): Env {
  const h = typeof location !== 'undefined' ? location.hostname : ''
  // console.replix.tv 가 운영 콘솔 호스트(2026-09-27 조현빈 결정). replix.tv 아래 경로는 이전 배치의 호환용.
  return h === 'console.replix.tv' || h === 'replix.tv' || h === 'www.replix.tv' ? 'prod' : 'dev'
}

export const ENV: Env = hostEnv()


/* 주입 환경 선택(HP-436, 2026-09-28): 작업물은 이 콘솔이 붙은 서버(WORKSPACE)에 있고, 채팅 넣기는 두 환경 중 고른다.
   OTHER 는 정본이 아닌 쪽 — 완성된 행을 그 서버의 "외부 넣기" API 로 보낸다. */
export type EnvConfig = { env: Env; label: string; api: string; auth: { url: string; realm: string; clientId: string } }
/* 주소 값은 콘솔 연결 프로필(core/hosted-env·개발 서버 .env.local) 하나에서 읽는다(HP-523 — 종전에는 여기 따로 적었다).
   어느 환경이 작업 서버인지는 여전히 주소(hostEnv)가 정한다 — 서버 칩을 따라가지 않는다(시딩 결정 ②③). */
function envConfig(env: Env, label: string): EnvConfig {
  const p = connectionProfile(env === 'prod' ? 'PROD' : 'DEV')
  return { env, label, api: p.apiBaseUrl, auth: { url: p.kcUrl, realm: p.kcRealm, clientId: p.kcClientId } }
}
export const ENVS: Record<Env, EnvConfig> = { prod: envConfig('prod', '운영'), dev: envConfig('dev', '개발') }
export const WORKSPACE: EnvConfig = ENVS[ENV]
export const OTHER: EnvConfig = ENVS[ENV === 'prod' ? 'dev' : 'prod']

export const API_BASE = WORKSPACE.api
