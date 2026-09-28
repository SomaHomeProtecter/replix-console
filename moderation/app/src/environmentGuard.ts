import { getEnvironmentMetadata } from './api/admin'
import { env } from './env'
import { validateEnvironmentMetadata } from './environment'

/** 인증 직후, 어떤 운영 데이터도 그리기 전에 서버 자기 선언과 선택 프로필을 교차 검증한다. */
export async function verifyEnvironment(): Promise<void> {
  validateEnvironmentMetadata(env, await getEnvironmentMetadata())
}
