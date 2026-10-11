import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * 작업 서버가 운영일 때(console.replix.tv)의 쓰기 확인(HP-526). 주소로 정해지는 작업 서버만 운영으로 바꾸고(env.ts),
 * fetch는 가짜 서버로 둔다 — 실제 서버로는 나가지 않는다. 되돌리기 어렵거나 서버 동작을 바꾸는 운영 쓰기는 공용 'PROD'
 * 확인 창(host.confirmProductionWrite)을 거쳐야 하고, 승인한 뒤에만 요청을 보낸다. 검수 대기 초안을 만드는 쓰기는 묻지 않는다.
 */
vi.mock('./env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./env')>()
  return { ...actual, ENV: 'prod', WORKSPACE: actual.ENVS.prod, OTHER: actual.ENVS.dev }
})
vi.mock('./secondaryAuth', () => ({
  secondaryToken: vi.fn(async () => 'other-token'),
  secondarySignedIn: () => false,
  secondaryLogout: vi.fn(),
}))

import { SeedingWorkspace } from './App'
import { bindHost } from './host'

type Json = Record<string, unknown>
type Write = { method: string; path: string; body: Json | undefined }

// 작업 서버 = 운영(vite.config.ts의 PROD 테스트 값). 다른 주소로 가는 요청은 없는 경로로 답한다.
const PROD_API = 'http://prod-api.test'
const WAIT = { timeout: 10_000 }
const TEST_TIMEOUT = 40_000

const work = { id: 1, code: 'solo', title: '나는 솔로', airWeekday: 3, airTime: '22:30', defaultRuntimeSec: 5400, enabled: true, sources: [] }
const episode = {
  id: 11, workId: 1, airDate: '2026-10-08', label: '33기 9회', airStartAt: '2026-10-08T13:30:00Z',
  airEndAt: null, runtimeSec: null, episodeId: 123,
}
const doneCollection = {
  id: 5, seedEpisodeId: 11, status: 'DONE', windowStartAt: '2026-10-08T13:10:00Z', windowEndAt: '2026-10-08T16:30:00Z',
  progress: null, error: null, postCount: 40, requestedBy: 'admin', startedAt: '2026-10-08T16:31:00Z',
  finishedAt: '2026-10-08T16:36:00Z', createdAt: '2026-10-08T16:30:00Z',
}
const density = {
  from: '2026-10-08T13:10:00Z', to: '2026-10-08T16:30:00Z', bucketMinutes: 1,
  buckets: [{ at: '2026-10-08T13:10:00Z', count: 3 }, { at: '2026-10-08T13:11:00Z', count: 9 }],
  suggestedStartAt: null, suggestedEndAt: '2026-10-08T15:05:00Z', note: '',
}
const anchor = { id: 31, seedEpisodeId: 11, playbackSec: 0, wallclockAt: '2026-10-08T13:31:05Z', note: '본편 시작' }
const note = { id: 41, seedEpisodeId: 11, minuteAt: '2026-10-08T13:35:00Z', note: '오프닝', confidence: '높음', tag: '시작' }
const plan = { id: 7, seedEpisodeId: 11, label: 'AI 계획', source: 'pipeline', status: 'DRAFT', createdBy: 'admin', createdAt: '2026-10-09T00:00:00Z', executedAt: null }
const item = { id: 1, planId: 7, seq: 1, seedPostId: 1, ghostKey: null, wallclockAt: null, playbackSec: 60, message: '채팅 1',
  kind: 'VERBATIM', spoiler: false, scene: null, reason: null, accepted: true, injectionId: null, error: null, external: null }
const planView = { plan, items: [{ item, previewSec: 60, gap: false }], anchorCount: 1, platformCode: 'NETFLIX', platformEpisodeId: '81000001', engagement: { emojis: 0, watchSeconds: 0 } }
const prompt = { key: 'scene', title: '장면 복원', description: '설명', content: '원래 내용', version: 7, updatedBy: '한서윤', updatedAt: '2026-10-07T08:20:00Z' }
const version6 = { id: 106, key: 'scene', version: 6, content: '여섯째 내용', note: null, createdBy: '한서윤', createdAt: '2026-10-06T08:20:00Z' }

