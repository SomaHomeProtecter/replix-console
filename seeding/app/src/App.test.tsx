import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * 시딩 작업 화면의 회귀 테스트(HP-517·518·519·525·526). API 모듈은 가짜로 바꾸지 않고 fetch만 가짜 서버로 둔다 — 결함이
 * 난 실제 경로를 거친다. jsdom의 주소는 localhost라 작업 서버(WORKSPACE)는 개발, 다른 환경(OTHER)은 운영이다(env.ts).
 * 작업 서버가 운영일 때의 쓰기 확인은 App.prod.test.tsx.
 */
vi.mock('./secondaryAuth', () => ({
  secondaryToken: vi.fn(async () => 'other-token'),
  secondarySignedIn: () => false,
  secondaryLogout: vi.fn(),
}))

import { SeedingWorkspace } from './App'
import { bindHost } from './host'

type Json = Record<string, unknown>
type Handler = (match: RegExpMatchArray, body: Json | undefined) => unknown
type Route = { method: string; host: 'workspace' | 'other'; path: RegExp; handle: Handler }

// 작업 서버(개발)가 아닌 쪽 = 운영 — vite.config.ts의 PROD 테스트 값. env.ts에서 읽지 않고 고정값으로 둔다:
// 시딩이 '다른 환경'으로 운영을 겨누는지까지 이 테스트가 함께 확인한다.
const OTHER_API = 'http://prod-api.test'

/* 회차 화면은 작품 → 회차 → 계획 순으로 읽기가 이어진다. 기본 대기(1초)는 바쁜 머신에서 모자라 결과가 흔들리므로
   넉넉히 기다린다 — 기다림이 길어질 뿐 판정은 같다. */
const WAIT = { timeout: 10_000 }
const TEST_TIMEOUT = 40_000

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
  sessionStorage.clear()
  window.history.replaceState(null, '', '/seeding/')
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

    await user.click(await screen.findByRole('button', { name: '회차 정보에 적용' }, WAIT))
    await waitFor(() => expect(patches).toHaveLength(1), WAIT)
    expect(patches[0].airEndAt).toBe('2026-10-08T15:05:00Z')

    await user.click(screen.getByRole('button', { name: '고치기' }))
    // 편집 칸은 '고치기'를 누른 순간의 값이다 — 종전에는 회차를 처음 열 때의 빈 값이 남아 있었다
    expect(await screen.findByDisplayValue('2026-10-09T00:05', {}, WAIT)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => expect(patches).toHaveLength(2), WAIT)
    expect(patches[1].airEndAt).toBe('2026-10-08T15:05:00Z')
    expect(patches[1].airStartAt).toBe('2026-10-08T13:30:00Z')
  }, TEST_TIMEOUT)
})

