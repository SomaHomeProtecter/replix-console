import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * 시딩 작업 화면의 회귀 테스트(HP-517·518·519). 시딩 폴더에는 아직 테스트 실행기가 없어, 배포 빌드와 같은 도구인
 * 공용 틀의 vitest에서 돌린다. API 모듈은 가짜로 바꾸지 않고 fetch만 가짜 서버로 둔다 — 결함이 난 실제 경로를 거친다.
 * jsdom의 주소는 localhost라 작업 서버(WORKSPACE)는 개발, 다른 환경(OTHER)은 운영이다(env.ts).
 */
vi.mock('@seeding/secondaryAuth', () => ({
  secondaryToken: vi.fn(async () => 'other-token'),
  secondarySignedIn: () => false,
  secondaryLogout: vi.fn(),
}))

import { SeedingWorkspace } from '@seeding/App'
import { bindHost } from '@seeding/host'

type Json = Record<string, unknown>
type Handler = (match: RegExpMatchArray, body: Json | undefined) => unknown
type Route = { method: string; host: 'workspace' | 'other'; path: RegExp; handle: Handler }

const OTHER_API = 'https://api.replix.tv' // 작업 서버(개발)가 아닌 쪽 — env.ts의 OTHER

/** 경로별 처리기를 받는 가짜 서버. 처리기가 Response를 돌려주면 그대로, 아니면 JSON 200으로 감싼다. */
function serve(routes: Route[]) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const u = new URL(url)
    const method = (init?.method ?? 'GET').toUpperCase()
    const host = u.origin === OTHER_API ? 'other' : 'workspace'
    for (const r of routes) {
      const m = u.pathname.match(r.path)
      if (r.method === method && r.host === host && m) {
        const out = await r.handle(m, init?.body ? JSON.parse(String(init.body)) : undefined)
        return out instanceof Response ? out : new Response(JSON.stringify(out ?? null), { status: 200 })
      }
    }
    return new Response(JSON.stringify({ message: `없는 경로 ${method} ${u.pathname}` }), { status: 404 })
  })
}

const work = { id: 1, code: 'solo', title: '나는 솔로', airWeekday: 3, airTime: '22:30', defaultRuntimeSec: 5400, enabled: true, sources: [] }
const baseEpisode = {
  id: 11, workId: 1, airDate: '2026-10-08', label: '33기 9회', airStartAt: '2026-10-08T13:30:00Z',
  airEndAt: null as string | null, runtimeSec: null as number | null, episodeId: null as number | null,
}
const doneCollection = {
  id: 5, seedEpisodeId: 11, status: 'DONE', windowStartAt: '2026-10-08T13:10:00Z', windowEndAt: '2026-10-08T16:30:00Z',
  progress: null, error: null, postCount: 40, requestedBy: 'admin', startedAt: '2026-10-08T16:31:00Z',
  finishedAt: '2026-10-08T16:36:00Z', createdAt: '2026-10-08T16:30:00Z',
}
const plan = { id: 7, seedEpisodeId: 11, label: 'AI 계획', source: 'pipeline', status: 'DRAFT', createdBy: 'admin', createdAt: '2026-10-09T00:00:00Z', executedAt: null }
const planItem = (id: number, over: Json = {}) => ({
  item: { id, planId: 7, seq: id, seedPostId: id, ghostKey: null, wallclockAt: null, playbackSec: 60 * id, message: `채팅 ${id}`,
    kind: 'VERBATIM', spoiler: false, scene: null, reason: null, accepted: true, injectionId: null, error: null, external: null, ...over },
  previewSec: 60 * id, gap: false,
})
const planView = (status: string, items: ReturnType<typeof planItem>[]) => ({
  plan: { ...plan, status }, items, anchorCount: 0, platformCode: 'NETFLIX', platformEpisodeId: '81000001',
  engagement: { emojis: 0, watchSeconds: 0 },
})

