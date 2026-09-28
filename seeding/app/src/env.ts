/* 어느 서버를 겨눌지는 주소가 정한다(HP-435 결정). 메타 태그나 빌드 인자로 바꿀 수 있게 두지 않는다 —
   운영 데이터를 쓰는 도구라 "설정을 잘못 둔 빌드"가 곧 사고다. */
export type Env = 'prod' | 'dev'

export function hostEnv(): Env {
  const h = typeof location !== 'undefined' ? location.hostname : ''
  // console.replix.tv 가 운영 콘솔 호스트(2026-09-27 조현빈 결정). replix.tv 아래 경로는 이전 배치의 호환용.
  return h === 'console.replix.tv' || h === 'replix.tv' || h === 'www.replix.tv' ? 'prod' : 'dev'
}

export const ENV: Env = hostEnv()

export const API_BASE = ENV === 'prod' ? 'https://api.replix.tv' : 'https://api.replix-dev.site'

export const AUTH = ENV === 'prod'
  ? { url: 'https://auth.replix.tv', realm: 'replix', clientId: 'replix-web' }
  : { url: 'https://auth.replix-dev.site', realm: 'replix', clientId: 'replix-web' }

/* 주입 환경 선택(HP-436, 2026-09-28): 작업물은 이 콘솔이 붙은 서버(WORKSPACE)에 있고, 채팅 넣기는 두 환경 중 고른다.
   OTHER 는 정본이 아닌 쪽 — 완성된 행을 그 서버의 "외부 넣기" API 로 보낸다. */
export type EnvConfig = { env: Env; label: string; api: string; auth: { url: string; realm: string; clientId: string } }
export const ENVS: Record<Env, EnvConfig> = {
  prod: { env: 'prod', label: '운영', api: 'https://api.replix.tv', auth: { url: 'https://auth.replix.tv', realm: 'replix', clientId: 'replix-web' } },
  dev: { env: 'dev', label: '개발', api: 'https://api.replix-dev.site', auth: { url: 'https://auth.replix-dev.site', realm: 'replix', clientId: 'replix-web' } },
}
export const WORKSPACE: EnvConfig = ENVS[ENV]
export const OTHER: EnvConfig = ENVS[ENV === 'prod' ? 'dev' : 'prod']
