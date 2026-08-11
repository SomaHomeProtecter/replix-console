import { act, render, screen, within } from '@testing-library/react'
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

  /**
   * 내려갈 때 타이머를 놓는지 <b>직접</b> 확인한다. 위 테스트는 타이머가 도는 것만 보므로,
   * 정리를 지워도 초록으로 남는다 — 그리고 이 화면은 필터·재조회로 자주 다시 그려지는 데다
   * 콘솔을 온종일 열어 두는 사용이라, 새면 인터벌이 조용히 쌓여 1분마다 죽은 컴포넌트를
   * 깨운다. 언마운트를 테스트 안에서 명시적으로 부르므로 afterEach 순서에 기대지 않는다.
   */
  /**
   * 깨진 시각을 가진 신고 한 건이 큐 화면 전체를 날리지 않는다(4차 리뷰). elapsedSince에 넣은
   * '모르면 —' 가드는 같은 칸의 formatKst가 먼저 RangeError를 던지는 바람에 <b>한 번도 실행되지
   * 않았다</b> — 두 곳이 함께 눕고 나서야 그 가드가 의미를 갖는다. 행 단위로 확인한다.
   */
  it('시각이 깨진 신고가 있어도 표는 그려지고 그 칸만 모른다고 말한다', () => {
    render(<ReportTable
        items={[makeReportItem({ id: 1, createdAt: '깨진값', snapshotMessage: '깨진 시각 신고' }),
          makeReportItem({ id: 2, snapshotMessage: '멀쩡한 신고' })]}
        selectedId={null} onSelect={() => {}} />)

    expect(screen.getByText('멀쩡한 신고')).toBeInTheDocument()   // 표 전체가 살아 있다
    const rows = screen.getAllByRole('row')
    expect(within(rows[1]).getAllByText('—').length).toBeGreaterThan(0)
  })

  it('화면에서 내려가면 타이머를 놓는다', () => {
    vi.useFakeTimers()
    const { unmount } = render(
        <ReportTable items={[makeReportItem()]} selectedId={null} onSelect={() => {}} />)
    expect(vi.getTimerCount()).toBe(1)

    unmount()

    expect(vi.getTimerCount()).toBe(0)
  })
})