/** 회차 화면이 처음 열 때 읽는 것들 — 각 테스트가 필요한 것만 덮어쓴다. */
function episodeRoutes(episode: () => Json, extra: Partial<Record<'collections' | 'plans', unknown>> = {}): Route[] {
  return [
    { method: 'GET', host: 'workspace', path: /\/seeding\/works$/, handle: () => [work] },
    { method: 'GET', host: 'workspace', path: /\/works\/1\/episodes$/, handle: () => [episode()] },
    { method: 'GET', host: 'workspace', path: /\/episodes\/11\/collections$/, handle: () => extra.collections ?? [] },
    { method: 'GET', host: 'workspace', path: /\/episodes\/11\/anchors$/, handle: () => [] },
    { method: 'GET', host: 'workspace', path: /\/episodes\/11\/scene-notes$/, handle: () => [] },
    { method: 'GET', host: 'workspace', path: /\/episodes\/11\/plans$/, handle: () => extra.plans ?? [] },
    { method: 'GET', host: 'workspace', path: /\/episodes\/11\/injections$/, handle: () => [] },
    { method: 'GET', host: 'workspace', path: /\/collections\/5\/posts$/, handle: () => ({ items: [], nextCursor: null, countBySource: {} }) },
  ]
}

const confirmProductionWrite = vi.fn(async () => undefined)

beforeEach(() => {
  localStorage.clear()
  confirmProductionWrite.mockClear()
  bindHost({ user: { name: '조현빈', sub: 'u-1', roles: ['admin'] }, token: async () => 'console-token', logout: vi.fn(), confirmProductionWrite })
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('회차 정보 — 그래프에서 적용한 방영 시각을 고치기·저장이 되돌리지 않는다(HP-517)', () => {
  it("'회차 정보에 적용' 뒤 '고치기 → 저장'을 해도 적용한 종료 시각이 남는다", async () => {
    let episode: Json = { ...baseEpisode }
    const patches: Json[] = []
    const fetchMock = serve([
      ...episodeRoutes(() => episode, { collections: [doneCollection] }),
      { method: 'GET', host: 'workspace', path: /\/collections\/5\/density$/, handle: () => ({
        from: '2026-10-08T13:10:00Z', to: '2026-10-08T16:30:00Z', bucketMinutes: 1,
        buckets: [{ at: '2026-10-08T13:10:00Z', count: 3 }, { at: '2026-10-08T13:11:00Z', count: 9 }],
        suggestedStartAt: null, suggestedEndAt: '2026-10-08T15:05:00Z', note: '' }) },
      { method: 'PATCH', host: 'workspace', path: /\/seeding\/episodes\/11$/, handle: (_m, body) => {
        patches.push(body!); episode = { ...episode, ...body }; return episode } },
    ])
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<SeedingWorkspace view="work" />)

    await user.click(await screen.findByRole('button', { name: '회차 정보에 적용' }))
    await waitFor(() => expect(patches).toHaveLength(1))
    expect(patches[0].airEndAt).toBe('2026-10-08T15:05:00Z')

    await user.click(screen.getByRole('button', { name: '고치기' }))
    // 편집 칸은 '고치기'를 누른 순간의 값이다 — 종전에는 회차를 처음 열 때의 빈 값이 남아 있었다
    expect(await screen.findByDisplayValue('2026-10-09T00:05')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => expect(patches).toHaveLength(2))
    expect(patches[1].airEndAt).toBe('2026-10-08T15:05:00Z')
    expect(patches[1].airStartAt).toBe('2026-10-08T13:30:00Z')
  })
})

describe('운영에 넣기(작업 서버) — 응답보다 먼저 끝나도 잠금이 풀린다(HP-519)', () => {
  it('실행 응답이 곧바로 EXECUTED여도 버튼이 다시 눌린다', async () => {
    const episode = { ...baseEpisode, episodeId: 123 }
    let executed = false
    const fetchMock = serve([
      ...episodeRoutes(() => episode, { plans: [plan] }),
      { method: 'GET', host: 'workspace', path: /\/seeding\/plans\/7$/, handle: () =>
        executed ? planView('EXECUTED', [planItem(1, { injectionId: 501 })]) : planView('DRAFT', [planItem(1)]) },
      { method: 'POST', host: 'workspace', path: /\/seeding\/plans\/7\/execute$/, handle: () => {
        executed = true
        // 넣을 행이 적어 백그라운드 작업이 응답을 만들기 전에 끝난 경우
        return planView('EXECUTED', [planItem(1, { injectionId: 501 })]) } },
    ])
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<SeedingWorkspace view="work" />)

    await user.click(await screen.findByRole('button', { name: '개발에 1건 넣기' }))
    // 종전에는 busy가 영영 참으로 남아 이 버튼이 꺼진 채였다
    expect(await screen.findByRole('button', { name: '개발에 넣은 것 모두 지우기' })).toBeEnabled()
  })
})

