import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./secondaryAuth', () => ({ secondaryToken: vi.fn(async () => 'x'), secondarySignedIn: () => false, secondaryLogout: vi.fn() }))

import { SeedingWorkspace } from './App'
import { bindHost } from './host'

const WAIT = { timeout: 10_000 }
const work = { id: 1, code: 'solo', title: '나는 솔로', airWeekday: 3, airTime: '22:30', defaultRuntimeSec: 5400, enabled: true, sources: [] }
const episode = { id: 11, workId: 1, airDate: '2026-10-08', label: '33기 9회', airStartAt: '2026-10-08T13:30:00Z', airEndAt: null, runtimeSec: null, episodeId: null }
const failed = { id: 5, seedEpisodeId: 11, status: 'FAILED', windowStartAt: '2026-10-08T13:10:00Z', windowEndAt: '2026-10-08T16:30:00Z',
  progress: null, error: '차단', postCount: 0, requestedBy: 'admin', startedAt: null, finishedAt: null, createdAt: '2026-10-08T16:30:00Z' }

function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>((r) => { resolve = r }); return { promise, resolve } }

beforeEach(() => {
  sessionStorage.clear(); localStorage.clear()
  window.history.replaceState(null, '', '/seeding/')
  bindHost({ user: { name: '리뷰', sub: 'u', roles: ['admin'] }, token: async () => 't', logout: vi.fn(), confirmProductionWrite: vi.fn(async () => undefined) })
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

/* 30초 다시 읽기의 늦은 응답이 방금 지운 결과를 되살리지 않는다(HP-526, 2026-10-12 독립 리뷰가 재현한 결함의 회귀 테스트). */
describe('뒤에서 다시 읽기 — 지운 뒤의 목록이 남는다', () => {
  it('뒤에서 읽던 수집 목록의 늦은 응답이 지우기 뒤 목록을 덮지 않는다', async () => {
    let collections: unknown[] = [failed]
    const held: Array<ReturnType<typeof deferred<Response>>> = []
    let holdNext = false
    const json = (v: unknown) => new Response(JSON.stringify(v), { status: 200 })
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const p = new URL(url).pathname; const m = (init?.method ?? 'GET').toUpperCase()
      if (m === 'GET' && p.endsWith('/seeding/works')) return json([work])
      if (m === 'GET' && p.endsWith('/works/1/episodes')) return json([episode])
      if (m === 'GET' && p.endsWith('/episodes/11/collections')) {
        if (holdNext) { holdNext = false; const d = deferred<Response>(); held.push(d); return d.promise }
        return json(collections)
      }
      if (m === 'GET' && /\/episodes\/11\/(anchors|scene-notes|plans|injections)$/.test(p)) return json([])
      if (m === 'DELETE' && p.endsWith('/collections/5')) { collections = []; return new Response(null, { status: 204 }) }
      return new Response(JSON.stringify({ message: `없는 경로 ${m} ${p}` }), { status: 404 })
    }))
    const user = userEvent.setup()
    render(<SeedingWorkspace view="work" />)
    const del = await screen.findByRole('button', { name: '지우기' }, WAIT)
    // 30초 주기의 뒤에서 읽기 — 탭이 다시 보일 때와 같은 경로(refresh)로 한 번 부른다. 응답은 붙잡아 둔다.
    holdNext = true
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(held).toHaveLength(1)
    // 그사이 운영자가 수집을 지운다 → 다시 읽기 → 빈 목록
    await user.click(del)
    expect(await screen.findByText('아직 수집한 적이 없습니다.', {}, WAIT)).toBeInTheDocument()
    // 뒤에서 읽던 응답(지우기 전 목록)이 이제 도착한다
    await act(async () => { held[0]!.resolve(json([failed])) })
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByText('아직 수집한 적이 없습니다.')).toBeInTheDocument()
  }, 40_000)
})
