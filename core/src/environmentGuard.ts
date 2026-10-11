import { apiFetch } from './api/client'
import { env } from './env'
import { validateEnvironmentMetadata } from './environment'
import type { EnvironmentMetadata } from './environment'

/** 서버의 환경·issuer·audience·azp 자기 선언(HP-337). 콘솔 부팅만 쓴다 — 종전에는 조치 api/admin.ts에 있었다. */
function getEnvironmentMetadata(): Promise<EnvironmentMetadata> {
  return apiFetch('/api/v1/admin/meta/environment')
}

/** 인증 직후, 어떤 운영 데이터도 그리기 전에 서버 자기 선언과 선택 프로필을 교차 검증한다. */
export async function verifyEnvironment(): Promise<void> {
  validateEnvironmentMetadata(env, await getEnvironmentMetadata())
}