/** 가짜 운영 서버 — 읽기는 아래 값으로 답하고, 쓰기는 모두 기록한 뒤 그럴듯한 값을 돌려준다. */
function prodServer(over: Partial<Record<'collections' | 'anchors' | 'notes' | 'plans', unknown[]>> = {}) {
  const writes: Write[] = []
  const reads: Record<string, () => unknown> = {
    '/api/v1/admin/seeding/works': () => [work],
    '/api/v1/admin/seeding/works/1/episodes': () => [episode],
    '/api/v1/admin/seeding/episodes/11/collections': () => over.collections ?? [],
    '/api/v1/admin/seeding/episodes/11/anchors': () => over.anchors ?? [],
    '/api/v1/admin/seeding/episodes/11/scene-notes': () => over.notes ?? [],
    '/api/v1/admin/seeding/episodes/11/plans': () => over.plans ?? [],
    '/api/v1/admin/seeding/episodes/11/injections': () => [],
    '/api/v1/admin/seeding/collections/5/density': () => density,
    '/api/v1/admin/seeding/plans/7': () => planView,
    '/api/v1/admin/seeding/prompts': () => [prompt],
    '/api/v1/admin/seeding/prompts/scene/versions': () => [version6],
  }
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const u = new URL(url)
    const method = (init?.method ?? 'GET').toUpperCase()
    if (u.origin !== PROD_API) return new Response(JSON.stringify({ message: `작업 서버가 아닌 곳 ${u.origin}` }), { status: 404 })
    if (method === 'GET') {
      const read = reads[u.pathname]
      return read ? new Response(JSON.stringify(read()), { status: 200 }) : new Response(JSON.stringify({ message: `없는 경로 ${u.pathname}` }), { status: 404 })
    }
    const body = init?.body ? JSON.parse(String(init.body)) as Json : undefined
    writes.push({ method, path: u.pathname.replace('/api/v1/admin/seeding', ''), body })
    if (u.pathname.endsWith('/plans') && method === 'POST') return new Response(JSON.stringify({ ...planView, plan: { ...plan, id: 9 } }), { status: 200 })
    if (u.pathname.includes('/plan-items/')) return new Response(JSON.stringify({ ...item, accepted: false }), { status: 200 })
    if (u.pathname.endsWith('/episodes') && method === 'POST') return new Response(JSON.stringify({ ...episode, id: 12 }), { status: 200 })
    if (u.pathname.startsWith('/api/v1/admin/seeding/prompts/')) return new Response(JSON.stringify({ ...prompt, version: 8 }), { status: 200 })
    if (method === 'DELETE') return new Response(null, { status: 204 })
    return new Response(JSON.stringify(method === 'PATCH' || u.pathname.endsWith('/link') ? episode : {}), { status: 200 })
  })
  return { fetchMock, writes }
}

const confirmProductionWrite = vi.fn<(summary: { target: string; change: string; reason: string }) => Promise<void>>(async () => undefined)
const reject = () => confirmProductionWrite.mockRejectedValueOnce(new Error('PROD 변경을 취소했습니다'))
const lastSummary = () => confirmProductionWrite.mock.calls.at(-1)?.[0]
const card = (title: RegExp) => screen.getByRole('region', { name: title })

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  window.history.replaceState(null, '', '/seeding/')
  confirmProductionWrite.mockClear()
  bindHost({ user: { name: '조현빈', sub: 'u-1', roles: ['admin'] }, token: async () => 'console-token', logout: vi.fn(), confirmProductionWrite })
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})
afterEach(() => {
  // 운영 쓰기는 브라우저 확인 창이 아니라 공용 'PROD' 확인 창만 거친다
  expect(window.confirm).not.toHaveBeenCalled()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('운영 쓰기 확인 — 프롬프트는 저장하는 순간 서버 동작이 바뀐다(HP-526, 시딩 결정 ⑥)', () => {
  it('저장·되돌리기·기본값 복원이 PROD 확인을 거치고, 취소하면 보내지 않는다', async () => {
    const { fetchMock, writes } = prodServer()
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<SeedingWorkspace view="prompts" />)

    const editor = await screen.findByDisplayValue('원래 내용', {}, WAIT)
    await user.clear(editor)
    await user.type(editor, '새 내용')
    reject()
    await user.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(confirmProductionWrite).toHaveBeenCalledTimes(1), WAIT)
    expect(lastSummary()).toEqual({
      target: "운영 서버 · AI 프롬프트 '장면 복원'",
      change: '지금 편집한 내용을 버전 8로 저장',
      reason: expect.stringContaining('저장하는 순간 AI 작업과 서버의 "다시 써서 넣기"가 새 내용을 씁니다'),
    })
    expect(writes).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(writes).toEqual([{ method: 'PUT', path: '/prompts/scene', body: { content: '새 내용', note: null } }]), WAIT)

    await user.click(screen.getByRole('button', { name: '이력 보기' }))
    await user.click(await screen.findByRole('button', { name: '이 버전으로 되돌리기' }, WAIT))
    await waitFor(() => expect(writes).toHaveLength(2), WAIT)
    expect(lastSummary()?.change).toBe('버전 6의 내용으로 되돌리기(버전 8로 저장)')
    expect(writes[1]).toMatchObject({ method: 'POST', path: '/prompts/scene/revert/6' })

    reject()
    await user.click(screen.getByRole('button', { name: '기본값으로 되돌리기' }))
    await waitFor(() => expect(confirmProductionWrite).toHaveBeenCalledTimes(4), WAIT)
    expect(lastSummary()?.change).toContain('기본 프롬프트로 되돌리기')
    expect(writes).toHaveLength(2)
  }, TEST_TIMEOUT)
})

