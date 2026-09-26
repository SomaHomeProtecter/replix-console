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