describe('회차 정보 — 편집하는 사이 바뀐 값(HP-517 리뷰)', () => {
  it("'고치기'를 연 채 그래프에서 적용하면 손대지 않은 칸이 새 값으로 바뀌고, 그 값이 저장된다", async () => {
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

    await user.click(await screen.findByRole('button', { name: '고치기' }, WAIT))
    await user.click(await screen.findByRole('button', { name: '회차 정보에 적용' }, WAIT))
    // 종료 칸은 손대지 않았으니 방금 적용한 값으로 다시 채워진다
    expect(await screen.findByDisplayValue('2026-10-09T00:05', {}, WAIT)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(patches).toHaveLength(2), WAIT)
    expect(patches[1].airEndAt).toBe('2026-10-08T15:05:00Z')
  }, TEST_TIMEOUT)
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

    await user.click(await screen.findByRole('button', { name: '개발에 1건 넣기' }, WAIT))
    // 종전에는 busy가 영영 참으로 남아 이 버튼이 꺼진 채였다
    expect(await screen.findByRole('button', { name: '개발에 넣은 것 모두 지우기' }, WAIT)).toBeEnabled()
  }, TEST_TIMEOUT)
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

    await user.click(await screen.findByRole('button', { name: '운영에 2건 넣기' }, WAIT))
    // 기록을 세 번 시도한 뒤(1초·2초 간격) 멈추고 알린다
    expect(await screen.findByText(/운영 서버에 기록하지 못했습니다/, {}, WAIT)).toBeInTheDocument()
    expect(posts).toHaveLength(1)

    recordFails = false
    await user.click(screen.getByRole('button', { name: '운영에 2건 넣기' }))
    // 남겨 둔 결과를 기록했고, 다시 넣지 않았다 — 두 행 모두 이미 들어갔기 때문이다
    await waitFor(() => expect(records).toHaveLength(1), WAIT)
    expect(records[0].batchKey).toBe(posts[0].batchKey)
    expect(posts).toHaveLength(1)
  }, TEST_TIMEOUT)

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

    await user.click(await screen.findByRole('button', { name: '운영에 1건 넣기' }, WAIT))
    // 기록된 묶음이 없어도 시도한 묶음이 있으니 지우기가 보인다 — 종전에는 숨어 있어 지울 길이 없었다
    await user.click(await screen.findByRole('button', { name: '운영에 넣은 것 모두 지우기' }, WAIT))

    await waitFor(() => expect(deleted).toHaveLength(1), WAIT)
    expect(deleted[0]).toMatch(/^plan:dev:7:/)
    await waitFor(() => expect(screen.queryByRole('button', { name: '운영에 넣은 것 모두 지우기' })).not.toBeInTheDocument(), WAIT)
  }, TEST_TIMEOUT)

  it('기록만 늦게 마친 묶음은 새로 넣을 행이 없어도 반응·감상 시간을 넣고, 오류를 띄우지 않는다(HP-518 리뷰)', async () => {
    const engagements: string[] = []
    let recordFails = true
    const fetchMock = serve([
      ...episodeRoutes(() => linked, { plans: [plan] }),
      { method: 'GET', host: 'workspace', path: /\/seeding\/plans\/7$/, handle: () => planView('DRAFT', [planItem(1)]) },
      { method: 'POST', host: 'other', path: /\/external-injections$/, handle: (_m, body) => ({
        episodeId: 900, results: (body!.items as { ref: string }[]).map((x) => ({ ref: x.ref, injectionId: 7001, error: null })) }) },
      { method: 'POST', host: 'other', path: /\/external-injections\/(.+)\/engagement$/, handle: (m) => {
        engagements.push(decodeURIComponent(m[1])); return { emojis: 1, watchSeconds: 60 } } },
      { method: 'PUT', host: 'workspace', path: /\/plans\/7\/external\/prod$/, handle: (_m, body) => {
        if (recordFails) return new Response(JSON.stringify({ message: '일시 오류' }), { status: 503 })
        return planView('DRAFT', [planItem(1, { external: JSON.stringify({ prod: { id: 7001, batchKey: body!.batchKey } }) })]) } },
    ])
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<SeedingWorkspace view="work" />)

    await user.click(await screen.findByRole('button', { name: '운영에 1건 넣기' }, WAIT))
    expect(await screen.findByText(/운영 서버에 기록하지 못했습니다/, {}, WAIT)).toBeInTheDocument()
    expect(engagements).toHaveLength(0)

    recordFails = false
    await user.click(screen.getByRole('button', { name: '닫기' }))
    await user.click(screen.getByRole('button', { name: '운영에 1건 넣기' }))
    await waitFor(() => expect(engagements).toHaveLength(1), WAIT)
    expect(screen.queryByText(/넣을 행이 없습니다/)).not.toBeInTheDocument()
  }, TEST_TIMEOUT)

  it('다른 서버에 넣은 채팅이 남은 계획은 지울 수 없다(HP-518 리뷰)', async () => {
    const fetchMock = serve([
      ...episodeRoutes(() => linked, { plans: [plan] }),
      { method: 'GET', host: 'workspace', path: /\/seeding\/plans\/7$/, handle: () =>
        planView('DRAFT', [planItem(1, { external: JSON.stringify({ prod: { id: 7001, batchKey: 'plan:dev:7:x' } }) })]) },
    ])
    vi.stubGlobal('fetch', fetchMock)
    render(<SeedingWorkspace view="work" />)
    expect(await screen.findByRole('button', { name: '계획 #7 지우기' }, WAIT)).toBeDisabled()
  }, TEST_TIMEOUT)
})

