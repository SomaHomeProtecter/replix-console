import { describe, expect, it, vi } from 'vitest'

const apiFetchMock = vi.hoisted(() => vi.fn())
vi.mock('./client', () => ({ apiFetch: apiFetchMock, qs: vi.fn() }))

import { dryRunFeatureChangeSet } from './admin'

describe('dryRunFeatureChangeSet — PROD 확인 계약(HP-353)', () => {
  it('조회성 POST도 상태 변경 없음이 드러나는 PROD 확인 설명을 전달한다', async () => {
    apiFetchMock.mockResolvedValue([])

    await dryRunFeatureChangeSet(17, [1, 999999])

    expect(apiFetchMock).toHaveBeenCalledWith(
      '/api/v1/admin/control/change-sets/17/dry-run',
      { method: 'POST', body: JSON.stringify({ userIds: [1, 999999] }) },
      {
        target: '기능 변경 세트 #17',
        change: 'dry-run · 사용자 2명 · 상태 변경 없음',
        reason: '승인 전 사용자별 적용 결과 확인',
      },
    )
  })
})