describe('다른 환경에 넣기 — 기록을 잃어도 같은 채팅을 다시 넣지 않는다(HP-518)', () => {
  const linked = { ...baseEpisode, episodeId: 123 }

  it('운영 서버 기록이 실패하면 결과를 남겨 두었다가, 다시 누를 때 넣지 않고 기록부터 마친다', async () => {
    let recordFails = true
    const records: Json[] = []
    const posts: Json[] = []
    const fetchMock = serve([
      ...episodeRoutes(() => linked, { plans: [plan] }),
      { method: 'GET', host: 'workspace', path: /\/seeding\/plans\/7$/, handle: () => planView('DRAFT', [planItem(1), planItem(2)]) },
      { method: 'POST', host: 'other', path: /\/external-injections$/, handle: (_m, body) => {
        posts.push(body!)
        return { episodeId: 900, results: (body!.items as { ref: string }[]).map((x, i) => ({ ref: x.ref, injectionId: 7000 + i, error: null })) } } },
      { method: 'POST', host: 'other', path: /\/engagement$/, handle: () => ({ emojis: 2, watchSeconds: 120 }) },
      { method: 'PUT', host: 'workspace', path: /\/plans\/7\/external\/prod$/, handle: (_m, body) => {
        if (recordFails) return new Response(JSON.stringify({ message: '일시 오류' }), { status: 503 })
        records.push(body!)
        const done = new Set((body!.results as { itemId: number }[]).map((r) => r.itemId))
        return planView('DRAFT', [1, 2].map((id) => planItem(id, done.has(id)
          ? { external: JSON.stringify({ prod: { id: 7000 + id, batchKey: body!.batchKey } }) } : {}))) } },
    ])
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<SeedingWorkspace view="work" />)

    await user.click(await screen.findByRole('button', { name: '운영에 2건 넣기' }))
    // 기록을 세 번 시도한 뒤(1초·2초 간격) 멈추고 알린다
    expect(await screen.findByText(/운영 서버에 기록하지 못했습니다/, {}, { timeout: 6000 })).toBeInTheDocument()
    expect(posts).toHaveLength(1)

    recordFails = false
    await user.click(screen.getByRole('button', { name: '운영에 2건 넣기' }))
    // 남겨 둔 결과를 기록했고, 다시 넣지 않았다 — 두 행 모두 이미 들어갔기 때문이다
    await waitFor(() => expect(records).toHaveLength(1))
    expect(records[0].batchKey).toBe(posts[0].batchKey)
    expect(posts).toHaveLength(1)
  }, 15_000)

  it('보낸 뒤 응답을 못 받은 묶음도 모두 지우기가 지운다', async () => {
    const deleted: string[] = []
    const fetchMock = serve([
      ...episodeRoutes(() => linked, { plans: [plan] }),
      { method: 'GET', host: 'workspace', path: /\/seeding\/plans\/7$/, handle: () => planView('DRAFT', [planItem(1)]) },
      // 대상 서버가 처리했는지 알 수 없게 끊긴다
      { method: 'POST', host: 'other', path: /\/external-injections$/, handle: () => { throw new TypeError('Failed to fetch') } },
      { method: 'DELETE', host: 'other', path: /\/external-injections\/(.+)$/, handle: (m) => { deleted.push(decodeURIComponent(m[1])); return { removed: 0 } } },
      { method: 'DELETE', host: 'workspace', path: /\/plans\/7\/external\/prod$/, handle: () => planView('DRAFT', [planItem(1)]) },
    ])
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<SeedingWorkspace view="work" />)

    await user.click(await screen.findByRole('button', { name: '운영에 1건 넣기' }))
    // 기록된 묶음이 없어도 시도한 묶음이 있으니 지우기가 보인다 — 종전에는 숨어 있어 지울 길이 없었다
    await user.click(await screen.findByRole('button', { name: '운영에 넣은 것 모두 지우기' }))

    await waitFor(() => expect(deleted).toHaveLength(1))
    expect(deleted[0]).toMatch(/^plan:dev:7:/)
    await waitFor(() => expect(screen.queryByRole('button', { name: '운영에 넣은 것 모두 지우기' })).not.toBeInTheDocument())
  })
})