describe('회차 머리 — 네 단계는 홈의 최근 회차와 같은 판정을 쓴다(HP-523에서 넘어온 항목, HP-525)', () => {
  it('검수 대기 계획이 있으면 AI 계획을 사람 차례(진행)로 짚는다', async () => {
    const fetchMock = serve([
      ...episodeRoutes(() => baseEpisode, { plans: [plan] }),
      { method: 'GET', host: 'workspace', path: /\/seeding\/plans\/7$/, handle: () => planView('DRAFT', [planItem(1)]) },
    ])
    vi.stubGlobal('fetch', fetchMock)
    render(<SeedingWorkspace view="work" />)

    const steps = await screen.findByRole('list', { name: '작업 단계' }, WAIT)
    const step = (label: string) => within(steps).getByText(label).closest('li')!
    // 종전 화면 머리는 계획이 있기만 하면 끝난 단계로 칠했다 — 홈은 같은 회차를 '검수 대기'(사람 차례)로 보였다
    await waitFor(() => expect(step('AI 계획')).toHaveClass('is-current'), WAIT)
    expect(step('AI 계획')).toHaveTextContent('검수 대기')
    expect(step('수집')).toHaveClass('is-idle')
    expect(step('채팅 넣기')).toHaveTextContent('아직')
  }, TEST_TIMEOUT)
})

/** 회차 하나를 열 때 읽는 목록을 모두 빈 값으로. */
function emptyEpisodeRoutes(id: number): Route[] {
  return ['collections', 'anchors', 'scene-notes', 'plans', 'injections'].map((what) => (
    { method: 'GET', host: 'workspace', path: new RegExp(`/episodes/${id}/${what}$`), handle: () => [] }))
}
const failWith = (status: number, message: string) => () => new Response(JSON.stringify({ message }), { status })
/** 단계 카드(제목으로 찾는다 — 카드는 제목을 이름으로 갖는 영역이다). */
const card = (title: RegExp) => screen.getByRole('region', { name: title })

describe('고른 회차는 주소와 세션에 남는다 — 새로고침·AI 프롬프트 다녀오기(HP-526)', () => {
  const second = { ...baseEpisode, id: 12, airDate: '2026-10-15', label: '33기 10회', airStartAt: '2026-10-15T13:30:00Z' }
  const routes = (): Route[] => [
    { method: 'GET', host: 'workspace', path: /\/seeding\/works$/, handle: () => [work] },
    { method: 'GET', host: 'workspace', path: /\/works\/1\/episodes$/, handle: () => [baseEpisode, second] },
    ...emptyEpisodeRoutes(11), ...emptyEpisodeRoutes(12),
  ]

  it('회차를 고르면 popstate 없이 주소를 바꾸고 세션에도 남겨, 메뉴로 돌아와도(쿼리 없음) 그 회차를 연다', async () => {
    vi.stubGlobal('fetch', serve(routes()))
    const popstate = vi.fn()
    window.addEventListener('popstate', popstate)
    const user = userEvent.setup()
    const { unmount } = render(<SeedingWorkspace view="work" />)

    // 처음 연 회차(첫 회차)도 주소에 남는다
    await waitFor(() => expect(window.location.search).toBe('?work=1&episode=11'), WAIT)
    await user.click(await screen.findByRole('button', { name: /^33기 10회/ }, WAIT))
    await waitFor(() => expect(window.location.search).toBe('?work=1&episode=12'), WAIT)
    expect(window.location.pathname).toBe('/seeding/')
    expect(JSON.parse(sessionStorage.getItem('replix_seeding_selection_dev') ?? 'null')).toEqual({ workId: 1, episodeId: 12 })
    // 공용 틀은 popstate를 받으면 주소를 다시 읽어 시딩 화면을 처음부터 다시 그린다 — 고를 때마다 그러면 안 된다
    expect(popstate).not.toHaveBeenCalled()
    window.removeEventListener('popstate', popstate)

    // 'AI 프롬프트'에 다녀와 왼쪽 메뉴 '회차 작업'(쿼리 없음)으로 돌아오면, 공용 틀은 회차 없이 화면을 새로 그린다
    unmount()
    render(<SeedingWorkspace view="work" />)
    expect(await screen.findByRole('heading', { level: 1, name: /33기 10회/ }, WAIT)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^33기 10회/ })).toHaveAttribute('aria-current', 'true')
  }, TEST_TIMEOUT)

  it('주소의 회차(홈의 최근 회차·새로고침·뒤로 가기)가 세션에 남은 회차보다 먼저다', async () => {
    sessionStorage.setItem('replix_seeding_selection_dev', JSON.stringify({ workId: 1, episodeId: 12 }))
    vi.stubGlobal('fetch', serve(routes()))
    render(<SeedingWorkspace view="work" workId={1} episodeId={11} />)

    expect(await screen.findByRole('heading', { level: 1, name: /33기 9회/ }, WAIT)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^33기 9회/ })).toHaveAttribute('aria-current', 'true')
  }, TEST_TIMEOUT)
})

