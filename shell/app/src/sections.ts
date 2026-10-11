import {
  ALL_CONSOLE_ENVIRONMENTS,
  MODERATION_BASE_PATH,
  environmentBasename,
} from '@core/environment'
import type { ConsoleEnvironment } from '@core/environment'

/** 콘솔의 세 구역 — 주소 첫 조각으로 가른다. */
export type Section = 'home' | 'seeding' | 'moderation'

export const HOME_PATH = '/'
export const SEEDING_PATH = '/seeding/'

export function sectionOf(pathname: string): Section {
  if (pathname === '/moderation' || pathname.startsWith(MODERATION_BASE_PATH)) return 'moderation'
  if (pathname === '/seeding' || pathname.startsWith(SEEDING_PATH)) return 'seeding'
  return 'home'
}

/**
 * 홈과 시딩이 붙는 서버. 호스팅 콘솔(console.replix.tv)은 PROD다 — 시딩 작업물의 정본이 운영이고, 계획은 운영에서
 * 만든 뒤 넣을 때만 서버를 고른다(닫힌 결정, 시딩.md). 개발 서버는 DEV다 — seeding/app/src/env.ts가 localhost를
 * 개발로 보는 것과 맞춘다. DEV는 조치를 개발 서버에서 시험할 때만 쓰고, 콘솔 안 서버 칩으로만 바꾼다(HP-506).
 */
export function homeEnvironment(hosted: boolean): ConsoleEnvironment {
  return hosted ? 'PROD' : 'DEV'
}

/**
 * 주소가 요구하는 서버. 조치 경로는 경로 조각(/moderation/&lt;env&gt;/)이 정하고(HP-456), 조각이 없는 조치 주소는
 * 지금 서버를 그대로 쓴다(부팅 때 initEnv가 정본 주소로 바꾼다). 홈·시딩은 {@link homeEnvironment}.
 */
export function environmentForPath(
  pathname: string, hosted: boolean, current: ConsoleEnvironment,
): ConsoleEnvironment {
  if (sectionOf(pathname) !== 'moderation') return homeEnvironment(hosted)
  const head = (pathname.slice(MODERATION_BASE_PATH.length).split('/')[0] ?? '').toUpperCase()
  return (ALL_CONSOLE_ENVIRONMENTS as readonly string[]).includes(head) ? head as ConsoleEnvironment : current
}

/** 조치 라우터의 basename — '/moderation/prod'. 조치 콘솔의 주소 규칙(environment.ts)을 그대로 쓴다. */
export function moderationBasename(environment: ConsoleEnvironment): string {
  return environmentBasename(MODERATION_BASE_PATH, environment)
}