describe('운영 쓰기 확인 — 회차의 기준값과 장면 메모(HP-526)', () => {
  it('회차 정보 저장·그래프 적용·장면 메모 전체 교체·모두 지우기가 PROD 확인을 거친다', async () => {
    const { fetchMock, writes } = prodServer({ collections: [doneCollection], notes: [note] })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<SeedingWorkspace view="work" />)

    // 그래프의 추정 종료를 회차 정보에 적용 — 취소하면 보내지 않는다
    reject()
    await user.click(await screen.findByRole('button', { name: '회차 정보에 적용' }, WAIT))
    await waitFor(() => expect(confirmProductionWrite).toHaveBeenCalledTimes(1), WAIT)
    expect(lastSummary()).toMatchObject({ target: '운영 서버 · 33기 9회 회차 정보', change: expect.stringMatching(/^방영 종료 없음 → .+ \(분당 글 수 그래프의 추정\)$/) })
    expect(writes).toHaveLength(0)

    // 회차 정보 저장(방영 시각은 수집 범위와 시각 환산의 기준)
    await user.click(screen.getByRole('button', { name: '고치기' }))
    const name = within(card(/^회차 정보$/)).getByPlaceholderText('예: 33기 9회')
    await user.clear(name)
    await user.type(name, '33기 9회 본편')
    await user.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(writes).toHaveLength(1), WAIT)
    expect(lastSummary()).toMatchObject({ target: '운영 서버 · 나는 솔로 33기 9회 회차 정보', change: '이름 33기 9회 → 33기 9회 본편' })
    expect(writes[0]).toMatchObject({ method: 'PATCH', path: '/episodes/11', body: { label: '33기 9회 본편' } })

    // 장면 메모 전체 교체
    const sync = card(/^2\s*시각 맞추기와 장면 메모$/)
    await user.click(within(sync).getByRole('button', { name: '표로 바꿔 넣기' }))
    await user.type(within(sync).getByRole('textbox'), '| 22:35 | 새 장면 | 근거 | 높음 | 시작 |')
    await user.click(within(sync).getByRole('button', { name: '저장 (전체 교체)' }))
    await waitFor(() => expect(writes).toHaveLength(2), WAIT)
    expect(lastSummary()).toMatchObject({ target: '운영 서버 · 33기 9회 장면 메모', change: '장면 메모 1분을 붙여 넣은 1분으로 모두 바꾸기' })
    expect(writes[1]).toMatchObject({ method: 'PUT', path: '/episodes/11/scene-notes' })

    // 장면 메모 모두 지우기 — 취소하면 보내지 않는다
    reject()
    await user.click(within(sync).getByRole('button', { name: '모두 지우기' }))
    await waitFor(() => expect(lastSummary()?.change).toBe('장면 메모 1분 모두 지우기'), WAIT)
    expect(writes).toHaveLength(2)
  }, TEST_TIMEOUT)
})