describe('계획 도착 — 탭이 보이는 동안 30초마다 다시 읽는다(HP-526)', () => {
  const next = { ...plan, id: 8, label: '새 AI 계획', createdAt: '2026-10-09T01:00:00Z' }
  const setVisibility = (state: DocumentVisibilityState) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
    document.dispatchEvent(new Event('visibilitychange'))
  }
  afterEach(() => {
    vi.useRealTimers()
    delete (document as { visibilityState?: unknown }).visibilityState
  })

  it('파이프라인이 만든 계획이 회차를 다시 고르지 않아도 나타나고, 보던 계획은 바뀌지 않는다', async () => {
    // 주기만 가짜 시계로 돌린다(그 밖의 기다림은 실제 시간).
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    let planList: Json[] = [plan]
    const fetchMock = serve([
      { method: 'GET', host: 'workspace', path: /\/episodes\/11\/plans$/, handle: () => planList },
      ...episodeRoutes(() => baseEpisode),
      { method: 'GET', host: 'workspace', path: /\/seeding\/plans\/7$/, handle: () => planView('DRAFT', [planItem(1)]) },
      { method: 'GET', host: 'workspace', path: /\/seeding\/plans\/8$/, handle: () => ({ ...planView('DRAFT', [planItem(2)]), plan: next }) },
    ])
    vi.stubGlobal('fetch', fetchMock)
    render(<SeedingWorkspace view="work" />)
    expect(await screen.findByRole('button', { name: /#7 AI 계획/ }, WAIT)).toHaveAttribute('aria-pressed', 'true')
    expect(await screen.findByText('채팅 1', {}, WAIT)).toBeInTheDocument()

    // 목록은 최신순이다 — 새 검수 대기 계획이 맨 앞에 온다
    planList = [next, plan]
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })
    expect(await screen.findByRole('button', { name: /#8 새 AI 계획/ }, WAIT)).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: /#7 AI 계획/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('채팅 1')).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/seeding/plans/8'))).toBe(false)
  }, TEST_TIMEOUT)

  it('탭이 가려진 동안은 다시 읽지 않고, 다시 보이면 곧바로 읽는다', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    let planList: Json[] = []
    const fetchMock = serve([
      { method: 'GET', host: 'workspace', path: /\/episodes\/11\/plans$/, handle: () => planList },
      ...episodeRoutes(() => baseEpisode),
      { method: 'GET', host: 'workspace', path: /\/seeding\/plans\/7$/, handle: () => planView('DRAFT', [planItem(1)]) },
    ])
    vi.stubGlobal('fetch', fetchMock)
    render(<SeedingWorkspace view="work" />)
    const planReads = () => fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/episodes/11/plans')).length
    // 빈 목록은 화면이 바뀌지 않아 읽기 자체를 기다린다(화면의 '아직 계획이 없습니다'는 읽기 전에도 보인다)
    await vi.waitFor(() => expect(planReads()).toBe(1), WAIT)
    expect(await screen.findByText(/아직 계획이 없습니다/, {}, WAIT)).toBeInTheDocument()

    act(() => setVisibility('hidden'))
    planList = [plan]
    await act(async () => { await vi.advanceTimersByTimeAsync(90_000) })
    expect(planReads()).toBe(1)
    expect(screen.queryByRole('button', { name: /#7 AI 계획/ })).not.toBeInTheDocument()

    act(() => setVisibility('visible'))
    expect(await screen.findByRole('button', { name: /#7 AI 계획/ }, WAIT)).toBeInTheDocument()
    expect(planReads()).toBe(2)
  }, TEST_TIMEOUT)
})

describe('오류는 그 단계 카드 안에 뜬다(HP-526)', () => {
  it('수집 목록·계획 목록 오류가 각자 카드에 뜨고, 하나를 닫아도 다른 카드의 오류는 남는다', async () => {
    vi.stubGlobal('fetch', serve([
      { method: 'GET', host: 'workspace', path: /\/episodes\/11\/collections$/, handle: failWith(500, '수집 목록 오류') },
      { method: 'GET', host: 'workspace', path: /\/episodes\/11\/plans$/, handle: failWith(503, '계획 목록 오류') },
      ...episodeRoutes(() => baseEpisode),
    ]))
    const user = userEvent.setup()
    render(<SeedingWorkspace view="work" />)

    expect(await screen.findByText(/수집 목록 오류/, {}, WAIT)).toBeInTheDocument()
    expect(await screen.findByText(/계획 목록 오류/, {}, WAIT)).toBeInTheDocument()
    const collect = card(/^1\s*수집$/), aiPlan = card(/^3\s*AI 채팅 계획$/)
    expect(within(collect).getByText(/수집 목록 오류/)).toBeInTheDocument()
    expect(within(collect).queryByText(/계획 목록 오류/)).not.toBeInTheDocument()
    expect(within(aiPlan).getByText(/계획 목록 오류/)).toBeInTheDocument()

    await user.click(within(collect).getByRole('button', { name: '닫기' }))
    expect(screen.queryByText(/수집 목록 오류/)).not.toBeInTheDocument()
    expect(within(aiPlan).getByText(/계획 목록 오류/)).toBeInTheDocument()
  }, TEST_TIMEOUT)

  it('채팅 넣기에서 난 오류는 4단계 카드에 뜬다', async () => {
    const linked = { ...baseEpisode, episodeId: 123 }
    vi.stubGlobal('fetch', serve([
      ...episodeRoutes(() => linked, { plans: [plan] }),
      // 계획 쪽에 넷플릭스 회차 정보가 없다 — 다른 환경에 넣기가 멈추고 알린다
      { method: 'GET', host: 'workspace', path: /\/seeding\/plans\/7$/, handle: () => ({ ...planView('DRAFT', [planItem(1)]), platformEpisodeId: null }) },
    ]))
    const user = userEvent.setup()
    render(<SeedingWorkspace view="work" />)

    await user.click(await screen.findByRole('button', { name: '운영에 1건 넣기' }, WAIT))
    const message = await screen.findByText(/넷플릭스 회차와 연결되지 않아 다른 환경에 넣을 수 없습니다/, {}, WAIT)
    expect(card(/^4\s*채팅 넣기$/)).toContainElement(message)
    expect(card(/^3\s*AI 채팅 계획$/)).not.toContainElement(message)
  }, TEST_TIMEOUT)

  it('일부만 들어간 넣기는 오류가 아니라 주의(공용 .notice-box)로 4단계 카드에 뜬다', async () => {
    const linked = { ...baseEpisode, episodeId: 123 }
    vi.stubGlobal('fetch', serve([
      ...episodeRoutes(() => linked, { plans: [plan] }),
      { method: 'GET', host: 'workspace', path: /\/seeding\/plans\/7$/, handle: () => planView('DRAFT', [planItem(1), planItem(2)]) },
      { method: 'POST', host: 'other', path: /\/external-injections$/, handle: () => ({ episodeId: 900, results: [
        { ref: '1', injectionId: 7001, error: null }, { ref: '2', injectionId: null, error: '그 서버에 회차가 없습니다' }] }) },
      { method: 'POST', host: 'other', path: /\/engagement$/, handle: () => ({ emojis: 1, watchSeconds: 60 }) },
      { method: 'PUT', host: 'workspace', path: /\/plans\/7\/external\/prod$/, handle: (_m, body) => planView('DRAFT', [
        planItem(1, { external: JSON.stringify({ prod: { id: 7001, batchKey: body!.batchKey } }) }), planItem(2)]) },
    ]))
    const user = userEvent.setup()
    render(<SeedingWorkspace view="work" />)

    await user.click(await screen.findByRole('button', { name: '운영에 2건 넣기' }, WAIT))
    const message = await screen.findByText(/운영 서버에 1건을 넣었고 1건은 실패했습니다/, {}, WAIT)
    expect(message.closest('.notice-box')).not.toBeNull()
    expect(message.closest('.error-box')).toBeNull()
    expect(card(/^4\s*채팅 넣기$/)).toContainElement(message)
  }, TEST_TIMEOUT)

  it('작품 목록을 못 읽으면 작업 공간 맨 위에 뜬다(단계 카드가 없다)', async () => {
    vi.stubGlobal('fetch', serve([
      { method: 'GET', host: 'workspace', path: /\/seeding\/works$/, handle: failWith(500, '작품 목록 오류') },
    ]))
    render(<SeedingWorkspace view="work" />)
    expect(await screen.findByRole('alert', {}, WAIT)).toHaveTextContent('작품 목록 오류')
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
  }, TEST_TIMEOUT)
})

describe('작품을 바꾸는 사이 이전 작품의 회차가 남지 않는다(HP-594)', () => {
  // 확인 창은 바꾼 작품(B) 이름을 보이는데 쓰기는 이전 작품(A) 회차로 나갔다 — 회차 작업 영역이 A 회차로 그려지면 안 된다.
  const workB = { ...work, id: 2, code: 'solo2', title: '나는 솔로 사랑은 계속된다', airWeekday: 4 }
  const episodeB = { ...baseEpisode, id: 21, workId: 2, airDate: '2026-10-09', label: '27기 3회', airStartAt: '2026-10-09T13:30:00Z' }
  const gate = () => { let open!: () => void; const opened = new Promise<void>((r) => { open = r }); return { opened, open } }
  const routes = (episodesA: Handler, episodesB: Handler): Route[] => [
    { method: 'GET', host: 'workspace', path: /\/seeding\/works$/, handle: () => [work, workB] },
    { method: 'GET', host: 'workspace', path: /\/works\/1\/episodes$/, handle: episodesA },
    { method: 'GET', host: 'workspace', path: /\/works\/2\/episodes$/, handle: episodesB },
    ...emptyEpisodeRoutes(11), ...emptyEpisodeRoutes(21),
  ]
  const episodeA = () => screen.queryByRole('button', { name: /^33기 9회/ })

  it('B 목록을 기다리는 동안 A 회차를 그리지 않고 불러오는 중임을 알린다', async () => {
    const b = gate()
    vi.stubGlobal('fetch', serve(routes(() => [baseEpisode], async () => { await b.opened; return [episodeB] })))
    const user = userEvent.setup()
    render(<SeedingWorkspace view="work" />)
    expect(await screen.findByRole('heading', { level: 1, name: /33기 9회/ }, WAIT)).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('작품'), '2')
    expect(await screen.findByText('회차를 불러오는 중입니다.', {}, WAIT)).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '회차 정보' })).not.toBeInTheDocument()
    expect(episodeA()).not.toBeInTheDocument()

    await act(async () => { b.open() })
    expect(await screen.findByRole('heading', { level: 1, name: /27기 3회/ }, WAIT)).toBeInTheDocument()
    expect(screen.queryByText('회차를 불러오는 중입니다.')).not.toBeInTheDocument()
  }, TEST_TIMEOUT)

  it('A 목록 응답이 B보다 늦게 와도 B 화면을 덮지 않는다', async () => {
    const a = gate()
    vi.stubGlobal('fetch', serve(routes(async () => { await a.opened; return [baseEpisode] }, () => [episodeB])))
    const user = userEvent.setup()
    render(<SeedingWorkspace view="work" />)
    await screen.findByRole('option', { name: workB.title }, WAIT)

    await user.selectOptions(screen.getByLabelText('작품'), '2')
    expect(await screen.findByRole('heading', { level: 1, name: /27기 3회/ }, WAIT)).toBeInTheDocument()
    await act(async () => { a.open() })
    // 늦은 A 응답이 처리될 틈을 준 뒤에도 B 회차 그대로다
    await act(async () => { await new Promise((r) => setTimeout(r, 50)) })
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('27기 3회')
    expect(episodeA()).not.toBeInTheDocument()
  }, TEST_TIMEOUT)

  it('B 목록을 못 읽으면 오류만 띄우고 A 회차를 남기지 않는다', async () => {
    vi.stubGlobal('fetch', serve(routes(() => [baseEpisode], failWith(503, '일시 오류'))))
    const user = userEvent.setup()
    render(<SeedingWorkspace view="work" />)
    expect(await screen.findByRole('heading', { level: 1, name: /33기 9회/ }, WAIT)).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('작품'), '2')
    expect(await screen.findByText(/일시 오류/, {}, WAIT)).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '회차 정보' })).not.toBeInTheDocument()
    expect(episodeA()).not.toBeInTheDocument()
    // 실패를 '회차 없음'이나 '불러오는 중'으로 보이지 않는다
    expect(screen.queryByText(/아직 회차가 없습니다/)).not.toBeInTheDocument()
    expect(screen.queryByText('회차를 불러오는 중입니다.')).not.toBeInTheDocument()
  }, TEST_TIMEOUT)
})

