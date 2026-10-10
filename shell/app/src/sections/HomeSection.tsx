import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { env } from '@moderation/env'
import { elapsedSince } from '@moderation/format'
import GlobalUserSearch from '../GlobalUserSearch'
import { airDateLabel, loadModerationSummary, loadRecentEpisodes, OPEN_REPORT_PAGE } from '../home/homeData'
import type { ModerationSummary, RecentEpisode } from '../home/homeData'
import { handleLinkClick, isHostedConsole } from '../navigation'
import { moderationBasename, SEEDING_PATH } from '../sections'
import { ArrowIcon, LockIcon, ShieldIcon, SproutIcon } from '../shell/icons'
import Shell from '../shell/Shell'

type Loaded<T> = { state: 'loading' } | { state: 'ready'; value: T } | { state: 'error'; message: string }

function useLoaded<T>(load: () => Promise<T>): Loaded<T> {
  const [loaded, setLoaded] = useState<Loaded<T>>({ state: 'loading' })
  useEffect(() => {
    let alive = true
    load().then(
      (value) => { if (alive) setLoaded({ state: 'ready', value }) },
      (error: unknown) => { if (alive) setLoaded({ state: 'error', message: error instanceof Error ? error.message : String(error) }) },
    )
    return () => { alive = false }
    // 홈을 열 때 한 번 읽는다 — 처리는 각 화면에서 하고, 홈으로 돌아오면 다시 읽는다.
  }, [])
  return loaded
}

function InAppLink({ href, className, children }: { href: string; className: string; children: ReactNode }) {
  return <a href={href} className={className} onClick={(event) => handleLinkClick(event, href)}>{children}</a>
}

function Workspace({ mark, title, extra, description, href, caption, children, footer }: {
  mark: ReactNode
  title: string
  extra?: ReactNode
  description: string
  href: string
  caption: string
  children: ReactNode
  footer: ReactNode
}) {
  return (
    <section className="cs-ws" aria-label={title}>
      <div className="cs-ws-head">
        <span className="cs-ws-mark" aria-hidden="true">{mark}</span>
        <div className="cs-ws-title">
          <div><h2>{title}</h2>{extra}</div>
          <p>{description}</p>
        </div>
        <InAppLink href={href} className="cs-open">열기<ArrowIcon /></InAppLink>
      </div>
      <div className="cs-ws-caption">{caption}</div>
      <div className="cs-ws-rows">{children}</div>
      <div className="cs-ws-foot">{footer}</div>
    </section>
  )
}

function SeedingCard() {
  const recent = useLoaded(() => loadRecentEpisodes(2))
  const hosted = isHostedConsole()
  return (
    <Workspace
        mark={<SproutIcon />} title="시딩" href={SEEDING_PATH} caption="최근 회차"
        extra={hosted ? <span className="cs-fixed"><LockIcon />PROD 고정</span> : undefined}
        description="커뮤니티 반응을 모아 AI 채팅 계획을 만들고, 검수한 채팅을 회차에 넣습니다."
        footer={<>
          <InAppLink href={SEEDING_PATH} className="cs-chip">회차 작업</InAppLink>
          <InAppLink href={`${SEEDING_PATH}?view=prompts`} className="cs-chip">AI 프롬프트</InAppLink>
        </>}>
      {recent.state === 'loading' && <div className="cs-ws-empty">불러오는 중…</div>}
      {recent.state === 'error' && <div className="error-box" role="alert">{recent.message}</div>}
      {recent.state === 'ready' && recent.value.length === 0 && (
        <div className="cs-ws-empty">아직 회차가 없습니다. 회차 작업에서 방영일을 추가하세요.</div>
      )}
      {recent.state === 'ready' && recent.value.map((item) => <EpisodeRow key={item.episode.id} item={item} />)}
    </Workspace>
  )
}

function EpisodeRow({ item: { work, episode, progress } }: { item: RecentEpisode }) {
  const href = `${SEEDING_PATH}?work=${work.id}&episode=${episode.id}`
  return (
    <InAppLink href={href} className="cs-episode">
      <span className="cs-episode-head">
        <span className="cs-episode-name">
          <b>{work.title} · {episode.label ?? episode.airDate}</b>
          <span>{airDateLabel(episode.airDate)} 방영</span>
        </span>
        <span className={`cs-status is-${progress.status.state}`}>{progress.status.label}</span>
      </span>
      <ol className="cs-steps">
        {progress.steps.map((step, index) => (
          <li key={step.label} className={`cs-step is-${step.state}`}>
            <span className="cs-step-no">{index + 1}</span>
            <span className="cs-step-text"><b>{step.label}</b><span>{step.detail}</span></span>
          </li>
        ))}
      </ol>
    </InAppLink>
  )
}

