import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

/*
 * 시딩이 겨누는 서버(HP-523 이후 콘솔 연결 프로필에서 읽는다). 종전에는 env.ts에 주소를 고정값으로 적어 두어 눈으로
 * 확인할 수 있었다 — 프로필로 옮긴 뒤에도 '운영 = api.replix.tv'가 깨지면 테스트가 잡게 한다.
 */
describe('시딩 서버 주소', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('호스팅 빌드의 연결 프로필은 시딩이 쓰던 운영·개발 서버를 그대로 가리킨다', () => {
    const file = readFileSync(resolve(__dirname, '../../../core/hosted-env/.env.production'), 'utf8')
    const value = (name: string) => file.match(new RegExp(`^${name}=(.*)$`, 'm'))?.[1]
    expect(value('VITE_PROD_API_BASE_URL')).toBe('https://api.replix.tv')
    expect(value('VITE_PROD_KC_URL')).toBe('https://auth.replix.tv')
    expect(value('VITE_DEV_API_BASE_URL')).toBe('https://api.replix-dev.site')
    expect(value('VITE_DEV_KC_URL')).toBe('https://auth.replix-dev.site')
    for (const env of ['PROD', 'DEV']) {
      expect(value(`VITE_${env}_KC_REALM`)).toBe('replix')
      expect(value(`VITE_${env}_KC_CLIENT_ID`)).toBe('replix-web')
    }
  })

  it('localhost에서는 작업 서버가 개발, 넣기의 다른 환경이 운영이다 — 서버 칩을 따라가지 않는다(시딩 결정 ②③)', async () => {
    const { WORKSPACE, OTHER } = await import('./env')
    expect(WORKSPACE).toMatchObject({ env: 'dev', api: 'http://api.test' })
    expect(OTHER).toMatchObject({ env: 'prod', api: 'http://prod-api.test' })
  })

  it('값이 빠져도 모듈을 불러오는 중에는 던지지 않고, 그 주소를 쓸 때 원인을 알린다(HP-456)', async () => {
    vi.stubEnv('VITE_PROD_KC_REALM', '')
    const { OTHER } = await import('./env') // 여기서 던지면 싱글파일 빌드에서 원인 대신 초기화 오류가 뜬다
    expect(() => OTHER.auth).toThrow('VITE_PROD_KC_REALM 값이 없습니다')
  })
})