describe('운영 쓰기 확인 — 개발 서버에서는 브라우저 확인 창으로(HP-526)', () => {
  it('프롬프트 저장은 확인을 거치고, 취소하면 저장하지 않는다', async () => {
    const saves: Json[] = []
    const prompt = { key: 'scene', title: '장면 복원', description: '설명', content: '원래 내용', version: 7, updatedBy: '한서윤', updatedAt: '2026-10-07T08:20:00Z' }
    vi.stubGlobal('fetch', serve([
      { method: 'GET', host: 'workspace', path: /\/seeding\/prompts$/, handle: () => [saves.length ? { ...prompt, content: '새 내용', version: 8 } : prompt] },
      { method: 'PUT', host: 'workspace', path: /\/seeding\/prompts\/scene$/, handle: (_m, body) => { saves.push(body!); return { ...prompt, content: body!.content, version: 8 } } },
    ]))
    const confirmSpy = vi.mocked(window.confirm).mockReturnValue(false)
    const user = userEvent.setup()
    render(<SeedingWorkspace view="prompts" />)

    const editor = await screen.findByDisplayValue('원래 내용', {}, WAIT)
    await user.clear(editor)
    await user.type(editor, '새 내용')
    await user.click(screen.getByRole('button', { name: '저장' }))
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining("'장면 복원' 프롬프트를 저장합니다"))
    expect(saves).toHaveLength(0)

    confirmSpy.mockReturnValue(true)
    await user.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(saves).toHaveLength(1), WAIT)
    expect(saves[0].content).toBe('새 내용')
    // 개발 서버 쓰기는 'PROD' 입력 창을 띄우지 않는다
    expect(confirmProductionWrite).not.toHaveBeenCalled()
    expect(await screen.findByText(/장면 복원 저장됨/, {}, WAIT)).toBeInTheDocument()
  }, TEST_TIMEOUT)
})