describe('운영 쓰기 확인 — 지우기와 연결 끊기(HP-526)', () => {
  it('수집·기준점·계획 지우기와 넷플릭스 연결 끊기가 PROD 확인을 거친다', async () => {
    const { fetchMock, writes } = prodServer({ collections: [{ ...doneCollection, postCount: 0 }], anchors: [anchor], plans: [plan] })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<SeedingWorkspace view="work" />)

    // 수집 지우기
    const collect = await screen.findByRole('region', { name: /^1\s*수집$/ }, WAIT)
    await user.click(await within(collect).findByRole('button', { name: '지우기' }, WAIT))
    await waitFor(() => expect(writes).toEqual([{ method: 'DELETE', path: '/collections/5', body: undefined }]), WAIT)
    expect(lastSummary()).toMatchObject({ target: '운영 서버 · 33기 9회 수집 #5', change: '수집한 글 0건 지우기' })

    // 기준점 지우기 — 취소
    reject()
    await user.click(within(card(/^2\s*시각 맞추기와 장면 메모$/)).getByRole('button', { name: '지우기' }))
    await waitFor(() => expect(lastSummary()?.change).toContain('기준점 지우기'), WAIT)

    // 넷플릭스 연결 끊기 — 취소
    reject()
    await user.click(screen.getByRole('button', { name: '연결 끊기' }))
    await waitFor(() => expect(lastSummary()?.change).toBe('넷플릭스 회차 id 123 연결 끊기'), WAIT)
    expect(writes).toHaveLength(1)

    // 계획 지우기
    await user.click(await screen.findByRole('button', { name: '계획 #7 지우기' }, WAIT))
    await waitFor(() => expect(writes).toHaveLength(2), WAIT)
    expect(lastSummary()).toMatchObject({ target: '운영 서버 · 33기 9회 AI 계획 #7', change: '계획 #7(1행) 지우기' })
    expect(writes[1]).toMatchObject({ method: 'DELETE', path: '/plans/7' })
  }, TEST_TIMEOUT)
})

describe('운영 쓰기 확인 — 진행 중인 수집 멈추기(2026-10-12 리뷰)', () => {
  it('수집 멈추기는 PROD 확인을 거치고, 취소하면 보내지 않는다', async () => {
    const running = { ...doneCollection, id: 6, status: 'RUNNING', postCount: 120, finishedAt: null }
    const { fetchMock, writes } = prodServer({ collections: [running] })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<SeedingWorkspace view="work" />)
    const collect = await screen.findByRole('region', { name: /^1\s*수집$/ }, WAIT)

    reject()
    await user.click(await within(collect).findByRole('button', { name: '멈추기' }, WAIT))
    await waitFor(() => expect(lastSummary()).toMatchObject({ target: '운영 서버 · 33기 9회 수집 #6', change: '진행 중인 수집 #6 멈추기' }), WAIT)
    expect(writes).toHaveLength(0)

    await user.click(within(collect).getByRole('button', { name: '멈추기' }))
    await waitFor(() => expect(writes).toEqual([{ method: 'POST', path: '/collections/6/cancel', body: undefined }]), WAIT)
  }, TEST_TIMEOUT)
})

describe('검수 대기 초안을 만드는 쓰기는 묻지 않는다(HP-526)', () => {
  it('계획 행 거부·계획 올리기·회차 추가·수집 시작은 PROD 확인 없이 보낸다', async () => {
    const { fetchMock, writes } = prodServer({ plans: [plan] })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<SeedingWorkspace view="work" />)

    await user.click(await screen.findByRole('button', { name: '거부' }, WAIT))
    await user.click(screen.getByRole('button', { name: '계획 파일을 손으로 올리기' }))
    await user.click(within(card(/^3\s*AI 채팅 계획$/)).getByRole('textbox'))
    await user.paste('[{"message": "새 채팅"}]')
    await user.click(screen.getByRole('button', { name: '올리기' }))
    await user.click(screen.getByRole('button', { name: '회차 추가' }))
    await user.click(screen.getByRole('button', { name: '추가' }))
    await user.click(screen.getByRole('button', { name: '수집 시작' }))

    await waitFor(() => expect(writes.map((w) => `${w.method} ${w.path}`)).toEqual([
      'PATCH /plan-items/1', 'POST /episodes/11/plans', 'POST /works/1/episodes', 'POST /episodes/11/collections',
    ]), WAIT)
    expect(confirmProductionWrite).not.toHaveBeenCalled()
  }, TEST_TIMEOUT)
})
