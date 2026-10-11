import { describe, expect, it } from 'vitest'
import { planNavigation } from './navigation'
import { environmentForPath, homeEnvironment, moderationBasename, sectionOf } from './sections'

describe('sectionOf — 주소 첫 조각이 구역을 고른다', () => {
  it.each([
    ['/', 'home'],
    ['/unknown', 'home'],
    ['/seeding/', 'seeding'],
    ['/seeding', 'seeding'],
    ['/moderation/', 'moderation'],
    ['/moderation', 'moderation'],
    ['/moderation/prod/users/42', 'moderation'],
    ['/moderationx', 'home'],
  ] as const)('%s → %s', (pathname, section) => {
    expect(sectionOf(pathname)).toBe(section)
  })
})

describe('서버 규칙(HP-506)', () => {
  it('홈·시딩은 호스팅 콘솔에서 PROD, 개발 서버에서 DEV다', () => {
    expect(homeEnvironment(true)).toBe('PROD')
    expect(homeEnvironment(false)).toBe('DEV')
  })

  it('조치 주소는 경로 조각이 서버를 정한다', () => {
    expect(environmentForPath('/moderation/dev/actions', true, 'PROD')).toBe('DEV')
    expect(environmentForPath('/moderation/prod/', true, 'DEV')).toBe('PROD')
    expect(environmentForPath('/moderation/local/', false, 'DEV')).toBe('LOCAL')
  })

  it('조각이 없는 조치 주소는 지금 서버를 그대로 쓴다', () => {
    expect(environmentForPath('/moderation/', true, 'DEV')).toBe('DEV')
    expect(environmentForPath('/moderation/users/42', true, 'PROD')).toBe('PROD')
  })

  it('홈·시딩 주소는 지금 서버와 무관하게 홈 서버를 요구한다', () => {
    expect(environmentForPath('/seeding/', true, 'DEV')).toBe('PROD')
    expect(environmentForPath('/', false, 'PROD')).toBe('DEV')
  })

  it('조치 basename은 조치 콘솔의 환경 경로 규칙을 따른다', () => {
    expect(moderationBasename('PROD')).toBe('/moderation/prod')
    expect(moderationBasename('DEV')).toBe('/moderation/dev')
  })
})

describe('planNavigation — 같은 서버면 페이지 안에서, 서버가 바뀌면 새로 연다', () => {
  it('PROD 콘솔에서 시딩·조치(PROD)로는 페이지 안에서 옮긴다 — 다시 로그인하지 않는다', () => {
    expect(planNavigation('/seeding/', true, 'PROD')).toBe('in-app')
    expect(planNavigation('/moderation/prod/suspensions', true, 'PROD')).toBe('in-app')
    expect(planNavigation('/', true, 'PROD')).toBe('in-app')
  })

  it('DEV로 가는 이동은 새로 연다 — Keycloak 서버가 다르다', () => {
    expect(planNavigation('/moderation/dev/', true, 'PROD')).toBe('reload')
  })

  it('DEV 조치에서 홈·시딩을 누르면 PROD로 새로 연다 — 시딩 작업물 정본은 운영이다', () => {
    expect(planNavigation('/seeding/', true, 'DEV')).toBe('reload')
    expect(planNavigation('/', true, 'DEV')).toBe('reload')
    expect(planNavigation('/moderation/dev/actions', true, 'DEV')).toBe('in-app')
  })

  it('개발 서버의 DEV 콘솔은 홈·시딩·조치를 모두 페이지 안에서 옮긴다', () => {
    expect(planNavigation('/seeding/?view=prompts', false, 'DEV')).toBe('in-app')
    expect(planNavigation('/moderation/dev/', false, 'DEV')).toBe('in-app')
  })
})