function ModerationRow({ href, label, go, children }: { href: string; label: string; go: string; children: ReactNode }) {
  return (
    <InAppLink href={href} className="cs-row">
      <span className="cs-row-main">
        <span className="cs-row-label">{label}</span>
        <span className="cs-row-value">{children}</span>
      </span>
      <span className="cs-row-go">{go}<ArrowIcon /></span>
    </InAppLink>
  )
}

function ModerationCard() {
  const summary = useLoaded(loadModerationSummary)
  const base = moderationBasename(env.environment)
  const links: readonly [string, string][] = [
    ['조치 로그', '/actions'], ['오탐 검토', '/moderation-reviews'], ['운영 협업', '/operation-cases'],
    ['정책 실험', '/moderation-policies'], ['기능 제어', '/feature-control'], ['피드백', '/feedback'],
  ]
  return (
    <Workspace
        mark={<ShieldIcon />} title="조치" href={`${base}/`} caption="지금 볼 것"
        description="신고를 처리하고 계정을 정지하며, 기능 제어와 사용자 공지를 다룹니다."
        footer={links.map(([label, sub]) => <InAppLink key={sub} href={`${base}${sub}`} className="cs-chip">{label}</InAppLink>)}>
      {summary.state === 'loading' && <div className="cs-ws-empty">불러오는 중…</div>}
      {summary.state === 'error' && <div className="error-box" role="alert">{summary.message}</div>}
      {summary.state === 'ready' && <ModerationRows summary={summary.value} base={base} />}
    </Workspace>
  )
}

function ModerationRows({ summary, base }: { summary: ModerationSummary; base: string }) {
  const age = summary.oldestOpenAt ? elapsedSince(summary.oldestOpenAt, new Date()) : null
  const { suspended, incident } = summary
  return (
    <>
      <ModerationRow href={`${base}/`} label="열린 신고" go="신고 큐">
        <b>{summary.openReports.toLocaleString()}건{summary.openReportsMore ? ' 넘음' : ''}</b>
        {summary.openReportsMore && <span className="cs-row-note">첫 {OPEN_REPORT_PAGE}건까지만 셉니다</span>}
        {age && <><span className="cs-row-note">가장 오래 기다린 신고</span><span className={`agebadge ${age.tone}`}>{age.label}</span></>}
      </ModerationRow>
      <ModerationRow href={`${base}/suspensions`} label="정지된 계정" go="정지 현황">
        <b>{suspended.total.toLocaleString()}명{suspended.truncated ? ' 넘음' : ''}</b>
        <span className="cs-row-note">
          진행 중 {suspended.active} · 무기한 {suspended.indefinite} · 만료됨(자동 해제 대기) {suspended.expired}
        </span>
      </ModerationRow>
      <ModerationRow href={`${base}/feature-control/incident-mode`} label="인시던트" go="인시던트">
        {incident
          ? <><span className="cs-row-quiet">{incident.severity} · {incident.title}</span><span className="cs-row-note">{incident.status}</span></>
          : <span className="cs-row-quiet">진행 중인 인시던트 없음</span>}
      </ModerationRow>
    </>
  )
}

/** 콘솔 홈 — 두 작업 공간으로 들어가는 입구. 지표판이 아니라 처리할 것부터 보인다(HP-506). */
export default function HomeSection({ path }: { path: string }) {
  return (
    <Shell section="home" path={path} search={<GlobalUserSearch />}>
      <div className="cs-page">
        <div className="cs-page-head">
          <h1>운영 콘솔</h1>
          <p>시딩과 조치를 같은 틀에서 씁니다. 로그인은 콘솔을 열 때 한 번이고, 메뉴를 옮겨도 다시 묻지 않습니다.</p>
        </div>
        <div className="cs-ws-grid">
          <SeedingCard />
          <ModerationCard />
        </div>
      </div>
    </Shell>
  )
}
