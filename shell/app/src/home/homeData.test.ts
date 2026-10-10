import { describe, expect, it } from 'vitest'
import type { Collection, Injection, Plan, SyncAnchor } from '@seeding/api'
import { airDateLabel, episodeProgress } from './homeData'

const collection = (status: Collection['status'], postCount = 0) => ({ status, postCount }) as Collection
const plan = (status: Plan['status']) => ({ status }) as Plan
const anchors = (n: number) => Array.from({ length: n }, (_, id) => ({ id }) as SyncAnchor)
const injections = (n: number) => Array.from({ length: n }, (_, id) => ({ id }) as Injection)

describe('episodeProgress — 회차 작업 네 단계', () => {
  it('아무것도 없으면 수집 전이다', () => {
    const progress = episodeProgress([], [], [], [])
    expect(progress.steps.map((step) => step.state)).toEqual(['idle', 'idle', 'idle', 'idle'])
    expect(progress.status).toEqual({ state: 'idle', label: '수집 전' })
  })

  it('수집이 도는 중이면 그 단계를 짚는다', () => {
    const progress = episodeProgress([collection('RUNNING')], [], [], [])
    expect(progress.steps[0]).toEqual({ label: '수집', state: 'current', detail: '수집 중' })
    expect(progress.status).toEqual({ state: 'current', label: '수집 중' })
  })

  it('검수 대기 계획이 있으면 AI 계획이 사람 차례다', () => {
    const progress = episodeProgress(
      [collection('FAILED'), collection('DONE', 4012)], anchors(9), [plan('DRAFT')], [])
    expect(progress.steps).toEqual([
      { label: '수집', state: 'done', detail: '4,012건' },
      { label: '시각 맞추기', state: 'done', detail: '기준점 9개' },
      { label: 'AI 계획', state: 'current', detail: '검수 대기' },
      { label: '채팅 넣기', state: 'idle', detail: '아직' },
    ])
    expect(progress.status).toEqual({ state: 'current', label: 'AI 계획 검수 대기' })
  })

  it('넣는 중인 계획은 채팅 넣기를 진행 중으로 본다', () => {
    const progress = episodeProgress([collection('DONE', 10)], anchors(1), [plan('RUNNING')], injections(3))
    expect(progress.steps[2]).toEqual({ label: 'AI 계획', state: 'done', detail: '계획 1개' })
    expect(progress.steps[3]).toEqual({ label: '채팅 넣기', state: 'current', detail: '넣는 중' })
    expect(progress.status).toEqual({ state: 'current', label: '채팅 넣는 중' })
  })

  it('넣기까지 끝나면 넣기 완료다', () => {
    const progress = episodeProgress([collection('DONE', 3977)], anchors(11), [plan('EXECUTED'), plan('EXECUTED')], injections(2697))
    expect(progress.steps[3]).toEqual({ label: '채팅 넣기', state: 'done', detail: '2,697건' })
    expect(progress.status).toEqual({ state: 'done', label: '넣기 완료' })
  })

  it('넣은 것을 모두 지웠으면 채팅 넣기 전으로 돌아간다', () => {
    const progress = episodeProgress([collection('DONE', 10)], anchors(1), [plan('EXECUTED')], [])
    expect(progress.status).toEqual({ state: 'idle', label: '채팅 넣기 전' })
  })
})

describe('airDateLabel', () => {
  it('방영일을 월/일(요일)로 쓴다 — 한국 시간 기준', () => {
    expect(airDateLabel('2026-10-07')).toBe('10/07 (수)')
    expect(airDateLabel('2026-10-08')).toBe('10/08 (목)')
  })
})
