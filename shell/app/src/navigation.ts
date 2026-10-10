import { useSyncExternalStore } from 'react'
import type { MouseEvent } from 'react'
import { env } from '@moderation/env'
import { HOSTED_CONSOLE_HOSTNAME } from '@moderation/environment'
import type { ConsoleEnvironment } from '@moderation/environment'
import { environmentForPath } from './sections'

/*
 * 콘솔 안 이동(HP-506). 메뉴를 옮겨도 페이지를 다시 열지 않는다 — 로그인은 콘솔을 열 때 한 번이고(Keycloak 연결이
 * 이 페이지에 하나), 새로 열면 그 확인을 다시 거친다. 다만 서버가 바뀌는 이동은 새로 연다: PROD와 DEV는 Keycloak
 * 서버 자체가 달라(auth.replix.tv / auth.replix-dev.site) 한 페이지에서 두 서버의 로그인을 함께 들 수 없다.
 */

type Listener = () => void
const listeners = new Set<Listener>()
const notifyAll = () => listeners.forEach((listener) => listener())

if (typeof window !== 'undefined') window.addEventListener('popstate', notifyAll)

function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function snapshot(): string {
  return `${window.location.pathname}${window.location.search}`
}

/** 지금 주소(경로 + 쿼리). 콘솔 안 이동·뒤로 가기·조치 라우터의 이동을 모두 따라간다. */
export function useCurrentPath(): string {
  return useSyncExternalStore(subscribe, snapshot)
}

/** 조치 라우터가 자기 링크로 주소를 바꿨을 때 부른다 — history.pushState는 이벤트를 내지 않아 틀이 모른다. */
export function notifyLocationChanged(): void {
  notifyAll()
}

export function isHostedConsole(): boolean {
  return window.location.hostname === HOSTED_CONSOLE_HOSTNAME
}

export type NavigationPlan = 'in-app' | 'reload'

/** 같은 서버면 페이지 안에서, 서버가 바뀌면 새로 연다. */
export function planNavigation(
  pathname: string, hosted: boolean, current: ConsoleEnvironment,
): NavigationPlan {
  return environmentForPath(pathname, hosted, current) === current ? 'in-app' : 'reload'
}

/** 콘솔 안 이동. 같은 서버면 주소만 바꾸고 popstate로 알린다 — 틀과 조치 라우터가 같은 신호로 새 주소를 읽는다. */
export function navigate(target: string): void {
  const url = new URL(target, window.location.origin)
  if (planNavigation(url.pathname, isHostedConsole(), env.environment) === 'reload') {
    window.location.assign(url)
    return
  }
  const next = `${url.pathname}${url.search}${url.hash}`
  if (next === `${window.location.pathname}${window.location.search}${window.location.hash}`) return
  window.history.pushState(null, '', next)
  window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
}

/**
 * 링크 클릭을 콘솔 안 이동으로 바꾼다. 새 탭·새 창(수정키·가운데 버튼)은 브라우저에 맡긴다 — 그 탭은 새로 열리며
 * 같은 Keycloak 세션으로 조용히 로그인된다.
 */
export function handleLinkClick(event: MouseEvent<HTMLAnchorElement>, target: string): void {
  if (event.defaultPrevented || event.button !== 0
      || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  navigate(target)
}
