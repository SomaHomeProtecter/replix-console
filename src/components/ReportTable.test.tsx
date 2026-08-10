import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeReportItem } from '../test/fixtures'
import ReportTable from './ReportTable'

afterEach(() => {
  vi.useRealTimers()
})

/**
 * 뱃지가 렌더 시점의 시각으로 굳으면, 콘솔을 열어 둔 채 두는 흔한 사용(벽에 띄운 큐 화면)에서
 * 24h·48h 경계를 넘긴 신고가 계속 옛 톤으로 남는다 — 나이가 유일한 신호인 바로 그 상황에서
 * HP-296이 내건 목적("목록만 보고 급한 것을 고른다")이 무너진다(2026-08-11 리뷰).
 */
describe('경과 뱃지는 시간을 따라간다', () => {
  it('열어 둔 채로 경계를 넘으면 스스로 톤이 바뀐다', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-11T00:00:00Z'))
    const createdAt = '2026-08-10T00:01:00Z' // 23시간 59분 전

    render(<ReportTable items={[makeReportItem({ createdAt })]} selectedId={null} onSelect={() => {}} />)
    expect(screen.getByText('23시간')).toBeInTheDocument()

    act(() => { vi.advanceTimersByTime(2 * 60 * 1000) })

    expect(screen.getByText('1일')).toBeInTheDocument()
  })
})
