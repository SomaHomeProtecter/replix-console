import { listIncidents, listReports, listSuspendedUsers } from '@moderation/api/admin'
import type { Incident } from '@moderation/api/types'
import { suspensionState } from '@moderation/format'
import { api } from '@seeding/api'
import type { Episode, Work } from '@seeding/api'
import { episodeProgress } from '@seeding/progress'
import type { EpisodeProgress } from '@seeding/progress'

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
