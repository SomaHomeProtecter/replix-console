import { useCallback, useEffect, useLayoutEffect, useState } from 'react'

export type Async<T> = { data: T | null; error: Error | null; loading: boolean }

/** 아주 작은 fetch 훅. 의존값이 바뀌면 다시 부르고, 언마운트·재요청 뒤 늦게 온 응답은 버린다. */
export function useAsync<T>(fn: () => Promise<T> | null, deps: unknown[]): Async<T> {
  const [state, setState] = useState<Async<T>>({ data: null, error: null, loading: true })
  useEffect(() => {
    let alive = true
    const p = fn()
    if (!p) {
      setState({ data: null, error: null, loading: false })
      return
    }
    setState((s) => ({ ...s, loading: true, error: null }))
    p.then(
      (data) => alive && setState({ data, error: null, loading: false }),
      (error: Error) => alive && setState({ data: null, error, loading: false }),
    )
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return state
}

/** 화면 폭을 가득 채우는 격자에서 보일 항목 수(열 × 줄). 열 수는 컨테이너 폭에서 계산하고
 *  폭이 바뀌면 다시 센다. 숫자 상한 대신 화면이 상한을 정한다(2026-09-07 조현빈).
 *  ref 는 콜백이다 — 스켈레톤 ↔ 실제 격자처럼 요소가 바뀌어도 새 요소를 다시 관찰한다. */
export function useFillCount(minPx: number, gapPx: number, rows: number) {
  const [node, setNode] = useState<HTMLElement | null>(null)
  const [cols, setCols] = useState(1)
  const ref = useCallback((el: HTMLElement | null) => setNode(el), [])
  useLayoutEffect(() => {
    if (!node) return
    const measure = () => {
      const w = node.clientWidth
      if (w < minPx) return // 캡처·전환 중 잠깐 0 으로 재는 경우가 있다 — 그 값으로 열을 줄이지 않는다
      setCols(Math.max(1, Math.floor((w + gapPx) / (minPx + gapPx))))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(node)
    return () => ro.disconnect()
  }, [node, minPx, gapPx])
  return { ref, count: cols * rows, cols }
}
