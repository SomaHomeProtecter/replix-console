import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * PROD 일괄 가림(HP-514) — API 모듈을 가짜로 바꾸지 않고 <b>실제 확인 겹과 apiFetch</b>를 거친다.
 * AuthorMessages.test.tsx는 '../api/admin'을 통째로 가짜로 바꿔 확인 창을 지나지 않았고, 그래서
 * "동시에 보낸 요청 중 첫 건만 확인 창에 닿고 나머지는 거절된다"는 결함을 잡지 못했다.
 * 여기서는 fetch만 가짜로 두고 나머지는 운영과 같은 길로 보낸다.
 */
vi.mock('../auth', () => ({ getToken: vi.fn(async () => 'test-token') }))
const envMock = vi.hoisted(() => ({
  environment: 'PROD' as 'DEV' | 'PROD', apiBaseUrl: 'http://api.test',
  kcUrl: '', kcRealm: '', kcClientId: '',
}))
vi.mock('../env', () => ({ env: envMock }))

import ProductionWriteGuard from '../ProductionWriteGuard'
import { makeAuthorMessage, makeReportItem } from '../test/fixtures'
import AuthorMessages from './AuthorMessages'

const REPORTED = '01FIXTUREMSG0000000000000A'
const IDS = ['M-1', REPORTED, 'M-3']

function json(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

describe('작성자 글 일괄 가림 — PROD 묶음 확인(HP-514)', () => {
  const fetchMock = vi.fn()
  const blinded = new Set<string>()
  const onActionDone = vi.fn()
  const onBusyChange = vi.fn()

  beforeEach(() => {
    blinded.clear()
    fetchMock.mockReset()
    onActionDone.mockReset()
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase()
      if (method === 'POST' && url.endsWith('/blind')) {
        blinded.add(decodeURIComponent(url.split('/').at(-2)!))
        return json({ blinded: true })
      }
      return json({
        rows: IDS.map((msgId, i) => makeAuthorMessage({
          msgId, message: `줄 ${i + 1}`, playbackTime: (i + 1) * 10,
          status: blinded.has(msgId) ? 'blinded' : 'visible',
        })),
        total: IDS.length,
      })
    })
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  function renderPanel() {
    const report = makeReportItem()
    return render(
      <ProductionWriteGuard>
        <AuthorMessages key={report.id} report={report} busy={false}
            onActionDone={onActionDone} onBusyChange={onBusyChange} />
      </ProductionWriteGuard>)
  }

  const blindPosts = () => fetchMock.mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method === 'POST')

  async function pickAll(user: ReturnType<typeof userEvent.setup>) {
    // 신고된 줄은 미리 골라져 있다 — 나머지 두 줄을 더 고른다.
    await screen.findByText('줄 1')
    for (const text of ['줄 1', '줄 3']) {
      await user.click(within(screen.getByText(text).closest('label')!).getByRole('checkbox'))
    }
    return screen.getByRole('button', { name: '선택 3건 가림' })
  }

  it('고른 3건을 확인 한 번으로 모두 가린다', async () => {
    const user = userEvent.setup()
    renderPanel()
    await user.click(await pickAll(user))

    // 확인 창은 묶음 전체를 보여 주고, 확인 전에는 아무것도 보내지 않는다
    const dialog = await screen.findByRole('dialog', { name: 'PROD 변경 최종 확인' })
    expect(dialog).toHaveTextContent('메시지 3건')
    expect(blindPosts()).toHaveLength(0)

    await user.type(within(dialog).getByRole('textbox', { name: 'PROD 확인 입력' }), 'PROD')
    await user.click(within(dialog).getByRole('button', { name: 'PROD에 적용' }))

    await waitFor(() => expect(blindPosts()).toHaveLength(3))
    expect([...blinded].sort()).toEqual([...IDS].sort())
    // 두 번째 확인 창은 뜨지 않는다 — 종전에는 여기서 나머지가 "확인 진행 중"으로 거절됐다
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(onActionDone).toHaveBeenCalledWith(undefined))
    expect(screen.queryByText(/실패/)).not.toBeInTheDocument()
  })

  it('확인을 취소하면 요청을 하나도 보내지 않고 고른 것을 그대로 둔다', async () => {
    const user = userEvent.setup()
    renderPanel()
    await user.click(await pickAll(user))

    const dialog = await screen.findByRole('dialog', { name: 'PROD 변경 최종 확인' })
    await user.click(within(dialog).getByRole('button', { name: '취소' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(blindPosts()).toHaveLength(0)
    expect(screen.getByRole('button', { name: '선택 3건 가림' })).toBeEnabled()
    expect(onActionDone).not.toHaveBeenCalled()
  })
})
