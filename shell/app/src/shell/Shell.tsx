import { Fragment, useId, useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import { logout, roleLabel, switchEnvironment, userName } from '@core/auth'
import { env } from '@core/env'
import { MODERATION_MENU } from '@moderation/routes'
import { CONSOLE_ENVIRONMENTS } from '@core/environment'
import type { ConsoleEnvironment } from '@core/environment'
import { handleLinkClick, isHostedConsole } from '../navigation'
import { environmentForPath, moderationBasename, SEEDING_PATH } from '../sections'
import type { Section } from '../sections'
import { ChevronIcon, ExternalIcon, HomeIcon, LockIcon, MenuIcon, ShieldIcon, SproutIcon } from './icons'

/**
 * 운영 콘솔 공용 틀(HP-506) — 톱바·왼쪽 메뉴·PROD 띠. 시안 = 아티팩트 FGyCFRqoVMB8YprhGyioMB.
 *
 * <p>종전에는 두 도구가 각자 톱바를 갖고 조치 톱바의 도구 전환 메뉴로 오갔다(HP-456). 이 틀이 그 자리를 대신한다:
 * 한 톱바, 한 메뉴 안에서 시딩과 조치를 묶음으로 나눈다. 색은 조치 콘솔의 시각 정본(styles.css :root)을 따른다 —
 * PROD는 호박색, 빨강은 정지 같은 되돌리기 어려운 조치에만 쓴다(HP-223 확정 제약, HP-456 D2).
 *
 * <p>조치가 쓰기 요청을 처리하는 동안(locked)에는 이동 수단을 모두 잠근다 — 페이지를 떠나면 조치 성패를 알릴 곳이
 * 사라진다(HP-300). 종전 조치 톱바의 잠금과 같은 규칙을 틀 전체로 넓혔다.
 *
 * <p>좁은 화면(760px 이하)에서는 메뉴 목록을 지금 화면 이름을 단 '메뉴' 단추 한 줄로 접는다(HP-699). 펼쳐 둔 메뉴가
 * 화면 높이의 42%를 차지해 본문이 맨 아래 띠에 갇혔다 — 휴대폰에서는 본문이 거의 보이지 않았다. 넓은 화면에는 단추가
 * 없고 목록이 늘 펼쳐져 있다(shell.css).
 */

type NavItem = { label: string; href: string; active: boolean; target: ConsoleEnvironment }

/** 메뉴에 없는 화면(조치의 사용자 상세 등)에서 접힌 메뉴 단추가 보일 이름. */
const SECTION_LABELS: Record<Section, string> = { home: '홈', seeding: '시딩', moderation: '조치' }

function splitPath(path: string): { pathname: string; search: string } {
  const at = path.indexOf('?')
  return at < 0 ? { pathname: path, search: '' } : { pathname: path.slice(0, at), search: path.slice(at) }
}

/** 조치 메뉴 켜짐 판정 — 신고 큐('/')는 정확히 그 경로일 때만, 나머지는 하위 경로까지(기능 제어의 탭들). */
function moderationActive(rest: string, sub: string): boolean {
  if (sub === '/') return rest === '/'
  return rest === sub || rest.startsWith(`${sub}/`)
}

export default function Shell({ section, path, locked = false, lockedTitle, search, banner, children }: {
  section: Section
  path: string
  locked?: boolean
  lockedTitle?: string
  search: ReactNode
  banner?: ReactNode
  children: ReactNode
}) {
  const environment = env.environment
  const hosted = isHostedConsole()
  const { pathname, search: query } = splitPath(path)
  const view = new URLSearchParams(query).get('view')
  const basename = moderationBasename(environment)
  const rest = section === 'moderation' ? (pathname.slice(basename.length) || '/') : ''
  const targetOf = (href: string) => environmentForPath(splitPath(href).pathname, hosted, environment)

  const home: NavItem = { label: '홈', href: '/', active: section === 'home', target: targetOf('/') }
  const seeding: NavItem[] = [
    { label: '회차 작업', href: SEEDING_PATH, active: section === 'seeding' && view !== 'prompts', target: targetOf(SEEDING_PATH) },
    { label: 'AI 프롬프트', href: `${SEEDING_PATH}?view=prompts`, active: section === 'seeding' && view === 'prompts', target: targetOf(SEEDING_PATH) },
  ]
  const moderation = MODERATION_MENU.map(({ group, items }) => ({
    group,
    items: items.map(({ label, path: sub }): NavItem => {
      const href = sub === '/' ? `${basename}/` : `${basename}${sub}`
      return { label, href, active: section === 'moderation' && moderationActive(rest, sub), target: environment }
    }),
  }))
  // 홈·시딩은 PROD 전용이다(시딩 작업물 정본 = 운영). DEV로 조치를 시험하다 누르면 PROD로 새로 연다.
  const seedingFixed = hosted && environment === 'PROD'
  const current = [home, ...seeding, ...moderation.flatMap(({ items }) => items)].find((item) => item.active)

  const [menuOpen, setMenuOpen] = useState(false)
  const menuListId = useId()

  const follow = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (locked) { event.preventDefault(); return }
    // 같은 구역 안 이동은 틀을 다시 그리지 않아 펼침 상태가 남는다 — 고르면 접어야 본문이 다시 보인다(HP-699).
    setMenuOpen(false)
    handleLinkClick(event, href)
  }

  const link = (item: NavItem, className: string, icon?: ReactNode) => (
    <a
        key={item.href} href={item.href} className={className}
        aria-current={item.active ? 'page' : undefined}
        aria-disabled={locked || undefined} title={locked ? lockedTitle : undefined}
        onClick={(event) => follow(event, item.href)}>
      {icon}
      <span className="cs-nav-label">{item.label}</span>
      {item.target !== environment && (
        <span className={`cs-tag${item.target === 'PROD' ? ' is-prod' : ''}`} title={`${item.target} 서버로 새로 엽니다`}>
          {item.target}
        </span>
      )}
    </a>
  )

  const switchServer = (target: ConsoleEnvironment) => {
    if (target === environment) return
    // 조치는 지금 보던 화면의 환경 경로 규칙(HP-456)을 그대로 따른다. 홈·시딩에서 고르면 그 서버의 조치 첫 화면으로 간다 —
    // DEV는 조치를 시험할 때만 쓰기 때문이다(HP-506).
    if (section === 'moderation') switchEnvironment(target)
    else window.location.assign(`${moderationBasename(target)}/`)
  }

  return (
    <div className="cs-app">
      <header className="cs-top">
        <a
            href="/" className="cs-brand" aria-disabled={locked || undefined}
            title={locked ? lockedTitle : '운영 콘솔 홈'} onClick={(event) => follow(event, '/')}>
          <span className="cs-wordmark"><span className="rx">Re</span>plix</span>
          <span className="cs-brand-sep" aria-hidden="true" />
          <span className="cs-brand-name">운영 콘솔</span>
        </a>
        <label className={`env-selector env-${environment.toLowerCase()}`}>
          <span className="sr-only">연결 서버</span>
          <select
              aria-label="연결 서버" value={environment} disabled={locked}
              title={lockedTitle ?? '서버를 바꾸면 그 서버로 다시 로그인합니다'}
              onChange={(event) => switchServer(event.target.value as ConsoleEnvironment)}>
            {CONSOLE_ENVIRONMENTS.map((candidate) => (
              <option key={candidate} value={candidate}>{candidate}</option>
            ))}
          </select>
        </label>
        {search}
        <div className="cs-account">
          <span className="cs-operator">{userName()} ({roleLabel()})</span>
          <button
              type="button" className="btn-logout" disabled={locked} title={lockedTitle}
              onClick={() => logout()}>
            로그아웃
          </button>
        </div>
      </header>
      {environment === 'PROD' && (
        <div className="prod-environment-banner" role="status">
          PROD 운영 환경 · 실제 사용자 데이터에 즉시 반영됩니다
        </div>
      )}
      <div className="cs-body">
        <nav className="cs-nav" aria-label="콘솔 메뉴">
          <button
              type="button" className="cs-nav-toggle" aria-expanded={menuOpen} aria-controls={menuListId}
              onClick={() => setMenuOpen((open) => !open)}>
            <MenuIcon />
            <span className="cs-nav-toggle-title">메뉴</span>{' '}
            <span className="cs-nav-toggle-current">{current?.label ?? SECTION_LABELS[section]}</span>
            <ChevronIcon />
          </button>
          <div className="cs-nav-list" id={menuListId}>
            {link(home, 'cs-nav-home', <HomeIcon />)}
            <div className="cs-nav-rule" aria-hidden="true" />

            <div className="cs-group">
              <span className="cs-group-mark" aria-hidden="true"><SproutIcon /></span>
              <span className="cs-group-text">
                <span className="cs-group-title">
                  <strong>시딩</strong>
                  {seedingFixed && <span className="cs-fixed"><LockIcon />PROD 고정</span>}
                </span>
                <span className="cs-group-sub">수집 · AI 채팅 계획 · 채팅 넣기</span>
              </span>
            </div>
            {seeding.map((item) => link(item, 'cs-nav-item'))}

            <div className="cs-nav-rule" aria-hidden="true" />

            <div className="cs-group">
              <span className="cs-group-mark" aria-hidden="true"><ShieldIcon /></span>
              <span className="cs-group-text">
                <span className="cs-group-title"><strong>조치</strong></span>
                <span className="cs-group-sub">신고 · 정지 · 기능 제어</span>
              </span>
            </div>
            {/* 조치는 성격별 묶음으로 나눈다(HP-529) — 묶음 이름은 화면 읽기 프로그램에 무리 이름으로 읽힌다. */}
            {moderation.map(({ group, items }) => (
              <Fragment key={group}>
                <div className="cs-nav-sub" role="group" aria-label={group}>
                  <span className="cs-nav-subcaption" aria-hidden="true">{group}</span>
                  {items.map((item) => link(item, 'cs-nav-item'))}
                </div>
              </Fragment>
            ))}

            {/* 지표 화면은 콘솔에 만들지 않고 있는 곳으로 보낸다(HP-223 확정 제약 ③, HP-297). */}
            {env.grafanaUrl && (
              <>
                <div className="cs-nav-rule" aria-hidden="true" />
                <span className="cs-nav-caption">바깥 도구</span>
                <a className="cs-nav-external" href={env.grafanaUrl} target="_blank" rel="noreferrer noopener">
                  <span className="cs-nav-label">Grafana · 모더레이션</span>
                  <ExternalIcon />
                </a>
              </>
            )}
          </div>
        </nav>
        <div className="cs-main">
          {banner}
          {children}
        </div>
      </div>
    </div>
  )
}
