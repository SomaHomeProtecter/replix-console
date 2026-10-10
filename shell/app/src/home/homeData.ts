import { listIncidents, listReports, listSuspendedUsers } from '@moderation/api/admin'
import type { Incident } from '@moderation/api/types'
import { suspensionState } from '@moderation/format'
import { api } from '@seeding/api'
import type { Collection, Episode, Injection, Plan, SyncAnchor, Work } from '@seeding/api'

/*
 * 홈의 "지금 볼 것"(HP-506). 지표 화면이 아니다 — 지표는 콘솔에 만들지 않고 Grafana로 보낸다(HP-223 확정 제약 ③).
 * 여기 숫자는 조치·시딩 화면이 이미 부르는 목록 API를 한 번 더 읽은 처리 대기 건수이고, 집계 API를 새로 만들지 않는다.
 */

/** 열린 신고는 첫 장만 읽는다 — 넘치면 "N건 넘음"으로 말하고, 가장 오래된 건은 다 읽었을 때만 말한다. */
export const OPEN_REPORT_PAGE = 50

export type ModerationSummary = {
  openReports: number
  openReportsMore: boolean
  oldestOpenAt: string | null
  suspended: { active: number; indefinite: number; expired: number; total: number; truncated: boolean }
  incident: Incident | null
  activeIncidents: number
}

const CLOSED_INCIDENT = ['RESOLVED', 'CANCELLED']

export async function loadModerationSummary(): Promise<ModerationSummary> {
  const [reports, suspended, incidents] = await Promise.all([
    listReports({ status: 'OPEN', reason: '' }, null, OPEN_REPORT_PAGE),
    listSuspendedUsers(),
    listIncidents(),
  ])
  const openReportsMore = reports.nextCursor !== null
  const oldestOpenAt = openReportsMore || reports.items.length === 0
    ? null
    : reports.items.reduce((oldest, item) => (item.createdAt < oldest ? item.createdAt : oldest), reports.items[0]!.createdAt)
  const now = new Date()
  const counts = { active: 0, indefinite: 0, expired: 0 }
  for (const row of suspended.rows) {
    const state = suspensionState(row.status, row.suspendedUntil, now)
    if (state !== 'none') counts[state] += 1
  }
  const active = incidents.filter((incident) => !CLOSED_INCIDENT.includes(incident.status))
  return {
    openReports: reports.items.length,
    openReportsMore,
    oldestOpenAt,
    suspended: {
      ...counts,
      total: counts.active + counts.indefinite + counts.expired,
      truncated: suspended.total > suspended.rows.length,
    },
    incident: active.find((incident) => incident.primary) ?? active[0] ?? null,
    activeIncidents: active.length,
  }
}

export type StepState = 'done' | 'current' | 'idle'
export type EpisodeStep = { label: string; state: StepState; detail: string }
export type EpisodeProgress = { steps: EpisodeStep[]; status: { state: StepState; label: string } }

/**
 * 회차 작업 네 단계(수집 → 시각 맞추기 → AI 계획 → 채팅 넣기)의 진행 — 시딩 화면 머리(EpisodeWorkspace)의 단계 표시와
 * 같은 근거를 쓰되, "지금 사람이 할 차례"(current)를 따로 짚는다: 수집이 도는 중, 검수 대기 계획, 넣는 중.
 */
export function episodeProgress(
  collections: Collection[], anchors: SyncAnchor[], plans: Plan[], injections: Injection[],
): EpisodeProgress {
  const done = collections.find((collection) => collection.status === 'DONE')
  const collecting = collections.some((collection) => collection.status === 'RUNNING' || collection.status === 'QUEUED')
  const drafts = plans.filter((plan) => plan.status === 'DRAFT').length
  const running = plans.some((plan) => plan.status === 'RUNNING')

  const steps: EpisodeStep[] = [
    done
      ? { label: '수집', state: 'done', detail: `${done.postCount.toLocaleString()}건` }
      : { label: '수집', state: collecting ? 'current' : 'idle', detail: collecting ? '수집 중' : '아직' },
    anchors.length > 0
      ? { label: '시각 맞추기', state: 'done', detail: `기준점 ${anchors.length}개` }
      : { label: '시각 맞추기', state: 'idle', detail: '아직' },
    plans.length === 0
      ? { label: 'AI 계획', state: 'idle', detail: '아직' }
      : drafts > 0
        ? { label: 'AI 계획', state: 'current', detail: '검수 대기' }
        : { label: 'AI 계획', state: 'done', detail: `계획 ${plans.length}개` },
    running
      ? { label: '채팅 넣기', state: 'current', detail: '넣는 중' }
      : injections.length > 0
        ? { label: '채팅 넣기', state: 'done', detail: `${injections.length.toLocaleString()}건` }
        : { label: '채팅 넣기', state: 'idle', detail: '아직' },
  ]
  // 회차의 한 줄 상태 — 사람이 손댈 일이 먼저다: 넣는 중 > 검수 대기 > 수집 중 > 끝남 > 다음 단계 전.
  const next = steps.find((step) => step.state !== 'done')
  const status: EpisodeProgress['status'] = running ? { state: 'current', label: '채팅 넣는 중' }
    : drafts > 0 ? { state: 'current', label: 'AI 계획 검수 대기' }
    : !done && collecting ? { state: 'current', label: '수집 중' }
    : !next ? { state: 'done', label: '넣기 완료' }
    : { state: 'idle', label: `${next.label} 전` }
  return { steps, status }
}

export type RecentEpisode = { work: Work; episode: Episode; progress: EpisodeProgress }

/** 최근 회차 — 켜진 작품들의 회차를 방영일 최신순으로 모아 앞의 몇 개만 단계를 읽는다. */
export async function loadRecentEpisodes(limit = 2): Promise<RecentEpisode[]> {
  const works = (await api.works()).filter((work) => work.enabled)
  const lists = await Promise.all(works.map(async (work) => (await api.episodes(work.id)).map((episode) => ({ work, episode }))))
  const recent = lists.flat().sort((a, b) => b.episode.airDate.localeCompare(a.episode.airDate)).slice(0, limit)
  return Promise.all(recent.map(async ({ work, episode }) => {
    const [collections, anchors, plans, injections] = await Promise.all([
      api.collections(episode.id), api.anchors(episode.id), api.plans(episode.id), api.injections(episode.id),
    ])
    return { work, episode, progress: episodeProgress(collections, anchors, plans, injections) }
  }))
}

const WEEKDAY = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', weekday: 'short' })

/** '2026-10-08' → '10/08 (수)' */
export function airDateLabel(airDate: string): string {
  const [, month = '', day = ''] = airDate.split('-')
  const weekday = WEEKDAY.format(new Date(`${airDate}T12:00:00+09:00`))
  return `${month}/${day} (${weekday})`
}
